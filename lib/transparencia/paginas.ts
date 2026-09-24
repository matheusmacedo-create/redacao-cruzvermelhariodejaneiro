/**
 * As páginas públicas do portal de transparência (/transparencia/) e dos
 * canais oficiais (/canais-oficiais/), geradas aqui e enviadas por FTP.
 *
 * Lançamento oculto (docs/auditoria-publica.md §1 e §9): enquanto
 * AUDITORIA_ABERTA não for "1", as duas saem com noindex (meta e cabeçalho, pelo
 * .htaccess da pasta), fora do sitemap e sem link em página nenhuma do site.
 *
 * Cada documento, parceria e versão da lista de canais mostra o código da
 * trilha pública e o SHA-256, com o link para conferir em /verificar/.
 */

import { montarPaginaDoSite, escapar } from '@/lib/site/esqueleto'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { codigoEmGrupos } from '@/lib/auditoria/catalogo'
import {
  CATEGORIAS, ROTULO_DA_CATEGORIA, ROTULO_DA_SITUACAO, ROTULO_DO_INSTRUMENTO, formatarCnpj, reais, tamanhoLegivel,
  type Canal, type Categoria, type Instrumento, type SituacaoDaPrestacao,
} from './regras'

export const portalAberto = () => process.env.AUDITORIA_ABERTA?.trim() === '1'

export type VersaoNoPortal = { nome: string; tamanho: number; sha256: string; url: string; publicadoEm: string; codigo: string | null }
export type DocumentoNoPortal = {
  id: string; categoria: Categoria; titulo: string; descricao: string | null; periodo: string | null
  atual: VersaoNoPortal; anteriores: VersaoNoPortal[]
}
export type ParceriaNoPortal = {
  id: string; instrumento: Instrumento; numero: string | null; orgao: string; orgao_cnpj: string | null; objeto: string
  data_assinatura: string | null; vigencia_inicio: string | null; vigencia_fim: string | null
  valor_total: string | null; valor_liberado: string | null; situacao_prestacao: SituacaoDaPrestacao; prestacao_final_em: string | null
  equipe: { funcao: string; remuneracao: string }[]; observacao: string | null; publicadoEm: string; codigo: string | null; hash: string | null
}

const dia = (iso: string | null) => (iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : '—')
const diaPorExtenso = (d: Date) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)

const CSS_DO_PORTAL = `
.pagina-simples{max-width:var(--coluna);margin:0 auto;padding:48px 20px 72px}
.pagina-simples h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-.5px;margin:0 0 8px;color:var(--ink)}
.pagina-simples .atualizada{color:var(--muted);font-size:13.5px;margin:0 0 28px}
.pagina-simples h2{font-size:21px;margin:40px 0 6px;color:var(--ink)}
.pagina-simples p,.pagina-simples li{font-size:16px;line-height:1.7;color:var(--text)}
.pagina-simples a{color:var(--blue)}
.pagina-simples .ajuda{color:var(--muted);font-size:14.5px;margin:0 0 12px}
.bloco-dados{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:22px 0}
.bloco-dados p{margin:4px 0;font-size:14.5px}
.indice-portal{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 8px;padding:0;list-style:none}
.indice-portal a{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:14px;text-decoration:none}
.documentos{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:12px}
.documentos>li{padding:14px 18px;border-top:1px solid var(--line)}
.documentos>li:first-child{border-top:0}
.documentos .titulo{font-weight:700;font-size:16.5px}
.documentos .meta{color:var(--muted);font-size:14px;margin:2px 0 0}
details.conferir{margin-top:8px}
details.conferir summary{cursor:pointer;font-size:14px;color:var(--blue)}
details.conferir p{font-size:13.5px;margin:6px 0}
code.hash{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all;background:var(--soft);padding:1px 4px;border-radius:4px}
.parceria{border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
.parceria h3{font-size:17px;margin:0 0 6px}
.parceria dl{display:grid;grid-template-columns:minmax(140px,35%) 1fr;gap:4px 14px;margin:8px 0 0;font-size:14.5px}
.parceria dt{color:var(--muted)}
.parceria dd{margin:0}
.canais{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:12px}
.canais li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;padding:12px 18px;border-top:1px solid var(--line)}
.canais li:first-child{border-top:0}
.canais .rotulo{font-weight:700}
.canais .valor{word-break:break-word}
@media (max-width:560px){.parceria dl{grid-template-columns:1fr}.parceria dt{margin-top:6px}}
`

function selo(codigo: string | null, sha256: string | null, rotuloDoHash = 'SHA-256'): string {
  if (!codigo && !sha256) return ''
  return `<details class="conferir"><summary>Conferir autenticidade</summary>
        ${sha256 ? `<p>${rotuloDoHash}: <code class="hash">${escapar(sha256)}</code></p>` : ''}
        ${codigo ? `<p>Código de verificação: <a href="/verificar/?c=${escapar(codigo)}"><code class="hash">${escapar(codigoEmGrupos(codigo))}</code></a></p>` : '<p>O código de verificação aparece aqui depois da conferência diária da trilha.</p>'}
      </details>`
}

