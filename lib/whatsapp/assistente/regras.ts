import { createHash } from 'node:crypto'
import { agoraEmBrasilia, diferencaEmDias } from '@/lib/agenda/datas'
import { RESPOSTAS } from '@/lib/portaria/regras'
import {
  CONFIRMACAO_VALE_MIN, LIMITES_DO_INTERATIVO, LINHA_DO_NAO_FUI_EU, MOTIVO_MINIMO, ehConfirmacao, lerDecisao, lerEscolha, limpo, normalizar, respostaParaWhatsapp, semInvisiveis,
  textoDoLinkDeConfirmacao, type Comando, type Interativo, type ResultadoDaAcao,
} from '../regras'

export { semInvisiveis }

/**
 * Regras do assistente do WhatsApp (o Claude que entende linguagem natural no número do Palácio), sem banco
 * nem rede — conferidas por `npx tsx scripts/conferir-assistente.ts`.
 *
 * O desenho é de segurança (a especificação está em ARQUITETURA §8.5): nenhuma frase do modelo, nenhum texto de
 * terceiro e nenhum dado guardado bastam para escrever no Palácio.
 *  - o modelo não tem ferramenta que escreva: preparar_* só acrescenta um passo a um rascunho; nada sai antes de
 *    a pessoa confirmar o plano EXATO, escrito aqui a partir do banco (textoDoPlano);
 *  - quem age vem do número; o modelo só aponta para itens que o código mostrou (os marcadores, marcadores.ts);
 *  - um preparar_* só vale se a MENSAGEM DA PRÓPRIA PESSOA pediu aquele tipo de ação (acoesPermitidas);
 *  - a confirmação é lida pelo código ("confirmo" escrito depois de o plano chegar, ou o botão com o hash);
 *  - o texto de terceiros entra neutro (dadoDeTerceiro) e nunca imita um marcador nem uma linha do plano.
 *
 * Nada aqui lança: entrada estranha vira recusa, null ou o texto fixo.
 */

// ------------------------------------------------------------------ limites

export const LIMITES = {
  /** Por turno (uma mensagem da pessoa). */
  chamadas: 4, leituras: 8, prazoMs: 40_000, folgaMs: 6_000, maxTokens: 8_000, entrada: 2_000,
  itensNoResultado: 10, caracteresNoResultado: 3_000, ferramentas: 20,
  /** Cada leitura (ms), cada chamada ao modelo (ms) e o que tem de sobrar do prazo para repetir uma chamada que falhou. */
  leituraMs: 8_000, chamadaMs: 25_000, repetirComMs: 12_000,
  /** Menos que isso até o fim do lote: nem começa o turno (sai o texto fixo de "não consegui terminar"). */
  turnoMinimoMs: 15_000,
  /** A vez de cada pessoa (um turno por vez): segura por tanto, e quem chega espera até tanto, de 1 em 1 s. */
  vezSegundos: 60, esperaDaVezMs: 15_000,
  /** Por plano. */
  passos: 8, votos: 3, destinatarios: 3, mensagem: 1_000, comentario: 4_000, relato: 4_000, recado: 200, local: 140, nota: 2_000,
  textoDoPlano: 3_800, mensagensDoPlano: 4,
  /** O registro de visita (os tamanhos da tela da portaria) e o motivo de uma decisão do Financeiro (recusar exige MOTIVO_MINIMO letras). */
  visitante: 120, empresa: 120, motivoDaVisita: 300, motivoFinanceiro: 500, motivoMinimo: MOTIVO_MINIMO,
  /** O nome que a pessoa pediu para o documento guardado no Drive (o mesmo teto de lib/google/drive-regras.ts). */
  nomeDoArquivo: 120,
  /** O plano sensível espera a confirmação no Palácio por tanto (o link vale o mesmo: CONFIRMACAO_VALE_MIN). */
  noPalacioMin: CONFIRMACAO_VALE_MIN,
  /** O eco do áudio (o que o código entendeu da transcrição da Kapso). */
  eco: 300,
  /** Por pessoa, por dia: planos executados (as mensagens diretas ficam em whatsapp_ia_config.mensagens_dia). */
  planosDia: 20,
  /** Pergunta e busca. */
  pergunta: 120, pedidoEmAberto: 300, opcoesMin: 2, opcoesMax: 10, buscaMin: 3, buscaMax: 60, agendaDias: 14, ajuda: 300,
  /** Prazos (min). */
  planoValeMin: 15, recenteMin: 2, executandoMin: 10, memoriaMin: 30, repetidaMin: 10,
  /** O assentamento do "confirmo" por texto: espera até tantos ms depois do envio (outra mensagem pode estar chegando). */
  assentarMs: 3_000,
} as const

// ------------------------------------------------------------------ preços e custo

/** US$ por milhão de tokens. Cache 5 min = 1,25× a entrada; 1 h = 2×; leitura = 0,05× no Opus 5.5 e 0,1× nos outros. */
export type Precos = { entrada: number; saida: number; cache5m: number; cache1h: number; leitura: number }

export const MODELO_PADRAO_DO_ASSISTENTE = 'claude-opus-5-5'

/** Os preços do modelo do assistente e dos recuos da API (fallbacks: 'default'). Modelo desconhecido paga como o padrão. */
export const PRECOS_POR_MTOK: Record<string, Precos> = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cache5m: 5, cache1h: 8, leitura: 0.2 },
  'claude-opus-5': { entrada: 5, saida: 25, cache5m: 6.25, cache1h: 10, leitura: 0.5 },
  'claude-opus-4-8': { entrada: 5, saida: 25, cache5m: 6.25, cache1h: 10, leitura: 0.5 },
}

/** Os preços pelo nome exato ou pelo mais longo que é começo dele (o nome com data); senão, os do padrão. */
export function precosDoModelo(modelo: string | null | undefined): { precos: Precos; conhecido: boolean } {
  const m = String(modelo ?? '').trim()
  if (PRECOS_POR_MTOK[m]) return { precos: PRECOS_POR_MTOK[m], conhecido: true }
  const prefixo = Object.keys(PRECOS_POR_MTOK).filter((k) => m.startsWith(`${k}-`) && !/^\d-/.test(m.slice(k.length + 1))).sort((a, b) => b.length - a.length)[0]
  return prefixo ? { precos: PRECOS_POR_MTOK[prefixo], conhecido: true } : { precos: PRECOS_POR_MTOK[MODELO_PADRAO_DO_ASSISTENTE], conhecido: false }
}

type TokensDaChamada = {
  input_tokens: number; output_tokens: number
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null
}

/** O `usage` da resposta, no formato da API (com `iterations` quando houve recuo ou mais de uma volta no servidor). */
export type UsoDaChamada = TokensDaChamada & { iterations?: (Partial<TokensDaChamada> & { type: string; model?: string })[] | null }

function custoDosTokens(t: Partial<TokensDaChamada>, p: Precos): number {
  const escrita = t.cache_creation
    ? (t.cache_creation.ephemeral_5m_input_tokens ?? 0) * p.cache5m + (t.cache_creation.ephemeral_1h_input_tokens ?? 0) * p.cache1h
    : (t.cache_creation_input_tokens ?? 0) * p.cache5m
  return ((t.input_tokens ?? 0) * p.entrada + (t.output_tokens ?? 0) * p.saida + (t.cache_read_input_tokens ?? 0) * p.leitura + escrita) / 1_000_000
}

/**
 * O custo estimado de uma chamada, em US$ (5 casas, como whatsapp_ia_uso.custo_usd). Com `iterations`, cada uma
 * paga o preço do modelo que a fez (o recuo cobra pelo modelo de destino). `desconhecido`: algum modelo sem preço
 * na tabela (pago como o padrão; quem chama registra no log).
 */
export function custoEstimado(uso: UsoDaChamada, modelo: string): { usd: number; desconhecido: boolean } {
  let desconhecido = false
  const precoDe = (m: string | undefined) => {
    const r = precosDoModelo(m ?? modelo)
    if (!r.conhecido) desconhecido = true
    return r.precos
  }
  const iteracoes = (uso.iterations ?? []).filter((i) => i && (i.type === 'message' || i.type === 'fallback_message'))
  const usd = iteracoes.length
    ? iteracoes.reduce((soma, i) => soma + custoDosTokens(i, precoDe(i.model)), 0)
    : custoDosTokens(uso, precoDe(modelo))
  return { usd: Math.round(usd * 100_000) / 100_000, desconhecido }
}

// ------------------------------------------------------------------ tetos

export type TetosDoAssistente = { teto_usd_dia: number; teto_usd_pessoa_dia: number; turnos_pessoa_hora: number; turnos_pessoa_dia: number }
export type Teto = 'turnos_hora' | 'turnos_dia' | 'pessoa' | 'espaco'

/** Os tetos de whatsapp_ia_config quando a linha não diz (os padrões da migração). */
export const TETOS_PADRAO: TetosDoAssistente & { leituras_detalhe_dia: number; mensagens_dia: number } = {
  teto_usd_dia: 10, teto_usd_pessoa_dia: 1, turnos_pessoa_hora: 20, turnos_pessoa_dia: 60, leituras_detalhe_dia: 40, mensagens_dia: 10,
}

/**
 * Qual teto a mensagem bateu; null = segue. Os da pessoa (turnos e US$) barram só ela; o do espaço desliga o
 * assistente para todos até a meia-noite de Brasília. Contagens e gastos já são "desde" (hora corrida, dia de Brasília).
 */
export function decidirTeto(p: { config: TetosDoAssistente; turnosNaHora: number; turnosNoDia: number; gastoDoEspaco: number; gastoDaPessoa: number }): Teto | null {
  if (p.gastoDoEspaco >= Number(p.config.teto_usd_dia)) return 'espaco'
  if (p.gastoDaPessoa >= Number(p.config.teto_usd_pessoa_dia)) return 'pessoa'
  if (p.turnosNoDia >= p.config.turnos_pessoa_dia) return 'turnos_dia'
  if (p.turnosNaHora >= p.config.turnos_pessoa_hora) return 'turnos_hora'
  return null
}

/** A meia-noite de Brasília do dia de `agora` (o Brasil não tem horário de verão desde 2019: −03:00). */
export function inicioDoDiaEmBrasilia(agora: Date): Date {
  return new Date(`${agoraEmBrasilia(agora).dia}T00:00:00-03:00`)
}

// ------------------------------------------------------------------ quem o assistente atende e a confiança do número

export type ModoDoAssistente = 'desligado' | 'piloto' | 'admins' | 'equipe'

/** O modo do espaço cobre a pessoa? desligado: ninguém; piloto: só as da lista; admins: quem administra; equipe: todos. A escola fica fora da v1. */
export function modoCobre(config: { modo: string; piloto: readonly string[] }, pessoa: { id: string; papel: string }): boolean {
  if (pessoa.papel === 'escola') return false
  if (config.modo === 'equipe') return true
  if (config.modo === 'admins') return pessoa.papel === 'admin'
  if (config.modo === 'piloto') return config.piloto.includes(pessoa.id)
  return false
}

/** O número é de confiança recente: confirmado há menos de tantos dias, ou login no Palácio há menos de tantos. */
export const CONFIANCA_DO_NUMERO = { confirmacaoDias: 180, loginDias: 60 } as const

/** O mesmo nome de perfil, sem diferença de acento, maiúscula, espaço ou caractere invisível. */
export const mesmoNome = (a: string, b: string) => normalizar(semInvisiveis(a)) === normalizar(semInvisiveis(b))

/**
 * A confiança do número (com o que whatsapp_contas e o login dizem): suspenso por troca de nome fica parado até a
 * pessoa confirmar o número de novo; sem nome guardado (contas de antes), grava o primeiro que vier; nome de perfil
 * diferente do guardado suspende (número reciclado ou trocado de mão). Sem nome no payload, nada muda. `recente`:
 * sem ela, só a leitura pessoal e nenhuma escrita pelo assistente.
 */
export function decidirConfianca(p: {
  confirmadoEm: string | null; nomeGuardado: string | null; suspensoEm: string | null; nomeAgora: string | null; ultimoLogin: string | null; agora: number
}): { acao: 'nada' | 'gravar_nome' | 'suspender'; suspenso: boolean; recente: boolean } {
  const dentro = (iso: string | null, dias: number) => {
    const t = iso ? Date.parse(iso) : NaN
    return Number.isFinite(t) && p.agora - t < dias * 86_400_000
  }
  const recente = dentro(p.confirmadoEm, CONFIANCA_DO_NUMERO.confirmacaoDias) || dentro(p.ultimoLogin, CONFIANCA_DO_NUMERO.loginDias)
  if (p.suspensoEm) return { acao: 'nada', suspenso: true, recente }
  const agora = p.nomeAgora?.trim() || null
  if (!agora) return { acao: 'nada', suspenso: false, recente }
  if (!p.nomeGuardado?.trim()) return { acao: 'gravar_nome', suspenso: false, recente }
  if (!mesmoNome(p.nomeGuardado, agora)) return { acao: 'suspender', suspenso: true, recente }
  return { acao: 'nada', suspenso: false, recente }
}

// ------------------------------------------------------------------ textos fixos (o código escreve; o modelo nunca)

