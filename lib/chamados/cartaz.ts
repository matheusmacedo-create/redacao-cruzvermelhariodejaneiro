import { descricaoCurta, MAXIMO_DO_TEXTO, montarChamadas, type Chamada, type ChamadaPronta, type Marcadores } from '@/lib/cartaz/copy'

/**
 * O cartaz com QR de cada fila de chamados (/chamados/cartaz): o QR leva a
 * /chamado?fila=<slug>, que abre "Abrir chamado" já na fila (com a sessão) ou
 * passa pelo login e volta para lá. Sem fila (o cartaz geral, de todos os
 * setores), o QR abre o formulário em que a pessoa escolhe o setor.
 *
 * A copy é escolhida na hora de imprimir (lib/cartaz/copy.ts): chamadas
 * genéricas (valem para qualquer setor), chamadas escritas para os setores
 * conhecidos (lib/chamados/cartaz-copy.ts, pelo prefixo do modelo em
 * lib/chamados/setores.ts) e as do cartaz geral, mais título e frase livres.
 *
 * Puro: a página, a rota e a conferência
 * (`npx tsx scripts/conferir-cartaz-dos-chamados.ts`) usam as mesmas regras.
 */

/** O mesmo formato do banco (chamado_filas.slug). */
export const ehSlugDaFila = (valor: unknown): valor is string => typeof valor === 'string' && /^[a-z0-9-]{2,40}$/.test(valor)

/** O "setor" do cartaz geral: o QR abre o formulário sem fila, e a pessoa escolhe. Fora do formato de slug, para nunca colidir com uma fila. */
export const FILA_GERAL = '_todos'

/** O endereço curto que vai no QR. Sem slug, o cartaz geral. */
export function linkDoCartaz(base: string, slug: string | null): string {
  const raiz = `${base.replace(/\/+$/, '')}/chamado`
  return slug ? `${raiz}?fila=${encodeURIComponent(slug)}` : raiz
}

/** Onde abrir o chamado dentro do Palácio. */
export const formularioDaFila = (slug: string) => `/chamados/novo?fila=${encodeURIComponent(slug)}`

/**
 * Para onde voltar depois de entrar (?voltar=), só se for um caminho do próprio
 * Palácio: começa com uma barra e não é "//outro-site" nem "/\\outro-site" (que
 * o navegador trataria como outro endereço). Qualquer outra coisa: o Início.
 */
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > 300) return null
  if (!valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return null
  if (/[\u0000-\u001f\s]/.test(valor)) return null
  // Dentro do Palácio, e não de volta para a própria entrada.
  if (valor === '/' || valor.startsWith('/?')) return null
  return valor
}

/** Os três passos impressos no cartaz. */
export const PASSOS_DO_CARTAZ = [
  'Aponte a câmera do celular para o código.',
  'Entre com o seu usuário do Palácio Virtual.',
  'Descreva o pedido e acompanhe a resposta pelo Palácio Virtual.',
] as const

// ------------------------------------------------------------------ a copy

/**
 * Marcadores deste cartaz (lib/cartaz/copy.ts):
 *   {setor}     o nome da fila            "Manutenção"
 *   {a} {setor} com o artigo do setor     "a Manutenção", "o setor de Compras"
 *   {de} {setor} o artigo contraído com "de" "da Manutenção", "do setor de Compras"
 *   {descricao} a descrição da fila, se cabe na folha (ou a primeira frase, ou o texto padrão)
 *   {assuntos}  os assuntos ativos da fila, até 4, separados por " · "
 *   {setores}   os setores que recebem chamados, até 5 "e outros" (só no cartaz geral)
 * Nunca o nome do setor por extenso: a fila pode ser renomeada.
 */
export type SetorDoCartaz = {
  nome: string
  /** "a", "o", "o setor de"… (lib/chamados/setores.ts, artigoDoSetor). */
  artigo: string
  descricao: string | null
  /** Os assuntos ativos do catálogo da fila. */
  assuntos: readonly string[]
  /** O prefixo do modelo de setor, quando o nome casa com um (TI, MAN, COM…); é a chave da copy escrita para ele. */
  prefixo: string | null
}

/** A copy escrita para cada setor conhecido, pelo prefixo do modelo: lib/chamados/cartaz-copy.ts. */
export type CopyPorModelo = Record<string, Record<string, Chamada>>

export const PARAMETRO_DA_FILA = 'fila'
export const CHAVE_PADRAO = 'precisa'
export const TEXTO_PADRAO = 'Abra um chamado pelo celular e acompanhe a resposta.'

