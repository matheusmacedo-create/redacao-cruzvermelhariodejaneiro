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
  ROTULO_DA_CATEGORIA, ROTULO_DA_SITUACAO, ROTULO_DO_INSTRUMENTO, formatarCnpj, reais, tamanhoLegivel,
  type Canal, type Categoria, type Instrumento, type SituacaoDaPrestacao,
} from './regras'

export const portalAberto = () => process.env.AUDITORIA_ABERTA?.trim() === '1'

export type VersaoNoPortal = { nome: string; tamanho: number; sha256: string; url: string; publicadoEm: string; codigo: string | null; removida?: boolean }
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

/**
 * Visual do portal (17/10/2026), a partir da pesquisa de referências: estrutura em quatro grupos como o portal da
 * Cruz Roja Española; destaque do mais recente e faixa de "selos" como o charity: water; documentos em lista, com
 * o botão de baixar sempre visível e os dados técnicos recolhidos (NN/g, GOV.UK); categoria vazia sempre dita
 * ("ainda não publicado"), nunca escondida; e um parágrafo de método, como o MSF faz com a auditoria.
 */
const GRUPOS_DO_PORTAL: { id: string; nome: string; resumo: string; categorias: Categoria[]; parcerias?: boolean }[] = [
  { id: 'institucional', nome: 'Institucional e jurídico', resumo: 'O estatuto que rege a filial e os registros que comprovam a sua existência legal.', categorias: ['estatuto', 'certidoes'] },
  { id: 'governanca', nome: 'Governança', resumo: 'Quem decide e como: diretoria, conselhos, atas e as políticas que orientam a conduta.', categorias: ['dirigentes', 'atas', 'politicas'] },
  { id: 'contas', nome: 'Prestação de contas', resumo: 'Demonstrações contábeis, pareceres, campanhas e parcerias com o poder público.', categorias: ['demonstracoes', 'parecer', 'campanhas'], parcerias: true },
  { id: 'atividades', nome: 'Atividades', resumo: 'Relatórios do que a filial faz e outros documentos.', categorias: ['relatorio_anual', 'outros'] },
]

