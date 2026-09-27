/**
 * Portaria virtual — o livro de visitantes da filial (migração 20260929060000).
 *
 * A portaria registra quem chegou; o visitante também pode se cadastrar pelo
 * QR da entrada (`/visitante?t=<segredo>`), e esse cadastro fica "aguardando"
 * até a portaria confirmar. Sem documento: nome, telefone, de onde vem, quem
 * visita e o motivo. Foto na entrada e crachá de visitante, com a devolução
 * conferida na saída. Quem é visitado recebe aviso.
 *
 * Módulo puro (sem banco, sem `server-only`): conferido por
 * scripts/conferir-portaria.ts.
 */

export type Visita = {
  id: string
  nome: string
  telefone: string | null
  empresa: string | null
  motivo: string | null
  visitado_id: string | null
  visitado_texto: string | null
  cracha_numero: string | null
  cracha_devolvido_em: string | null
  foto_path: string | null
  origem: 'portaria' | 'autocadastro'
  entrada_em: string | null
  saida_em: string | null
  descartada_em: string | null
  created_at: string
  /** A resposta de quem é visitado (migração 20260929160000). */
  resposta: RespostaDaVisita | null
  resposta_recado: string | null
  resposta_em: string | null
  resposta_por: string | null
  resposta_canal: 'palacio' | 'whatsapp' | null
  avisar_visitante: boolean
  registrado_por: string | null
  confirmado_por: string | null
}

/** A lista é explícita: `ip_hash` não é liberado para a API (select('*') falharia). */
export const COLUNAS_DA_VISITA = 'id,nome,telefone,empresa,motivo,visitado_id,visitado_texto,cracha_numero,cracha_devolvido_em,foto_path,origem,entrada_em,saida_em,descartada_em,created_at,resposta,resposta_recado,resposta_em,resposta_por,resposta_canal,avisar_visitante,registrado_por,confirmado_por'

export type Situacao = 'aguardando' | 'dentro' | 'saiu' | 'descartada'

export function situacaoDaVisita(v: Pick<Visita, 'entrada_em' | 'saida_em' | 'descartada_em'>): Situacao {
  if (v.descartada_em) return 'descartada'
  if (!v.entrada_em) return 'aguardando'
  return v.saida_em ? 'saiu' : 'dentro'
}

/** Saiu (ou nunca voltou) sem devolver o crachá de visitante. */
export const crachaPendente = (v: Pick<Visita, 'cracha_numero' | 'cracha_devolvido_em' | 'saida_em'>) =>
  Boolean(v.cracha_numero && !v.cracha_devolvido_em && v.saida_em)

const FUSO = 'America/Sao_Paulo'
/** "2026-09-27" no horário de Brasília. */
export const diaEmSaoPaulo = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
/** "14:05". */
export const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
/** "27/09 14:05". */
export const diaEHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Ainda "dentro", mas entrou num dia anterior: provavelmente esqueceram de registrar a saída. */
export const entrouEmOutroDia = (v: Pick<Visita, 'entrada_em' | 'saida_em'>, hoje: string) =>
  Boolean(v.entrada_em && !v.saida_em && diaEmSaoPaulo(v.entrada_em) < hoje)

