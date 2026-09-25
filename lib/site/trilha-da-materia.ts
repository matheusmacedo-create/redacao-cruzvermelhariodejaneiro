/**
 * O texto canônico de uma matéria na trilha pública de auditoria — o MESMO que
 * `auditoria.conteudo_materia()` monta no banco (supabase/migrations/
 * 20260925203000_cvrj_auditoria.sql): `json_canonico` de {corpo, subtitulo,
 * titulo, url}, chaves em ordem, sem espaços.
 *
 * Por que a aplicação precisa dele: o gancho da trilha dispara quando
 * `site_url` ou `site_published_at` mudam. Desde que republicar deixou de
 * reescrever a data da primeira publicação, a versão nova de uma matéria
 * republicada no mesmo endereço não dispara mais o gancho — então a
 * publicação a registra pela porta da aplicação (`auditoria_registrar_item`).
 * O conteúdo tem de ser idêntico ao do banco, byte a byte: igual, o registro
 * reconhece a versão que já existe e não abre outra; diferente, abriria uma
 * versão nova a cada republicação.
 *
 * Equivalências: `coalesce(body, '')`; `nullif(btrim(subtitle), '')` (btrim
 * sem argumento tira só o espaço comum); strings no escape do jsonb do
 * Postgres, que é o mesmo do JSON.stringify (\" \\ \b \f \n \r \t e \u00XX
 * minúsculo para os outros controles; o resto sai como está).
 */
export function conteudoCanonicoDaMateria(p: { titulo: string; subtitulo: string | null; corpo: string | null; url: string | null }): string {
  const subtitulo = (p.subtitulo ?? '').replace(/^ +| +$/g, '')
  const par = (chave: string, valor: string | null) => `${JSON.stringify(chave)}:${valor === null ? 'null' : JSON.stringify(valor)}`
  return `{${[par('corpo', p.corpo ?? ''), par('subtitulo', subtitulo || null), par('titulo', p.titulo), par('url', p.url)].join(',')}}`
}