function blocoDaFilial(): string {
  const f = DADOS_DA_FILIAL
  return `<div class="bloco-dados">
      <p><strong>${escapar(f.nome)}</strong></p>
      <p>CNPJ ${escapar(f.cnpj)} · ${escapar(f.endereco)}</p>
      <p>E-mail: <a href="mailto:${escapar(f.email)}">${escapar(f.email)}</a></p>
    </div>`
}

export function paginaDaTransparencia(p: { documentos: DocumentoNoPortal[]; parcerias: ParceriaNoPortal[]; agora?: Date; indexar?: boolean }): string {
  const agora = p.agora ?? new Date()
  const secoes = CATEGORIAS.map((c) => ({ c, docs: p.documentos.filter((d) => d.categoria === c) })).filter((s) => s.docs.length)

  const blocos = secoes.map(({ c, docs }) => `
      <section id="${c}">
        <h2>${escapar(ROTULO_DA_CATEGORIA[c].nome)}</h2>
        <p class="ajuda">${escapar(ROTULO_DA_CATEGORIA[c].ajuda)}</p>
        <ul class="documentos">${docs.map((d) => `
          <li>
            <a class="titulo" href="${escapar(d.atual.url)}">${escapar(d.titulo)}</a>${d.periodo ? ` <span class="meta">(${escapar(d.periodo)})</span>` : ''}
            <p class="meta">PDF, ${escapar(tamanhoLegivel(d.atual.tamanho))} · publicado em ${escapar(dia(d.atual.publicadoEm))}</p>
            ${d.descricao ? `<p class="meta">${escapar(d.descricao)}</p>` : ''}
            ${selo(d.atual.codigo, d.atual.sha256, 'SHA-256 do arquivo')}
            ${d.anteriores.length ? `<details class="conferir"><summary>Versões anteriores (${d.anteriores.length})</summary>${d.anteriores.map((v) => `
              <p><a href="${escapar(v.url)}">Versão publicada em ${escapar(dia(v.publicadoEm))}</a> — substituída.
              SHA-256 <code class="hash">${escapar(v.sha256)}</code>${v.codigo ? ` · código <a href="/verificar/?c=${escapar(v.codigo)}"><code class="hash">${escapar(codigoEmGrupos(v.codigo))}</code></a>` : ''}</p>`).join('')}
            </details>` : ''}
          </li>`).join('')}
        </ul>
      </section>`).join('')

  const parcerias = p.parcerias.length ? `
      <section id="parcerias">
        <h2>Parcerias com o poder público</h2>
        <p class="ajuda">Termos de colaboração, de fomento e acordos de cooperação, com os dados que a Lei nº 13.019/2014 (art. 11) manda divulgar.
        Da equipe paga com recursos da parceria aparecem a função e a remuneração — não o nome.</p>
        ${p.parcerias.map((x) => `
        <article class="parceria">
          <h3>${escapar(ROTULO_DO_INSTRUMENTO[x.instrumento])}${x.numero ? ` nº ${escapar(x.numero)}` : ''} — ${escapar(x.orgao)}</h3>
          <p>${escapar(x.objeto)}</p>
          <dl>
            ${x.orgao_cnpj ? `<dt>CNPJ do órgão</dt><dd>${escapar(formatarCnpj(x.orgao_cnpj))}</dd>` : ''}
            <dt>Assinatura</dt><dd>${escapar(dia(x.data_assinatura))}</dd>
            <dt>Vigência</dt><dd>${escapar(dia(x.vigencia_inicio))} a ${escapar(dia(x.vigencia_fim))}</dd>
            <dt>Valor total</dt><dd>${escapar(reais(x.valor_total))}</dd>
            <dt>Valor liberado</dt><dd>${escapar(reais(x.valor_liberado))}</dd>
            <dt>Prestação de contas</dt><dd>${escapar(ROTULO_DA_SITUACAO[x.situacao_prestacao])}${x.prestacao_final_em ? ` (${escapar(dia(x.prestacao_final_em))})` : ''}</dd>
            ${x.equipe.length ? `<dt>Equipe paga pela parceria</dt><dd>${x.equipe.map((e) => `${escapar(e.funcao)}: ${escapar(reais(e.remuneracao))}`).join('<br>')}</dd>` : ''}
            ${x.observacao ? `<dt>Observação</dt><dd>${escapar(x.observacao)}</dd>` : ''}
          </dl>
          ${selo(x.codigo, x.hash, 'SHA-256 do registro')}
        </article>`).join('')}
      </section>` : ''

  const indice = [...secoes.map(({ c }) => ({ id: c, nome: ROTULO_DA_CATEGORIA[c].nome })), ...(p.parcerias.length ? [{ id: 'parcerias', nome: 'Parcerias' }] : [])]

  const corpo = `<main class="pagina-simples">
      <h1>Transparência</h1>
      <p class="atualizada">Atualizada em ${diaPorExtenso(agora)}.</p>
      <p>Aqui a Filial publica os documentos que prestam contas do seu trabalho: estatuto, diretoria, demonstrações
      contábeis, pareceres, relatórios e as parcerias com o poder público. Documento publicado não é trocado em silêncio:
      uma versão nova fica ao lado da anterior, e cada uma tem uma impressão digital (SHA-256) e um código de verificação
      registrados na trilha pública de auditoria.</p>
      ${blocoDaFilial()}
      ${indice.length ? `<ul class="indice-portal">${indice.map((i) => `<li><a href="#${i.id}">${escapar(i.nome)}</a></li>`).join('')}</ul>` : '<p>Nenhum documento publicado ainda.</p>'}
      ${blocos}
      ${parcerias}
      <section id="como-conferir">
        <h2>Como conferir um documento</h2>
        <p>Baixe o PDF e calcule o SHA-256 dele (no Windows, <code>certutil -hashfile arquivo.pdf SHA256</code>; no Mac ou Linux,
        <code>shasum -a 256 arquivo.pdf</code>). O resultado tem de ser igual ao publicado aqui. Pelo código de verificação você vê
        quando o documento foi registrado, se continua valendo e baixa a prova ancorada no Bitcoin, que se confere sem depender da Filial.</p>
      </section>
    </main>`

  return montarPaginaDoSite({
    titulo: 'Transparência',
    descricao: 'Estatuto, diretoria, demonstrações contábeis, pareceres, relatórios e parcerias da Cruz Vermelha Brasileira — Filial do Rio de Janeiro.',
    caminho: '/transparencia/',
    corpo,
    cssExtra: CSS_DO_PORTAL,
    agora,
    indexar: p.indexar ?? portalAberto(),
  })
}

