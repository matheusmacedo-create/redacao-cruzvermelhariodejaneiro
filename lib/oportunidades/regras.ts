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
} as const
export type Tipo = keyof typeof TIPOS
export const ehTipo = (s: unknown): s is Tipo => typeof s === 'string' && Object.hasOwn(TIPOS, s)

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
  vagas: number | null; inscricoes_ate: string | null; horas: number | null
}

export function lerOportunidade(f: FormData): { dados: DadosDaOportunidade | null; erros: string[] } {
  const erros: string[] = []
  const t = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
  const titulo = t('titulo', 160)
  const tipo = t('tipo', 20)
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
      vagas: vagas ? Number(vagas) : null, inscricoes_ate: inscricoes, horas: horas ? Math.round(Number(horas) * 4) / 4 : null,
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
    'BEGIN:VEVENT', `UID:${o.id}@redacao.cruzvermelhariodejaneiro.org`, `DTSTAMP:${d(new Date().toISOString())}`,
    `DTSTART:${d(o.inicio)}`, `DTEND:${d(o.fim)}`, `SUMMARY:${esc(o.titulo)}`,
    ...(o.local ? [`LOCATION:${esc(o.local)}`] : []),
    `DESCRIPTION:${esc([o.descricao ?? '', url].filter(Boolean).join('\n\n'))}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}
