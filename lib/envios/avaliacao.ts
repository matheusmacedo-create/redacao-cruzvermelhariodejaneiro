import 'server-only'
import { put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT, fileKind, safeExtension } from '@/lib/storage'
import { montar } from '@/lib/contas/emails'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { AUTORIZACOES, mensagemDePublicacao, tamanhoLegivel, type Autorizacao } from './regras'
import { armazenamento, avisarAvaliadores } from './servidor'

/**
 * O que acontece depois que um envio chega (docs/envio-de-acoes.md §5):
 * copiar para a Biblioteca o que vai ser publicado e avisar quem enviou
 * quando a ação virou matéria.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ArquivoDoEnvio = { id: string; chave: string; nome: string; tipo_mime: string | null; tamanho: number; categoria: string; file_id: string | null }

/**
 * Copia um arquivo do R2 para a Biblioteca (Vercel Blob), em fluxo — o vídeo
 * não passa inteiro pela memória. Devolve o id do arquivo na Biblioteca ou o
 * motivo de ter ficado de fora (tipo, tamanho ou cota).
 */
export async function copiarParaBiblioteca(admin: Admin, p: {
  arquivo: ArquivoDoEnvio; workspaceId: string; usuarioId: string; autorizacao: Autorizacao; credito: string; usado: { bytes: number }
}): Promise<{ fileId?: string; motivo?: string }> {
  const { arquivo } = p
  if (arquivo.file_id) return { fileId: arquivo.file_id }
  const tipo = (arquivo.tipo_mime ?? '').split(';')[0].trim()
  if (!LIBRARY_MIME_TYPES.has(tipo)) return { motivo: `${arquivo.nome}: a Biblioteca não aceita ${tipo || 'este tipo'} (fica guardado no acervo).` }
  if (arquivo.tamanho > LIBRARY_FILE_LIMIT) return { motivo: `${arquivo.nome}: passa de ${tamanhoLegivel(LIBRARY_FILE_LIMIT)}, o limite da Biblioteca.` }
  if (p.usado.bytes + arquivo.tamanho > WORKSPACE_STORAGE_LIMIT) return { motivo: `${arquivo.nome}: a Biblioteca está cheia (${tamanhoLegivel(WORKSPACE_STORAGE_LIMIT)}).` }
  const r2 = armazenamento()
  if (!r2) return { motivo: 'O armazenamento do acervo não está configurado.' }

  const resposta = await fetch(urlAssinada(r2.config, r2.bucket, arquivo.chave, 'GET', 600), { cache: 'no-store' })
  if (!resposta.ok || !resposta.body) return { motivo: `${arquivo.nome}: não foi possível ler do acervo (${resposta.status}).` }
  const caminho = `workspaces/${p.workspaceId}/library/${crypto.randomUUID()}${safeExtension(arquivo.nome)}`
  const blob = await put(caminho, resposta.body, {
    access: 'private', addRandomSuffix: false, contentType: tipo, multipart: arquivo.tamanho > 50 * 1024 * 1024,
  })
  const { data, error } = await admin.from('files').insert({
    workspace_id: p.workspaceId,
    name: arquivo.nome, original_name: arquivo.nome,
    file_type: fileKind(tipo), content_type: tipo,
    storage_path: blob.pathname, size_bytes: arquivo.tamanho, status: 'available',
    // O que a pessoa declarou no envio: "todos autorizaram" libera; o resto a comunicação confere.
    authorization_status: AUTORIZACOES[p.autorizacao].podePublicar ? 'authorized' : 'pending',
    tags: ['envio-da-equipe', `credito:${p.credito}`.slice(0, 60)],
    uploaded_by: p.usuarioId,
  }).select('id').single()
  if (error || !data) return { motivo: `${arquivo.nome}: não foi possível registrar na Biblioteca.` }
  p.usado.bytes += arquivo.tamanho
  await admin.from('envio_arquivos').update({ file_id: data.id }).eq('id', arquivo.id)
  return { fileId: data.id as string }
}

/**
 * A matéria foi ao ar: quem mandou a ação e pediu aviso fica sabendo. Com
 * e-mail, vai sozinho; só com WhatsApp, quem avalia recebe o lembrete no sino
 * (a mensagem pronta está no botão da tela do envio). Nunca lança.
 */
export async function avisarQuemEnviou(contentId: string, workspaceId: string, url: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: peca } = await admin.from('content_pieces').select('pauta_id').eq('id', contentId).eq('workspace_id', workspaceId).maybeSingle()
    if (!peca?.pauta_id) return
    const { data: envios } = await admin.from('envios')
      .select('id, nome, titulo, email, whatsapp, avisar_quando_publicar, avisado_em')
      .eq('workspace_id', workspaceId).eq('pauta_id', peca.pauta_id).is('avisado_em', null)
    for (const e of (envios ?? []) as { id: string; nome: string; titulo: string; email: string | null; whatsapp: string | null; avisar_quando_publicar: boolean }[]) {
      if (!e.avisar_quando_publicar) continue
      if (e.email) {
        const enviado = await enviarComSeguranca(e.email, montar({
          assunto: 'A ação que você mandou virou matéria',
          preheader: e.titulo.slice(0, 120),
          titulo: 'Sua ação está no site da Cruz Vermelha RJ',
          blocos: [
            { tipo: 'p', texto: mensagemDePublicacao(e.nome, e.titulo, url) },
            { tipo: 'botao', rotulo: 'Ver a matéria', url },
            { tipo: 'nota', texto: 'Continue mandando: cada ação registrada ajuda a mostrar o trabalho da filial.' },
          ],
        }))
        if (enviado) { await admin.from('envios').update({ avisado_em: new Date().toISOString() }).eq('id', e.id); continue }
      }
      if (e.whatsapp) {
        await avisarAvaliadores(admin, workspaceId, {
          envioId: e.id,
          titulo: `Avise ${e.nome.split(' ')[0]} pelo WhatsApp`,
          mensagem: `A matéria de "${e.titulo}" foi ao ar. A mensagem pronta está no botão "Avisar pelo WhatsApp" do envio.`.slice(0, 280),
        })
      }
    }
  } catch (causa) {
    console.error('[envios] aviso de publicação:', causa instanceof Error ? causa.message : causa)
  }
}
