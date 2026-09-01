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
export const HTACCESS_DAS_NOTICIAS = `# Gerado pela Redação — cruzvermelhariodejaneiro.org
# HTML sempre revalidado (o navegador confere o ETag antes de usar);
# mídia com cache de uma semana.
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(jpg|jpeg|png|webp|gif|svg|mp4|webm)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>
`
