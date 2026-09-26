/**
 * Regras das oportunidades (ações, plantões, eventos). Puro. Horário sempre
 * de São Paulo (UTC-3, sem horário de verão desde 2019).
 */

export const TIPOS = {
  acao: { rotulo: 'Ação' },
  plantao: { rotulo: 'Plantão' },
  evento: { rotulo: 'Evento' },
  formacao: { rotulo: 'Formação presencial' },
  outro: { rotulo: 'Outro' },
  // Os que pedem resposta: sem inscrição, vagas nem horas; `inicio` é quando
  // abre e `fim` é o prazo para responder (migração 20260929020000).
  aviso: { rotulo: 'Aviso para confirmar' },
  enquete: { rotulo: 'Enquete / formulário' },
  quiz: { rotulo: 'Quiz' },
} as const
export type Tipo = keyof typeof TIPOS
export const ehTipo = (s: unknown): s is Tipo => typeof s === 'string' && Object.hasOwn(TIPOS, s)

/** Aviso, enquete e quiz: o voluntário responde, não se inscreve. */
export const TIPOS_DE_RESPOSTA = ['aviso', 'enquete', 'quiz'] as const
export const ehDeResposta = (tipo: string | null | undefined) => (TIPOS_DE_RESPOSTA as readonly string[]).includes(tipo ?? '')

/** O que cada tipo de resposta pede ao voluntário, para a tela da equipe. */
export const EXPLICACAO_DO_TIPO: Partial<Record<Tipo, string>> = {
  aviso: 'O voluntário lê e toca em “Estou ciente”. Pode ter perguntas, se quiser.',
  enquete: 'O voluntário responde às perguntas e pode mudar a resposta até o prazo.',
  quiz: 'Perguntas com resposta certa e nota mínima; até 3 tentativas.',
}

export const SITUACOES_DA_INSCRICAO = {
  inscrito: 'Inscrito',
  espera: 'Lista de espera',
  cancelado: 'Cancelou',
  presente: 'Presente',
  ausente: 'Ausente',
} as const

const FUSO = '-03:00'

