/**
 * Regras dos cursos da Área do Voluntário. Puro: a tela da equipe, a do
 * voluntário e os testes usam as mesmas funções; o banco confere de novo.
 */

/**
 * O id do vídeo a partir do que a equipe colar: link do YouTube (watch,
 * youtu.be, shorts, embed, live) ou o próprio id de 11 caracteres.
 */
export function idDoYoutube(entrada: string): string | null {
  const s = entrada.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  let url: URL
  try { url = new URL(s.startsWith('http') ? s : `https://${s}`) } catch { return null }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      id = m?.[1] ?? null
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

export const urlDoVideo = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`
export const miniaturaDoVideo = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

export type AulaResumo = { id: string; modulo_id: string; ordem: number; duracao_min: number | null }
export type ModuloResumo = { id: string; ordem: number }

/** Aulas na ordem do curso: módulo por módulo, cada um na sua ordem. */
export function aulasEmOrdem<A extends AulaResumo>(modulos: ModuloResumo[], aulas: A[]): A[] {
  const posicao = new Map([...modulos].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)).map((m, i) => [m.id, i]))
  return [...aulas].filter((a) => posicao.has(a.modulo_id))
    .sort((a, b) => (posicao.get(a.modulo_id)! - posicao.get(b.modulo_id)!) || a.ordem - b.ordem || a.id.localeCompare(b.id))
}

export type Progresso = { feitas: number; total: number; pct: number; proxima: string | null; concluido: boolean }

/** Quanto do curso a pessoa fez e qual é a próxima aula a ver. */
export function progresso(emOrdem: { id: string }[], concluidas: Set<string>): Progresso {
  const total = emOrdem.length
  const feitas = emOrdem.filter((a) => concluidas.has(a.id)).length
  const proxima = emOrdem.find((a) => !concluidas.has(a.id))?.id ?? null
  return { feitas, total, pct: total ? Math.round((100 * feitas) / total) : 0, proxima, concluido: total > 0 && feitas === total }
}

/** Anterior e seguinte de uma aula, para a navegação do player. */
export function vizinhas(emOrdem: { id: string }[], aulaId: string): { anterior: string | null; seguinte: string | null } {
  const i = emOrdem.findIndex((a) => a.id === aulaId)
  if (i < 0) return { anterior: null, seguinte: null }
  return { anterior: emOrdem[i - 1]?.id ?? null, seguinte: emOrdem[i + 1]?.id ?? null }
}

export const duracaoLegivel = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`)

export const CODIGO_DE_CERTIFICADO = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
export const normalizarCodigo = (s: string) => {
  const limpo = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : s.toUpperCase().trim()
}

const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
const inteiro = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN)

export type DadosDoCurso = { titulo: string; resumo: string | null; descricao: string | null; carga_horaria: number | null; nota_minima: number | null; validade_meses: number | null }

export function lerCurso(f: FormData): { dados: DadosDoCurso | null; erros: string[] } {
  const erros: string[] = []
  const titulo = texto(f, 'titulo', 160)
  const carga = texto(f, 'carga_horaria', 6).replace(',', '.')
  const nota = texto(f, 'nota_minima', 3)
  const validade = texto(f, 'validade_meses', 3)
  if (titulo.length < 3) erros.push('Dê um título ao curso.')
  if (carga && !(Number(carga) > 0 && Number(carga) <= 999)) erros.push('Carga horária inválida.')
  if (nota && !(inteiro(nota) >= 1 && inteiro(nota) <= 100)) erros.push('A nota mínima vai de 1 a 100.')
  if (validade && !(inteiro(validade) >= 1 && inteiro(validade) <= 120)) erros.push('A validade vai de 1 a 120 meses.')
  if (erros.length) return { dados: null, erros }
  return {
    dados: {
      titulo, resumo: texto(f, 'resumo', 300) || null, descricao: texto(f, 'descricao', 6000) || null,
      carga_horaria: carga ? Math.round(Number(carga) * 10) / 10 : null, nota_minima: nota ? inteiro(nota) : null, validade_meses: validade ? inteiro(validade) : null,
    },
    erros,
  }
}

export type DadosDaAula = { titulo: string; youtube_id: string | null; texto: string | null; material_id: string | null; duracao_min: number | null }

export function lerAula(f: FormData): { dados: DadosDaAula | null; erros: string[] } {
  const erros: string[] = []
  const titulo = texto(f, 'titulo', 160)
  const video = texto(f, 'video', 300)
  const youtube = video ? idDoYoutube(video) : null
  const corpo = texto(f, 'texto', 20000)
  const material = texto(f, 'material_id', 36)
  const duracao = texto(f, 'duracao_min', 3)
  if (titulo.length < 2) erros.push('Dê um título à aula.')
  if (video && !youtube) erros.push('Link do YouTube não reconhecido. Cole o endereço do vídeo (youtube.com/watch?v=… ou youtu.be/…).')
  if (!video && !corpo && !material) erros.push('A aula precisa de vídeo, texto ou apostila.')
  if (material && !/^[0-9a-f-]{36}$/.test(material)) erros.push('Apostila inválida.')
  if (duracao && !(inteiro(duracao) >= 1 && inteiro(duracao) <= 600)) erros.push('Duração de 1 a 600 minutos.')
  if (erros.length) return { dados: null, erros }
  return { dados: { titulo, youtube_id: youtube, texto: corpo || null, material_id: material || null, duracao_min: duracao ? inteiro(duracao) : null }, erros }
}

export type DadosDaQuestao = { enunciado: string; alternativas: string[]; correta: number }

/** Alternativas: uma por campo alt_0..alt_5; `correta` é o índice entre as preenchidas. */
export function lerQuestao(f: FormData): { dados: DadosDaQuestao | null; erros: string[] } {
  const erros: string[] = []
  const enunciado = texto(f, 'enunciado', 1000)
  const brutas = Array.from({ length: 6 }, (_, i) => texto(f, `alt_${i}`, 300))
  const marcada = inteiro(texto(f, 'correta', 1))
  const preenchidas = brutas.map((t, i) => ({ t, i })).filter((x) => x.t)
  if (enunciado.length < 3) erros.push('Escreva a pergunta.')
  if (preenchidas.length < 2) erros.push('Preencha pelo menos duas alternativas.')
  const correta = preenchidas.findIndex((x) => x.i === marcada)
  if (correta < 0) erros.push('Marque a alternativa certa (entre as preenchidas).')
  if (erros.length) return { dados: null, erros }
  return { dados: { enunciado, alternativas: preenchidas.map((x) => x.t), correta }, erros }
}

/** "Nota 75 · 3 de 4" para o resultado da prova. */
export const resultadoLegivel = (r: { nota: number; acertos: number; total: number }) => `Nota ${r.nota} · ${r.acertos} de ${r.total}`