/** "há 5 min", "há 2 h 10 min", "há 3 dias". */
export function haQuanto(iso: string, agora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Quem é visitado, como sai na tela: a pessoa do Palácio e/ou o texto livre. */
export function quemVisita(v: Pick<Visita, 'visitado_texto'>, nomeDaPessoa: string | null | undefined): string {
  const partes = [nomeDaPessoa?.trim(), v.visitado_texto?.trim()].filter(Boolean) as string[]
  if (partes.length === 2 && partes[0].toLowerCase() === partes[1].toLowerCase()) return partes[0]
  return partes.join(' · ')
}

// ---------------------------------------------------------------- o formulário

export type DadosDoVisitante = {
  nome: string; telefone: string; empresa: string; motivo: string; visitado_texto: string
  /** O visitante autorizou receber a resposta pelo WhatsApp (só vale com telefone). */
  avisar_visitante: boolean
  /** Só a portaria escolhe a pessoa do Palácio (avisada); o autocadastro escreve texto livre. */
  visitado_id?: string; cracha_numero?: string
}

const LIMITES = { nome: 120, telefone: 30, empresa: 120, motivo: 300, visitado_texto: 120, cracha_numero: 20 } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const limpar = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Lê e confere o formulário (o banco confere de novo). `publico`: o
 * autocadastro não escolhe pessoa nem crachá — isso é da portaria.
 */
export function lerVisitante(f: { get(nome: string): unknown }, publico = false): { dados: DadosDoVisitante; erros: string[] } {
  const dados: DadosDoVisitante = {
    nome: limpar(f.get('nome'), LIMITES.nome),
    telefone: limpar(f.get('telefone'), LIMITES.telefone),
    empresa: limpar(f.get('empresa'), LIMITES.empresa),
    motivo: limpar(f.get('motivo'), LIMITES.motivo),
    visitado_texto: limpar(f.get('visitado_texto'), LIMITES.visitado_texto),
    avisar_visitante: false,
  }
  dados.avisar_visitante = Boolean(dados.telefone) && ['on', 'true', 'sim'].includes(limpar(f.get('avisar_visitante'), 5))
  const erros: string[] = []
  if (dados.nome.length < 2) erros.push(publico ? 'Escreva o seu nome.' : 'Escreva o nome do visitante.')
  if (dados.telefone && !/^[\d\s()+.-]{8,30}$/.test(dados.telefone)) erros.push('Telefone inválido: use só números, com DDD.')
  if (!publico) {
    const visitado = limpar(f.get('visitado_id'), 36)
    if (visitado && !UUID.test(visitado)) erros.push('Pessoa visitada inválida.')
    if (visitado) dados.visitado_id = visitado
    const cracha = limpar(f.get('cracha_numero'), LIMITES.cracha_numero)
    if (cracha) dados.cracha_numero = cracha
  }
  if (publico && !dados.visitado_texto && !dados.motivo) erros.push('Diga quem você vai visitar ou o motivo da visita.')
  return { dados, erros }
}

// ---------------------------------------------------------------- foto e QR

const CAMINHO = /^portaria\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/

/** Onde a foto do visitante mora no Blob privado. O banco confere o mesmo formato (portaria_definir_foto). */
export const caminhoDaFotoDoVisitante = (workspaceId: string, visitaId: string, id: string) => `portaria/${workspaceId}/${visitaId}/${id}.jpg`

export function fotoDaVisita(caminho: string | null | undefined, workspaceId: string, visitaId: string): boolean {
  const m = caminho ? CAMINHO.exec(caminho) : null
  return Boolean(m && m[1] === workspaceId && m[2] === visitaId)
}

/** O endereço da foto na tela da portaria; o `?v=` muda a cada troca. */
export const urlDaFotoDoVisitante = (visitaId: string, caminho: string | null | undefined) =>
  (caminho ? `/api/portaria/${visitaId}/foto?v=${CAMINHO.exec(caminho)?.[3] ?? '0'}` : null)

export const ehTokenDaEntrada = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t)
export const linkDaEntrada = (base: string, token: string) => `${base.replace(/\/$/, '')}/visitante?t=${token}`

// ---------------------------------------------------------------- crachás de visitante para imprimir

/**
 * Os dois formatos do crachá de visitante, os dois no tamanho de cartão
 * (CR80, 86 × 54 mm): deitado, o do porta-crachá horizontal com presilha,
 * o mais comum no Brasil; e em pé, na mesma posição do crachá funcional.
 * Numa folha A4 em pé cabem 10 deitados (2 × 5) ou 9 em pé (3 × 3).
 */
export const FORMATOS_DE_CRACHA = {
  deitado: { rotulo: 'Deitado (86 × 54 mm)', colunas: 2, linhas: 5, largura: 86, altura: 54 },
  empe: { rotulo: 'Em pé (54 × 86 mm)', colunas: 3, linhas: 3, largura: 54, altura: 86 },
} as const
export type FormatoDoCracha = keyof typeof FORMATOS_DE_CRACHA
export const formatoDoCracha = (bruto: unknown): FormatoDoCracha => (bruto === 'empe' ? 'empe' : 'deitado')
export const crachasPorFolha = (f: FormatoDoCracha) => FORMATOS_DE_CRACHA[f].colunas * FORMATOS_DE_CRACHA[f].linhas

/** O crachá em pé, o primeiro formato: 9 por folha. */
export const CRACHAS_POR_FOLHA = 9
export const MAXIMO_DE_CRACHAS = 99

