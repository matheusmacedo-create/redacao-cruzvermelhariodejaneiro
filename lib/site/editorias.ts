/**
 * As editorias do jornal — em que caderno cada matéria sai em /noticias/.
 *
 * O banco não guarda editoria: ela é lida do título e do endereço da matéria,
 * por palavras. É o que troca o chapéu "Notícias", igual em todas as chamadas,
 * pelo assunto de cada uma, e o que deixa a primeira página se dividir em
 * cadernos, como num jornal.
 *
 * Módulo puro (sem banco, sem rede), conferido por
 * `npx tsx scripts/conferir-indice-noticias.ts`.
 *
 * A ORDEM das regras decide os empates e foi escolhida de propósito:
 * "Curso de primeiros socorros" é Cursos, não Primeiros socorros;
 * "Voluntariado para idosos" é Voluntariado, não Cuidado.
 * Matéria que nenhuma regra reconhece sai em "Rio de Janeiro", o caderno geral.
 */

export type Editoria = {
  /** Âncora do caderno na página (#cursos) — não mude sem motivo: é endereço público. */
  id: string
  nome: string
}

export const EDITORIA_GERAL: Editoria = { id: 'rio', nome: 'Rio de Janeiro' }

const REGRAS: { editoria: Editoria; padrao: RegExp }[] = [
  {
    editoria: { id: 'cursos', nome: 'Cursos e formação' },
    padrao: /\bcursos?\b|bombeiros? civi[ls]|brigadista|lei kiss|homologacao|\bsbv\b|suporte basico de vida|quem pode ministrar/,
  },
  {
    editoria: { id: 'voluntariado', nome: 'Voluntariado' },
    padrao: /voluntari/,
  },
  {
    editoria: { id: 'movimento', nome: 'História e Movimento' },
    padrao: /convenc(ao|oes) de genebra|protocolos adicionais|\bdih\b|dunant|solferino|\bcicv\b|comite internacional|federacao internacional|\bifrc\b|cristal vermelho|crescente vermelho|emblema|guerra|oswaldo cruz|gripe espanhola|hospital da cruz vermelha|escola de enfermagem|e ong|em farmacia|lacos familiares/,
  },
  {
    editoria: { id: 'emergencias', nome: 'Emergências e clima' },
    padrao: /enchente|inundac|alagament|vendaval|deslizament|\braios?\b|sirene|defesa civil|onda de calor|falta de luz|estagios operacionais|plano familiar|leptospirose|dengue|ressaca|temporal|chuva/,
  },
  {
    editoria: { id: 'cuidado', nome: 'Cuidado com idosos' },
    padrao: /idos[oa]s?\b|cuidador|acamad|lesao por pressao/,
  },
  {
    editoria: { id: 'primeiros-socorros', nome: 'Primeiros socorros' },
    padrao: /primeiros socorros|lei lucas|engasg|desmai|infarto|\bavc\b|picada|fratura|choque eletrico|afogament|sangrament|insolac|bateu a cabeca|acidente|\b192\b/,
  },
]

/** Os cadernos na ordem em que aparecem na página. Cursos fica por último: o jornal não abre vendendo curso. */
export const ORDEM_DOS_CADERNOS: Editoria[] = [
  'primeiros-socorros', 'emergencias', 'voluntariado', 'cuidado', 'movimento', 'rio', 'cursos',
].map((id) => (id === EDITORIA_GERAL.id ? EDITORIA_GERAL : REGRAS.find((r) => r.editoria.id === id)!.editoria))

/** Minúsculas, sem acento e sem pontuação — "Convenções de Genebra" e "convencoes-de-genebra" viram o mesmo texto. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A editoria de uma matéria, pelo título e pelo fim do endereço (o slug guarda palavras que um título revisto perdeu). */
export function editoriaDaMateria(titulo: string, url = ''): Editoria {
  const slug = url.replace(/\/+$/, '').split('/').pop() ?? ''
  const texto = ` ${normalizar(titulo)} ${normalizar(slug)} `
  return REGRAS.find((r) => r.padrao.test(texto))?.editoria ?? EDITORIA_GERAL
}