/** Valem para qualquer setor, sem supor o que ele atende. A primeira é a de sempre. */
export const CHAMADAS_GENERICAS: Record<string, Chamada> = {
  precisa: { rotulo: 'Precisa de…?', titulo: ['Precisa', '{de} {setor}?'], texto: '{descricao}' },
  direto: { rotulo: 'Fale direto', titulo: ['Fale com', '{a} {setor}.'], texto: 'O chamado leva o seu pedido a quem atende, com prazo de resposta, e você acompanha tudo pelo celular.' },
  catalogo: { rotulo: 'O que o setor atende', titulo: ['{setor} atende', 'por chamado.'], texto: 'Atende: {assuntos}. Abra um chamado e acompanhe a resposta.' },
  'no-ar': { rotulo: 'Pediu e ficou no ar?', titulo: ['Pediu e ficou no ar?', 'Abra um chamado.'], texto: 'Pedido de corredor se perde. O chamado fica registrado, com número e prazo, e {a} {setor} responde por ali mesmo.' },
  recado: { rotulo: 'Não fique só no recado', titulo: ['Não fique só no recado.', 'Abra um chamado.'], texto: 'O pedido para {a} {setor} fica registrado, com prazo de resposta, e você acompanha cada passo no Palácio Virtual.' },
  corredor: { rotulo: 'Pediu no corredor? Registre.', titulo: ['Pediu no corredor?', 'Registre.'], texto: 'Por chamado, {a} {setor} recebe, responde e você acompanha, com prazo.' },
}

/** O cartaz geral: o QR abre o formulário sem fila. */
export const CHAMADAS_DO_GERAL: Record<string, Chamada> = {
  precisa: { rotulo: 'Precisa de outro setor?', titulo: ['Precisa de', 'outro setor?'], texto: 'Abra um chamado: {setores}. Você escolhe o setor, e ele responde pelo Palácio, com prazo.' },
  outro: { rotulo: 'Travou, faltou ou venceu?', titulo: ['Travou, faltou ou venceu?', 'Abra um chamado.'], texto: 'Escolha o setor no formulário: o pedido fica registrado, com número e prazo, e chega a quem resolve.' },
  quem: { rotulo: 'Não sabe a quem pedir?', titulo: ['Não sabe a quem pedir?', 'Abra um chamado.'], texto: 'Escolha o setor na lista e descreva o que precisa. O chamado tem número, prazo de resposta e histórico, e você acompanha no Palácio.' },
  caminho: { rotulo: 'Qualquer setor, um só caminho', titulo: ['Qualquer setor,', 'um só caminho.'], texto: 'Todo pedido entre setores vira chamado: com número, prazo e resposta no Palácio.' },
}

/** Os marcadores de um setor (ou do cartaz geral, sem setor). */
export function marcadoresDoCartaz(setor: SetorDoCartaz | null, setores: readonly string[]): Marcadores {
  return {
    valores: {
      setor: setor?.nome ?? null,
      a: setor ? setor.artigo : null,
      // "a" → "da", "o setor de" → "do setor de"; sem artigo, só "de".
      de: setor ? (setor.artigo ? `d${setor.artigo}` : 'de') : null,
      descricao: setor ? descricaoCurta(setor.descricao, MAXIMO_DO_TEXTO, TEXTO_PADRAO) : null,
    },
    listas: { assuntos: { itens: setor?.assuntos ?? [], maximo: 4, separador: ' · ' }, setores: { itens: setores, maximo: 5, separador: ', ', resto: ' e outros' } },
  }
}

/**
 * As chamadas que valem para este cartaz, na ordem do seletor: a de sempre,
 * as escritas para o setor, as outras genéricas. No cartaz geral, as do geral.
 */
export function chamadasDoCartaz(setor: SetorDoCartaz | null, setores: readonly string[], porModelo: CopyPorModelo): ChamadaPronta[] {
  const fonte: [string, Chamada][] = setor
    ? [
      [CHAVE_PADRAO, CHAMADAS_GENERICAS[CHAVE_PADRAO]],
      ...Object.entries(setor.prefixo ? porModelo[setor.prefixo] ?? {} : {}),
      ...Object.entries(CHAMADAS_GENERICAS).filter(([k]) => k !== CHAVE_PADRAO),
    ]
    : Object.entries(CHAMADAS_DO_GERAL)
  return montarChamadas(fonte, marcadoresDoCartaz(setor, setores))
}