/** O prefixo impresso ("V", "VIS", "PRES"): 1 a 5 letras ou números, maiúsculo. Inválido → "V". */
export function prefixoDoCracha(bruto: unknown): string {
  const p = String(bruto ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return /^[A-Z0-9]{1,5}$/.test(p) ? p : 'V'
}

/**
 * Os números da folha: de `de` até `ate` (no máximo 99 crachás), com zero à
 * esquerda na mesma largura ("V-01" … "V-18"). Fora do intervalo, corrige.
 */
export function numerosDeCracha(prefixo: unknown, de: unknown, ate: unknown, porFolha = CRACHAS_POR_FOLHA): string[] {
  const p = prefixoDoCracha(prefixo)
  const lerInteiro = (v: unknown, padrao: number) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : padrao }
  const inicio = Math.min(Math.max(lerInteiro(de, 1), 1), 999)
  const fim = Math.min(Math.max(lerInteiro(ate, inicio + porFolha - 1), inicio), inicio + MAXIMO_DE_CRACHAS - 1, 999)
  const largura = Math.max(2, String(fim).length)
  return Array.from({ length: fim - inicio + 1 }, (_, i) => `${p}-${String(inicio + i).padStart(largura, '0')}`)
}

/**
 * Em folhas do formato (9 em pé, 10 deitados). No verso, cada linha sai
 * espelhada: impresso frente e verso (virando pela borda longa), cada verso
 * cai atrás da sua frente.
 */
export function folhasDeCrachas<T>(itens: T[], formato: FormatoDoCracha = 'empe'): { frente: (T | null)[]; verso: (T | null)[] }[] {
  const { colunas, linhas } = FORMATOS_DE_CRACHA[formato]
  const porFolha = colunas * linhas
  const folhas: { frente: (T | null)[]; verso: (T | null)[] }[] = []
  for (let i = 0; i < itens.length; i += porFolha) {
    const frente: (T | null)[] = [...itens.slice(i, i + porFolha)]
    while (frente.length < porFolha) frente.push(null)
    const verso = Array.from({ length: linhas }, (_, l) => frente.slice(l * colunas, (l + 1) * colunas).reverse()).flat()
    folhas.push({ frente, verso })
  }
  return folhas
}

// ---------------------------------------------------------------- a resposta de quem é visitado

/**
 * Quem é visitado responde pelo Palácio ou pelo WhatsApp (migração
 * 20260929160000). Na filial, quem é liberado sobe ao hall e espera o setor
 * atender; quem espera fica na recepção até nova resposta.
 */
export type RespostaDaVisita = 'subir' | 'aguardar' | 'recusar'

export const RESPOSTAS: Record<RespostaDaVisita, { numero: 1 | 2 | 3; rotulo: string; curto: string; orientacao: string }> = {
  subir: { numero: 1, rotulo: 'Pode subir', curto: 'Pode subir', orientacao: 'O visitante pode subir ao hall e aguardar: o setor vai atender.' },
  aguardar: { numero: 2, rotulo: 'Aguarde na recepção', curto: 'Aguardar', orientacao: 'O visitante aguarda na recepção até nova resposta.' },
  recusar: { numero: 3, rotulo: 'Não pode receber agora', curto: 'Não pode agora', orientacao: 'Quem é visitado não pode receber agora: converse com o visitante.' },
}

export const ehResposta = (v: unknown): v is RespostaDaVisita => v === 'subir' || v === 'aguardar' || v === 'recusar'

/** O caminho do aviso: a resposta que cita a mensagem do WhatsApp volta para esta visita (lib/whatsapp/regras.ts, alvoDoLink). */
export const linkDaVisita = (id: string) => `/portaria/visita/${id}`

// A resposta no começo da mensagem; o que vem depois é o recado. Aceita acento ou não, maiúscula ou não.
const COMECOS: [RespostaDaVisita, RegExp][] = [
  ['subir', /^\s*(?:1|sim|pode\s+(?:subir|entrar|vir|passar)|sub[ae]|subir|entr[ae]|entrar|liberad[oa]|liber[ae]|liberar|ok)(?![\p{L}\d])/iu],
  ['aguardar', /^\s*(?:2|aguard[ae]\w*|esper[ae]\w*|(?:um|1)\s+(?:momento|minuto|instante))(?![\p{L}\d])/iu],
  ['recusar', /^\s*(?:3|n[aã]o\s+posso(?:\s+receber)?(?:\s+agora)?|n[aã]o|recus[ae]\w*|agora\s+n[aã]o|hoje\s+n[aã]o)(?![\p{L}\d])/iu],
]

