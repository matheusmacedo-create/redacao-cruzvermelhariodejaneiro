import { montarPaginaDoSite, escapar } from '@/lib/site/esqueleto'
import { NOME_DO_CANAL, resumoDoPost, type ItemDaLinha } from '@/lib/site/linha-do-tempo'

/**
 * A central de notícias — /noticias/ com cara de primeira página de jornal.
 *
 * Até aqui o endereço servia o que o acaso deixou lá: a última matéria de
 * teste publicada virava o "índice" do noticiário, visível ao público e ao
 * Google. Agora o índice é gerado da lista real de matérias publicadas e
 * REGERADO a cada publicação — empilha sozinho, como o usuário pediu.
 *
 * A mais recente abre como manchete; as demais empilham em ordem. Sem
 * miniaturas por enquanto: a capa de cada matéria mora na pasta dela e o
 * índice não tem como saber o nome do arquivo — melhor um jornal de texto
 * bem posto do que um de imagens quebradas.
 */

export type NoticiaDoIndice = {
  titulo: string
  /** Linha fina ou resumo — pode faltar. */
  descricao?: string | null
  /** Endereço completo da matéria publicada. */
  url: string
  publicadaEm: Date
}

const CSS_INDICE = `
.jornal{max-width:var(--coluna-larga);margin:0 auto;padding:40px 20px 72px}
.jornal-topo{border-bottom:3px solid var(--ink);padding-bottom:14px;margin-bottom:8px}
.jornal-topo h1{font-size:clamp(30px,4.5vw,44px);letter-spacing:-.5px;line-height:1.1;margin:0}
.jornal-topo p{color:var(--muted);margin:6px 0 0;font-size:14.5px}
.manchete{display:block;text-decoration:none;color:inherit;padding:28px 0;border-bottom:1px solid var(--line)}
.manchete .kicker{color:var(--red);font-weight:800;font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase}
.manchete h2{font-size:clamp(24px,3.4vw,34px);line-height:1.18;letter-spacing:-.4px;margin:8px 0 10px;color:var(--ink)}
.manchete p{font-size:17px;line-height:1.6;color:var(--text);margin:0 0 10px}
.manchete time{color:var(--muted);font-size:13.5px}
.manchete:hover h2{color:var(--red)}
.fila{list-style:none;margin:0;padding:0}
.fila li{border-bottom:1px solid var(--line)}
.fila a{display:block;text-decoration:none;color:inherit;padding:20px 0}
.fila h3{font-size:20px;line-height:1.3;letter-spacing:-.2px;margin:0 0 6px;color:var(--ink)}
.fila p{font-size:15.5px;line-height:1.6;color:var(--muted);margin:0 0 6px}
.fila time{color:var(--muted);font-size:13px}
.fila a:hover h3{color:var(--red)}

.jornal-vazio{padding:48px 0;color:var(--muted);font-size:16px}
.tempo{margin-top:48px}
.tempo-topo{border-bottom:3px solid var(--ink);padding-bottom:10px;margin-bottom:4px}
.tempo-topo h2{font-size:clamp(22px,3vw,30px);letter-spacing:-.4px;margin:0}
.tempo-topo p{color:var(--muted);margin:4px 0 0;font-size:14px}
.tempo ol{list-style:none;margin:0;padding:0}
.tempo li{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
.tempo time{flex:0 0 92px;color:var(--muted);font-size:13px;padding-top:3px}
.tempo .canal{display:inline-block;flex:0 0 auto;align-self:flex-start;border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#fff;background:var(--ink)}

/* Com o ".tempo" na frente para vencer a regra base — sem ele, a cor de cada
   canal perde na especificidade e toda etiqueta sai preta. */
.tempo .canal-instagram{background:#c13584}.tempo .canal-facebook{background:#1877f2}.tempo .canal-linkedin{background:#0a66c2}
.tempo .canal-x{background:#111}.tempo .canal-youtube{background:#cc0000}.tempo .canal-tiktok{background:#161823}
.tempo .canal-threads{background:#333}.tempo .canal-bluesky{background:#1185fe}.tempo .canal-newsletter{background:var(--red)}
.tempo .fala{min-width:0;flex:1}
.tempo .fala p{margin:0;font-size:15.5px;line-height:1.6;color:var(--text)}
.tempo .fala a{color:var(--blue);font-weight:600;font-size:13.5px;text-decoration:none}
.tempo .fala a:hover{color:var(--red)}
@media(max-width:640px){.tempo li{flex-wrap:wrap}.tempo time{flex-basis:100%}}
`