const ICONE_DO_GRUPO: Record<string, string> = {
  institucional: '<path d="M3 21h18M5 21V10m14 11V10M3 10l9-6 9 6M9 21v-6h6v6"/>',
  governanca: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.8 0 5 2.2 5 5"/>',
  contas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  atividades: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
}
const svg = (desenho: string, classe = 'pt-ico') => `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${desenho}</svg>`
const ICONE_PDF = svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>', 'pt-ico-pdf')
const ICONE_BAIXAR = svg('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>')
const ICONE_VERIFICAR = svg('<path d="M12 3 5 6v6c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>')
const curto = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-10)}`

const CSS_DA_TRANSPARENCIA = `
.pt{--pt-suave:#5b6576;--pt-borda:#e2e8f0;--pt-fundo:#f7f8fa;--pt-ok:#1d6b1d;color:var(--text)}
.pt a{color:var(--blue)}
.pt-topo{background:linear-gradient(180deg,#fff 0%,var(--pt-fundo) 100%);border-bottom:1px solid var(--pt-borda)}
.pt-topo-dentro{max-width:var(--max);margin:0 auto;padding:44px 20px 36px}
.pt-olho{color:var(--red);font-size:12.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}
.pt h1{font-size:clamp(30px,4.6vw,46px);line-height:1.08;letter-spacing:-.6px;margin:0 0 14px;color:var(--ink)}
.pt-compromisso{font-size:18px;line-height:1.6;max-width:62ch;margin:0 0 6px;color:#2d3748}
.pt-atualizada{color:var(--pt-suave);font-size:14px;margin:0}
.pt-numeros{list-style:none;padding:0;margin:26px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pt-numeros li{background:#fff;border:1px solid var(--pt-borda);border-radius:12px;padding:14px 16px}
.pt-numeros b{display:block;font-size:26px;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.pt-numeros span{display:block;color:var(--pt-suave);font-size:13.5px;line-height:1.35;margin-top:4px}
.pt-selos{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0;list-style:none}
.pt-selos li{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--pt-borda);border-radius:999px;padding:6px 12px;font-size:13.5px;color:#2d3748}
.pt-selos li::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--pt-ok)}
.pt-selos a{font-weight:700;text-decoration:none}
.pt-corpo{max-width:var(--max);margin:0 auto;padding:36px 20px 72px;display:grid;grid-template-columns:230px 1fr;gap:40px;align-items:start}
.pt-corpo>*{min-width:0}
.pt-nav{position:sticky;top:90px}
.pt-nav p{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--pt-suave);margin:0 0 8px}
.pt-nav ul{list-style:none;padding:0;margin:0;display:grid;gap:2px}
.pt-nav a{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:8px;color:#2d3748;text-decoration:none;font-size:14.5px;font-weight:600}
.pt-nav a:hover,.pt-nav a:focus-visible{background:var(--pt-fundo);color:var(--red)}
.pt-nav .pt-conta{color:var(--pt-suave);font-weight:500;font-variant-numeric:tabular-nums}
.pt-destaque{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;border:1px solid var(--pt-borda);border-left:4px solid var(--red);border-radius:12px;padding:18px 20px;margin:0 0 34px;background:#fff}
.pt-destaque .pt-rotulo{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin:0 0 2px}
.pt-destaque h2{font-size:18px;margin:0;color:var(--ink)}
.pt-destaque p{margin:2px 0 0;color:var(--pt-suave);font-size:14px}
.pt-grupo{margin:0 0 40px;scroll-margin-top:90px}
.pt-grupo-topo{display:flex;gap:14px;align-items:flex-start;margin:0 0 14px}
.pt-grupo-icone{flex-shrink:0;width:44px;height:44px;border-radius:12px;background:#fff1f1;color:var(--red);display:flex;align-items:center;justify-content:center}
.pt-grupo-icone .pt-ico{width:24px;height:24px}
.pt-grupo h2{font-size:23px;margin:0;color:var(--ink)}
.pt-grupo-topo p{margin:2px 0 0;color:var(--pt-suave);font-size:15px}
.pt-categoria{border:1px solid var(--pt-borda);border-radius:12px;background:#fff;margin:0 0 12px;overflow:hidden}
.pt-categoria h3{font-size:15px;margin:0;padding:12px 18px;background:var(--pt-fundo);border-bottom:1px solid var(--pt-borda);color:var(--ink);display:flex;justify-content:space-between;gap:10px}
.pt-categoria h3 small{font-weight:500;color:var(--pt-suave);font-size:13px}
.pt-docs{list-style:none;margin:0;padding:0}
.pt-doc{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:16px 18px;border-top:1px solid var(--pt-borda)}
.pt-doc:first-child{border-top:0}
.pt-ico-pdf{width:34px;height:34px;color:var(--red);margin-top:2px}
.pt-doc-titulo{font-weight:700;font-size:16.5px;line-height:1.35;color:var(--ink);text-decoration:none}
.pt-doc-titulo:hover{color:var(--red);text-decoration:underline}
.pt-doc-meta{color:var(--pt-suave);font-size:14px;margin:3px 0 0}
.pt-doc-desc{font-size:14.5px;line-height:1.55;margin:6px 0 0;color:#2d3748}
.pt-acoes{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.pt-botao{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 14px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid var(--pt-borda);color:#2d3748;background:#fff;cursor:pointer;font-family:inherit}
.pt a.pt-botao-forte,.pt-botao-forte{background:var(--red);border-color:var(--red);color:#fff}
.pt a.pt-botao-forte:hover{background:var(--red-dark)}
.pt-botao:hover{border-color:var(--red)}
.pt-botao .pt-ico{width:16px;height:16px}
.pt-botao:focus-visible,.pt-nav a:focus-visible,.pt-doc-titulo:focus-visible{outline:3px solid rgba(204,0,0,.35);outline-offset:2px}
.pt-hash{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:12px 0 0;font-size:13.5px;color:var(--pt-suave)}
.pt-hash code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:var(--pt-fundo);border:1px solid var(--pt-borda);border-radius:6px;padding:2px 6px;color:#1a202c}
.pt-copiar{border:0;background:none;color:var(--blue);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;padding:2px 4px}
.pt-copiar:focus-visible{outline:3px solid rgba(43,108,176,.35);border-radius:4px}
.pt details{margin:10px 0 0}
.pt summary{cursor:pointer;font-size:13.5px;color:var(--blue);font-weight:600}
.pt details p{font-size:13.5px;line-height:1.6;margin:6px 0}
.pt code.hash{word-break:break-all}
.pt-vazios{padding:12px 18px;font-size:14px;color:var(--pt-suave);border-top:1px dashed var(--pt-borda);margin:0}
.pt-vazios b{color:#2d3748;font-weight:600}
.pt-vazio{border:1px dashed #cbd5e0;border-radius:12px;padding:14px 18px;margin:0 0 12px;font-size:14.5px;color:#2d3748;background:#fff}
.pt-vazio strong{display:block;color:var(--ink)}
.pt-parceria{border:1px solid var(--pt-borda);border-radius:12px;padding:16px 18px;margin:0 0 12px;background:#fff}
.pt-parceria h3{font-size:16.5px;margin:0 0 6px}
.pt-parceria dl{display:grid;grid-template-columns:minmax(140px,35%) 1fr;gap:4px 14px;margin:8px 0 0;font-size:14.5px}
.pt-parceria dt{color:var(--pt-suave)}
.pt-parceria dd{margin:0}
.pt-metodo{background:#0f1318;color:#e2e8f0;border-radius:14px;padding:26px;margin:8px 0 40px}
.pt-metodo h2{color:#fff;font-size:22px;margin:0 0 6px}
.pt-metodo>p{margin:0 0 16px;line-height:1.6;color:#cbd5e0}
.pt-metodo ol{list-style:none;counter-reset:passo;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pt-metodo li{counter-increment:passo;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;font-size:14.5px;line-height:1.55}
.pt-metodo li::before{content:counter(passo);display:inline-flex;width:26px;height:26px;border-radius:50%;background:var(--red);color:#fff;font-weight:800;align-items:center;justify-content:center;margin-bottom:8px}
.pt-metodo li b{display:block;color:#fff;margin-bottom:4px}
.pt-metodo code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px;color:#fff;word-break:break-all}
.pt-metodo a{color:#ffb3b3}
.pt-rodape{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}
.pt-cartao{border:1px solid var(--pt-borda);border-radius:12px;padding:18px 20px;background:#fff}
.pt-cartao h2{font-size:17px;margin:0 0 8px;color:var(--ink)}
.pt-cartao p{margin:4px 0;font-size:14.5px;line-height:1.6}
.pt-cartao ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.pt-cartao li a{font-weight:700;text-decoration:none}
.pt-cartao li span{display:block;color:var(--pt-suave);font-size:13.5px}
@media (max-width:920px){
  .pt-corpo{grid-template-columns:1fr;gap:20px}
  .pt-nav{position:static}
  .pt-nav ul{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
  .pt-nav a{white-space:nowrap;border:1px solid var(--pt-borda);border-radius:999px;padding:6px 12px}
  .pt-numeros{grid-template-columns:repeat(2,1fr)}
  .pt-metodo ol,.pt-rodape{grid-template-columns:1fr}
}
@media (max-width:560px){
  .pt-categoria h3{flex-direction:column;gap:2px}
  .pt-destaque{grid-template-columns:1fr}
  .pt-destaque .pt-ico-pdf{display:none}
  .pt-doc{grid-template-columns:1fr}
  .pt-doc .pt-ico-pdf{display:none}
  .pt-parceria dl{grid-template-columns:1fr}
  .pt-parceria dt{margin-top:6px}
}
`

const JS_DA_TRANSPARENCIA = `<script>
(function () {
  document.querySelectorAll('[data-copiar]').forEach(function (b) {
    b.addEventListener('click', function () {
      var valor = b.getAttribute('data-copiar'), antes = b.textContent;
      function feito(ok) { b.textContent = ok ? 'Copiado' : 'Não deu para copiar'; setTimeout(function () { b.textContent = antes; }, 1800); }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(valor).then(function () { feito(true); }, function () { feito(false); });
      else feito(false);
    });
  });
  var alvo = document.querySelector('[data-pt-dias]');
  if (!alvo || !window.fetch) return;
  fetch('/verificar/lotes/indice.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (lotes) {
    if (!Array.isArray(lotes)) return;
    var dias = {}; lotes.forEach(function (l) { if (l && l.dia) dias[l.dia] = true; });
    var d = new Date(Date.now() - 3 * 3600 * 1000), n = 0;
    var iso = function (x) { return x.toISOString().slice(0, 10); };
    if (!dias[iso(d)]) d.setUTCDate(d.getUTCDate() - 1);
    while (dias[iso(d)]) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    if (n > 0) alvo.textContent = String(n);
  }).catch(function () {});
})();
</script>`

function documentoDoPortal(d: DocumentoNoPortal): string {
  const v = d.atual
  const meta = [d.periodo, `PDF, ${tamanhoLegivel(v.tamanho)}`, `publicado em ${dia(v.publicadoEm)}`].filter(Boolean).map((t) => escapar(String(t))).join(' · ')
  const anteriores = d.anteriores.length ? `
              <details><summary>Versões anteriores (${d.anteriores.length})</summary>${d.anteriores.map((a) => `
                <p>${a.removida ? `Versão publicada em ${escapar(dia(a.publicadoEm))}: substituída, e o arquivo foi retirado do site.` : `<a href="${escapar(a.url)}">Versão publicada em ${escapar(dia(a.publicadoEm))}</a>: substituída.`}
                SHA-256 <code class="hash">${escapar(a.sha256)}</code>${a.codigo ? ` · código <a href="/verificar/?c=${escapar(a.codigo)}"><code class="hash">${escapar(codigoEmGrupos(a.codigo))}</code></a>` : ''}</p>`).join('')}
              </details>` : ''
  return `
            <li class="pt-doc">
              ${ICONE_PDF}
              <div>
                <a class="pt-doc-titulo" href="${escapar(v.url)}">${escapar(d.titulo)}</a>
                <p class="pt-doc-meta">${meta}</p>
                ${d.descricao ? `<p class="pt-doc-desc">${escapar(d.descricao)}</p>` : ''}
                <div class="pt-acoes">
                  <a class="pt-botao pt-botao-forte" href="${escapar(v.url)}" download>${ICONE_BAIXAR}Baixar PDF <span class="pt-tamanho">(${escapar(tamanhoLegivel(v.tamanho))})</span></a>
                  ${v.codigo ? `<a class="pt-botao" href="/verificar/?c=${escapar(v.codigo)}">${ICONE_VERIFICAR}Verificar autenticidade</a>` : ''}
                </div>
                <p class="pt-hash">Impressão digital (SHA-256): <code title="${escapar(v.sha256)}">${escapar(curto(v.sha256))}</code>
                  <button type="button" class="pt-copiar" data-copiar="${escapar(v.sha256)}" aria-label="Copiar a impressão digital completa de ${escapar(d.titulo)}">Copiar</button></p>
                <details><summary>Dados completos de verificação</summary>
                  <p>SHA-256 do arquivo: <code class="hash">${escapar(v.sha256)}</code></p>
                  ${v.codigo ? `<p>Código de verificação: <a href="/verificar/?c=${escapar(v.codigo)}"><code class="hash">${escapar(codigoEmGrupos(v.codigo))}</code></a></p>` : '<p>O código de verificação aparece aqui depois da conferência diária da trilha.</p>'}
                </details>${anteriores}
              </div>
            </li>`
}

function parceriaDoPortal(x: ParceriaNoPortal): string {
  return `
          <article class="pt-parceria">
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
          </article>`
}

export function paginaDaTransparencia(p: { documentos: DocumentoNoPortal[]; parcerias: ParceriaNoPortal[]; agora?: Date; indexar?: boolean }): string {
  const agora = p.agora ?? new Date()
  const docsDe = (c: Categoria) => p.documentos.filter((d) => d.categoria === c)
  const maisRecente = [...p.documentos].sort((a, b) => b.atual.publicadoEm.localeCompare(a.atual.publicadoEm))[0]

  // A página pública mostra só o que tem documento (pedido do Google Ad Grants,
  // 19/10/2026): seção vazia, lista do que "ainda não foi publicado" e o
  // contador "X de 10 seções" liam como portal em construção. Os dados não
  // mudam — a seção volta sozinha quando ganhar o primeiro documento. Quem
  // procura algo que não está aqui tem o pedido de documentos no fim da página.
  const gruposComDocumento = GRUPOS_DO_PORTAL.filter((g) => g.categorias.some((c) => docsDe(c).length) || (g.parcerias && p.parcerias.length))
  const grupos = gruposComDocumento.map((g) => {
    const cheias = g.categorias.filter((c) => docsDe(c).length)
    const total = cheias.reduce((n, c) => n + docsDe(c).length, 0) + (g.parcerias ? p.parcerias.length : 0)
    const categorias = cheias.map((c) => `
        <section class="pt-categoria" id="${c}" aria-labelledby="pt-cat-${c}">
          <h3 id="pt-cat-${c}">${escapar(ROTULO_DA_CATEGORIA[c].nome)} <small>${escapar(ROTULO_DA_CATEGORIA[c].ajuda)}</small></h3>
          <ul class="pt-docs">${docsDe(c).map(documentoDoPortal).join('')}
          </ul>
        </section>`).join('')
    // Sem parceria, a nota "Nenhuma parceria em vigor" continua: é informação
    // (Lei nº 13.019/2014, art. 11), não seção vazia — e só aparece quando o
    // grupo tem documento, portanto quando a seção está na página.
    const parcerias = !g.parcerias ? '' : p.parcerias.length ? `
        <section id="parcerias" aria-labelledby="pt-cat-parcerias">
          <h3 id="pt-cat-parcerias" class="pt-sub">Parcerias com o poder público</h3>
          <p class="pt-doc-desc">Termos de colaboração, de fomento e acordos de cooperação, com os dados que a Lei nº 13.019/2014 (art. 11) manda divulgar.
          Da equipe paga com recursos da parceria aparecem a função e a remuneração, não o nome.</p>
          ${p.parcerias.map(parceriaDoPortal).join('')}
        </section>` : `
        <div class="pt-vazio" id="parcerias"><strong>Parcerias com o poder público</strong>
          Nenhuma parceria em vigor. Quando houver, cada uma aparece aqui com os dados que a Lei nº 13.019/2014 (art. 11) manda divulgar: órgão, objeto, valores, vigência e situação da prestação de contas.</div>`
    const corpoDoGrupo = `${categorias}${parcerias}`
    return {
      nav: `<li><a href="#${g.id}">${escapar(g.nome)} <span class="pt-conta">${total}</span></a></li>`,
      html: `
      <section class="pt-grupo" id="${g.id}" aria-labelledby="pt-grupo-${g.id}">
        <div class="pt-grupo-topo"><span class="pt-grupo-icone">${svg(ICONE_DO_GRUPO[g.id])}</span>
          <div><h2 id="pt-grupo-${g.id}">${escapar(g.nome)}</h2><p>${escapar(g.resumo)}</p></div></div>${corpoDoGrupo}
      </section>`,
    }
  })

  const destaque = maisRecente ? `
      <div class="pt-destaque">
        ${ICONE_PDF}
        <div><p class="pt-rotulo">Publicado mais recentemente</p><h2>${escapar(maisRecente.titulo)}</h2>
          <p>${escapar(ROTULO_DA_CATEGORIA[maisRecente.categoria].nome)} · publicado em ${escapar(dia(maisRecente.atual.publicadoEm))}</p></div>
        <a class="pt-botao pt-botao-forte" href="${escapar(maisRecente.atual.url)}" download>${ICONE_BAIXAR}Baixar PDF</a>
      </div>` : ''

  const f = DADOS_DA_FILIAL
  const corpo = `<main class="pt">
    <section class="pt-topo" aria-labelledby="pt-titulo">
      <div class="pt-topo-dentro">
        <p class="pt-olho">Portal da transparência</p>
        <h1 id="pt-titulo">Transparência</h1>
        <p class="pt-compromisso">Tudo o que a Filial publica como oficial vem com prova. Cada documento tem uma impressão digital e um código de
        verificação registrados numa trilha pública de auditoria: nada é trocado em silêncio, nem pela própria Filial.</p>
        <p class="pt-atualizada">Atualizada em ${diaPorExtenso(agora)}.</p>
        <ul class="pt-numeros" aria-label="O portal em números">
          <li><b>${p.documentos.length}</b><span>${p.documentos.length === 1 ? 'documento publicado' : 'documentos publicados'}, todos verificáveis</span></li>
          <li><b data-pt-dias>—</b><span>dias seguidos com o selo diário da trilha</span></li>
          <li><b>${maisRecente ? escapar(dia(maisRecente.atual.publicadoEm)) : '—'}</b><span>última publicação</span></li>
        </ul>
        <ul class="pt-selos" aria-label="As provas de cada registro">
          <li>Impressão digital SHA-256</li><li>Carimbo de tempo RFC 3161</li><li>Âncora diária no Bitcoin</li><li>Assinatura digital da Filial</li>
          <li><a href="/gestao/">Entenda como funciona</a></li>
        </ul>
      </div>
    </section>
    <div class="pt-corpo">
      <nav class="pt-nav" aria-label="Seções do portal">
        <p>Seções</p>
        <ul>${grupos.map((g) => g.nav).join('')}
          <li><a href="#como-conferir">Como conferir</a></li>
        </ul>
      </nav>
      <div>
        ${destaque}
        ${grupos.map((g) => g.html).join('')}
        <section class="pt-metodo" id="como-conferir" aria-labelledby="pt-metodo-titulo">
          <h2 id="pt-metodo-titulo">Como conferir um documento</h2>
          <p>A conferência não depende da Filial: as provas ficam em arquivos públicos e se conferem com ferramentas livres.</p>
          <ol>
            <li><b>Baixe o PDF</b>Use o botão "Baixar PDF" do documento. O arquivo é o mesmo registrado na trilha.</li>
            <li><b>Calcule a impressão digital</b>No Windows: <code>certutil -hashfile arquivo.pdf SHA256</code>. No Mac ou Linux: <code>shasum -a 256 arquivo.pdf</code>. O resultado tem de ser igual ao publicado aqui.</li>
            <li><b>Confira o registro</b>Em <a href="/verificar/">Verificar um documento</a>, o código mostra quando o documento foi registrado, se continua valendo e as provas do Bitcoin e do carimbo de tempo.</li>
          </ol>
        </section>
        <div class="pt-rodape">
          <section class="pt-cartao" aria-labelledby="pt-filial">
            <h2 id="pt-filial">Quem publica</h2>
            <p><strong>${escapar(f.nome)}</strong></p>
            <p>Filial estadual da Cruz Vermelha Brasileira, cujo estatuto foi aprovado pelo Decreto nº 8.885/2016.</p>
            <p>CNPJ ${escapar(f.cnpj)} · ${escapar(f.endereco)}</p>
            <p>E-mail: <a href="mailto:${escapar(f.email)}">${escapar(f.email)}</a></p>
          </section>
          <section class="pt-cartao" aria-labelledby="pt-canais">
            <h2 id="pt-canais">Precisa de mais?</h2>
            <ul>
              <li><a href="/pedido-de-documentos/">Pedido de documentos</a><span>A íntegra de um documento ou um que não está aqui, com resposta por e-mail.</span></li>
              <li><a href="/gestao/">Como funciona a nossa gestão</a><span>A trilha, os selos diários e o papel da tecnologia.</span></li>
              <li><a href="/canais-oficiais/">Canais oficiais</a><span>Os únicos endereços e contatos da Filial. Desconfie de outros.</span></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
    ${JS_DA_TRANSPARENCIA}
  </main>`

  return montarPaginaDoSite({
    titulo: 'Transparência',
    descricao: 'Os documentos oficiais da Cruz Vermelha Brasileira — Filial do Rio de Janeiro, cada um com impressão digital e código de verificação.',
    caminho: '/transparencia/',
    corpo,
    cssExtra: CSS_DO_PORTAL + CSS_DA_TRANSPARENCIA,
    agora,
    ativo: 'transparencia',
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
  return `# Gerado pelo Palácio Virtual — cruzvermelhariodejaneiro.org
# HTML sempre revalidado.${indexar ? '' : '\n# Lançamento oculto: fora dos buscadores até a abertura (docs/auditoria-publica.md, §9).'}
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>${indexar ? '' : `
  Header set X-Robots-Tag "noindex, nofollow, noarchive"`}
</IfModule>
`
}