/**
 * "1", "pode subir", "2 estou em reunião, 10 min", "não posso: estou fora".
 * Null quando não começa por uma das três respostas.
 */
export function lerRespostaDaVisita(texto: string): { resposta: RespostaDaVisita; recado: string | null } | null {
  const bruto = String(texto ?? '').slice(0, 600)
  for (const [resposta, re] of COMECOS) {
    const m = re.exec(bruto)
    if (!m) continue
    const recado = bruto.slice(m[0].length).replace(/^[\s:,.;!\-–—]+/, '').replace(/\s+/g, ' ').trim().slice(0, 280)
    return { resposta, recado: recado || null }
  }
  return null
}

/**
 * Sem citar a mensagem do aviso, só vale a resposta que não deixa dúvida
 * ("1", "2", "3", "pode subir", "aguarde", "não posso"): um "sim" ou "ok"
 * solto pode ser sobre outra conversa.
 */
export function respostaClaraDaVisita(texto: string): ReturnType<typeof lerRespostaDaVisita> {
  const lida = lerRespostaDaVisita(texto)
  return lida && /^\s*(?:[123](?![\p{L}\d])|pode\s|aguard|esper|n[aã]o\s+posso)/iu.test(texto) ? lida : null
}

/** A pergunta que vai no aviso de quem é visitado (no WhatsApp, abaixo do aviso). */
export const PERGUNTA_DA_VISITA = 'Responda esta mensagem com *1* (pode subir), *2* (aguarde na recepção) ou *3* (não posso receber agora). Pode escrever um recado depois do número.'

const nomeCurto = (nome: string | null | undefined) => String(nome ?? '').trim().split(/\s+/)[0] || ''
const semFormatacao = (t: string, max: number) => t.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** O aviso para a portaria (quem registrou a entrada): o que fazer com o visitante. */
export function avisoParaPortaria(p: { visitante: string; quemRespondeu: string; resposta: RespostaDaVisita; recado: string | null; visitanteAvisado: boolean }) {
  const r = RESPOSTAS[p.resposta]
  return {
    titulo: `${r.rotulo}: ${semFormatacao(p.visitante, 80)}`,
    mensagem: [
      `${semFormatacao(p.quemRespondeu, 80)} respondeu. ${r.orientacao}`,
      p.recado ? `Recado: ${semFormatacao(p.recado, 280).replace(/[^.!?…]$/, '$&.')}` : null,
      p.visitanteAvisado ? 'O visitante também recebeu a resposta pelo WhatsApp.' : null,
    ].filter(Boolean).join(' '),
  }
}

/**
 * A mensagem para o visitante, no WhatsApp que ele autorizou na entrada. Só a
 * situação: o recado é para a portaria (quem escreveu não conta que o visitante
 * vai ler, e a observação de quem registrou pelo telefone é interna).
 */
export function mensagemParaVisitante(p: { visitante: string; quem: string; setor: string | null; resposta: RespostaDaVisita }): string {
  const ola = nomeCurto(p.visitante) ? `Olá, ${semFormatacao(nomeCurto(p.visitante), 40)}!` : 'Olá!'
  const quem = `${semFormatacao(p.quem, 80)}${p.setor ? ` (${semFormatacao(p.setor, 60)})` : ''}`
  const corpo = {
    subir: `*Pode subir.* ${quem} já pode receber você. Suba até o hall e aguarde: você será chamado para o atendimento.`,
    aguardar: `*Aguarde na recepção, por favor.* ${quem} pediu um momento. Avisaremos por aqui quando puder subir.`,
    recusar: `${quem} não poderá receber você agora. Por favor, fale com a portaria.`,
  }[p.resposta]
  return [
    `${ola} ${corpo}`,
    '_Cruz Vermelha Brasileira – RJ · Portaria. Mensagem automática sobre a sua visita de hoje._',
  ].join('\n\n')
}

/** A situação da resposta na tela da portaria: o que mostrar ao lado do visitante. */
export function situacaoDaResposta(v: Pick<Visita, 'visitado_id' | 'resposta'>): 'sem_pessoa' | 'esperando' | RespostaDaVisita {
  if (!v.visitado_id) return 'sem_pessoa'
  return v.resposta ?? 'esperando'
}
