import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarAliases } from '@/lib/google/gmail'
import { setorDoEndereco } from './setor-do-endereco'

/**
 * Traz a lista "enviar como" do Gmail para as caixas da Redação.
 *
 * Endereço e assinatura vêm SEMPRE do Gmail — é o que garante que cada
 * setor sai com a assinatura exata que está configurada lá. O setor de cada
 * caixa e se ela está ativa são decisões da Redação e não são tocados aqui.
 * Alias que sumiu do Gmail (ou perdeu a verificação) fica marcado e não
 * envia mais, sem apagar o histórico.
 *
 * Caixa nova ganha a SUGESTÃO do setor pelo endereço
 * (lib/correio/setor-do-endereco.ts) — mas continua inativa: ativar é de um
 * administrador. E o setor que ainda não tinha e-mail no Diretório passa a
 * mostrar o endereço da caixa dele.
 */
export async function sincronizarCaixas(workspaceId: string): Promise<{ total: number; novas: number; fora: number; sugeridas: number; pendentes: string[] }> {
  const todos = await listarAliases(workspaceId)
  const aliases = todos.filter((a) => a.verificado)
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const [{ data: existentes }, { data: setores }] = await Promise.all([
    admin.from('caixas_de_email').select('id, email, setor_id').eq('workspace_id', workspaceId),
    admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId),
  ])
  const porEmail = new Map((existentes ?? []).map((c) => [String(c.email).toLowerCase(), c as { id: string; setor_id: string | null }]))
  const listaDeSetores = (setores ?? []) as { id: string; nome: string; email: string | null }[]

  let novas = 0, sugeridas = 0
  const donos = new Map<string, string>()
  for (const a of aliases) {
    const dados = {
      nome_exibicao: a.nome, assinatura_html: a.assinatura, responder_para: a.responderPara,
      principal: a.principal, no_gmail: true, sincronizada_em: agora,
    }
    const existente = porEmail.get(a.email)
    // Só para caixa nova: se um administrador tirou o setor de uma caixa, a sincronização não devolve.
    const sugerido = existente ? null : setorDoEndereco(a.email, listaDeSetores)
    if (sugerido) sugeridas++
    const setor = existente?.setor_id ?? sugerido
    if (setor && !donos.has(setor)) donos.set(setor, a.email)
    if (existente) {
      await admin.from('caixas_de_email').update(dados).eq('id', existente.id)
    } else {
      // Caixa nova nasce inativa (com o setor sugerido, se houver): ninguém
      // envia por ela até um administrador ativar.
      await admin.from('caixas_de_email').insert({ ...dados, workspace_id: workspaceId, email: a.email, ativa: false, setor_id: sugerido })
      novas++
    }
  }
  // O Diretório mostra o e-mail do setor: preenche onde ainda está vazio.
  for (const s of listaDeSetores) {
    const email = donos.get(s.id)
    if (email && !s.email) await admin.from('setores').update({ email }).eq('id', s.id).is('email', null)
  }

  const noGmail = new Set(aliases.map((a) => a.email))
  const sumiram = (existentes ?? []).filter((c) => !noGmail.has(String(c.email).toLowerCase())).map((c) => c.id as string)
  if (sumiram.length) await admin.from('caixas_de_email').update({ no_gmail: false, sincronizada_em: agora }).in('id', sumiram)

  await admin.from('google_conexao').update({ sincronizada_em: agora }).eq('workspace_id', workspaceId)
  // Pendentes no Gmail (ex.: "não verificado"): aparecem na lista mas não viram caixa até serem confirmados lá.
  const pendentes = todos.filter((a) => !a.verificado).map((a) => a.email)
  return { total: aliases.length, novas, fora: sumiram.length, sugeridas, pendentes }
}

/** A frase que a tela mostra depois de sincronizar (e depois de conectar). */
export function resumoDaSincronizacao(r: Awaited<ReturnType<typeof sincronizarCaixas>>): string {
  return [
    `${r.total} endereço(s) no Gmail.`,
    r.novas ? `${r.novas} novo(s).` : '',
    r.sugeridas ? `${r.sugeridas} ligado(s) ao setor pelo nome — confira e ative.` : '',
    r.fora ? `${r.fora} sumiram do Gmail e não enviam mais.` : '',
    r.pendentes.length ? `Ainda sem confirmação no Gmail: ${r.pendentes.join(', ')} (confirme lá e sincronize de novo).` : '',
  ].filter(Boolean).join(' ')
}

/**
 * Sincroniza se a última vez foi há mais de `horas`. Nome e assinatura são
 * editados no Gmail (contato@ → Enviar e-mail como); sem isto, a Redação só
 * via a mudança quando alguém lembrava de clicar em "Sincronizar". Nunca
 * lança e não segura a tela mais de 10 segundos: com o Gmail fora do ar, vale
 * o que já estava guardado.
 */
export async function sincronizarSeAntigo(workspaceId: string, horas = 1): Promise<void> {
  try {
    const { data: conexao } = await createAdminClient().from('google_conexao')
      .select('estado, sincronizada_em').eq('workspace_id', workspaceId).maybeSingle()
    if (!conexao || conexao.estado !== 'ativa') return
    const ultima = conexao.sincronizada_em ? new Date(conexao.sincronizada_em).getTime() : 0
    if (Date.now() - ultima < horas * 60 * 60_000) return
    await Promise.race([
      sincronizarCaixas(workspaceId),
      new Promise((resolver) => setTimeout(resolver, 10_000)),
    ])
  } catch (causa) {
    console.error('[correio] sincronização automática falhou:', causa instanceof Error ? causa.message : causa)
  }
}
