/**
 * Qual espaço recebe as inscrições da newsletter, escolhido da lista de espaços (lib/newsletter/contexto.ts). Puro,
 * conferido em scripts/conferir-newsletter-espaco.ts.
 *
 * A regra: o único de Produção (`kind: 'production'`), a mesma que requireWorkspace() e as páginas públicas usam
 * (portaria, envios, participe). Um espaço de Demonstração (`kind: 'demo'`, o das gravações dos tutoriais, docs/AJUDA.md
 * §12) não muda nada. Nunca escolhe na sorte: sem Produção e com mais de um espaço, ou com dois de Produção, FALHA
 * dizendo o que fazer — inscrição parar com erro claro é ruim; inscrição cair no espaço errado em silêncio é pior,
 * porque ninguém descobre.
 */

export type EspacoListado = { id: string; kind: string | null }

export function escolherEspacoDaNewsletter(lista: EspacoListado[]): { id: string } | { erro: string } {
  if (!lista.length) return { erro: 'Não há espaço de trabalho para receber a inscrição.' }
  const producao = lista.filter((w) => w.kind === 'production')
  if (producao.length === 1) return { id: producao[0].id }
  if (producao.length > 1) {
    return { erro: 'Há mais de um espaço de Produção: defina NEWSLETTER_WORKSPACE_ID para dizer qual recebe as inscrições.' }
  }
  // Sem Produção: só vale se houver um espaço só (o caso antigo, antes de existir o tipo).
  if (lista.length === 1) return { id: lista[0].id }
  return { erro: 'Há mais de um espaço de trabalho e nenhum de Produção: defina NEWSLETTER_WORKSPACE_ID para dizer qual recebe as inscrições.' }
}
