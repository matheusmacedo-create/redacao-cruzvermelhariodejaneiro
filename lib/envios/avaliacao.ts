import 'server-only'
import { urlBase } from '@/lib/newsletter/contexto'
import { put, del } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT, fileKind, safeExtension } from '@/lib/storage'
import { TIPOS_OTIMIZAVEIS, nomeFinal, otimizarImagem } from '@/lib/midia/otimizar-imagem'
import { TETO_PARA_OTIMIZAR, farejarTipo, type TipoFarejado } from '@/lib/midia/regras'
import { montar } from '@/lib/contas/emails'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { AUTORIZACOES, mensagemDePublicacao, nomeDaChave, tamanhoLegivel, type Autorizacao } from './regras'
import { armazenamento, avisarAvaliadores } from './servidor'

/**
 * O que acontece depois que um envio chega (docs/envio-de-acoes.md §5):
 * copiar para a Biblioteca o que vai ser publicado e avisar quem enviou
 * quando a ação virou matéria.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ArquivoDoEnvio = { id: string; chave: string; nome: string; tipo_mime: string | null; tamanho: number; categoria: string; file_id: string | null }

/** O tipo pelo conteúdo: o declarado no envio é só o que o aparelho disse. */
const PELO_CONTEUDO: Partial<Record<TipoFarejado, string>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/**
 * Copia um arquivo do R2 para a Biblioteca (Vercel Blob). Foto é lida
 * inteira e gravada leve (lib/midia/otimizar-imagem.ts: JPEG girado, sem
 * metadados — o GPS do celular sai —, lado maior de 2048 px); vídeo e o
 * resto vão em fluxo, sem passar inteiros pela memória. O original continua
 * no acervo (R2). Devolve o id do arquivo na Biblioteca ou o motivo de ter
 * ficado de fora (tipo, tamanho ou cota).
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

  let corpo: ReadableStream<Uint8Array> | Buffer = resposta.body
  let tipoFinal = tipo
  let nome = nomeDaChave(arquivo.chave)
  let tamanho = arquivo.tamanho
  let otimizadoEm: string | null = null
  let tamanhoOriginal: number | null = null
  if (TIPOS_OTIMIZAVEIS.has(tipo) && arquivo.tamanho <= TETO_PARA_OTIMIZAR) {
    const bytes = Buffer.from(await resposta.arrayBuffer())
    corpo = bytes
    tamanho = bytes.length
    // O sharp só abre o que o conteúdo confirma ser foto; o resto vai como veio.
    const real = PELO_CONTEUDO[farejarTipo(bytes)]
    if (real) {
      try {
        const foto = await otimizarImagem(bytes, real, 'padrao')
        corpo = foto.bytes
        tipoFinal = foto.tipo
        nome = nomeFinal(nome, foto)
        tamanho = foto.bytes.length
        // Mesmo sem mudar (mudou=false), passou pelo otimizador: não volta a ser candidata.
        otimizadoEm = new Date().toISOString()
        tamanhoOriginal = bytes.length
      } catch (causa) {
        console.error('[envios] a foto não pôde ser otimizada, vai como veio:', arquivo.nome, causa instanceof Error ? causa.message : causa)
      }
    }
    // A conferência de cima usou o tamanho do original; a versão com
    // metadados tirados pode, raramente, sair maior.
    if (p.usado.bytes + tamanho > WORKSPACE_STORAGE_LIMIT) return { motivo: `${arquivo.nome}: a Biblioteca está cheia (${tamanhoLegivel(WORKSPACE_STORAGE_LIMIT)}).` }
  }

  const caminho = `workspaces/${p.workspaceId}/library/${crypto.randomUUID()}${safeExtension(nome)}`
  const blob = await put(caminho, corpo, {
    access: 'private', addRandomSuffix: false, contentType: tipoFinal, multipart: !Buffer.isBuffer(corpo) && arquivo.tamanho > 50 * 1024 * 1024,
  })
  const { data, error } = await admin.from('files').insert({
    workspace_id: p.workspaceId,
    // O nome canônico (data-assunto-autor-número) na Biblioteca; o do celular fica como original.
    name: nome, original_name: arquivo.nome,
    file_type: fileKind(tipoFinal), content_type: tipoFinal,
    storage_path: blob.pathname, size_bytes: tamanho, status: 'available',
    // O que a pessoa declarou no envio: "todos autorizaram" libera; o resto a comunicação confere.
    authorization_status: AUTORIZACOES[p.autorizacao].podePublicar ? 'authorized' : 'pending',
    tags: ['envio-da-equipe', `credito:${p.credito}`.slice(0, 60)],
    uploaded_by: p.usuarioId,
    otimizado_em: otimizadoEm,
    tamanho_original: tamanhoOriginal,
  }).select('id').single()
  if (error || !data) {
    // Blob sem linha no banco é arquivo invisível ocupando espaço para sempre.
    await del(blob.pathname).catch(() => {})
    return { motivo: `${arquivo.nome}: não foi possível registrar na Biblioteca.` }
  }
  p.usado.bytes += tamanho
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
    // O álbum do evento, se o envio é de um evento com o álbum ligado: vai junto no e-mail.
    const ids = (envios ?? []).map((e) => e.id as string)
    const albumDe = new Map<string, string>()
    if (ids.length) {
      const { data: comEvento } = await admin.from('envios').select('id, envio_eventos(album_token)').in('id', ids).not('evento_id', 'is', null)
      for (const l of (comEvento ?? []) as { id: string; envio_eventos: { album_token: string | null } | { album_token: string | null }[] | null }[]) {
        const ev = Array.isArray(l.envio_eventos) ? l.envio_eventos[0] : l.envio_eventos
        if (ev?.album_token) albumDe.set(l.id, `${urlBase()}/album/${ev.album_token}`)
      }
    }
    for (const e of (envios ?? []) as { id: string; nome: string; titulo: string; email: string | null; whatsapp: string | null; avisar_quando_publicar: boolean }[]) {
      if (!e.avisar_quando_publicar) continue
      const album = albumDe.get(e.id)
      if (e.email) {
        const enviado = await enviarComSeguranca(e.email, montar({
          assunto: 'A ação que você mandou virou matéria',
          preheader: e.titulo.slice(0, 120),
          titulo: 'Sua ação está no site da Cruz Vermelha RJ',
          blocos: [
            { tipo: 'p', texto: mensagemDePublicacao(e.nome, e.titulo, url) },
            { tipo: 'botao', rotulo: 'Ver a matéria', url },
            ...(album ? [{ tipo: 'item' as const, titulo: 'O álbum do evento', texto: 'As fotos de todo mundo que esteve lá, para ver e baixar.', url: album }] : []),
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