export const TEXTOS_FIXOS = {
  velho: 'Este plano não vale mais: já foi respondido, venceu ou foi trocado.',
  revisao: 'Você pediu uma mudança neste plano; espere o plano novo (ou responda *cancelar*).',
  antes_do_plano: 'Esse *confirmo* foi escrito antes de o plano chegar. Confira o plano e responda de novo.',
  cite_o_plano: 'Para confirmar, responda *confirmo* citando o plano (ou toque em Confirmar).',
  ja_escolheu: 'Você já escolheu; confira o plano acima.',
  nada_aberto: 'Não há plano aberto; nada foi feito.',
  /** O "confirmo" do plano que já espera o Palácio (o link saiu): a confirmação é lá; "cancelar" ainda desiste dele. */
  no_palacio: `Este plano já espera a confirmação no Palácio: use o link que mandei (vale ${CONFIRMACAO_VALE_MIN} minutos desde o *confirmo*). Para desistir, responda *cancelar*.`,
  quase: 'Para fazer, responda *confirmo* (ou toque em Confirmar). Para desistir, *cancelar*.',
  cancelado: 'Pronto: nada foi feito.',
  ocupado: 'Ainda estou cuidando da sua mensagem anterior; responda de novo em instantes.',
  obrigado: 'Disponha.',
  esquecido: 'Pronto, começamos do zero.',
  recusa: 'Não consigo tratar esse pedido por aqui. Tente com outras palavras, ou responda *menu*.',
  sem_tempo: 'Não consegui terminar agora. Tente de novo em poucas palavras, ou responda *menu*.',
  fora_do_ar: 'O assistente está fora do ar agora; os comandos do *menu* continuam valendo.',
  cota: 'Você usou bastante o assistente hoje; os comandos do *menu* continuam valendo.',
  repetida: 'Já respondi essa mensagem há pouco. Se quiser outra coisa, escreva de outro jeito.',
  grande: 'Esse pedido ficou grande para o WhatsApp; faça pelo Palácio.',
  nao_fiz: 'Não fiz nada ainda. Diga o que quer que eu prepare.',
  plano_nao_saiu: 'Não consegui mandar o plano; peça de novo.',
  mensagem_no_meio: 'Recebi outra mensagem sua antes deste *confirmo*; confira o plano e responda de novo.',
  escrita_desligada: 'Pedir ações por aqui não está ligado para esta pessoa; faça pelo Palácio ou pelos comandos do menu.',
  numero_antigo: 'Faz tempo que este número não é confirmado nem há login no Palácio. Para pedir ações por aqui, confirme o número de novo: em Meu perfil → WhatsApp, toque em “Trocar número” e confirme o mesmo número.',
  so_no_palacio: 'Isso só pelo Palácio.',
  limite_de_detalhe: 'Limite de consultas detalhadas de hoje; veja no Palácio.',
  limite_do_turno: 'Limite de consultas desta mensagem.',
  nao_pediu: 'A pessoa não pediu esse tipo de ação nesta mensagem.',
  conta_mudou: 'sua conta mudou desde o plano (a verificação em duas etapas, o papel ou o número)',
  /** O preparo de quem usa a verificação em duas etapas (até a confirmação no Palácio): ao modelo, e o motivo à pessoa, com o link do código. */
  dois_fatores: 'A conta desta pessoa usa a verificação em duas etapas: votos, mensagens e comentários dela são feitos pelo Palácio (o sistema manda o link). Diga isso em uma frase e não insista.',
  dois_fatores_motivo: 'sua conta usa a verificação em duas etapas; faça pelo Palácio',
  limite_de_planos: 'você chegou ao limite de planos por dia pelo WhatsApp; faça pelo Palácio',
  limite_de_mensagens: 'você chegou ao limite de mensagens diretas por dia pelo WhatsApp; mande pelo Palácio',
  sem_confirmacao_no_palacio: 'Nada foi feito: a confirmação no Palácio ainda não está ligada. Faça pelo Palácio.',
  lembrete: '_O plano acima continua valendo: responda *confirmo* para fazer, ou *cancelar*._',
  pergunta_desconhecida: 'Use só marcadores que apareceram no contexto ou em resultados de ferramentas.',
  nome_mudou: 'O nome de perfil do WhatsApp do seu número mudou. Por segurança, o assistente ficou parado neste número até você confirmar o número de novo: em Meu perfil → WhatsApp, toque em “Trocar número” e confirme o mesmo número. Os comandos do menu continuam.',
  /** O plano maior que o corpo de uma mensagem com botões: o texto sai sozinho, e os botões vêm logo depois, nesta. */
  confirma_o_plano: 'Confirma o plano acima?',
  /** A pergunta maior que o corpo de uma mensagem com lista: a lista vem logo depois, nesta. */
  escolha_acima: 'Qual das opções acima?',
  /** "confirmo" (ou "sim") falado: áudio nunca faz nada sem o plano confirmado por escrito ou pelo botão. */
  audio_nao_confirma: 'Áudio não confirma plano: para fazer, responda *confirmo* por escrito (ou toque em Confirmar). Para desistir, *cancelar*.',
  /** Muitos links de confirmação na última hora (o teto das confirmações da onda 2). */
  limite_de_links: 'Nada foi feito: muitos links de confirmação pedidos na última hora. Faça pelo Palácio.',
  so_quem_atende: 'Só quem atende a fila do chamado assume, resolve ou transfere; para falar com a equipe, use preparar_comentario_no_chamado.',
} as const

/** O aviso ao modelo que disse que fez sem ter preparado nada (uma repetição só; depois, TEXTOS_FIXOS.nao_fiz). */
export const AVISO_NADA_FOI_FEITO =
  '<sistema>Nada foi feito. Ações só com preparar_*; se a pessoa pediu uma ação, prepare; senão, responda sem dizer que fez.</sistema>'

// ------------------------------------------------------------------ texto de terceiros e da pessoa

/** O formato do marcador que o código emite (apr_1, pes_3): três letras, sublinhado, até três dígitos. */
export const FORMATO_DO_MARCADOR = /^[a-z]{3}_[0-9]{1,3}$/
export const marcadorValido = (m: unknown): m is string => typeof m === 'string' && FORMATO_DO_MARCADOR.test(m)

