import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { diaEmSaoPaulo, hora } from '@/lib/portaria/regras'
import { nivelDoNome } from '@/lib/participantes/regras'
import { TIPOS_DE_RESPOSTA, horasDaAtividade, quando } from '@/lib/oportunidades/regras'
import {
  ACOES_NA_ESCOLHA, BOTOES_DA_CHAMADA, BOTOES_DA_CONFERENCIA, INSCRITOS_NA_CHAMADA, TEXTO_SEM_ACAO_PELO_WHATSAPP, ehConfirmacao, interativoDaEscolha,
  lerEscolha, lerMarcacaoDePresenca, textoDaChamada, textoDaConferenciaDaPresenca, textoDaEscolha, textoDaPresencaMarcada, textoSemAcaoHoje,
  type Opcao,
} from './regras'
import { INDISPONIVEL, encerrarPendencia, podeAgirPeloWhatsapp, semFuncao, type Pendencia, type Pessoa, type Resposta } from './acoes'

/**
 * A presença das ações do Voluntariado pelo WhatsApp (a chamada):
 *
 *  - "presença" (ou "chamada", "marcar presença") lista as ações de hoje com
 *    a presença liberada — já começaram e não acabaram antes de hoje, sem as
 *    que só pedem resposta (aviso, enquete, quiz) e sem as canceladas; com
 *    mais de uma, a pessoa escolhe;
 *  - a chamada: os inscritos da ação (inscrito, presente ou ausente), por
 *    nome, numerados, com o que já foi marcado; a pessoa responde com os
 *    números de quem veio ("1 3 4", "1 a 5", "todos", "todos menos 3",
 *    "faltas 2 6") — lerMarcacaoDePresenca, em regras.ts;
 *  - a conferência ("confirmo"), e cada marcação passa pela MESMA função da
 *    tela, registrar_presenca (o botão "Presente"/"Ausente" de
 *    app/actions/oportunidades.ts, marcarPresenca), chamada como quem
 *    escreveu por whatsapp_registrar_presenca (sessão simulada aal1). As
 *    horas são as da tela: as da oportunidade ou a duração dela (o banco
 *    calcula com p_horas nulo, como o campo da tela vem preenchido).
 *
 * Quem marca é quem a tela deixa: o nível do Voluntariado lido como o banco
 * lê (private.nivel_participantes: admin tem tudo; os outros, o que
 * participantes_acesso diz), "gerenciar" ou mais. A equipe da Escola não abre
 * o Voluntariado, então não marca. Telefone e e-mail dos inscritos não vêm por
 * aqui. Marcar é ação (podeAgirPeloWhatsapp): quem usa a verificação em duas
 * etapas marca pela tela — e o banco recusa de novo (nivel_participantes é 0
 * na sessão aal1 de quem tem o fator).
 *
 * As etapas ficam em whatsapp_pendencias (tipo "marcar_presenca", migração
 * 20261018233000): antes dela, o banco recusa a pergunta e o bot manda para a
 * tela da ação.
 */

type Admin = ReturnType<typeof createAdminClient>

type AcaoNaConversa = { id: string; titulo: string; quando: string; horas: number }
type InscritoNaConversa = { id: string; nome: string; situacao: string }
type DadosDaPresenca = {
  etapa?: 'acao' | 'chamada' | 'conferencia'
  /** As ações da escolha, quando há mais de uma. */
  acoes?: AcaoNaConversa[]
  acao?: AcaoNaConversa
  /** Os inscritos na ordem da lista mostrada (o número da resposta é a posição). */
  inscritos?: InscritoNaConversa[]
  /**
   * Os números escolhidos na lista (a posição em `inscritos`, de 1 em diante): números, não ids, para a
   * pergunta caber folgada no limite de `whatsapp_pendencias.dados` (8000 bytes) com 40 inscritos.
   */
  presentes?: number[]
  ausentes?: number[]
}

const SITUACOES_DA_CHAMADA = ['inscrito', 'presente', 'ausente']