const dataLegivel = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)

export function paginaDeNoticias(
  noticias: NoticiaDoIndice[],
  agora: Date = new Date(),
  /** A vida nos outros canais — post de rede, edição de newsletter. */
  linhaDoTempo: ItemDaLinha[] = [],
): string {
  const ordenadas = [...noticias].sort((a, b) => b.publicadaEm.getTime() - a.publicadaEm.getTime())
  const [manchete, ...fila] = ordenadas

  const miolo = !manchete
    ? '<p class="jornal-vazio">As primeiras notícias estão a caminho.</p>'
    : `<a class="manchete" href="${escapar(manchete.url)}">
        <span class="kicker">Última notícia</span>
        <h2>${escapar(manchete.titulo)}</h2>
        ${manchete.descricao?.trim() ? `<p>${escapar(manchete.descricao.trim())}</p>` : ''}
        <time datetime="${manchete.publicadaEm.toISOString()}">${dataLegivel(manchete.publicadaEm)}</time>
      </a>
      ${fila.length ? `<ul class="fila">
        ${fila.map((n) => `<li><a href="${escapar(n.url)}">
          <h3>${escapar(n.titulo)}</h3>
          ${n.descricao?.trim() ? `<p>${escapar(n.descricao.trim())}</p>` : ''}
          <time datetime="${n.publicadaEm.toISOString()}">${dataLegivel(n.publicadaEm)}</time>
        </a></li>`).join('\n        ')}
      </ul>` : ''}`

  const dataCurta = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .format(d).replace(/\. de /g, ' ').replace('.', '')

  // A linha do tempo: o que saiu em CADA canal, do mais novo ao mais velho.
  // O nome do canal sai por extenso e o texto sem marcação — este é um jornal,
  // não um log de sistema.
  const tempo = linhaDoTempo.length
    ? `<section class="tempo">
        <div class="tempo-topo">
          <h2>Linha do tempo</h2>
          <p>O que publicamos em cada canal — Instagram, Facebook, LinkedIn e além.</p>
        </div>
        <ol>
          ${linhaDoTempo.map((i) => {
            const nome = NOME_DO_CANAL[i.canal] ?? i.canal
            const resumo = resumoDoPost(i.texto)
            return `<li>
            <time datetime="${i.quando.toISOString()}">${escapar(dataCurta(i.quando))}</time>
            <span class="canal canal-${escapar(i.canal)}">${escapar(nome)}</span>
            <div class="fala">
              ${resumo ? `<p>${escapar(resumo)}</p>` : ''}
              ${i.url ? `<a href="${escapar(i.url)}" target="_blank" rel="noopener">Ver no ${escapar(nome)} →</a>` : ''}
            </div>
          </li>`
          }).join('\n          ')}
        </ol>
      </section>`
    : ''

  const corpo = `<main class="jornal">
      <div class="jornal-topo">
        <h1>Notícias</h1>
        <p>O trabalho da Cruz Vermelha Brasileira no Rio de Janeiro, contado por quem o faz.</p>
      </div>
      ${miolo}
      ${tempo}
    </main>`

  return montarPaginaDoSite({
    titulo: 'Notícias',
    descricao: 'As notícias da Cruz Vermelha Brasileira — Rio de Janeiro: campanhas, atendimentos, cursos e parcerias.',
    caminho: '/noticias/',
    corpo,
    cssExtra: CSS_INDICE,
    agora,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Notícias — Cruz Vermelha Brasileira — Rio de Janeiro',
      url: 'https://cruzvermelhariodejaneiro.org/noticias/',
      hasPart: ordenadas.slice(0, 20).map((n) => ({
        '@type': 'NewsArticle', headline: n.titulo, url: n.url, datePublished: n.publicadaEm.toISOString(),
      })),
    },
  })
}