/** Corta com "…" sem passar de `max`. */
function corte(t: string, max: number): string {
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** Uma linha só, sem invisíveis nem controles, cortada em `max` (títulos e nomes vindos do banco: o plano não ganha linha falsa). */
export function umaLinha(texto: string | null | undefined, max: number): string {
  return corte(semInvisiveis(String(texto ?? '')).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim(), max)
}

/**
 * Texto escrito por outra pessoa (título, nome, recado, mensagem de colega) antes de ir ao modelo: sem invisíveis,
 * sem controles e sem a formatação que pesa (*, ~, crase; o sublinhado fica, para "pes_1" não virar outra coisa),
 * numa linha, com os sinais que imitariam as tags do contexto (‹ ›) e os marcadores (⟦ ⟧) trocados, cortado em
 * `max`. "[pes_1]" escrito por alguém vira "⟦pes_1⟧", que não é marcador.
 */
export function dadoDeTerceiro(texto: string | null | undefined, max = 300): string {
  const linha = semInvisiveis(String(texto ?? '').slice(0, 8_000)).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/[*~`]/g, '').replace(/\s+/g, ' ').trim()
  return corte(linha.replace(/</g, '‹').replace(/>/g, '›').replace(/\[/g, '⟦').replace(/\]/g, '⟧'), max)
}

/**
 * O texto de um comando fixo de área (o "status", a frota, o estoque, a portaria) como vai ao modelo: sem nenhum
 * endereço (os links vêm do código, na resposta final) nem e-mail (as contas Google do "status"), cada linha como
 * dado de terceiro (nomes de visitantes, materiais e veículos foram escritos por alguém).
 */
export function textoDeArea(texto: string): string {
  return semInvisiveis(texto).replace(/https?:\/\/\S+/gi, '').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, 'e-mail oculto').replace(/(^|\s)\/[a-z0-9/_?=&#.-]+/gi, '$1')
    .split('\n').map((l) => dadoDeTerceiro(l, 240)).filter(Boolean).join('\n').slice(0, LIMITES.caracteresNoResultado - 60)
}

const TLDS = 'com|net|org|br|ly|io|me|co|info|xyz|app|link|site|online|top|gov|edu|ai|gg|to|tk|cc|us|biz|dev|page|club|live|shop|store|click|ru|cn|in|pt|uk|de|fr|es|it|tv|so|sh|mx|ar|cl'
const DOMINIO_SOLTO = new RegExp(`(^|[^a-z0-9@._-])((?:[a-z0-9][a-z0-9-]*\\.)+(?:${TLDS}))(?![a-z0-9-])(\\/\\S*)?`, 'gi')

/** O texto tem link (http, www. ou domínio solto, como bit.ly/x)? Mensagem que sai em nome da pessoa não leva link. */
export function temLink(texto: string | null | undefined): boolean {
  const t = semInvisiveis(String(texto ?? ''))
  if (/https?:\/\//i.test(t) || /(^|[^a-z0-9])www\./i.test(t)) return true
  DOMINIO_SOLTO.lastIndex = 0
  return DOMINIO_SOLTO.test(t)
}

/** O texto pede ou traz segredo (senha, código, token, a verificação em duas etapas, 6 dígitos seguidos)? Não sai em nome de ninguém. */
export function pedeSegredo(texto: string | null | undefined): boolean {
  const bruto = semInvisiveis(String(texto ?? ''))
  if (/\d{6}/.test(bruto)) return true
  return /\b(senha|senhas|codigo|codigos|token|tokens|pin|2fa|otp|autenticador|autenticacao|duas etapas)\b/.test(normalizar(bruto))
}

/**
 * O nome de uma pessoa como o código mostra (o rótulo, o plano, o "pedida por"): numa linha, sem a formatação do
 * WhatsApp e sem "(", ")", "@" e "·". O full_name é editável por quem é dono dele: "Carla Souza (@carla.souza · RH)"
 * no nome imitaria o @usuário e o setor que o código põe depois (e sumiria com o ⚠ do homônimo).
 */
export function nomeMostrado(nome: string | null | undefined, max = 80): string {
  return umaLinha(umaLinha(limpo(String(nome ?? ''), 400), 400).replace(/[()@·•∙‧・]/g, ' '), max)
}

/**
 * O esqueleto do nome para o ⚠ de homônimo: o que vem antes do primeiro "(", "@" ou "·", sem acento nem pontuação.
 * "Carla Souza (@carla.souza · RH)" no full_name é a Carla Souza; sem nada antes, o nome inteiro.
 */
export function esqueletoDoNome(nome: string | null | undefined): string {
  const inteiro = semInvisiveis(String(nome ?? ''))
  return normalizar(inteiro.split(/[(@·]/)[0]) || normalizar(inteiro)
}

/** Há outra pessoa ativa com o mesmo nome (pelo esqueleto: esqueletoDoNome) no quadro do espaço? É o ⚠ do rótulo. */
export function temHomonimo(quadro: Map<string, { nome: string; ativo: boolean }>, id: string): boolean {
  const eu = quadro.get(id)
  if (!eu) return false
  const nome = esqueletoDoNome(eu.nome)
  for (const [outro, p] of quadro) if (outro !== id && p.ativo && esqueletoDoNome(p.nome) === nome) return true
  return false
}

/**
 * "Ana Souza (@ana.souza · RH)", com ⚠ quando há outra pessoa ativa com o mesmo nome no espaço. Vai ao modelo (o
 * contexto e as leituras): o nome e o setor entram como dado de terceiro — "</contexto>" num full_name fica inerte.
 */
export function rotuloDaPessoa(p: { nome: string | null | undefined; username: string | null | undefined; setor?: string | null; homonimo?: boolean }): string {
  const nome = dadoDeTerceiro(nomeMostrado(p.nome), 80) || 'Sem nome'
  const usuario = String(p.username ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
  const setor = p.setor ? dadoDeTerceiro(limpo(p.setor, 200), 40) : ''
  const dentro = [usuario ? `@${usuario}` : null, setor || null].filter(Boolean).join(' · ')
  return `${nome}${dentro ? ` (${dentro})` : ''}${p.homonimo ? ' ⚠' : ''}`
}

// ------------------------------------------------------------------ portão de intenção

export type TipoDeAcao = 'voto' | 'mensagem' | 'comentario' | 'lidos' | 'chamado' | 'visita' | 'chat' | 'atendimento' | 'registro_visita' | 'financeiro' | 'drive'
export const TIPOS_DE_ACAO: readonly TipoDeAcao[] = ['voto', 'mensagem', 'comentario', 'lidos', 'chamado', 'visita', 'chat', 'atendimento', 'registro_visita', 'financeiro', 'drive']

const DE_MENSAGEM = 'mand|avis|fala|fale|diz|diga|dizer|escrev|msg|mensag|zap|whats|respond|recado|lembra'

/**
 * Os radicais que ligam cada tipo de ação (lista fechada, conferida no script). Começo de palavra, no texto sem
 * acento e minúsculo. "atendimento" liga preparar_atendimento_do_chamado (assumir, resolver, transferir),
 * "registro_visita", preparar_registro_de_visita, e "drive", preparar_guardar_no_drive (o documento que a pessoa
 * mandou, na pasta que ela disse).
 */
const RADICAIS: [TipoDeAcao, RegExp][] = [
  ['voto', /\b(aprov|ajust|vot|libera|reprov)/],
  ['mensagem', new RegExp(`\\b(${DE_MENSAGEM})`)],
  ['comentario', new RegExp(`\\b(${DE_MENSAGEM}|coment)`)],
  ['lidos', /\b(lid|limpa)|\bli\b/],
  ['chamado', /\b(chamado|quebr|parou|pifou|estrag|consert|defeito|vazand|toner|manutencao|suporte)|\bnao funciona|\bsem (internet|luz|agua)\b/],
  ['visita', /\b(sobe|subir|aguard|espera|recus|portaria|visita)/],
  ['atendimento', /\b(assum|resolv|transfer|pega)/],
  ['registro_visita', /\b(registr|chegou|visitante)/],
  ['drive', /\b(guard|salv|arquiv|drive|pasta|coloc|bota|poe|ponha)/],
]

/**
 * Os tipos de ação que a MENSAGEM DA PESSOA pede — só o texto dela, nunca o contexto, a citação ou os resultados
 * das ferramentas: dado de terceiro não liga tipo de ação. "financeiro" (preparar_decisao_financeira, que termina
 * sempre no Palácio) só com aprovar/recusar junto de despesa, compra, pagamento ou reembolso na própria mensagem.
 */
export function acoesPermitidas(texto: string): TipoDeAcao[] {
  const t = normalizar(String(texto ?? ''))
  const ligados = new Set<TipoDeAcao>(RADICAIS.filter(([, r]) => r.test(t)).map(([tipo]) => tipo))
  if (/\b(aprov|reprov|recus)/.test(t) && /\b(despes|compra|pagament|reembols)/.test(t)) ligados.add('financeiro')
  return TIPOS_DE_ACAO.filter((x) => ligados.has(x))
}

/** O que vale num turno: o pedido desta mensagem, unido ao guardado na pergunta e ao do plano em revisão. */
export function unirPermitidas(...grupos: (readonly TipoDeAcao[] | null | undefined)[]): TipoDeAcao[] {
  const todos = new Set(grupos.flatMap((g) => [...(g ?? [])]))
  return TIPOS_DE_ACAO.filter((x) => todos.has(x))
}

/**
 * A lista fechada, em ordem de nome (é o começo do prefixo do cache). As 17 da v1, com a onda 2: o atendimento do
 * chamado, o registro de visita e a decisão do Financeiro (sempre no Palácio), e consultar_area no lugar de
 * ver_status_do_whatsapp; depois, guardar no Google Drive, com ler_filas_de_chamado dentro de consultar_area (a área
 * filas_de_chamado) — 20, o teto (LIMITES.ferramentas).
 */
export const NOMES_DAS_FERRAMENTAS = [
  'buscar_ajuda', 'buscar_pessoa', 'consultar_area', 'ler_agenda', 'ler_aprovacoes', 'ler_avisos', 'ler_chamados', 'perguntar',
  'preparar_atendimento_do_chamado', 'preparar_chamado', 'preparar_comentario_no_chamado', 'preparar_decisao_financeira', 'preparar_guardar_no_drive',
  'preparar_marcar_avisos_lidos', 'preparar_mensagem_direta', 'preparar_registro_de_visita', 'preparar_resposta_a_visita', 'preparar_voto', 'ver_aprovacao', 'ver_chamado',
] as const
export type NomeDaFerramenta = (typeof NOMES_DAS_FERRAMENTAS)[number]
export const ehFerramenta = (nome: unknown): nome is NomeDaFerramenta => NOMES_DAS_FERRAMENTAS.includes(nome as NomeDaFerramenta)

/** As leituras de detalhe, que contam no teto diário (leituras_detalhe_dia). A consulta de uma área também conta. */
export const LEITURAS_DE_DETALHE: readonly NomeDaFerramenta[] = ['buscar_pessoa', 'consultar_area', 'ver_aprovacao', 'ver_chamado']

const TIPO_DA_FERRAMENTA: Partial<Record<NomeDaFerramenta, TipoDeAcao>> = {
  preparar_voto: 'voto',
  preparar_mensagem_direta: 'mensagem',
  preparar_comentario_no_chamado: 'comentario',
  preparar_marcar_avisos_lidos: 'lidos',
  preparar_chamado: 'chamado',
  preparar_resposta_a_visita: 'visita',
  preparar_atendimento_do_chamado: 'atendimento',
  preparar_registro_de_visita: 'registro_visita',
  preparar_decisao_financeira: 'financeiro',
  preparar_guardar_no_drive: 'drive',
}

/**
 * As áreas que consultar_area lê (cada uma com a permissão da tela dela). filas_de_chamado é a antiga ler_filas_de_chamado
 * (as filas e os assuntos, com fil_ e ass_): vale em qualquer nível de leitura e não conta como leitura de detalhe.
 */
export const AREAS_DA_CONSULTA = ['filas_de_chamado', 'financeiro', 'frota', 'estoque', 'portaria', 'whatsapp'] as const
export type AreaDaConsulta = (typeof AREAS_DA_CONSULTA)[number]

/** O tipo de ação de um preparar_*; null para as leituras e o perguntar (que não escrevem). */
export const tipoDaFerramenta = (nome: string): TipoDeAcao | null => TIPO_DA_FERRAMENTA[nome as NomeDaFerramenta] ?? null

/** O preparar_* foi pedido pela pessoa nesta mensagem (ou no pedido guardado)? Leituras passam sempre. */
export function conferirIntencao(nome: string, permitidas: readonly TipoDeAcao[]): boolean {
  const tipo = tipoDaFerramenta(nome)
  return tipo === null || permitidas.includes(tipo)
}

const NUMERO_POR_EXTENSO: Record<string, number> = {
  duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
}

/**
 * Quantos itens a pessoa disse ("as duas", "ambas", "os 2" → 2; "as três" → 3; até 8). Sem número ("todas") ou
 * com hora ("às 3 da tarde", "às 15h"): null, sem conferência.
 */
export function quantidadePedida(texto: string): number | null {
  const t = normalizar(String(texto ?? ''))
  if (/\b(ambas|ambos)\b/.test(t)) return 2
  const m = /\b(?:as|os)\s+(duas|dois|tres|quatro|cinco|seis|sete|oito|[2-8])\b(?!\s*(?:h|hs|hr|hrs|hora|horas|min|minutos|da manha|da tarde|da noite|e meia)\b)/.exec(t)
  return m ? NUMERO_POR_EXTENSO[m[1]] ?? null : null
}

/** A conferência de quantidade dos votos: o texto do erro quando o rascunho não bate com o que a pessoa disse; null se bate. */
export function conferirQuantidade(pedida: number | null, preparados: number): string | null {
  if (pedida === null || pedida === preparados) return null
  return `A pessoa falou em ${pedida}; você preparou ${preparados}. Pergunte quais com perguntar.`
}

// ------------------------------------------------------------------ o que a pessoa respondeu (sem modelo)

/** O id curto de um plano nos botões: os 12 primeiros hex do uuid (o id do botão tem no máximo 40 caracteres). */
export const idCurto = (uuid: string) => String(uuid ?? '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12)

/** Os ids dos botões do plano: `plano:<id curto>:<hash8>:sim|nao` (só o plano com este hash confirma). */
export function idDoBotao(planoId: string, hash: string, sim: boolean): string {
  return `plano:${idCurto(planoId)}:${String(hash ?? '').slice(0, 8)}:${sim ? 'sim' : 'nao'}`
}

/** O id da linha de uma pergunta: `esc:<id curto>:<marcador>`. */
export const idDaEscolha = (perguntaId: string, marcador: string) => `esc:${idCurto(perguntaId)}:${marcador}`

export type BotaoLido = { tipo: 'plano'; id: string; hash8: string; sim: boolean } | { tipo: 'escolha'; id: string; marcador: string }

export function lerBotao(texto: string): BotaoLido | null {
  const t = String(texto ?? '').trim()
  const plano = /^plano:([0-9a-f]{12}):([0-9a-f]{8}):(sim|nao)$/.exec(t)
  if (plano) return { tipo: 'plano', id: plano[1], hash8: plano[2], sim: plano[3] === 'sim' }
  const escolha = /^esc:([0-9a-f]{12}):([a-z]{3}_[0-9]{1,3})$/.exec(t)
  return escolha ? { tipo: 'escolha', id: escolha[1], marcador: escolha[2] } : null
}

const AGRADECE = new Set(['obrigado', 'obrigada', 'obrigadao', 'obg', 'obgd', 'obgda', 'brigado', 'brigada', 'valeu', 'vlw', 'grato', 'grata', 'agradeco', 'tks', 'thanks'])
const JUNTO_DO_AGRADECIMENTO = new Set(['muito', 'mto', 'mt', 'ok', 'blz', 'beleza', 'show', 'top', 'otimo', 'perfeito', 'e', 'pela', 'pelo', 'ajuda', 'por', 'tudo', 'demais', 'de', 'nada', 'entao', 'ta', 'certo'])

/** "obrigado", "valeu!", "ok, obrigada pela ajuda": responde "Disponha." sem modelo. */
export function ehAgradecimento(texto: string): boolean {
  const palavras = normalizar(String(texto ?? '')).split(' ').filter(Boolean)
  return palavras.length > 0 && palavras.length <= 6 && palavras.some((w) => AGRADECE.has(w)) && palavras.every((w) => AGRADECE.has(w) || JUNTO_DO_AGRADECIMENTO.has(w))
}

const ESQUECER = new Set(['esquece', 'esqueca', 'esquece tudo', 'esqueca tudo', 'esquece isso', 'nova conversa', 'comecar de novo', 'recomecar', 'zerar', 'zera',
  'limpar conversa', 'limpa a conversa', 'apaga a conversa'])

/** "esquece", "nova conversa": apaga a memória curta e cancela o plano ou a pergunta, sem modelo. */
export const ehEsquecer = (texto: string): boolean => ESQUECER.has(normalizar(String(texto ?? '')))

const QUASE = new Set(['sim', 's', 'ok', 'okay', 'okk', 'pode', 'manda', 'isso', 'blz', 'beleza', 'bora', 'certo', 'fechado', 'pode sim', 'sim pode', 'ok pode',
  'pode mandar', 'pode fazer', 'pode ser', 'manda ver', 'isso mesmo', 'perfeito', 'vai', 'faz', 'faca', 'sim por favor', 'pode ir', 'uhum', 'aham', 'positivo',
  'ta bom', 'ta', 'ta otimo', 'tudo certo', 'pode seguir', 'segue'])

/** "sim", "ok", "pode": quase uma confirmação. NÃO confirma (decisão do dono): recebe a orientação fixa. */
export const ehQuaseConfirmacao = (texto: string): boolean => QUASE.has(normalizar(String(texto ?? '')))

const CANCELA_INTEIRO = new Set(['nao', 'n', 'nao quero', 'esquece', 'esqueca', 'deixa', 'deixa pra la', 'nao precisa', 'nao obrigado', 'nao obrigada'])

/**
 * Desistir do plano ou da pergunta: "cancelar", "pode cancelar", "desisto", "esquece", "não", "não quero". Palavra
 * com cancel ou desist só em mensagem curta (até 5 palavras): "não, tira a segunda" é correção, não desistência.
 */
export function ehCancelamentoAmplo(texto: string): boolean {
  const t = normalizar(String(texto ?? ''))
  if (!t) return false
  if (CANCELA_INTEIRO.has(t)) return true
  const palavras = t.split(' ')
  return palavras.length <= 5 && palavras.some((w) => w.startsWith('cancel') || w.startsWith('desist'))
}

/**
 * A mensagem que cita um aviso de chamado, do Chat ou de uma mensagem direta pede algo ao assistente? Verbo
 * dirigido a ele, pergunta, menção a terceiro ou "pra mim". Na dúvida, sim: o falso positivo custa só um plano a
 * confirmar; o falso negativo mandaria o texto direto para outra pessoa.
 */
export function pareceInstrucao(texto: string): boolean {
  const bruto = String(texto ?? '')
  const t = normalizar(bruto)
  if (!t) return false
  if (bruto.includes('?')) return true
  if (/\b(aprov|mand|avis|resum|explic|marc|encaminh|lembr|escrev|pergunt)/.test(t)) return true
  if (/\b(fala|fale|diz|diga|dizer|conta|conte) (pra|para|pro|com|a|ao)\b/.test(t)) return true
  if (/\babr(e|ir|a)\b/.test(t)) return true
  if (/\b(o que|oq|quem|quando|qual|quais|cade|kd|onde|como esta|como ta|por que|pq)\b/.test(t)) return true
  if (/\b(dele|dela|deles|delas)\b/.test(t) || /\b(pra|para) (mim|ele|ela|eles|elas)\b/.test(t)) return true
  // "pra Carla", "para o Daniel": nome com maiúscula depois de pra/para.
  return /\b(?:pra|para|pro)\s+(?:(?:o|a)\s+)?\p{Lu}\p{Ll}+/u.test(semInvisiveis(bruto))
}

/** O plano ou a pergunta da pessoa e o que a mensagem citou, como o servidor leu (plano.ts, planoAberto). */
export type PlanoAberto = {
  plano: { id: string; situacao: 'pergunta' | 'aberto' | 'em_revisao'; hash: string | null; opcoes: string[]; entregueEm: number | null } | null
  /**
   * plano: citou uma das mensagens do plano ou da pergunta abertos; plano_velho: citou a de um plano que não está
   * mais aberto; outra: um aviso ou uma pendência que o bot reconheceu; desconhecida: algo que o código não sabe o
   * que é; nenhuma: não citou.
   */
  citacao: 'plano' | 'plano_velho' | 'outra' | 'desconhecida' | 'nenhuma'
  /** Um plano ou pergunta encerrado há menos de LIMITES.recenteMin (o "2" repetido, o "cancelar" atrasado). */
  recente: { situacao: string; atualizadoEm: number } | null
  /**
   * Sem plano aberto, o plano que espera a confirmação no Palácio (o link saiu e ainda vale): citar as mensagens dele
   * é citar o plano (`citacao` "plano"); o "cancelar" desiste dele, e o "confirmo" manda ao link.
   */
  noPalacio?: { id: string } | null
}

export type RespostaAoPlano =
  | { tipo: 'confirmar' } | { tipo: 'cancelar' } | { tipo: 'quase' } | { tipo: 'escolha'; marcador: string }
  | { tipo: 'velho' } | { tipo: 'revisao' } | { tipo: 'antes_do_plano' } | { tipo: 'cite_o_plano' } | { tipo: 'ja_escolheu' } | { tipo: 'nada_aberto' }
  | { tipo: 'no_palacio' }

const so = <T extends RespostaAoPlano['tipo']>(tipo: T) => ({ tipo }) as Extract<RespostaAoPlano, { tipo: T }>

/**
 * A mensagem é resposta ao plano ou à pergunta do assistente? Só o código lê: "confirmo" (ehConfirmacao) vale só
 * para um plano já entregue e escrito DEPOIS da entrega (pela hora da Meta), ou citando o plano; "sim" e "ok" não
 * confirmam. null: não é resposta ao plano (segue o caminho de sempre, ou vai ao assistente com o plano no contexto).
 * O plano que já espera o Palácio (sem citar, ou citando o plano): "cancelar" (e o botão Cancelar dele) desiste, e
 * "confirmo" (e o botão Confirmar) ouve que a confirmação é pelo link.
 */
export function lerRespostaAoPlano(texto: string, aberto: PlanoAberto, opcoes: { visitaEsperando: boolean; enviadaEm: number | null }): RespostaAoPlano | null {
  const p = aberto.plano
  const noPalacio = p ? null : aberto.noPalacio ?? null
  const paraONoPalacio = Boolean(noPalacio) && (aberto.citacao === 'plano' || aberto.citacao === 'nenhuma')
  const botao = lerBotao(texto)
  if (botao?.tipo === 'plano') {
    if (p && idCurto(p.id) === botao.id) {
      if (p.situacao === 'aberto' && p.hash && p.hash.slice(0, 8) === botao.hash8) return so(botao.sim ? 'confirmar' : 'cancelar')
      if (p.situacao === 'em_revisao') return so('revisao')
    }
    if (noPalacio && idCurto(noPalacio.id) === botao.id) return so(botao.sim ? 'no_palacio' : 'cancelar')
    return so('velho')
  }
  if (botao?.tipo === 'escolha') {
    if (p?.situacao === 'pergunta' && idCurto(p.id) === botao.id && p.opcoes.includes(botao.marcador)) return { tipo: 'escolha', marcador: botao.marcador }
    return so('velho')
  }
  const citouVelho = aberto.citacao === 'plano_velho'
  if (ehConfirmacao(texto)) {
    if (citouVelho) return so('velho')
    if (paraONoPalacio) return so('no_palacio')
    if (!p) return aberto.recente ? so('velho') : null
    if (p.situacao === 'em_revisao') return so('revisao')
    if (p.situacao === 'pergunta') return null
    if (aberto.citacao === 'plano') return so('confirmar')
    if (aberto.citacao !== 'nenhuma') return so('cite_o_plano')
    if (opcoes.enviadaEm === null) return so('cite_o_plano')
    if (p.entregueEm === null || opcoes.enviadaEm <= p.entregueEm) return so('antes_do_plano')
    return so('confirmar')
  }
  if (ehCancelamentoAmplo(texto)) {
    if (p || paraONoPalacio) return so('cancelar')
    return aberto.recente || citouVelho ? so('nada_aberto') : null
  }
  const n = lerEscolha(texto, 99)
  if (n !== null) {
    if (p?.situacao === 'pergunta') {
      // Citando outra mensagem (a lista do menu, a pergunta do bot), o número é dela, não da pergunta.
      if (aberto.citacao === 'plano' || (aberto.citacao === 'nenhuma' && !opcoes.visitaEsperando)) {
        const marcador = p.opcoes[n - 1]
        return marcador ? { tipo: 'escolha', marcador } : null
      }
      return null
    }
    // O "2" repetido logo depois da escolha (sem citar, ou citando a pergunta que já passou); citando outra
    // mensagem (a lista do menu), o número é dela.
    if (!p && (aberto.recente || citouVelho) && (n === 2 || n === 3) && (aberto.citacao === 'nenhuma' || citouVelho)) return so('ja_escolheu')
    return null
  }
  if (ehQuaseConfirmacao(texto)) {
    if (p?.situacao === 'aberto') return so('quase')
    if (p?.situacao === 'em_revisao') return so('revisao')
    return null
  }
  return null
}

export type Rota =
  | 'bot' | 'ia' | 'chat_plano' | 'ia_obrigado' | 'ia_esquecer'
  | 'ia_confirmo' | 'ia_cancelar' | 'ia_quase' | 'ia_escolha'
  | 'ia_plano_velho' | 'ia_revisao' | 'ia_antes_do_plano' | 'ia_cite_o_plano' | 'ia_ja_escolheu' | 'ia_nada_aberto'
  | 'ia_audio_nao_confirma' | 'ia_no_palacio'

export const ROTA_DA_RESPOSTA: Record<RespostaAoPlano['tipo'], Rota> = {
  confirmar: 'ia_confirmo', cancelar: 'ia_cancelar', quase: 'ia_quase', escolha: 'ia_escolha', velho: 'ia_plano_velho', revisao: 'ia_revisao',
  antes_do_plano: 'ia_antes_do_plano', cite_o_plano: 'ia_cite_o_plano', ja_escolheu: 'ia_ja_escolheu', nada_aberto: 'ia_nada_aberto',
  no_palacio: 'ia_no_palacio',
}

/** O texto fixo das rotas que respondem sem modelo e sem trava. */
export const TEXTO_DA_ROTA: Partial<Record<Rota, string>> = {
  ia_plano_velho: TEXTOS_FIXOS.velho, ia_revisao: TEXTOS_FIXOS.revisao, ia_antes_do_plano: TEXTOS_FIXOS.antes_do_plano,
  ia_cite_o_plano: TEXTOS_FIXOS.cite_o_plano, ia_ja_escolheu: TEXTOS_FIXOS.ja_escolheu, ia_nada_aberto: TEXTOS_FIXOS.nada_aberto,
  ia_quase: TEXTOS_FIXOS.quase, ia_obrigado: TEXTOS_FIXOS.obrigado, ia_audio_nao_confirma: TEXTOS_FIXOS.audio_nao_confirma,
  ia_no_palacio: TEXTOS_FIXOS.no_palacio,
}

export type AvisoCitado = 'aprovacao' | 'chamado' | 'chat' | 'mensagem' | 'visita' | 'outro'

/**
 * O comando que a rota do assistente vê. A decisão do Financeiro ("aprova a 2", "recusa a 1") só é comando com a
 * lista do "financeiro" aberta, de quem decide (`listaDoFinanceiro`): sem ela, o "2" é o da última lista que a
 * memória curta guardou (os "avisos", as "aprovacoes"), e a mensagem vai ao assistente como "desconhecido".
 */
export function comandoDaRota(comando: Comando, listaDoFinanceiro: boolean): Comando {
  return comando === 'decidir_financeiro' && !listaDoFinanceiro ? 'desconhecido' : comando
}

/**
 * Para onde vai a mensagem, com o assistente: indisponível ou com mídia, o bot de sempre; resposta ao plano, a rota
 * dela; aviso de aprovação com "aprovar"/"ajustes:", o bot (com a conferência de hoje); aviso de chamado, Chat ou
 * mensagem com cara de instrução, o assistente; Chat sem instrução, o plano de um passo; pergunta do bot, o bot;
 * "esquece" e "valeu", sem modelo; o que o bot não entende, o assistente; os comandos, o bot.
 *
 * `audio`: o texto é a transcrição de um áudio (a Kapso a manda no payload). Áudio nunca escreve sem plano: nada de
 * comando fixo (nem "parar"), resposta direta a aviso, pergunta do bot ou plano do Chat — vai sempre ao assistente,
 * que só lê ou prepara um plano; e o "confirmo" (ou "sim") falado não confirma.
 */
export function rotaDaMensagem(e: {
  disponivel: boolean; midia: boolean; comando: Comando; texto: string
  resposta: RespostaAoPlano | null
  aviso: AvisoCitado | null
  paraPendencia: boolean
  audio?: boolean
}): Rota {
  if (!e.disponivel || e.midia) return 'bot'
  if (e.audio) {
    if (e.resposta?.tipo === 'confirmar' || e.resposta?.tipo === 'quase') return 'ia_audio_nao_confirma'
    if (e.resposta) return ROTA_DA_RESPOSTA[e.resposta.tipo]
    if (ehEsquecer(e.texto)) return 'ia_esquecer'
    if (ehAgradecimento(e.texto)) return 'ia_obrigado'
    return 'ia'
  }
  if (e.resposta) return ROTA_DA_RESPOSTA[e.resposta.tipo]
  if (e.aviso === 'aprovacao') return lerDecisao(e.texto) ? 'bot' : 'ia'
  if (e.aviso === 'chat') return pareceInstrucao(e.texto) ? 'ia' : 'chat_plano'
  if (e.aviso === 'chamado' || e.aviso === 'mensagem') return pareceInstrucao(e.texto) ? 'ia' : 'bot'
  if (e.aviso) return 'bot'
  if (e.paraPendencia) return 'bot'
  if (ehEsquecer(e.texto)) return 'ia_esquecer'
  if (ehAgradecimento(e.texto)) return 'ia_obrigado'
  if (e.comando === 'desconhecido') return 'ia'
  return 'bot'
}

// ------------------------------------------------------------------ entrada das ferramentas

type Campo =
  | { tipo: 'texto'; min: number; max: number; semLink?: boolean; semSegredo?: boolean }
  | { tipo: 'marcador'; prefixo: string | null; prefixos?: readonly string[] }
  /** Marcador ou "" (o campo que só vale em parte das ações: a fila e o assunto da transferência). */
  | { tipo: 'marcadorOuVazio'; prefixo: string }
  | { tipo: 'marcadores'; prefixo: string | null; min: number; max: number }
  | { tipo: 'enum'; valores: readonly (string | number)[] }
  | { tipo: 'booleano' }
  | { tipo: 'data' }

const ESQUEMAS: Record<NomeDaFerramenta, Record<string, Campo>> = {
  buscar_ajuda: { pergunta: { tipo: 'texto', min: 2, max: LIMITES.ajuda } },
  buscar_pessoa: { nome: { tipo: 'texto', min: 1, max: 200 } },
  consultar_area: { area: { tipo: 'enum', valores: AREAS_DA_CONSULTA }, busca: { tipo: 'texto', min: 0, max: 80 } },
  ler_agenda: { de: { tipo: 'data' }, ate: { tipo: 'data' } },
  ler_aprovacoes: { situacao: { tipo: 'enum', valores: ['esperando_meu_voto', 'que_eu_pedi'] } },
  ler_avisos: { so_nao_lidos: { tipo: 'booleano' } },
  ler_chamados: {
    escopo: { tipo: 'enum', valores: ['abri', 'comigo', 'minhas_filas'] }, situacao: { tipo: 'enum', valores: ['abertos', 'encerrados_7_dias'] },
    busca: { tipo: 'texto', min: 0, max: 80 },
  },
  perguntar: {
    pergunta: { tipo: 'texto', min: 2, max: LIMITES.pergunta }, opcoes: { tipo: 'marcadores', prefixo: null, min: LIMITES.opcoesMin, max: LIMITES.opcoesMax },
    pedido_em_aberto: { tipo: 'texto', min: 0, max: LIMITES.pedidoEmAberto },
  },
  preparar_atendimento_do_chamado: {
    chamado: { tipo: 'marcador', prefixo: 'cha' }, acao: { tipo: 'enum', valores: ['assumir', 'resolver', 'transferir'] },
    fila: { tipo: 'marcadorOuVazio', prefixo: 'fil' }, assunto: { tipo: 'marcadorOuVazio', prefixo: 'ass' },
    nota: { tipo: 'texto', min: 0, max: LIMITES.nota, semLink: true, semSegredo: true },
  },
  preparar_chamado: {
    fila: { tipo: 'marcador', prefixo: 'fil' }, assunto: { tipo: 'marcador', prefixo: 'ass' }, relato: { tipo: 'texto', min: 5, max: LIMITES.relato, semSegredo: true },
    local: { tipo: 'texto', min: 0, max: LIMITES.local }, urgencia: { tipo: 'enum', valores: [1, 2, 3] },
  },
  preparar_comentario_no_chamado: {
    chamado: { tipo: 'marcador', prefixo: 'cha' }, texto: { tipo: 'texto', min: 2, max: LIMITES.comentario, semLink: true, semSegredo: true },
  },
  preparar_decisao_financeira: {
    item: { tipo: 'marcador', prefixo: null, prefixos: ['des', 'com'] }, decisao: { tipo: 'enum', valores: ['aprovar', 'recusar'] },
    motivo: { tipo: 'texto', min: 0, max: LIMITES.motivoFinanceiro, semLink: true, semSegredo: true },
  },
  preparar_guardar_no_drive: { pasta: { tipo: 'texto', min: 1, max: 300 }, nome: { tipo: 'texto', min: 0, max: LIMITES.nomeDoArquivo } },
  preparar_marcar_avisos_lidos: { escopo: { tipo: 'enum', valores: ['todos', 'estes'] }, avisos: { tipo: 'marcadores', prefixo: 'avi', min: 0, max: 10 } },
  preparar_mensagem_direta: { para: { tipo: 'marcador', prefixo: 'pes' }, texto: { tipo: 'texto', min: 1, max: LIMITES.mensagem, semLink: true, semSegredo: true } },
  preparar_registro_de_visita: {
    visitante: { tipo: 'texto', min: 2, max: LIMITES.visitante, semLink: true, semSegredo: true }, empresa: { tipo: 'texto', min: 0, max: LIMITES.empresa, semLink: true },
    visitado: { tipo: 'marcador', prefixo: 'pes' }, motivo: { tipo: 'texto', min: 0, max: LIMITES.motivoDaVisita, semLink: true, semSegredo: true },
  },
  preparar_resposta_a_visita: {
    visita: { tipo: 'marcador', prefixo: 'vis' }, resposta: { tipo: 'enum', valores: ['subir', 'aguardar', 'recusar'] },
    recado: { tipo: 'texto', min: 0, max: LIMITES.recado, semLink: true, semSegredo: true },
  },
  preparar_voto: {
    aprovacao: { tipo: 'marcador', prefixo: 'apr' }, decisao: { tipo: 'enum', valores: ['aprovar', 'pedir_ajustes'] },
    nota: { tipo: 'texto', min: 0, max: LIMITES.nota, semLink: true, semSegredo: true },
  },
  ver_aprovacao: { aprovacao: { tipo: 'marcador', prefixo: 'apr' } },
  ver_chamado: { chamado: { tipo: 'marcador', prefixo: 'cha' } },
}

/** Os campos que cada ferramenta recebe (o mesmo das definições strict; ferramentas.ts confere contra isto). */
export const CAMPOS_DAS_FERRAMENTAS: Record<NomeDaFerramenta, string[]> = Object.fromEntries(
  Object.entries(ESQUEMAS).map(([nome, campos]) => [nome, Object.keys(campos)]),
) as Record<NomeDaFerramenta, string[]>

export type EntradaValidada = { ok: true; valor: Record<string, unknown> } | { ok: false; erro: string }

const letras = (t: string) => (t.match(/\p{L}/gu) ?? []).length

/**
 * Confere a entrada de uma ferramenta antes de qualquer leitura: os campos são só os da definição, todos presentes,
 * do tipo certo, nos tamanhos e formatos (marcador do tipo certo, data AAAA-MM-DD); o texto que sai em nome da
 * pessoa não leva link nem pede segredo. `contexto.assuntoPedeLocal`: o assunto do chamado pede o local. O erro é
 * uma frase em português para o modelo (vai como is_error).
 */
export function validarEntrada(nome: string, entrada: unknown, contexto: { assuntoPedeLocal?: boolean } = {}): EntradaValidada {
  if (!ehFerramenta(nome)) return { ok: false, erro: 'Ferramenta desconhecida.' }
  const esquema = ESQUEMAS[nome]
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, erro: 'Entrada inválida.' }
  const e = entrada as Record<string, unknown>
  const sobra = Object.keys(e).filter((k) => !(k in esquema))
  if (sobra.length) return { ok: false, erro: `Campo que não existe: ${sobra.slice(0, 3).join(', ')}.` }
  const valor: Record<string, unknown> = {}
  for (const [campo, regra] of Object.entries(esquema)) {
    const v = e[campo]
    if (v === undefined || v === null) return { ok: false, erro: `Falta o campo ${campo}.` }
    if (regra.tipo === 'texto') {
      if (typeof v !== 'string') return { ok: false, erro: `${campo} deve ser texto.` }
      const t = v.trim()
      if (t.length < regra.min) return { ok: false, erro: regra.min <= 1 ? `${campo} está vazio.` : `${campo} precisa de pelo menos ${regra.min} caracteres.` }
      if (t.length > regra.max) return { ok: false, erro: `${campo} pode ter até ${regra.max.toLocaleString('pt-BR')} caracteres.` }
      if (regra.semLink && temLink(t)) return { ok: false, erro: `${campo} não pode ter link nem endereço de site.` }
      if (regra.semSegredo && pedeSegredo(t)) return { ok: false, erro: `${campo} não pode pedir nem trazer senha, código ou token.` }
      valor[campo] = t
    } else if (regra.tipo === 'marcador') {
      const exemplo = regra.prefixo ?? regra.prefixos?.[0] ?? 'apr'
      if (!marcadorValido(v)) return { ok: false, erro: `${campo} deve ser um marcador do contexto, como ${exemplo}_1.` }
      if (regra.prefixo && !v.startsWith(`${regra.prefixo}_`)) return { ok: false, erro: `${campo} deve ser um marcador ${regra.prefixo}_.` }
      if (regra.prefixos && !regra.prefixos.some((x) => v.startsWith(`${x}_`))) return { ok: false, erro: `${campo} deve ser um marcador ${regra.prefixos.map((x) => `${x}_`).join(' ou ')}.` }
      valor[campo] = v
    } else if (regra.tipo === 'marcadorOuVazio') {
      if (v === '') { valor[campo] = ''; continue }
      if (!marcadorValido(v) || !v.startsWith(`${regra.prefixo}_`)) return { ok: false, erro: `${campo} deve ser um marcador ${regra.prefixo}_ do contexto, ou "".` }
      valor[campo] = v
    } else if (regra.tipo === 'marcadores') {
      if (!Array.isArray(v) || !v.every(marcadorValido)) return { ok: false, erro: `${campo} deve ser uma lista de marcadores do contexto.` }
      if (regra.prefixo && !v.every((m) => m.startsWith(`${regra.prefixo}_`))) return { ok: false, erro: `${campo} aceita só marcadores ${regra.prefixo}_.` }
      const unicos = [...new Set(v)]
      if (unicos.length < regra.min || unicos.length > regra.max) return { ok: false, erro: `${campo} deve ter de ${regra.min} a ${regra.max} marcadores diferentes.` }
      valor[campo] = unicos
    } else if (regra.tipo === 'enum') {
      if (!regra.valores.includes(v as string | number)) return { ok: false, erro: `${campo} fora das opções: ${regra.valores.join(', ')}.` }
      valor[campo] = v
    } else if (regra.tipo === 'booleano') {
      if (typeof v !== 'boolean') return { ok: false, erro: `${campo} deve ser true ou false.` }
      valor[campo] = v
    } else {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())) return { ok: false, erro: `${campo} deve ser uma data AAAA-MM-DD.` }
      valor[campo] = v
    }
  }
  // As regras entre campos.
  if (nome === 'buscar_pessoa') {
    const n = normalizar(String(valor.nome)).length
    if (n < LIMITES.buscaMin || n > LIMITES.buscaMax) return { ok: false, erro: `nome precisa ter de ${LIMITES.buscaMin} a ${LIMITES.buscaMax} letras.` }
  }
  if (nome === 'ler_agenda') {
    const dias = diferencaEmDias(String(valor.de), String(valor.ate))
    if (dias < 0) return { ok: false, erro: 'ate vem antes de de.' }
    if (dias > LIMITES.agendaDias) return { ok: false, erro: `O intervalo da agenda vai até ${LIMITES.agendaDias} dias.` }
  }
  if (nome === 'preparar_voto' && valor.decisao === 'pedir_ajustes' && letras(String(valor.nota)) < 5) {
    return { ok: false, erro: 'Pedir ajustes exige a nota com o que mudar (pelo menos 5 letras), nas palavras da pessoa.' }
  }
  if (nome === 'preparar_marcar_avisos_lidos') {
    const avisos = valor.avisos as string[]
    if (valor.escopo === 'estes' && !avisos.length) return { ok: false, erro: 'Com escopo estes, diga os avisos (avi_).' }
    if (valor.escopo === 'todos' && avisos.length) return { ok: false, erro: 'Com escopo todos, avisos deve ser [].' }
  }
  if (nome === 'preparar_chamado' && contexto.assuntoPedeLocal && !String(valor.local).trim()) {
    return { ok: false, erro: 'Este assunto pede o local (sala, andar ou setor).' }
  }
  if (nome === 'preparar_atendimento_do_chamado') {
    // A fila e o assunto só valem na transferência; nas outras ações, ficam vazios.
    if (valor.acao !== 'transferir') Object.assign(valor, { fila: '', assunto: '' })
    if (valor.acao === 'resolver' && letras(String(valor.nota)) < 5) return { ok: false, erro: 'Resolver exige a solução na nota (pelo menos 5 letras): é o que quem abriu vai ler.' }
    if (valor.acao === 'transferir' && (!valor.fila || !valor.assunto)) return { ok: false, erro: 'Transferir exige a fila (fil_) e o assunto (ass_) de destino, de consultar_area filas_de_chamado.' }
    if (valor.acao === 'transferir' && letras(String(valor.nota)) < 3) return { ok: false, erro: 'Transferir exige o motivo na nota (pelo menos 3 letras).' }
  }
  if (nome === 'preparar_decisao_financeira' && valor.decisao === 'recusar' && letras(String(valor.motivo)) < LIMITES.motivoMinimo) {
    return { ok: false, erro: `Recusar exige o motivo (pelo menos ${LIMITES.motivoMinimo} letras), nas palavras da pessoa: quem pediu recebe o motivo.` }
  }
  return { ok: true, valor }
}

// ------------------------------------------------------------------ o plano

export type PessoaNoPlano = { nome: string; username: string; setor: string | null; homonimo: boolean }

/** Um passo resolvido: tudo o que o texto do plano e o executor precisam, lido do banco no preparo. */
export type Passo =
  | {
    acao: 'votar'; aprovacaoId: string; decisao: 'approved' | 'changes_requested'; nota: string; hashConteudo: string
    titulo: string; pedidoPor: { nome: string; username: string; homonimo: boolean } | null; pedidoEm: string
    conferencia: { setor: string; itens: string[] }[]; isento: false
  }
  | { acao: 'mensagem_direta'; paraId: string; para: PessoaNoPlano; texto: string; isento: false }
  | { acao: 'comentar_chamado'; chamadoId: string; codigo: string; titulo: string; texto: string; isento: false }
  | { acao: 'responder_chat'; canalId: string; fio: string | null; canalNome: string; texto: string; isento: false }
  | {
    acao: 'abrir_chamado'; filaId: string; filaNome: string; categoriaId: string; categoriaNome: string
    relato: string; local: string | null; urgencia: 1 | 2 | 3; isento: true
  }
  | { acao: 'responder_visita'; visitaId: string; visitante: string; resposta: 'subir' | 'aguardar' | 'recusar'; recado: string | null; isento: true }
  /**
   * Marcar como lidos: os avisos do plano, ou "todos" os sem ler até `ate` (a hora do preparo, em ISO: o aviso que
   * chega depois do plano não fica lido sem ser visto). Sem `ate` (planos de antes), todos os sem ler.
   */
  | { acao: 'marcar_lidos'; avisoIds: string[] | 'todos'; ate?: string; quantos: number; isento: true }
  /** Quem atende a fila: assumir, resolver (a nota é a solução) ou transferir (a nota é o motivo), pelas funções da tela. */
  | {
    acao: 'atender_chamado'; chamadoId: string; codigo: string; titulo: string; tipo: 'assumir' | 'resolver' | 'transferir'
    filaId: string | null; filaNome: string | null; categoriaId: string | null; categoriaNome: string | null; nota: string; isento: false
  }
  /** A portaria registra quem chegou; a pessoa visitada recebe o aviso e responde como sempre. */
  | { acao: 'registrar_visita'; visitante: string; empresa: string | null; visitadoId: string; visitado: PessoaNoPlano; motivo: string | null; isento: false }
  /** A decisão de uma despesa ou de uma compra: SEMPRE confirmada no Palácio, pela função da tela (nunca pelo WhatsApp). */
  | {
    acao: 'decidir_financeiro'; tipo: 'despesa' | 'compra'; itemId: string; titulo: string; codigo: string | null; valor: number; fornecedor: string | null
    papel: 'financeiro' | 'diretoria' | null; decisao: 'aprovar' | 'recusar'; motivo: string; isento: false
  }
  /**
   * Guardar no Google Drive o documento que a pessoa mandou ao WhatsApp (lib/whatsapp/drive.ts): `nome` é o nome final
   * do arquivo, `partes` o caminho dentro de "Palácio – Arquivos" (já conferido: o setor dela, ou qualquer um para quem
   * administra) e o resto é o que baixa o arquivo da Kapso na hora (a mensagem, o id da mídia e o endereço de reserva).
   */
  | {
    acao: 'guardar_no_drive'; nome: string; tipo: string; tamanho: number | null; mime: string; extensao: string
    mensagemId: string; arquivo: string; endereco: string | null; partes: string[]; isento: false
  }

/** Valem com a verificação em duas etapas (só criam ou respondem o que é da pessoa): abrir chamado, responder à portaria, marcar lidos. */
export const passoIsento = (p: Passo): boolean => p.isento === true

/** A decisão do Financeiro: nunca sai pelo WhatsApp, nem de quem pode agir por lá. */
export const passoSempreNoPalacio = (p: Passo): boolean => p.acao === 'decidir_financeiro'

/**
 * O plano vai inteiro ao Palácio se algum passo é sensível: a decisão do Financeiro (sempre) ou um passo não isento de
 * quem não pode agir pelo WhatsApp (a verificação em duas etapas).
 */
export const planoSensivel = (passos: Passo[], podeAgir: boolean): boolean => passos.some((p) => passoSempreNoPalacio(p) || (!passoIsento(p) && !podeAgir))

/** JSON com as chaves em ordem: o mesmo plano dá sempre o mesmo texto (e o mesmo hash), venha da memória ou do jsonb. */
export function jsonCanonico(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => jsonCanonico(x)).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`
}

export const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex')

/** O hash do plano: preso à pessoa, ao espaço e aos passos exatos. Qualquer campo mudado, outro hash. */
export function hashDoPlano(p: { userId: string; workspaceId: string; passos: Passo[] }): string {
  return sha256(jsonCanonico({ v: 2, userId: p.userId, workspaceId: p.workspaceId, passos: p.passos }))
}

/** O que ficou de fora no preparo (o código escreve o quê e o porquê; `link`: onde fazer no Palácio, já com o endereço inteiro). */
export type FicouDeFora = { oQue: string; motivo: string; link?: string }

/** "18/10" a partir de um instante, em Brasília. */
function diaEMes(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const [, m, dia] = agoraEmBrasilia(d).dia.split('-')
  return `${dia}/${m}`
}

/** O texto que vai sair, inteiro e citado: cada linha com "> " (um corpo não imita linha do plano), sem linhas vazias seguidas. */
function citacao(texto: string): string {
  const linhas = semInvisiveis(String(texto ?? '')).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\u2028|\u2029/g, '\n').split('\n').map((l) => l.trimEnd())
  const juntas: string[] = []
  for (const l of linhas) if (l.trim() || (juntas.length && juntas[juntas.length - 1] !== '')) juntas.push(l.trim() ? l : '')
  while (juntas.length && juntas[juntas.length - 1] === '') juntas.pop()
  return juntas.map((l) => (l ? `> ${l}` : '>')).join('\n')
}

const titulo = (t: string) => `“${umaLinha(limpo(String(t ?? ''), 600), 140) || 'Sem título'}”`
/** "no canal *#geral*", ou "na conversa" (a conversa direta não tem nome); no fio, "do canal". */
const ondeNoChat = (canalNome: string, fio: boolean) => {
  const nome = umaLinha(limpo(String(canalNome ?? ''), 200), 60).replace(/^#/, '')
  return nome ? `${fio ? 'do' : 'no'} canal *#${nome}*` : fio ? 'da conversa' : 'na conversa'
}
/** O nome de uma pessoa (ou de quem visita) no plano e no recibo: sem os sinais que imitariam o @usuário (nomeMostrado). */
const nomeCurto = (t: string) => nomeMostrado(t) || 'Sem nome'
/** O nome do documento guardado no Drive (os parênteses do nome do arquivo ficam). */
const arquivoCurto = (t: string) => umaLinha(limpo(String(t ?? ''), 400), 80) || 'Sem nome'
const HOMONIMO = '⚠ há outra pessoa com este nome no espaço'
const ROTULO_DA_RESPOSTA_A_VISITA: Record<'subir' | 'aguardar' | 'recusar', string> = { subir: RESPOSTAS.subir.rotulo, aguardar: RESPOSTAS.aguardar.rotulo, recusar: RESPOSTAS.recusar.rotulo }
const ROTULO_DA_URGENCIA: Record<1 | 2 | 3, string> = { 1: 'baixa', 2: 'média', 3: 'alta' }
/** "2,3 MB", "180 KB" (o documento guardado no Drive). */
function tamanhoDoArquivo(bytes: number | null): string {
  const b = Number(bytes)
  if (!Number.isFinite(b) || b <= 0) return ''
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
/** O valor em reais, como as telas do Financeiro (o texto do plano é da pessoa; o valor nunca vai ao modelo). */
const emReais = (valor: number) => (Number.isFinite(valor) ? valor : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** "Ana Souza (@ana.souza · RH)", no texto do plano (o nome em negrito). */
function pessoaNoTexto(p: PessoaNoPlano): string {
  const usuario = String(p.username ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
  const setor = p.setor ? umaLinha(limpo(p.setor, 200), 40) : ''
  const dentro = [usuario ? `@${usuario}` : null, setor || null].filter(Boolean).join(' · ')
  return `*${nomeCurto(p.nome)}*${dentro ? ` (${dentro})` : ''}`
}

function blocoDaConferencia(conferencia: { setor: string; itens: string[] }[]): string[] {
  return conferencia.filter((b) => b.itens.length).flatMap((b) => [
    `_Ao confirmar, você declara que conferiu (${umaLinha(limpo(b.setor, 200), 60)}):_`,
    ...b.itens.map((i) => `☐ ${umaLinha(limpo(i, 600), 200)}`),
  ])
}

/**
 * As linhas dos passos (sem o cabeçalho e o rodapé): é o que aparece no WhatsApp e, em HTML, na página de confirmar
 * no Palácio. Pessoas sempre com @usuário; o texto que sai, inteiro e citado; a conferência do setor agrupada
 * quando é a mesma em todos os votos "aprovado".
 */
export function linhasDoPlano(passos: Passo[]): string[] {
  const aprovados = passos.filter((p): p is Extract<Passo, { acao: 'votar' }> => p.acao === 'votar' && p.decisao === 'approved')
  const agrupar = aprovados.length > 1 && aprovados.every((v) => jsonCanonico(v.conferencia) === jsonCanonico(aprovados[0].conferencia))
  const ultimoAprovado = aprovados[aprovados.length - 1]
  const temVoto = passos.some((p) => p.acao === 'votar')
  const linhas: string[] = []
  passos.forEach((p, i) => {
    const n = `*${i + 1}.*`
    if (p.acao === 'votar') {
      const quem = p.pedidoPor ? ` — pedida por ${nomeCurto(p.pedidoPor.nome)} (@${String(p.pedidoPor.username).replace(/[^a-z0-9._-]/gi, '').slice(0, 40)})` : ''
      const quando = diaEMes(p.pedidoEm)
      const cabeca = `${p.decisao === 'approved' ? 'Votar *aprovado*' : 'Pedir *ajustes*'} em ${titulo(p.titulo)}${quem}${quando ? ` em ${quando}` : ''}`
      linhas.push(p.decisao === 'approved' ? `${n} ${cabeca}` : `${n} ${cabeca}:`)
      if (p.pedidoPor?.homonimo) linhas.push(HOMONIMO)
      if (p.decisao === 'changes_requested') linhas.push(citacao(p.nota))
      if (p.decisao === 'approved' && (!agrupar || p === ultimoAprovado)) linhas.push(...blocoDaConferencia(p.conferencia))
    } else if (p.acao === 'mensagem_direta') {
      linhas.push(`${n} Mensagem no Palácio para ${pessoaNoTexto(p.para)}:`)
      if (p.para.homonimo) linhas.push(HOMONIMO)
      linhas.push(citacao(p.texto))
      linhas.push(`_Chega no sino da pessoa (marcada como enviada pelo WhatsApp do Palácio) e, se ela recebe os avisos pelo WhatsApp, por lá.${temVoto ? ' O Palácio também avisa cada voto a quem pediu a aprovação.' : ''}_`)
    } else if (p.acao === 'comentar_chamado') {
      linhas.push(`${n} Comentar no chamado *${umaLinha(limpo(p.codigo, 40), 20)}* ${titulo(p.titulo)}:`, citacao(p.texto))
    } else if (p.acao === 'responder_chat') {
      linhas.push(`${n} Responder ${p.fio ? 'no fio ' : ''}${ondeNoChat(p.canalNome, p.fio !== null)}:`, citacao(p.texto))
    } else if (p.acao === 'abrir_chamado') {
      linhas.push(`${n} Abrir chamado em *${umaLinha(limpo(p.filaNome, 200), 60)}* · ${umaLinha(limpo(p.categoriaNome, 200), 60)} (urgência ${ROTULO_DA_URGENCIA[p.urgencia] ?? 'média'})${p.local ? ` — local: ${umaLinha(limpo(p.local, 400), LIMITES.local)}` : ''}:`)
      linhas.push(citacao(p.relato))
    } else if (p.acao === 'responder_visita') {
      linhas.push(`${n} Responder à portaria sobre *${nomeCurto(p.visitante)}*: *${ROTULO_DA_RESPOSTA_A_VISITA[p.resposta]}*${p.recado ? ', com o recado:' : ''}`)
      if (p.recado) linhas.push(citacao(p.recado))
    } else if (p.acao === 'atender_chamado') {
      const chamado = `o chamado *${umaLinha(limpo(p.codigo, 40), 20)}* ${titulo(p.titulo)}`
      if (p.tipo === 'assumir') {
        linhas.push(`${n} Assumir ${chamado} (ele fica com você)`)
      } else if (p.tipo === 'resolver') {
        linhas.push(`${n} Resolver ${chamado}, com a solução:`, citacao(p.nota), '_Quem abriu é avisado para confirmar e avaliar (ou reabrir)._')
      } else {
        const destino = `*${umaLinha(limpo(p.filaNome ?? '', 200), 60) || 'outra fila'}*${p.categoriaNome ? ` · ${umaLinha(limpo(p.categoriaNome, 200), 60)}` : ''}`
        linhas.push(`${n} Transferir ${chamado} para ${destino}, com o motivo:`, citacao(p.nota))
      }
    } else if (p.acao === 'registrar_visita') {
      const empresa = p.empresa ? ` (de ${umaLinha(limpo(p.empresa, 400), LIMITES.empresa)})` : ''
      linhas.push(`${n} Registrar na portaria a entrada de *${nomeCurto(p.visitante)}*${empresa} para ${pessoaNoTexto(p.visitado)}${p.motivo ? ', motivo:' : ''}`)
      if (p.visitado.homonimo) linhas.push(HOMONIMO)
      if (p.motivo) linhas.push(citacao(p.motivo))
      linhas.push('_A pessoa recebe a ficha da visita e responde à portaria; você é avisado da resposta. Para o telefone, a autorização ou a foto do visitante, cancele e escreva *visitante:* e o nome: o registro guiado pergunta tudo._')
    } else if (p.acao === 'decidir_financeiro') {
      const oQue = p.tipo === 'despesa' ? 'a despesa' : `a compra *${umaLinha(limpo(p.codigo ?? '', 40), 20)}*`
      const fornecedor = p.fornecedor ? ` · ${umaLinha(limpo(p.fornecedor, 400), 80)}` : ''
      const etapa = p.papel === 'diretoria' ? ' (pela Diretoria)' : p.tipo === 'compra' ? ' (pelo Financeiro)' : ''
      linhas.push(`${n} ${p.decisao === 'aprovar' ? '*Aprovar*' : '*Recusar*'} ${oQue} ${titulo(p.titulo)} — ${emReais(p.valor)}${fornecedor}${etapa}${p.decisao === 'recusar' ? ', com o motivo:' : ''}`)
      if (p.decisao === 'recusar') linhas.push(citacao(p.motivo))
      linhas.push('_A decisão é confirmada no Palácio, com a sua sessão: o WhatsApp nunca decide despesa nem compra._')
    } else if (p.acao === 'guardar_no_drive') {
      const tamanho = tamanhoDoArquivo(p.tamanho)
      linhas.push(`${n} Guardar no Google Drive o documento *${arquivoCurto(p.nome)}* (${[umaLinha(p.tipo, 20), tamanho].filter(Boolean).join(', ')}) em _${umaLinha(limpo(['Palácio – Arquivos', ...p.partes].join('/'), 600), 300)}_`)
      linhas.push('_A pasta é criada se ainda não existir; o link do arquivo vem no recibo._')
    } else {
      linhas.push(`${n} Marcar como lidos ${p.avisoIds === 'todos' ? 'todos os avisos sem abrir' : p.quantos === 1 ? '1 aviso' : `${p.quantos} avisos`}`)
    }
  })
  return linhas
}

export const CABECALHO_DO_PLANO = '*Confira o plano* — nada foi feito ainda.'
export const LINHA_DO_PLANO_SENSIVEL =
  'Como sua conta usa a verificação em duas etapas, a confirmação é no Palácio: responda *confirmo* e eu mando o link (uso único, 15 minutos).'
/** O plano com uma decisão do Financeiro (de qualquer pessoa): a confirmação é sempre no Palácio. */
export const LINHA_DO_PLANO_NO_PALACIO =
  'Decisão de despesa ou compra se confirma no Palácio: responda *confirmo* e eu mando o link (uso único, 15 minutos).'

/**
 * O texto do plano, todo escrito aqui: os passos (linhasDoPlano), o que ficou de fora, a linha do Palácio quando é
 * sensível e como responder. Nunca mostra hash, ids, nem se o colega tem WhatsApp. `cabe`: false acima de
 * LIMITES.textoDoPlano — aí o texto é a recusa (TEXTOS_FIXOS.grande).
 */
export function textoDoPlano(p: { passos: Passo[]; ficouDeFora?: FicouDeFora[]; sensivel?: boolean }): { texto: string; cabe: boolean } {
  const fora = (p.ficouDeFora ?? []).map((f) => {
    const motivo = umaLinha(f.motivo, 200)
    return `Ficou de fora: ${umaLinha(f.oQue, 200)} — ${f.link ? `${motivo.replace(/[.\s]+$/, '')}: ${umaLinha(f.link, 300)}` : motivo}`
  })
  const texto = [
    CABECALHO_DO_PLANO,
    linhasDoPlano(p.passos).join('\n'),
    fora.length ? fora.join('\n') : null,
    [
      p.passos.length > 1 ? 'Se um passo falhar, os seguintes não são feitos.' : null,
      p.sensivel ? (p.passos.some(passoSempreNoPalacio) ? LINHA_DO_PLANO_NO_PALACIO : LINHA_DO_PLANO_SENSIVEL) : null,
      `Responda *confirmo* para fazer${p.passos.length > 1 ? ' tudo' : ''}, ou *cancelar*. Vale por ${LIMITES.planoValeMin} minutos.`,
    ].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n')
  return texto.length <= LIMITES.textoDoPlano ? { texto, cabe: true } : { texto: TEXTOS_FIXOS.grande, cabe: false }
}

/**
 * O rascunho vira plano? De 1 a 8 passos; passo repetido vira um só, na ordem; no máximo 3 votos (e um por
 * aprovação), 3 destinatários e uma mensagem por destinatário; o texto cabe no WhatsApp.
 */
export function validarRascunho(passos: Passo[], extra: { ficouDeFora?: FicouDeFora[]; sensivel?: boolean } = {}): { ok: true; passos: Passo[] } | { ok: false; erro: string } {
  const vistos = new Set<string>()
  const unicos = passos.filter((p) => {
    const chave = jsonCanonico(p)
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  if (!unicos.length) return { ok: false, erro: 'Nenhum passo para confirmar.' }
  if (unicos.length > LIMITES.passos) return { ok: false, erro: `No máximo ${LIMITES.passos} passos por plano; faça pelo Palácio.` }
  const votos = unicos.filter((p) => p.acao === 'votar')
  if (new Set(votos.map((v) => v.aprovacaoId)).size < votos.length) return { ok: false, erro: 'Dois votos diferentes na mesma aprovação.' }
  if (votos.length > LIMITES.votos) return { ok: false, erro: `No máximo ${LIMITES.votos} votos por plano; o resto, pelo Palácio.` }
  const mensagens = unicos.filter((p) => p.acao === 'mensagem_direta')
  const destinatarios = new Set(mensagens.map((m) => m.paraId))
  if (destinatarios.size < mensagens.length) return { ok: false, erro: 'Uma mensagem por pessoa em cada plano.' }
  if (destinatarios.size > LIMITES.destinatarios) return { ok: false, erro: `Mensagens para no máximo ${LIMITES.destinatarios} pessoas por plano.` }
  if (!textoDoPlano({ passos: unicos, ...extra }).cabe) return { ok: false, erro: TEXTOS_FIXOS.grande }
  return { ok: true, passos: unicos }
}

/**
 * A pergunta do assistente, escrita aqui: as opções com os rótulos do banco (pessoas com @usuário e ⚠) e o
 * pedido em aberto, que a pessoa vê (o modelo o escreveu: entra saneado, numa linha).
 */
export function textoDaPergunta(p: { pergunta: string; opcoes: string[]; pedidoEmAberto: string | null }): string {
  // Sem sublinhado: o pedido vai em itálico, e um "_" no meio quebraria a formatação.
  const pedido = p.pedidoEmAberto ? limpo(dadoDeTerceiro(p.pedidoEmAberto, LIMITES.pedidoEmAberto), LIMITES.pedidoEmAberto) : ''
  return [
    dadoDeTerceiro(p.pergunta, LIMITES.pergunta) || 'Qual?',
    p.opcoes.map((o, i) => `*${i + 1}* – ${umaLinha(o, 120)}`).join('\n'),
    pedido ? `_Para: ${pedido}_` : null,
    `Responda com o número, ou *cancelar*. Vale por ${LIMITES.planoValeMin} minutos.`,
  ].filter(Boolean).join('\n')
}

/** O resultado de cada passo executado, como fica em whatsapp_ia_planos.resultado (sem texto). */
export type ResultadoDoPasso = { n: number; ok: boolean; codigo: string }

function linkDoPasso(p: Passo, base: string): string | null {
  if (p.acao === 'votar') return `${base}/aprovacoes/${p.aprovacaoId}`
  if (p.acao === 'mensagem_direta') return `${base}/mensagens/pessoa/${p.paraId}`
  if (p.acao === 'comentar_chamado') return `${base}/chamados/${p.chamadoId}`
  if (p.acao === 'responder_chat') return `${base}/chat/${p.canalId}${p.fio ? `?fio=${p.fio}` : ''}`
  if (p.acao === 'responder_visita') return null
  if (p.acao === 'marcar_lidos') return `${base}/notificacoes`
  if (p.acao === 'atender_chamado') return `${base}/chamados/${p.chamadoId}`
  if (p.acao === 'registrar_visita') return `${base}/portaria`
  if (p.acao === 'decidir_financeiro') return p.tipo === 'despesa' ? `${base}/financeiro/${p.itemId}` : `${base}/financeiro/compras/${p.itemId}`
  // O documento guardado no Drive: o link do arquivo vem do resultado da execução.
  return null
}

/** O que foi feito, sem os textos de ação (o recibo pode esperar na fila). */
function feitoDoPasso(p: Passo): string {
  if (p.acao === 'votar') return p.decisao === 'approved' ? `Voto *aprovado* em ${titulo(p.titulo)}` : `Pedido de *ajustes* em ${titulo(p.titulo)}`
  if (p.acao === 'mensagem_direta') return `Mensagem enviada a *${nomeCurto(p.para.nome)}* (@${String(p.para.username).replace(/[^a-z0-9._-]/gi, '').slice(0, 40)})`
  if (p.acao === 'comentar_chamado') return `Comentário no chamado *${umaLinha(limpo(p.codigo, 40), 20)}*`
  if (p.acao === 'responder_chat') return `Resposta ${ondeNoChat(p.canalNome, false)}`
  if (p.acao === 'abrir_chamado') return `Chamado aberto em *${umaLinha(limpo(p.filaNome, 200), 60)}*`
  if (p.acao === 'responder_visita') return `Resposta à portaria sobre *${nomeCurto(p.visitante)}*: *${ROTULO_DA_RESPOSTA_A_VISITA[p.resposta]}*`
  if (p.acao === 'atender_chamado') {
    const codigo = `*${umaLinha(limpo(p.codigo, 40), 20)}*`
    if (p.tipo === 'assumir') return `Chamado ${codigo} assumido`
    if (p.tipo === 'resolver') return `Chamado ${codigo} resolvido; quem abriu foi avisado`
    return `Chamado ${codigo} transferido para *${umaLinha(limpo(p.filaNome ?? '', 200), 60) || 'outra fila'}*`
  }
  // O nome do visitante é texto de ação (é redigido): o recibo, que pode esperar na fila, fala só de quem foi avisado.
  if (p.acao === 'registrar_visita') return `Entrada registrada na portaria; *${nomeCurto(p.visitado.nome)}* recebeu o aviso`
  if (p.acao === 'decidir_financeiro') {
    const oQue = p.tipo === 'despesa' ? 'Despesa' : `Compra *${umaLinha(limpo(p.codigo ?? '', 40), 20)}*`
    return `${oQue} ${titulo(p.titulo)} ${p.decisao === 'aprovar' ? '*aprovada*' : '*recusada*'}`
  }
  // O nome do arquivo é redigido junto com o plano: o recibo, que pode esperar na fila, fala só da pasta.
  if (p.acao === 'guardar_no_drive') return `Documento guardado no Google Drive em _${umaLinha(limpo(p.partes.join('/'), 400), 200)}_`
  return p.avisoIds === 'todos' ? 'Avisos marcados como lidos' : `${p.quantos === 1 ? '1 aviso marcado' : `${p.quantos} avisos marcados`} como lido${p.quantos === 1 ? '' : 's'}`
}

const juntarNumeros = (ns: number[]) => (ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0]))

/**
 * O recibo: cada passo feito com o link (o link do resultado, quando a ação devolve um — o chamado aberto —, ou o
 * do item), e onde parou. Sem textos de ação: pode ir pela fila. `resultados`: os da execução, em ordem, com o
 * texto do código para o passo que falhou.
 */
export function textoDoRecibo(p: {
  passos: Passo[]; resultados: (ResultadoDoPasso & { texto?: string; link?: string })[]; urlBase: string
  /** O recibo do plano confirmado pelo WhatsApp oferece o "Não fui eu" (lib/whatsapp/protecao.ts): é a linha que ensina e marca o aviso. */
  naoFuiEu?: boolean
}): string {
  const feitos = p.resultados.filter((r) => r.ok)
  const falhou = p.resultados.find((r) => !r.ok && r.codigo !== 'nao_feito')
  const cabeca = !falhou ? 'Feito:' : feitos.length ? 'Feito em parte:' : 'Nada foi feito:'
  const linhas = feitos.map((r) => {
    const passo = p.passos[r.n - 1]
    if (!passo) return null
    const link = r.link ?? linkDoPasso(passo, p.urlBase)
    return `✓ ${feitoDoPasso(passo)}${link ? ` — ${link}` : ''}`
  }).filter((l): l is string => Boolean(l))
  if (falhou) {
    const motivo = umaLinha(limpo(falhou.texto ?? 'não deu certo', 400), 200).replace(/[.\s]+$/, '')
    linhas.push(`✗ Parei no passo ${falhou.n}: ${motivo}.`)
    const seguintes = p.passos.map((_, i) => i + 1).filter((n) => n > falhou.n)
    if (seguintes.length) linhas.push(seguintes.length === 1 ? `O passo ${seguintes[0]} não foi feito.` : `Os passos ${juntarNumeros(seguintes)} não foram feitos.`)
  }
  const recibo = [cabeca, ...linhas].join('\n')
  return p.naoFuiEu && feitos.length ? `${recibo}\n\n_${LINHA_DO_NAO_FUI_EU}_` : recibo
}

/**
 * O que a pessoa já fez hoje pelo assistente, a partir dos planos executados (executado ou parcial) desde a
 * meia-noite de Brasília: quantos planos e quantas mensagens diretas saíram de verdade (o passo com resultado ok).
 * As cotas do dia (LIMITES.planosDia, whatsapp_ia_config.mensagens_dia) contam por aqui.
 */
export function contarAcoesDoDia(linhas: { passos: unknown; resultado: unknown }[]): { planos: number; mensagens: number } {
  let mensagens = 0
  for (const l of linhas) {
    const passos = Array.isArray(l.passos) ? l.passos as { acao?: unknown }[] : []
    const resultado = Array.isArray(l.resultado) ? l.resultado as Partial<ResultadoDoPasso>[] : []
    passos.forEach((p, i) => {
      if (p?.acao === 'mensagem_direta' && resultado.some((r) => r?.n === i + 1 && r.ok === true)) mensagens++
    })
  }
  return { planos: linhas.length, mensagens }
}

/** O registro da conferência que a pessoa declarou ao confirmar o plano (o mesmo formato de registroDaConferencia, de lib/aprovacoes/setores.ts). */
export function registroDaConferenciaDoPlano(conferencia: { setor: string; itens: string[] }[]): string {
  return conferencia.filter((b) => b.itens.length).map((b) => `Conferido (${b.setor}): ${b.itens.join('; ')}.`).join('\n')
}

/** O motivo do código como entra em "Ficou de fora" e no "Nada foi feito": minúscula no começo (o resto como está). */
export function motivoDoCodigo(texto: string): string {
  const t = umaLinha(String(texto ?? ''), 300)
  return t ? `${t.charAt(0).toLocaleLowerCase('pt-BR')}${t.slice(1)}` : 'não deu certo'
}

/** A revalidação na confirmação achou um passo que não vale mais: nada é feito. */
export function textoDaRevalidacao(n: number, motivo: string, total: number): string {
  const porque = motivoDoCodigo(umaLinha(limpo(motivo, 400), 200)).replace(/[.\s]+$/, '')
  return `Nada foi feito: ${total > 1 ? `passo ${n}, ` : ''}${porque}. Peça de novo se quiser.`
}

/** O plano sensível: o link de confirmar no Palácio (app/confirmar/[token], ramo "plano"). */
export function textoDoLinkNoPalacio(url: string): string {
  return textoDoLinkDeConfirmacao({ oQue: `O plano está pronto para confirmar no Palácio (vale por ${CONFIRMACAO_VALE_MIN} minutos).`, url })
}

/** O plano que a página de confirmar no Palácio (ou um botão atrasado) não acha mais esperando: por quê, numa frase. */
export function textoDoPlanoQueNaoVale(situacao: string | null | undefined): string {
  if (situacao === 'executando' || situacao === 'executado' || situacao === 'parcial' || situacao === 'falhou') return 'Este plano já foi confirmado: veja o recibo no WhatsApp.'
  if (situacao === 'vencido') return 'Este plano venceu. Peça de novo pelo WhatsApp do Palácio, ou faça pela tela de sempre.'
  if (situacao === 'cancelado' || situacao === 'substituido') return 'Este plano foi cancelado ou trocado por outro: nada foi feito.'
  return TEXTOS_FIXOS.velho
}

// ------------------------------------------------------------------ botões e listas (o toque é lido pelo código)

/** Os botões do plano: Confirmar e Cancelar, com o id curto e o hash (o botão de um plano antigo, ou com outro hash, não confirma). */
export function interativoDoPlano(planoId: string, hash: string): Interativo {
  return { tipo: 'botoes', botoes: [{ id: idDoBotao(planoId, hash, true), titulo: 'Confirmar' }, { id: idDoBotao(planoId, hash, false), titulo: 'Cancelar' }] }
}

/** "Ana Souza (@ana.souza · RH) ⚠" → o nome no título da linha e o resto na descrição; o que não é pessoa, inteiro. */
function partesDoRotulo(rotulo: string): { titulo: string; descricao: string | null } {
  const r = umaLinha(rotulo, 120)
  const m = /^(.+?) \((@[^)]*)\)( ⚠)?$/.exec(r)
  if (m) return { titulo: m[1], descricao: `${m[2]}${m[3] ? ' · ⚠ há outra pessoa com este nome' : ''}` }
  return { titulo: r, descricao: r.length > LIMITES_DO_INTERATIVO.tituloDaLinha - 3 ? r : null }
}

/** A lista da pergunta do assistente: uma linha por opção, com o id `esc:<id curto>:<marcador>` (o toque escolhe aquela opção). */
export function interativoDaPergunta(perguntaId: string, opcoes: string[], rotulos: string[]): Interativo | null {
  if (!opcoes.length || opcoes.length !== rotulos.length || opcoes.length > LIMITES_DO_INTERATIVO.linhas) return null
  return {
    tipo: 'lista', botao: 'Escolher',
    secoes: [{ linhas: opcoes.map((m, i) => ({ id: idDaEscolha(perguntaId, m), titulo: `${i + 1}. ${partesDoRotulo(rotulos[i]).titulo}`, descricao: partesDoRotulo(rotulos[i]).descricao })) }],
  }
}

/**
 * O texto com os botões (ou a lista), no limite do corpo de uma mensagem interativa (LIMITES_DO_INTERATIVO.corpo):
 * até ele, uma mensagem só; acima, o texto sai sozinho e os botões vêm numa segunda mensagem curta (`chamada`). As
 * duas mostram o plano: citar qualquer uma é citar o plano.
 */
export function mensagensComInterativo(texto: string, interativo: Interativo | null, chamada: string): { texto: string; interativo: Interativo | null }[] {
  if (!interativo || texto.trim().length <= LIMITES_DO_INTERATIVO.corpo) return [{ texto, interativo }]
  return [{ texto, interativo: null }, { texto: chamada, interativo }]
}

// ------------------------------------------------------------------ o áudio (só com a transcrição da Kapso)

/** O eco do que o código entendeu do áudio, na frente da resposta: a pessoa confere antes de qualquer plano. */
export function textoDoEcoDoAudio(transcricao: string): string {
  return `_Entendi do áudio:_ “${limpo(dadoDeTerceiro(transcricao, LIMITES.eco), LIMITES.eco) || '…'}”`
}

// ------------------------------------------------------------------ a página de confirmar no Palácio (as mesmas linhas, em HTML)

export type ParteDoTexto = { texto: string; negrito: boolean }
export type BlocoDaTela = { tipo: 'passo' | 'citacao' | 'nota' | 'aviso'; partes: ParteDoTexto[] }

/** "Votar *aprovado* em “X”" → as partes, com o negrito do WhatsApp marcado (a página não interpreta mais nada). */
export function partesComNegrito(linha: string): ParteDoTexto[] {
  const partes: ParteDoTexto[] = []
  let resto = String(linha ?? '')
  for (let m = /\*([^*\n]+)\*/.exec(resto); m; m = /\*([^*\n]+)\*/.exec(resto)) {
    if (m.index > 0) partes.push({ texto: resto.slice(0, m.index), negrito: false })
    partes.push({ texto: m[1], negrito: true })
    resto = resto.slice(m.index + m[0].length)
  }
  if (resto) partes.push({ texto: resto, negrito: false })
  return partes
}

/**
 * As linhas do plano (linhasDoPlano, as mesmas do WhatsApp) como blocos para a página de confirmar no Palácio: o
 * passo, o texto que vai sair (as linhas "> " juntas), a nota em itálico e o ⚠. A conferência do setor não entra
 * aqui: a página a mostra como caixas para marcar (conferenciaDoPlano), como a tela da aprovação.
 */
export function blocosDaTela(linhas: string[]): BlocoDaTela[] {
  const blocos: BlocoDaTela[] = []
  for (const linha of linhas.flatMap((l) => l.split('\n'))) {
    if (linha.startsWith('☐ ') || linha.startsWith('_Ao confirmar, você declara que conferiu')) continue
    if (linha === '>' || linha.startsWith('> ')) {
      const texto = linha === '>' ? '' : linha.slice(2)
      const ultimo = blocos[blocos.length - 1]
      if (ultimo?.tipo === 'citacao') ultimo.partes[0].texto += `\n${texto}`
      else blocos.push({ tipo: 'citacao', partes: [{ texto, negrito: false }] })
    } else if (/^_.+_$/.test(linha)) {
      blocos.push({ tipo: 'nota', partes: [{ texto: linha.slice(1, -1), negrito: false }] })
    } else if (linha.startsWith('⚠')) {
      blocos.push({ tipo: 'aviso', partes: [{ texto: linha, negrito: false }] })
    } else if (linha.trim()) {
      blocos.push({ tipo: 'passo', partes: partesComNegrito(linha) })
    }
  }
  return blocos
}

/** A conferência que a página pede marcada: a dos votos "aprovado" do plano, por setor, sem repetir item. */
export function conferenciaDoPlano(passos: Passo[]): { setor: string; itens: string[] }[] {
  const porSetor = new Map<string, string[]>()
  for (const p of passos) {
    if (p.acao !== 'votar' || p.decisao !== 'approved') continue
    for (const b of p.conferencia) {
      const itens = porSetor.get(b.setor) ?? []
      for (const i of b.itens) if (!itens.includes(i)) itens.push(i)
      porSetor.set(b.setor, itens)
    }
  }
  return [...porSetor.entries()].filter(([, itens]) => itens.length).map(([setor, itens]) => ({ setor, itens }))
}

const REDIGIDO = /^h:[0-9a-f]{12}$/
const resumoDoTexto = (t: string | null) => (t === null || t === '' || REDIGIDO.test(t) ? t : `h:${sha256(t).slice(0, 12)}`)

/**
 * Apaga os textos de ação de um plano que saiu de "aberto" (executado, falhou, cancelado, substituído, vencido):
 * mensagem, nota, relato, recado, local, a solução ou o motivo do chamado, o visitante (nome, empresa, motivo), o
 * motivo da decisão e o nome do documento guardado no Drive viram um sha-256 curto (dá para conferir, não para ler;
 * o id da mídia do documento some), e o pedido em aberto some. Títulos e nomes do banco ficam: o sino já os guarda.
 * Idempotente.
 */
export function redigirPassos(passos: Passo[]): { passos: Passo[]; pedidoEmAberto: null } {
  const redigidos = passos.map((p): Passo => {
    if (p.acao === 'votar') return { ...p, nota: resumoDoTexto(p.nota) ?? '' }
    if (p.acao === 'mensagem_direta' || p.acao === 'comentar_chamado' || p.acao === 'responder_chat') return { ...p, texto: resumoDoTexto(p.texto) ?? '' }
    if (p.acao === 'abrir_chamado') return { ...p, relato: resumoDoTexto(p.relato) ?? '', local: resumoDoTexto(p.local) }
    if (p.acao === 'responder_visita') return { ...p, recado: resumoDoTexto(p.recado) }
    if (p.acao === 'atender_chamado') return { ...p, nota: resumoDoTexto(p.nota) ?? '' }
    if (p.acao === 'registrar_visita') return { ...p, visitante: resumoDoTexto(p.visitante) ?? '', empresa: resumoDoTexto(p.empresa), motivo: resumoDoTexto(p.motivo) }
    if (p.acao === 'decidir_financeiro') return { ...p, motivo: resumoDoTexto(p.motivo) ?? '' }
    // O documento: o nome some, e o que baixava o arquivo também (o plano não serve mais para buscá-lo).
    if (p.acao === 'guardar_no_drive') return { ...p, nome: resumoDoTexto(p.nome) ?? '', arquivo: '', endereco: null }
    return p
  })
  return { passos: redigidos, pedidoEmAberto: null }
}

// ------------------------------------------------------------------ a resposta em texto do modelo

const URL_COM_ESQUEMA = /https?:\/\/\S+/gi
const URL_COM_WWW = /(^|[^a-z0-9])www\.\S+/gi

/** Um item citável na resposta: o rótulo que entra no lugar do marcador e o link (o código põe, nunca o modelo). */
export type ItemCitavel = { rotulo: string; link: string | null }

/**
 * A resposta em texto, antes de sair: sem URL nenhuma (http, www., domínio solto), com cada marcador trocado pelo
 * nome ou título (marcador desconhecido some; "⟦pes_1⟧" de terceiro fica como está), no formato do WhatsApp, e com
 * os links de até 3 itens citados e os da Central de ajuda, escritos aqui.
 */
export function posProcessarResposta(texto: string, p: { itens: Record<string, ItemCitavel>; ajuda?: { titulo: string; href: string }[]; urlBase: string }): string {
  DOMINIO_SOLTO.lastIndex = 0
  const semLinks = semInvisiveis(String(texto ?? '')).replace(URL_COM_ESQUEMA, '').replace(URL_COM_WWW, '$1').replace(DOMINIO_SOLTO, '$1')
  const citados: string[] = []
  const comNomes = semLinks.replace(/(?<!⟦)\[?\b([a-z]{3}_[0-9]{1,3})\b\]?(?!⟧)/g, (_, m: string) => {
    const item = Object.prototype.hasOwnProperty.call(p.itens, m) ? p.itens[m] : null
    if (!item) return ''
    if (!citados.includes(m)) citados.push(m)
    return umaLinha(item.rotulo, 140)
  })
  const corpo = respostaParaWhatsapp(comNomes.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1').split('\n').map((l) => l.trim()).join('\n'), 1500)
  const links = [
    ...citados.map((m) => p.itens[m]).filter((i) => i.link).slice(0, 3).map((i) => `• ${umaLinha(i.rotulo, 80)}: ${p.urlBase}${i.link}`),
    ...(p.ajuda ?? []).slice(0, 3).map((a) => `• ${umaLinha(limpo(a.titulo, 200), 80)}: ${p.urlBase}${a.href}`),
  ]
  return [corpo || TEXTOS_FIXOS.sem_tempo, links.length ? links.join('\n') : null].filter(Boolean).join('\n\n')
}

/**
 * Os marcadores que a resposta citou, na ordem em que aparecem, sem repetir e só os conhecidos ("⟦pes_1⟧" de
 * terceiro não conta). Dois ou mais viram a "última lista": "a 2" na mensagem seguinte é o segundo.
 */
export function marcadoresNaResposta(texto: string, conhecidos: Record<string, unknown>): string[] {
  const vistos: string[] = []
  for (const m of semInvisiveis(String(texto ?? '')).matchAll(/(?<!⟦)\[?\b([a-z]{3}_[0-9]{1,3})\b\]?(?!⟧)/g)) {
    if (Object.prototype.hasOwnProperty.call(conhecidos, m[1]) && !vistos.includes(m[1])) vistos.push(m[1])
  }
  return vistos.slice(0, 10)
}

/**
 * O modelo disse que fez sem ter preparado nada? Primeira pessoa no passado ("aprovei", "mandei" — e as mudanças de
 * plano: "tirei", "troquei", "acrescentei"), "pronto"/"feito" no começo, ou "sua mensagem foi enviada". "O chamado foi
 * aberto em 12/10" é leitura, não conta; "incluí" e "substituí" só com o acento ("o plano inclui dois passos" é leitura).
 */
export function afirmaQueFez(texto: string): boolean {
  const t = normalizar(String(texto ?? ''))
  if (/^(pronto|prontinho|feito|tudo certo|ok feito)\b/.test(t)) return true
  if (/\b(aprovei|votei|enviei|mandei|registrei|marquei|comentei|respondi|avisei|encaminhei|abri o chamado|abri um chamado|abri seu chamado)\b/.test(t)) return true
  if (/\b(tirei|retirei|removi|troquei|mudei|alterei|atualizei|corrigi|acrescentei|adicionei|ajustei)\b/.test(t)) return true
  if (/(?<!\p{L})(incluí|substituí)(?!\p{L})/u.test(String(texto ?? '').normalize('NFC').toLowerCase())) return true
  return /\b(sua mensagem|a mensagem|seu voto|o voto|os votos|seu comentario|o comentario|o recado|seu recado) (foi|foram|ja foi|ja foram) (enviad|registrad|computad|dad|feit)/.test(t)
}

// ------------------------------------------------------------------ o recuo da API (fallbacks)

type Bloco = { type: string; id?: string; tool_use_id?: string }

/** Os blocos depois do último `fallback` (sem recuo, todos): só eles valem nesta resposta. */
export function depoisDoUltimoRecuo<B extends Bloco>(content: B[]): B[] {
  const i = content.map((b) => b.type).lastIndexOf('fallback')
  return i < 0 ? content : content.slice(i + 1)
}

/**
 * O conteúdo do assistente para reenviar na volta seguinte. Sem recuo, tudo e sem mudança. Com recuo (regra da
 * API), antes do último `fallback` saem o raciocínio (thinking, redacted_thinking), os tool_use e os blocos
 * internos desconhecidos; ficam o texto, os pares de ferramenta do servidor e o próprio marcador.
 */
export function paraReenviar<B extends Bloco>(content: B[]): B[] {
  const i = content.map((b) => b.type).lastIndexOf('fallback')
  if (i < 0) return content
  const antes = content.slice(0, i)
  const resultados = new Set(antes.filter((b) => b.type.endsWith('_tool_result') && b.tool_use_id).map((b) => b.tool_use_id as string))
  const pares = new Set(antes.filter((b) => b.type === 'server_tool_use' && b.id && resultados.has(b.id)).map((b) => b.id as string))
  const ficam = antes.filter((b) => b.type === 'text' || b.type === 'fallback'
    || (b.type === 'server_tool_use' && Boolean(b.id) && pares.has(b.id as string))
    || (b.type.endsWith('_tool_result') && Boolean(b.tool_use_id) && pares.has(b.tool_use_id as string)))
  return [...ficam, ...content.slice(i)]
}

// ------------------------------------------------------------------ a rotina diária (rotina.ts lê o banco; aqui, a conta)

/** Os limiares dos alertas da rotina diária (últimas 24 h de um espaço). */
export const LIMIAR_DOS_ALERTAS = { minimoDeChamadas: 10, semCache: 0.5, recusas: 0.05, minimoParaRecusas: 20, p95Ms: 20_000 } as const

/** O P95 de uma lista de tempos (ms); 0 sem dados. */
export function percentil95(tempos: number[]): number {
  const t = tempos.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return t.length ? t[Math.min(t.length - 1, Math.ceil(t.length * 0.95) - 1)] : 0
}

export type LinhaDoUsoNaRotina = { user_id: string | null; chamadas: number; cache_lida: number; desfecho: string; ms: number | null; custo_usd: number | string; leituras_detalhe: number }

/** Os pontos de atenção de um espaço nas últimas 24 h (puro sobre as linhas; o texto de cada alerta é escrito aqui). */
export function pontosDeAtencao(linhas: LinhaDoUsoNaRotina[], tetos: { leituras_detalhe_dia: number; teto_usd_pessoa_dia: number }, suspensos: number): { titulo: string; mensagem: string }[] {
  const comModelo = linhas.filter((l) => l.chamadas > 0)
  const chamadas = comModelo.reduce((s, l) => s + l.chamadas, 0)
  const pontos: { titulo: string; mensagem: string }[] = []
  const semCache = comModelo.filter((l) => !l.cache_lida).length
  if (chamadas > LIMIAR_DOS_ALERTAS.minimoDeChamadas && comModelo.length && semCache / comModelo.length > LIMIAR_DOS_ALERTAS.semCache) {
    pontos.push({
      titulo: 'Assistente do WhatsApp: o cache quase não foi lido',
      mensagem: `Nas últimas 24 h, ${semCache} de ${comModelo.length} conversas não leram o cache do prompt (o custo sobe). Algo mudou no começo do prompt, ou o tráfego ficou espaçado demais para o tempo do cache.`,
    })
  }
  const recusas = comModelo.filter((l) => l.desfecho === 'recusa').length
  if (comModelo.length >= LIMIAR_DOS_ALERTAS.minimoParaRecusas && recusas / comModelo.length > LIMIAR_DOS_ALERTAS.recusas) {
    pontos.push({ titulo: 'Assistente do WhatsApp: muitas recusas', mensagem: `Nas últimas 24 h, ${recusas} de ${comModelo.length} conversas terminaram em recusa do modelo. Vale olhar o que está sendo pedido.` })
  }
  const p95 = percentil95(comModelo.map((l) => Number(l.ms)))
  if (comModelo.length >= LIMIAR_DOS_ALERTAS.minimoDeChamadas && p95 > LIMIAR_DOS_ALERTAS.p95Ms) {
    pontos.push({ titulo: 'Assistente do WhatsApp: respostas lentas', mensagem: `Nas últimas 24 h, 5% das conversas levaram mais de ${Math.round(p95 / 1000)} s para responder.` })
  }
  const porPessoa = new Map<string, { detalhe: number; usd: number }>()
  for (const l of linhas) {
    if (!l.user_id) continue
    const p = porPessoa.get(l.user_id) ?? { detalhe: 0, usd: 0 }
    p.detalhe += l.leituras_detalhe ?? 0
    p.usd += Number(l.custo_usd) || 0
    porPessoa.set(l.user_id, p)
  }
  const noTeto = [...porPessoa.values()].filter((p) => p.detalhe >= tetos.leituras_detalhe_dia || p.usd >= tetos.teto_usd_pessoa_dia).length
  if (noTeto) {
    pontos.push({
      titulo: 'Assistente do WhatsApp: pessoas no teto do dia',
      mensagem: `Nas últimas 24 h, ${noTeto === 1 ? '1 pessoa bateu' : `${noTeto} pessoas bateram`} o teto de consultas detalhadas ou de gasto do assistente. Os tetos ficam em Configurações → WhatsApp.`,
    })
  }
  if (suspensos) {
    pontos.push({
      titulo: 'Assistente do WhatsApp: números parados pela troca de nome',
      mensagem: `${suspensos === 1 ? '1 número está' : `${suspensos} números estão`} com o assistente parado porque o nome de perfil do WhatsApp mudou. Volta quando a pessoa confirmar o número de novo: em Meu perfil → WhatsApp, ela toca em “Trocar número” e confirma o mesmo número.`,
    })
  }
  return pontos
}

// ------------------------------------------------------------------ resultado de ação (re-exportado para os executores)

export type { ResultadoDaAcao }
