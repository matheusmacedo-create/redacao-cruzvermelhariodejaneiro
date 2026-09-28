/**
 * O que os cartazes com QR têm em comum (chamados por setor, matrícula por
 * curso): a copy escolhida na hora de imprimir e guardada na URL.
 *
 * Uma chamada é um título em duas partes (a segunda em vermelho) e a frase
 * de apoio, com marcadores entre chaves que cada cartaz troca pelos seus
 * dados: {setor}, {a}, {curso}, {descricao}… e listas como {assuntos}. Por
 * cima da chamada, a pessoa pode escrever o próprio título e a própria frase.
 *
 * Puro: as páginas, as barras de opções e as conferências
 * (scripts/conferir-cartaz-dos-chamados.ts, scripts/conferir-cartaz-dos-cursos.ts)
 * usam as mesmas regras.
 */

export type Chamada = { rotulo: string; titulo: readonly [string, string]; texto: string }

/** A chamada já com os marcadores trocados, pronta para a folha e para o seletor. */
export type ChamadaPronta = { chave: string; rotulo: string; titulo: [string, string]; texto: string }

/**
 * O que entra no lugar dos marcadores. Um valor null esconde a chamada que o
 * usa (o cartaz geral não tem {setor}); uma lista vazia também. A string
 * vazia vale: "{a} {setor}" com a = "" vira só o nome.
 */
export type Marcadores = {
  valores: Record<string, string | null | undefined>
  listas?: Record<string, { itens: readonly string[]; maximo: number; separador: string }>
}

export const MAXIMO_DO_TITULO = 48
export const MAXIMO_DO_TEXTO = 160
/** Um título montado com nome comprido pode passar do máximo do título livre; a folha encolhe a letra até aqui. */
export const MAXIMO_DO_TITULO_MONTADO = 60

/** O corpo do título na folha, pelo tamanho: até 34 caracteres em 36 pt, até 48 em 30 pt, até 60 em 25 pt, o resto em 21 pt. */
export function tamanhoDoTitulo(titulo: readonly [string, string]): 'grande' | 'medio' | 'pequeno' | 'minusculo' {
  const n = `${titulo[0]} ${titulo[1]}`.trim().length
  return n <= 34 ? 'grande' : n <= 48 ? 'medio' : n <= MAXIMO_DO_TITULO_MONTADO ? 'pequeno' : 'minusculo'
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Troca os marcadores de uma chamada. Devolve null quando falta o que ela
 * pede: a chamada some do seletor em vez de sair com buraco. Marcador que o
 * cartaz não conhece fica como está (a conferência acusa).
 */
export function montarChamada(chave: string, c: Chamada, m: Marcadores): ChamadaPronta | null {
  const trocar = (t: string): string | null => {
    let faltou = false
    const pronto = t.replace(/\{([a-z]+)\}/g, (marcador, nome: string) => {
      const lista = m.listas?.[nome]
      if (lista) {
        if (!lista.itens.length) faltou = true
        return lista.itens.slice(0, lista.maximo).join(lista.separador)
      }
      if (nome in m.valores) {
        const v = m.valores[nome]
        if (v === null || v === undefined) faltou = true
        return v ?? ''
      }
      return marcador
    })
    return faltou ? null : pronto.replace(/\s+/g, ' ').replace(/\s+([.,;:?!])/g, '$1').trim()
  }
  const t1 = trocar(c.titulo[0]), t2 = trocar(c.titulo[1]), texto = trocar(c.texto)
  if (t1 === null || t2 === null || texto === null) return null
  // A segunda parte continua a frase ("Fale com / a Manutenção.") — só ganha maiúscula quando começa uma.
  const segundaComeca = t1 === '' || /[.?!:]$/.test(t1)
  return { chave, rotulo: c.rotulo, titulo: [capitalizar(t1), segundaComeca ? capitalizar(t2) : t2], texto: capitalizar(texto) }
}

/** Monta uma lista de chamadas, pulando as que não cabem neste cartaz. */
export function montarChamadas(fonte: Iterable<[string, Chamada]>, m: Marcadores): ChamadaPronta[] {
  const prontas: ChamadaPronta[] = []
  for (const [chave, c] of fonte) { const p = montarChamada(chave, c, m); if (p) prontas.push(p) }
  return prontas
}

// ------------------------------------------------------------------ as opções na URL

/** `alvo` é o setor ou o curso (o nome do parâmetro é de cada cartaz: "fila", "curso"). */
export type OpcoesDoCartaz = { alvo: string; chamada: string; titulo: string; texto: string }

type Parametros = URLSearchParams | Record<string, string | string[] | undefined>
const ler = (p: Parametros, k: string): string | undefined => {
  const v = p instanceof URLSearchParams ? p.get(k) ?? undefined : p[k]
  return Array.isArray(v) ? v[0] : v
}
/** Sem quebras, espaços repetidos ou caracteres de controle, e cortado no máximo. */
const limpar = (v: string | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()

/** Lê as opções da URL. Chamada fora do formato volta à padrão; o alvo a página resolve (slug, id ou o geral). */
export function lerOpcoes(p: Parametros, chaveDoAlvo: string, chamadaPadrao: string): OpcoesDoCartaz {
  const chamada = ler(p, 'chamada') ?? ''
  return {
    alvo: limpar(ler(p, chaveDoAlvo), 60),
    chamada: /^[a-z0-9-]{1,40}$/.test(chamada) ? chamada : chamadaPadrao,
    titulo: limpar(ler(p, 'titulo'), MAXIMO_DO_TITULO),
    texto: limpar(ler(p, 'texto'), MAXIMO_DO_TEXTO),
  }
}

/** A query string das opções, sem o que já é padrão. */
export function paraAUrl(o: OpcoesDoCartaz, chaveDoAlvo: string, chamadaPadrao: string): string {
  const q = new URLSearchParams()
  if (o.alvo) q.set(chaveDoAlvo, o.alvo)
  if (o.chamada !== chamadaPadrao) q.set('chamada', o.chamada)
  if (o.titulo) q.set('titulo', o.titulo)
  if (o.texto) q.set('texto', o.texto)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * A chamada que vai para a folha: a escolhida (ou a primeira da lista, se a
 * chave não vale aqui), com o título e a frase da pessoa por cima. No título
 * livre, "|" separa a parte em vermelho: "Quebrou?|Chame a Manutenção.".
 */
export function chamadaFinal(o: OpcoesDoCartaz, lista: readonly ChamadaPronta[]): ChamadaPronta {
  const base = lista.find((c) => c.chave === o.chamada) ?? lista[0]
  if (!o.titulo) return { ...base, texto: o.texto || base.texto }
  const [t1, ...resto] = o.titulo.split('|')
  return { ...base, titulo: [t1.trim(), resto.join('|').trim()], texto: o.texto || base.texto }
}