/** "2026-09-27T08:00" (campo datetime-local, hora de SP) → ISO com fuso. */
export function deLocal(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null
  const d = new Date(`${valor}:00${FUSO}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ISO → "2026-09-27T08:00" para preencher o campo, em hora de SP. */
export function paraLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return d.toISOString().slice(0, 16)
}

export type EstadoDaOportunidade = 'aberta' | 'lotada' | 'encerrada' | 'andamento' | 'passada' | 'cancelada'

export function estado(o: { inicio: string; fim: string; inscricoes_ate: string | null; cancelada_em: string | null; vagas: number | null }, ocupadas: number, agora: Date): EstadoDaOportunidade {
  const t = agora.getTime()
  if (o.cancelada_em) return 'cancelada'
  if (t >= Date.parse(o.fim)) return 'passada'
  if (t >= Date.parse(o.inicio)) return 'andamento'
  if (t >= Date.parse(o.inscricoes_ate ?? o.inicio)) return 'encerrada'
  if (o.vagas !== null && ocupadas >= o.vagas) return 'lotada'
  return 'aberta'
}

export type EstadoDoPedido = 'agendado' | 'aberto' | 'encerrado' | 'cancelado'

/** Aviso, enquete e quiz: antes de abrir, aberto até o prazo, encerrado. */
export function estadoDoPedido(o: { inicio: string; fim: string; cancelada_em: string | null }, agora: Date): EstadoDoPedido {
  const t = agora.getTime()
  if (o.cancelada_em) return 'cancelado'
  if (t < Date.parse(o.inicio)) return 'agendado'
  if (t > Date.parse(o.fim)) return 'encerrado'
  return 'aberto'
}

export const vagasRestantes = (vagas: number | null, ocupadas: number) => (vagas === null ? null : Math.max(0, vagas - ocupadas))

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(new Date(iso))
const hora = (iso: string) => {
  const [h, m] = fmt(iso, { hour: '2-digit', minute: '2-digit', hour12: false }).split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}

/** "sáb., 27 de set. · 8h às 14h" ou, em dias diferentes, "27/09 8h → 28/09 14h". */
export function quando(inicio: string, fim: string): string {
  const mesmoDia = fmt(inicio, { dateStyle: 'short' }) === fmt(fim, { dateStyle: 'short' })
  if (mesmoDia) return `${fmt(inicio, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hora(inicio)} às ${hora(fim)}`
  return `${fmt(inicio, { day: '2-digit', month: '2-digit' })} ${hora(inicio)} → ${fmt(fim, { day: '2-digit', month: '2-digit' })} ${hora(fim)}`
}

/** Dia e mês para o selo do cartão: { dia: '27', mes: 'SET' }. */
export const selo = (iso: string) => ({ dia: fmt(iso, { day: '2-digit' }), mes: fmt(iso, { month: 'short' }).replace('.', '').toUpperCase() })

/** Horas que viram presença: as informadas ou a duração, em quartos de hora. */
export const horasDaAtividade = (o: { inicio: string; fim: string; horas: number | null }) =>
  o.horas ?? Math.round(((Date.parse(o.fim) - Date.parse(o.inicio)) / 3600_000) * 4) / 4

export type DadosDaOportunidade = {
  titulo: string; tipo: Tipo; descricao: string | null; local: string | null; inicio: string; fim: string
  vagas: number | null; inscricoes_ate: string | null; horas: number | null; nota_minima: number | null
}

/**
 * Lê o formulário da equipe. Nos tipos de resposta (aviso, enquete, quiz):
 * "Abre em" vazio é agora; "Prazo" é obrigatório; vagas, prazo de inscrição
 * e horas não valem; o quiz tem nota mínima (padrão 70).
 */
export function lerOportunidade(f: FormData, agora = new Date()): { dados: DadosDaOportunidade | null; erros: string[] } {
  const erros: string[] = []
  const t = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
  const titulo = t('titulo', 160)
  const tipo = t('tipo', 20)
  if (ehDeResposta(tipo)) return lerPedido(f, titulo, tipo as Tipo, agora)
  const inicio = deLocal(t('inicio', 16))
  const fim = deLocal(t('fim', 16))
  const ate = t('inscricoes_ate', 16)
  const inscricoes = ate ? deLocal(ate) : null
  const vagas = t('vagas', 5)
  const horas = t('horas', 5).replace(',', '.')
  if (titulo.length < 3) erros.push('Dê um título.')
  if (!ehTipo(tipo)) erros.push('Escolha o tipo.')
  if (!inicio || !fim) erros.push('Informe início e fim.')
  else if (fim <= inicio) erros.push('O fim precisa ser depois do início.')
  if (ate && !inscricoes) erros.push('Prazo de inscrição inválido.')
  if (inscricoes && inicio && inscricoes > inicio) erros.push('O prazo de inscrição termina antes do início.')
  if (vagas && !(/^\d+$/.test(vagas) && Number(vagas) >= 1 && Number(vagas) <= 10000)) erros.push('Vagas: de 1 a 10.000 (em branco = sem limite).')
  if (horas && !(Number(horas) > 0 && Number(horas) <= 24)) erros.push('Horas: de 0,25 a 24.')
  if (erros.length) return { dados: null, erros }
  return {
    dados: {
      titulo, tipo: tipo as Tipo, descricao: t('descricao', 6000) || null, local: t('local', 300) || null, inicio: inicio!, fim: fim!,
      vagas: vagas ? Number(vagas) : null, inscricoes_ate: inscricoes, horas: horas ? Math.round(Number(horas) * 4) / 4 : null, nota_minima: null,
    },
    erros,
  }
}

function lerPedido(f: FormData, titulo: string, tipo: Tipo, agora: Date): { dados: DadosDaOportunidade | null; erros: string[] } {
  const erros: string[] = []
  const t = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
  const abre = t('inicio', 16)
  const inicio = abre ? deLocal(abre) : new Date(Math.floor(agora.getTime() / 60_000) * 60_000).toISOString()
  const fim = deLocal(t('fim', 16))
  const nota = t('nota_minima', 3)
  if (titulo.length < 3) erros.push('Dê um título.')
  if (abre && !inicio) erros.push('Data de abertura inválida.')
  if (!fim) erros.push('Informe o prazo para responder.')
  else if (inicio && fim <= inicio) erros.push('O prazo precisa ser depois da abertura.')
  if (tipo === 'quiz' && nota && !(/^\d+$/.test(nota) && Number(nota) >= 1 && Number(nota) <= 100)) erros.push('Nota mínima: de 1 a 100.')
  if (erros.length) return { dados: null, erros }
  return {
    dados: {
      titulo, tipo, descricao: t('descricao', 6000) || null, local: t('local', 300) || null, inicio: inicio!, fim: fim!,
      vagas: null, inscricoes_ate: null, horas: null, nota_minima: tipo === 'quiz' ? (nota ? Number(nota) : 70) : null,
    },
    erros,
  }
}

/** Arquivo .ics (calendário) de uma oportunidade, para "adicionar à agenda". */
export function ics(o: { id: string; titulo: string; descricao: string | null; local: string | null; inicio: string; fim: string }, url: string): string {
  const d = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cruz Vermelha RJ//Area do Voluntario//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    // O UID fica com o domínio antigo de propósito: é a identidade do evento na agenda de quem
    // já baixou; mudar faria o calendário duplicar a atividade (lib/dominio.ts).
    'BEGIN:VEVENT', `UID:${o.id}@redacao.cruzvermelhariodejaneiro.org`, `DTSTAMP:${d(new Date().toISOString())}`,
    `DTSTART:${d(o.inicio)}`, `DTEND:${d(o.fim)}`, `SUMMARY:${esc(o.titulo)}`,
    ...(o.local ? [`LOCATION:${esc(o.local)}`] : []),
    `DESCRIPTION:${esc([o.descricao ?? '', url].filter(Boolean).join('\n\n'))}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}
