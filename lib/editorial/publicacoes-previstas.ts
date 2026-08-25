import { canaisDePublicacao } from '@/lib/data'

// Publicações que a pessoa marcou no formulário de registro: cada uma vira uma
// data no calendário editorial e uma peça de conteúdo em rascunho.
//
// A leitura mora aqui, fora do arquivo de server actions, porque é lógica pura
// — dá para conferir sem subir banco nem servidor.

const CANAIS = new Set<string>(canaisDePublicacao)

export const LIMITE_DE_PUBLICACOES = 12

// Rótulos dos campos que o formulário guarda em `details`. O corpo da peça de
// conteúdo é montado com eles para que o Marketing leia o contexto inteiro sem
// precisar abrir a pauta e traduzir nomes de campo.
const ROTULO_DO_DETALHE: Record<string, string> = {
  local: 'Local',
  schedule: 'Horário',
  participantsCount: 'Pessoas participantes',
  volunteersCount: 'Voluntários',
  audience: 'Público atendido',
  organizer: 'Organização ou parceiros',
  story: 'História',
  contact: 'Pessoa para entrevista',
  ideaGoal: 'Objetivo da ideia',
  materialType: 'Tipo de material',
  request: 'O que precisa ser feito',
  notes: 'Detalhes',
  objective: 'Objetivo',
  result: 'Resultado',
}

export type PublicacaoPrevista = { data: string; hora: string | null; canal: string; assunto: string }

export function publicacoesPrevistas(formData: FormData, tituloDaPauta: string): PublicacaoPrevista[] {
  const campo = (key: string) => formData.getAll(key).map((valor) => String(valor).trim())
  const datas = campo('pubData')
  if (!datas.length) return []
  if (datas.length > LIMITE_DE_PUBLICACOES) {
    throw new Error(`São no máximo ${LIMITE_DE_PUBLICACOES} publicações por registro. Divida em mais de uma pauta.`)
  }

  const horas = campo('pubHora')
  const canais = campo('pubCanal')
  const assuntos = campo('pubAssunto')

  return datas.map((data, i) => {
    if (!ehData(data)) throw new Error('Informe a data de cada publicação prevista.')
    const hora = horas[i] ?? ''
    if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error('Horário da publicação inválido.')
    const canal = canais[i] ?? ''
    return {
      data,
      hora: hora || null,
      // Canal desconhecido não derruba o registro: cai em "Outro" e a
      // Comunicação corrige na peça. O que não pode é perder a data.
      canal: CANAIS.has(canal) ? canal : 'Outro',
      assunto: (assuntos[i] || tituloDaPauta).slice(0, 200),
    }
  })
}

// O navegador manda YYYY-MM-DD, mas o formato sozinho não basta: 2026-02-31
// passa no molde e o Postgres recusa depois, já com a pauta gravada.
function ehData(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const data = new Date(`${valor}T12:00:00Z`)
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
}

export function contextoParaComunicacao(descricao: string, details: Record<string, string>): string {
  const linhas = descricao ? [descricao.trim()] : []
  for (const [chave, rotulo] of Object.entries(ROTULO_DO_DETALHE)) {
    const valor = details[chave]
    if (valor) linhas.push(`${rotulo}: ${valor}`)
  }
  return linhas.join('\n\n')
}
