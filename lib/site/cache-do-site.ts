/**
 * As regras de cache da pasta de notícias.
 *
 * O Hostinger serve o HTML sem Cache-Control nenhum, e sem instrução o
 * navegador "chuta" a validade pela idade do arquivo — foi assim que a mesma
 * página de teste voltou três vezes para a mesma pessoa depois de já ter
 * saído do servidor. `no-cache` não proíbe guardar: obriga a REVALIDAR antes
 * de usar, e como o LiteSpeed manda ETag, a resposta comum é um 304 barato.
 * A mídia pode viver uma semana no navegador: quando uma imagem muda de
 * verdade, ela muda de nome.
 *
 * O arquivo sobe só na pasta de notícias, nunca na raiz: a raiz do Hostinger
 * pode ter um .htaccess próprio da hospedagem, e sobrescrever configuração
 * que não é nossa é o tipo de estrago que não se descobre na hora.
 */

/**
 * Matérias aposentadas (duplicatas, endereços trocados): cada uma responde 301
 * para a página que ficou, e os links antigos continuam levando a algum lugar.
 * `de` é o slug antigo (a pasta dentro de /noticias/); `para` é o caminho
 * absoluto do destino, ex.: '/noticias/slug-que-ficou/'.
 *
 * Quem decide o que sai do ar é a responsável pelo site, depois de aprovar a
 * lista das duplicatas. A regra cobre a pasta inteira (a página e as fotos que
 * ficaram nela), então a pasta velha pode continuar no servidor sem aparecer.
 */
export const REDIRECIONAMENTOS_DAS_NOTICIAS: { de: string; para: string }[] = [
  // 25/09/2026: três matérias repetiam o chamado de voluntários para o desfile de
  // 7 de Setembro (evento já passado). Fica /noticias/7-de-setembro/.
  { de: 'desfile-de-7-de-setembro-cruz-vermelha-rj-abre-cadastro-para-voluntarios', para: '/noticias/7-de-setembro/' },
  { de: 'o-7-de-setembro-esta-chegando', para: '/noticias/7-de-setembro/' },
]

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Caminho absoluto no próprio site, só com caracteres de URL: nada de espaço,
// aspas ou "//" no começo (que o navegador leria como outro domínio).
const CAMINHO = /^\/(?!\/)[A-Za-z0-9._~!&'()*+,;=:@%/-]*$/

const escaparPadrao = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Na substituição do RewriteRule, $ e % são referências (a $1, a %1).
const escaparDestino = (texto: string) => texto.replace(/[$%\\]/g, '\\$&')

/** As regras de redirecionamento, uma por slug aposentado. Entrada fora do formato é ignorada. */
export function regrasDeRedirecionamento(lista: { de: string; para: string }[] = REDIRECIONAMENTOS_DAS_NOTICIAS): string[] {
  const vistos = new Set<string>()
  const regras: string[] = []
  for (const { de, para } of lista) {
    const slug = de.trim()
    const destino = para.trim()
    if (!SLUG.test(slug) || !CAMINHO.test(destino) || vistos.has(slug)) continue
    if (destino.replace(/\/+$/, '') === `/noticias/${slug}`) continue
    vistos.add(slug)
    regras.push(`RewriteRule ^${escaparPadrao(slug)}(/.*)?$ ${escaparDestino(destino)} [R=301,L]`)
  }
  return regras
}

/**
 * O .htaccess de /noticias/. O bloco de redirecionamento só existe quando há
 * redirecionamento: um RewriteEngine nesta pasta faz o Apache/LiteSpeed deixar
 * de aplicar aqui as regras da raiz — por isso, junto dele, vão as duas regras
 * da raiz que valem para as notícias (www → domínio sem www, e /index.html →
 * pasta com barra).
 */
export function htaccessDasNoticias(lista: { de: string; para: string }[] = REDIRECIONAMENTOS_DAS_NOTICIAS): string {
  const regras = regrasDeRedirecionamento(lista)
  const redirecionamento = regras.length
    ? `
# Matérias aposentadas: 301 para a página que ficou (REDIRECIONAMENTOS_DAS_NOTICIAS).
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_HOST} ^www\\.cruzvermelhariodejaneiro\\.org$ [NC]
  RewriteRule ^(.*)$ https://cruzvermelhariodejaneiro.org/noticias/$1 [R=301,L]
  RewriteCond %{THE_REQUEST} \\s/+noticias/(.*/)?index\\.html[\\s?] [NC]
  RewriteRule ^(.*/)?index\\.html$ /noticias/$1 [R=301,L]
${regras.map((r) => `  ${r}`).join('\n')}
</IfModule>
`
    : ''
  return `# Gerado pela Redação — cruzvermelhariodejaneiro.org
# HTML sempre revalidado (o navegador confere o ETag antes de usar);
# mídia com cache de uma semana.
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(jpg|jpeg|png|webp|avif|gif|svg|mp4|webm)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>
${redirecionamento}`
}

export const HTACCESS_DAS_NOTICIAS = htaccessDasNoticias()