/** O nível no Voluntariado, como o banco lê sem sessão; a equipe da Escola não abre a área (0). */
export async function nivelNoVoluntariado(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<number> {
  if (ehEquipeDaEscola(pessoa.papel)) return 0
  if (pessoa.papel === 'admin') return 3
  try {
    const { data } = await admin.from('participantes_acesso').select('nivel').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
    return nivelDoNome(data?.nivel as string | null | undefined)
  } catch {
    return 0
  }
}

/** Marca presença quem coordena as oportunidades (a mesma permissão do botão "Presente" da tela). Na dúvida, não. */
export const coordenaAcoes = async (admin: Admin, workspaceId: string, pessoa: Pessoa) => (await nivelNoVoluntariado(admin, workspaceId, pessoa)) >= 2

/** Meia-noite de hoje em Brasília, em UTC (o fuso é fixo, UTC−3). */
const inicioDeHoje = () => new Date(`${diaEmSaoPaulo(new Date())}T00:00:00-03:00`).toISOString()

/** O "presença": as ações de hoje com a presença liberada (uma vai direto à chamada). null para quem não coordena (o bot segue como sempre). */
export async function comecarPresenca(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<Resposta | null> {
  if (!await coordenaAcoes(admin, workspaceId, pessoa)) return null
  const lista = `${base}/voluntariado/oportunidades`
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${lista}` }
  const agora = new Date().toISOString()
  const hoje = inicioDeHoje()
  const amanha = new Date(Date.parse(hoje) + 86_400_000).toISOString()
  const naoDeResposta = `(${TIPOS_DE_RESPOSTA.join(',')})`
  const [{ data: liberadas, error }, { data: depois }] = await Promise.all([
    admin.from('oportunidades').select('id, titulo, inicio, fim, horas').eq('workspace_id', workspaceId).is('cancelada_em', null)
      .not('tipo', 'in', naoDeResposta).lte('inicio', agora).gte('fim', hoje).order('inicio', { ascending: false }).limit(ACOES_NA_ESCOLHA),
    admin.from('oportunidades').select('titulo, inicio').eq('workspace_id', workspaceId).is('cancelada_em', null)
      .not('tipo', 'in', naoDeResposta).gt('inicio', agora).lt('inicio', amanha).order('inicio').limit(3),
  ])
  if (error) return { texto: `Não consegui ler as ações de hoje agora. Marque pela tela: ${lista}` }
  const acoes: AcaoNaConversa[] = (liberadas ?? []).map((o) => ({
    id: o.id as string, titulo: (o.titulo as string | null)?.trim() || 'Ação', quando: quando(o.inicio as string, o.fim as string),
    horas: horasDaAtividade({ inicio: o.inicio as string, fim: o.fim as string, horas: o.horas === null ? null : Number(o.horas) }),
  }))
  if (!acoes.length) {
    return { texto: textoSemAcaoHoje({ depois: (depois ?? []).map((o) => ({ titulo: (o.titulo as string | null) ?? 'Ação', hora: hora(o.inicio as string) })), urlBase: base }) }
  }
  if (acoes.length === 1) return chamada(admin, workspaceId, { acao: acoes[0] }, base)
  const opcoes: Opcao[] = acoes.map((a) => ({ nome: a.titulo, detalhe: a.quando }))
  return {
    texto: textoDaEscolha({ pergunta: 'Qual ação? Estas estão com a presença liberada hoje:', opcoes }),
    pergunta: { tipo: 'marcar_presenca', dados: { etapa: 'acao', acoes } satisfies DadosDaPresenca },
    interativo: interativoDaEscolha(opcoes, { cancelar: 'Não marcar agora' }),
    semPergunta: `${textoDaEscolha({ pergunta: 'Estas ações estão com a presença liberada hoje:', opcoes, rodape: '' }).trim()}\n\nMarque pela tela: ${lista}`,
  }
}

/** A chamada da ação: os inscritos por nome, numerados, e a pergunta de quem veio. */
async function chamada(admin: Admin, workspaceId: string, d: DadosDaPresenca & { acao: AcaoNaConversa }, base: string, pendenciaId?: number): Promise<Resposta> {
  const tela = `${base}/voluntariado/oportunidades/${d.acao.id}#inscritos`
  // A tela e o banco aceitam de 0,25 a 24 h por presença: a ação mais longa pede as horas na tela.
  if (!(d.acao.horas > 0 && d.acao.horas <= 24)) return { texto: `A *${d.acao.titulo}* passa de 24 h: marque a presença pela tela, dizendo as horas de cada um. ${tela}` }
  const { data, error } = await admin.from('oportunidade_inscricoes').select('id, situacao, participantes(nome, nome_social)')
    .eq('workspace_id', workspaceId).eq('oportunidade_id', d.acao.id).in('situacao', SITUACOES_DA_CHAMADA).limit(500)
  if (error) return { texto: `Não consegui ler os inscritos agora. Marque pela tela: ${tela}` }
  const inscritos: InscritoNaConversa[] = (data ?? []).map((i) => {
    const p = (Array.isArray(i.participantes) ? i.participantes[0] : i.participantes) as { nome?: string | null; nome_social?: string | null } | null
    // O nome vai cortado como a lista mostra (limpo, 60): é ele que fica guardado na pergunta.
    return { id: i.id as string, nome: (p?.nome_social?.trim() || p?.nome?.trim() || 'Voluntário').slice(0, 60), situacao: i.situacao as string }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  if (!inscritos.length) return { texto: `Ninguém está inscrito na *${d.acao.titulo}*. A ação: ${tela}` }
  if (inscritos.length > INSCRITOS_NA_CHAMADA) {
    return { texto: `A *${d.acao.titulo}* tem ${inscritos.length} inscritos: a chamada por aqui vai até ${INSCRITOS_NA_CHAMADA}. Marque pela tela: ${tela}` }
  }
  const texto = textoDaChamada({ titulo: d.acao.titulo, quando: d.acao.quando, inscritos, horas: d.acao.horas })
  return {
    texto,
    pergunta: { tipo: 'marcar_presenca', dados: { etapa: 'chamada', acao: d.acao, inscritos } satisfies DadosDaPresenca, id: pendenciaId },
    interativo: BOTOES_DA_CHAMADA,
    semPergunta: `${INDISPONIVEL}: ${tela}`,
  }
}

/**
 * A resposta à pergunta aberta. `estrita` = a pessoa citou a pergunta: o que
 * não serve é pedido de novo; sem citar, devolve null e segue como mensagem comum.
 */
export async function seguirPresenca(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDaPresenca
  const deNovo = (t: string) => (estrita ? { texto: t } : null)
  const avancar = async (r: Resposta) => {
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }

  if (d.etapa === 'acao' && d.acoes?.length) {
    const n = lerEscolha(texto, d.acoes.length)
    if (!n) return deNovo(`Responda com o número da ação (1 a ${d.acoes.length}), ou *cancelar*.`)
    return avancar(await chamada(admin, workspaceId, { acao: d.acoes[n - 1] }, base, p.id))
  }
  if (d.etapa === 'chamada' && d.acao && d.inscritos?.length) {
    const inscritos = d.inscritos
    const marcacao = lerMarcacaoDePresenca(texto, inscritos.length)
    if (!marcacao) {
      return deNovo(`Não entendi. Responda com os números de quem veio (de 1 a ${inscritos.length}; ex.: _1 3 4_ ou _1 a 5_), *todos*, _todos menos 3_ ou _faltas 2 6_. Ou *cancelar*.`)
    }
    const presentes = marcacao.presentes.map((n) => inscritos[n - 1])
    const ausentes = marcacao.ausentes.map((n) => inscritos[n - 1])
    return {
      texto: textoDaConferenciaDaPresenca({ titulo: d.acao.titulo, quando: d.acao.quando, presentes: presentes.map((i) => i.nome), ausentes: ausentes.map((i) => i.nome), horas: d.acao.horas }),
      pergunta: { tipo: 'marcar_presenca', id: p.id, dados: { ...d, etapa: 'conferencia', presentes: marcacao.presentes, ausentes: marcacao.ausentes } satisfies DadosDaPresenca },
      interativo: BOTOES_DA_CONFERENCIA,
    }
  }
  if (d.etapa !== 'conferencia' || !d.acao || !d.inscritos) {
    await encerrarPendencia(admin, p.id)
    return { texto: `Não consegui continuar. Marque pela tela: ${base}/voluntariado/oportunidades` }
  }

  if (!ehConfirmacao(texto)) return estrita ? { texto: 'Para marcar, responda a conferência com *confirmo*; para desistir, *cancelar*.' } : null
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta chamada já foi marcada.' }
  const tela = `${base}/voluntariado/oportunidades/${d.acao.id}#inscritos`
  if (!await coordenaAcoes(admin, workspaceId, pessoa) || !await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${tela}` }
  return marcar(admin, workspaceId, pessoa, d as DadosDaPresenca & { acao: AcaoNaConversa; inscritos: InscritoNaConversa[] }, tela)
}

/**
 * Marca cada um pela mesma função da tela (registrar_presenca, como quem escreveu): presente lança as horas da
 * ação no cadastro; ausente tira as que esta ação tinha lançado. Uma recusa (ação que ainda não começou, inscrição
 * que mudou) não para as outras: sai na resposta, com o motivo do banco.
 */
async function marcar(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaPresenca & { acao: AcaoNaConversa; inscritos: InscritoNaConversa[] }, tela: string): Promise<Resposta> {
  // O número da lista vira a inscrição mostrada; número que não está na lista (não acontece: a resposta foi conferida) fica de fora.
  const daLista = (presente: boolean) => (n: number) => (d.inscritos[n - 1] ? [{ inscrito: d.inscritos[n - 1], presente }] : [])
  const pedidos = [...(d.presentes ?? []).flatMap(daLista(true)), ...(d.ausentes ?? []).flatMap(daLista(false))]
  const falhas: { nome: string; motivo: string }[] = []
  let presentes = 0
  let ausentes = 0
  for (const pedido of pedidos) {
    const { error } = await admin.rpc('whatsapp_registrar_presenca', {
      p_user_id: pessoa.id, p_workspace_id: workspaceId, p_inscricao_id: pedido.inscrito.id, p_presente: pedido.presente, p_horas: null,
    })
    if (semFuncao(error)) return { texto: `${INDISPONIVEL}: ${tela}` }
    if (error) {
      falhas.push({ nome: pedido.inscrito.nome, motivo: error.code === 'P0001' && error.message ? error.message : 'não foi possível registrar.' })
      continue
    }
    if (pedido.presente) presentes++
    else ausentes++
  }
  return { texto: textoDaPresencaMarcada({ titulo: d.acao.titulo, presentes, ausentes, horas: d.acao.horas, falhas, link: tela }) }
}
