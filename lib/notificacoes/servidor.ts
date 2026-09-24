import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { emailDeNotificacao } from './emails'
import { decidirEmail, lerModos, linkInterno, INTERVALO_NO_MESMO_LINK_MIN, type Categoria } from './regras'

type Admin = ReturnType<typeof createAdminClient>

export type Aviso = {
  workspaceId: string
  /** Quem recebe. Nulos, repetidos e o próprio autor são descartados. */
  para: (string | null | undefined)[]
  /** Quem causou o aviso: nunca é avisado do que ele mesmo fez. */
  atorId: string | null
  categoria: Categoria
  titulo: string
  mensagem: string
  /** Caminho interno (/chamados/…); vira o clique do sino e o botão do e-mail. */
  link: string
  /** Frase de abertura do e-mail, quando precisa ser diferente do texto do sino. */
  textoDoEmail?: string
  /** Trecho em destaque no e-mail (a mensagem, o comentário, o motivo). */
  citacao?: string | null
  botao?: string
  /** Frase pequena no fim do e-mail. */
  nota?: string
}

/**
 * O único jeito de avisar alguém na Redação: grava no sino e, conforme a
 * preferência da pessoa, manda e-mail para o endereço de recuperação
 * confirmado (lib/notificacoes/regras.ts explica quando).
 *
 * Nunca lança: o aviso é consequência de algo que já foi salvo, e falhar o
 * aviso não pode desfazer nem esconder aquilo. O e-mail sai depois da
 * resposta (after), para quem clicou não esperar o provedor.
 */
export async function notificar(admin: Admin, aviso: Aviso): Promise<void> {
  try {
    const destinos = [...new Set(aviso.para.filter((u): u is string => Boolean(u) && u !== aviso.atorId))]
    if (!destinos.length) return
    const link = linkInterno(aviso.link)
    const titulo = aviso.titulo.trim().slice(0, 200)
    const mensagem = aviso.mensagem.trim().slice(0, 280)

    const base = { workspace_id: aviso.workspaceId, title: titulo, message: mensagem, link }
    let { data: linhas, error } = await admin.from('notifications')
      .insert(destinos.map((user_id) => ({ ...base, user_id, categoria: aviso.categoria, ator_id: aviso.atorId })))
      .select('id, user_id')
    if (error) {
      // Banco ainda sem a migração das notificações: grava do jeito antigo.
      console.error('[notificacoes] gravando sem categoria:', error.message)
      ;({ data: linhas, error } = await admin.from('notifications').insert(destinos.map((user_id) => ({ ...base, user_id }))).select('id, user_id'))
      if (error) { console.error('[notificacoes] aviso não gravado:', error.message); return }
    }

    const enviar = async () => {
      try { await enviarEmails(admin, aviso, destinos, linhas ?? [], { titulo, mensagem, link }) } catch (causa) {
        console.error('[notificacoes] e-mails não enviados:', causa instanceof Error ? causa.message : causa)
      }
    }
    try { after(enviar) } catch { await enviar() }
  } catch (causa) {
    console.error('[notificacoes] falha ao avisar:', causa instanceof Error ? causa.message : causa)
  }
}

async function enviarEmails(admin: Admin, aviso: Aviso, destinos: string[], linhas: { id: string; user_id: string }[],
  texto: { titulo: string; mensagem: string; link: string | null }) {
  const agora = new Date()
  const desde = new Date(agora.getTime() - INTERVALO_NO_MESMO_LINK_MIN * 60_000).toISOString()
  const [{ data: pessoas }, { data: preferencias }, recentes] = await Promise.all([
    admin.from('profiles').select('*').in('id', destinos),
    admin.from('notificacao_preferencias').select('user_id, modos').in('user_id', destinos),
    texto.link
      ? admin.from('notifications').select('user_id, email_em').in('user_id', destinos).eq('link', texto.link).gte('email_em', desde)
      : Promise.resolve({ data: [] as { user_id: string; email_em: string }[] }),
  ])
  const modos = new Map((preferencias ?? []).map((p) => [p.user_id as string, lerModos(p.modos)]))
  const ultimo = new Map<string, string>()
  for (const r of recentes.data ?? []) if (!ultimo.has(r.user_id) || r.email_em > ultimo.get(r.user_id)!) ultimo.set(r.user_id, r.email_em)

  for (const pessoa of (pessoas ?? []) as { id: string; full_name: string; email: string | null; email_confirmado_em: string | null; active: boolean; visto_em?: string | null }[]) {
    if (!pessoa.active) continue
    const decisao = decidirEmail({
      modo: (modos.get(pessoa.id) ?? lerModos(null))[aviso.categoria],
      temEmailConfirmado: Boolean(pessoa.email && pessoa.email_confirmado_em),
      vistoEm: pessoa.visto_em,
      ultimoEmailNoMesmoLink: ultimo.get(pessoa.id),
      agora,
    })
    if (decisao !== 'agora') continue
    const enviado = await enviarComSeguranca(pessoa.email!, emailDeNotificacao({
      urlBase: urlBase(), nome: pessoa.full_name, titulo: texto.titulo, mensagem: aviso.textoDoEmail ?? texto.mensagem, link: texto.link,
      citacao: aviso.citacao, botao: aviso.botao, nota: aviso.nota,
    }))
    const linha = linhas.find((l) => l.user_id === pessoa.id)
    if (enviado && linha) await admin.from('notifications').update({ email_em: new Date().toISOString() }).eq('id', linha.id)
  }
}

/**
 * Marca que a pessoa está com a Redação aberta (para não mandar e-mail do
 * que ela está vendo). Escreve no máximo uma vez por minuto.
 */
export async function marcarVisto(userId: string, vistoEm: string | null | undefined) {
  const ultimo = vistoEm ? new Date(vistoEm).getTime() : 0
  if (Date.now() - ultimo < 60_000) return
  try {
    await createAdminClient().from('profiles').update({ visto_em: new Date().toISOString() }).eq('id', userId)
  } catch { /* sem a coluna ainda: sem problema */ }
}
