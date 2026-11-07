import dados from './videos.json'
import { codigoDoTexto, textoDaTarefa } from './ouvir'
import type { Tarefa } from './tipos'

/**
 * Os vídeos da ajuda (docs/AJUDA.md §14): um vídeo curto por tarefa, gravado por script no espaço de Demonstração,
 * com a voz da filial e legenda. O catálogo (lib/ajuda/videos.json) é escrito por scripts/videos/gravar.ts; a tarefa
 * aponta para o vídeo pelo campo `video`. Puro: serve ao painel "?", à Central e à conferência (scripts/conferir-videos.ts).
 *
 * O MP4 e a capa ficam no site da filial (como os áudios da página da coordenação do voluntariado): são públicos, mas
 * só mostram dados fictícios. A legenda fica aqui, em public/tutoriais, na mesma origem do Palácio (o navegador não
 * carrega legenda de outra origem sem CORS).
 */

export const ENDERECO_DOS_VIDEOS = 'https://cruzvermelhariodejaneiro.org/assets/tutoriais/palacio/'

export type VideoGravado = {
  titulo: string
  /** A área (href do guia) e a tarefa que o vídeo mostra. */
  area: string
  tarefa: string
  /** Em segundos. */
  duracao: number
  /** AAAA-MM-DD. */
  gravadoEm: string
  /** O código do texto da tarefa quando o vídeo foi gravado (codigoDoTexto(textoDaTarefa(tarefa))). */
  impressao: string
  /** Nomes dos arquivos: o MP4 e a capa têm a versão no nome; a legenda, não (ela vem com ?v=). */
  video: string
  capa: string
  legenda: string
}

export type VideoDaAjuda = VideoGravado & {
  id: string
  enderecoDoVideo: string
  enderecoDaCapa: string
  enderecoDaLegenda: string
}

const CATALOGO = dados as Record<string, VideoGravado>

export function videoDaAjuda(id: string | null | undefined): VideoDaAjuda | null {
  const v = id ? CATALOGO[id] : undefined
  if (!id || !v) return null
  const versao = v.video.replace(/\.mp4$/, '').split('-').pop()
  return {
    ...v,
    id,
    enderecoDoVideo: ENDERECO_DOS_VIDEOS + v.video,
    enderecoDaCapa: ENDERECO_DOS_VIDEOS + v.capa,
    enderecoDaLegenda: `/tutoriais/${v.legenda}?v=${versao}`,
  }
}

export function todosOsVideos(): VideoDaAjuda[] {
  return Object.keys(CATALOGO).map((id) => videoDaAjuda(id)!).filter(Boolean)
}

/** "45 s", "1 min", "1 min 20 s": o tempo do vídeo no botão. */
export function duracaoLegivel(segundos: number): string {
  const s = Math.round(segundos)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const resto = s % 60
  return resto < 5 ? `${min} min` : `${min} min ${resto} s`
}

/** A impressão do texto de uma tarefa: muda quando o passo a passo muda, e o vídeo pode ter ficado velho. */
export function impressaoDaTarefa(tarefa: Tarefa): Promise<string> {
  return codigoDoTexto(textoDaTarefa(tarefa))
}
