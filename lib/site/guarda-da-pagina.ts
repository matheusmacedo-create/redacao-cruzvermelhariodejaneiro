/**
 * A última conferência antes de uma matéria subir para o site.
 *
 * A página do desfile de 7 de Setembro foi ao ar com `![…](/api/private-blob?
 * pathname=workspaces%2F…)` e `## ` no meio do texto: o leitor viu Markdown
 * cru, e o endereço interno da Biblioteca ficou público. O leitor de blocos
 * foi corrigido, mas a regra que importa é outra: página com qualquer coisa
 * de dentro da Redação, ou com marcação que não virou formatação, não sobe —
 * a publicação para com um erro que diz o quê e onde.
 *
 * Módulo puro: recebe o HTML pronto e devolve os problemas encontrados.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const VAZAMENTOS: { padrao: RegExp; motivo: string }[] = [
  { padrao: /\/api\/private-blob|%2Fapi%2Fprivate-blob/i, motivo: 'endereço de arquivo privado da Biblioteca (/api/private-blob)' },
  { padrao: /blob\.vercel-storage\.com/i, motivo: 'endereço do armazenamento de arquivos da Redação (blob.vercel-storage.com)' },
  { padrao: new RegExp(`workspaces(?:/|%2F)${UUID}`, 'i'), motivo: 'caminho interno de um espaço de trabalho (workspaces/…)' },
  { padrao: /\blocalhost\b|127\.0\.0\.1/i, motivo: 'endereço de máquina local (localhost)' },
  { padrao: /cruzvermelharj\.org\.br/i, motivo: 'o domínio antigo da filial, que não pode ser citado nem linkado' },
]

const MARCACAO: { padrao: RegExp; motivo: string }[] = [
  { padrao: /!\[/, motivo: 'foto escrita em Markdown que não virou imagem ("![")' },
  { padrao: /\*\*/, motivo: 'negrito que não fechou ("**")' },
  { padrao: /\]\(/, motivo: 'link escrito em Markdown que não virou link ("](")' },
]

/** O trecho em volta da ocorrência, para quem for corrigir achar o lugar. */
function trecho(texto: string, indice: number): string {
  return texto.slice(Math.max(0, indice - 40), indice + 40).replace(/\s+/g, ' ').trim()
}

/**
 * Os problemas da página, em português, prontos para a mensagem de erro.
 * Os vazamentos valem para o HTML inteiro; a marcação que sobrou é procurada
 * no que o leitor vê (texto e atributos), fora dos <script> e do <style>.
 */
export function problemasDaPagina(html: string): string[] {
  const problemas: string[] = []
  for (const { padrao, motivo } of VAZAMENTOS) {
    const m = padrao.exec(html)
    if (m) problemas.push(`${motivo}, perto de "${trecho(html, m.index)}"`)
  }
  const visivel = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  for (const { padrao, motivo } of MARCACAO) {
    const m = padrao.exec(visivel)
    if (m) problemas.push(`${motivo}, perto de "${trecho(visivel, m.index)}"`)
  }
  return problemas
}