export function paginaDosCanais(p: {
  versao: number; canais: Canal[]; observacao: string | null; publicadoEm: string; codigo: string | null; hash: string | null
  chaveId: string | null; agora?: Date; indexar?: boolean
}): string {
  const agora = p.agora ?? new Date()
  const linhas = p.canais.map((c) => `
          <li><span class="rotulo">${escapar(c.rotulo)}</span>
            <span class="valor">${c.url ? `<a href="${escapar(c.url)}" rel="noopener">${escapar(c.valor)}</a>` : escapar(c.valor)}</span></li>`).join('')
  const corpo = `<main class="pagina-simples">
      <h1>Canais oficiais</h1>
      <p class="atualizada">Versão ${p.versao}, publicada em ${diaPorExtenso(new Date(p.publicadoEm))}.</p>
      <p>Estes são os únicos endereços, telefones e perfis da Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro.
      Se alguém falar em nome da Filial por outro canal, pedir dinheiro, dados ou pagamento fora desta lista, desconfie e
      confirme por um dos canais abaixo.</p>
      <ul class="canais">${linhas}
      </ul>
      ${p.observacao ? `<p>${escapar(p.observacao)}</p>` : ''}
      <div class="bloco-dados">
        <p>Esta lista é registrada na trilha pública de auditoria a cada versão: não muda sem deixar registro.</p>
        ${p.hash ? `<p>SHA-256 do registro: <code class="hash">${escapar(p.hash)}</code></p>` : ''}
        ${p.codigo ? `<p>Código de verificação: <a href="/verificar/?c=${escapar(p.codigo)}"><code class="hash">${escapar(codigoEmGrupos(p.codigo))}</code></a></p>` : ''}
        ${p.chaveId ? `<p>Impressão digital da chave que assina os lotes diários da trilha: <code class="hash">${escapar(p.chaveId)}</code></p>` : ''}
      </div>
    </main>`
  return montarPaginaDoSite({
    titulo: 'Canais oficiais',
    descricao: 'Os endereços, telefones e perfis oficiais da Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro. Desconfie de outros.',
    caminho: '/canais-oficiais/',
    corpo,
    cssExtra: CSS_DO_PORTAL,
    agora,
    indexar: p.indexar ?? portalAberto(),
  })
}

/** .htaccess das pastas do portal: HTML sempre revalidado e, até a abertura, fora dos buscadores (inclusive os PDFs). */
export function htaccessDoPortal(indexar: boolean = portalAberto()): string {
  return `# Gerado pela Redação — cruzvermelhariodejaneiro.org
# HTML sempre revalidado.${indexar ? '' : '\n# Lançamento oculto: fora dos buscadores até a abertura (docs/auditoria-publica.md, §9).'}
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>${indexar ? '' : `
  Header set X-Robots-Tag "noindex, nofollow, noarchive"`}
</IfModule>
`
}
