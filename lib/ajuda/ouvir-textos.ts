import { GUIAS, TOPICOS_GERAIS, BOAS_VINDAS, BOAS_VINDAS_ESCOLA } from './index'
import { BOAS_VINDAS_DO_MEMBRO, GUIAS_DO_MEMBRO, TOPICOS_DO_MEMBRO } from './membro'
import { codigoDoTexto, textoDaArea, textoDaPergunta, textoDaTarefa, textoDoPassoDoTour } from './ouvir'
import type { GuiaDaArea, TopicoGeral } from './tipos'

/**
 * Todos os textos que o "Ouvir" pode tocar (sem 'server-only', para o script de conferência; quem serve é
 * ouvir-servidor.ts), pelo código (lib/ajuda/ouvir.ts). A rota do áudio só grava o que está
 * aqui: o conjunto é fechado (o conteúdo da ajuda), e o gasto máximo de voz é o da ajuda inteira, uma vez.
 */
export function textosQueSePodemOuvir(): string[] {
  const textos: string[] = []
  const daArea = (g: GuiaDaArea) => {
    textos.push(textoDaArea(g.paraQueServe, g.quemUsa))
    for (const t of g.tarefas) textos.push(textoDaTarefa(t))
    for (const p of g.perguntas) textos.push(textoDaPergunta(p))
    for (const p of g.tour) textos.push(textoDoPassoDoTour(p))
    for (const tela of g.telas ?? []) for (const p of tela.tour) textos.push(textoDoPassoDoTour(p))
  }
  const doTopico = (t: TopicoGeral) => {
    for (const x of t.tarefas) textos.push(textoDaTarefa(x))
    for (const p of t.perguntas) textos.push(textoDaPergunta(p))
  }
  GUIAS.forEach(daArea)
  GUIAS_DO_MEMBRO.forEach(daArea)
  TOPICOS_GERAIS.forEach(doTopico)
  TOPICOS_DO_MEMBRO.forEach(doTopico)
  for (const p of [...BOAS_VINDAS, ...BOAS_VINDAS_ESCOLA, ...BOAS_VINDAS_DO_MEMBRO]) textos.push(textoDoPassoDoTour(p))
  return [...new Set(textos.filter(Boolean))]
}

/** Código → texto, de todos os textos acima. */
export async function indiceDosTextos(): Promise<Map<string, string>> {
  const textos = textosQueSePodemOuvir()
  return new Map(await Promise.all(textos.map(async (t) => [await codigoDoTexto(t), t] as const)))
}
