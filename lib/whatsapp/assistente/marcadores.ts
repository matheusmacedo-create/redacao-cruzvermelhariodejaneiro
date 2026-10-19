/**
 * Os marcadores do assistente do WhatsApp (apr_1, pes_3…): o único jeito de o modelo apontar para um item. O
 * código emite um marcador para cada item que mostra (no contexto ou num resultado de ferramenta) e, quando o
 * modelo devolve um, resolve para o uuid — conferindo o tipo. Marcador desconhecido, vencido ou de outro tipo não
 * resolve. Módulo puro — conferido por `npx tsx scripts/conferir-assistente.ts`.
 *
 * A memória curta (whatsapp_ia_memoria.refs) guarda só isto: marcador → (tipo, uuid). O CHECK do banco recusa
 * qualquer outra coisa (private.whatsapp_refs_validas), então nenhum texto da conversa fica guardado.
 */

export type TipoDeItem = 'aprovacao' | 'chamado' | 'pessoa' | 'aviso' | 'visita' | 'fila' | 'assunto' | 'despesa' | 'compra' | 'veiculo' | 'item' | 'oficio'

/** O prefixo de cada tipo. [onda 2] des, com, vei, ite e ofi ainda sem ferramenta. */
export const PREFIXOS: Record<TipoDeItem, string> = {
  aprovacao: 'apr', chamado: 'cha', pessoa: 'pes', aviso: 'avi', visita: 'vis', fila: 'fil', assunto: 'ass',
  despesa: 'des', compra: 'com', veiculo: 'vei', item: 'ite', oficio: 'ofi',
}

const TIPO_DO_PREFIXO = Object.fromEntries(Object.entries(PREFIXOS).map(([tipo, prefixo]) => [prefixo, tipo])) as Record<string, TipoDeItem>

/** Como o banco guarda (whatsapp_ia_memoria: refs e proximo). */
export type RefDoMarcador = { t: TipoDeItem; id: string }
export type MemoriaDeMarcadores = { refs: Record<string, RefDoMarcador>; proximo: number }

/** Os tetos do banco: até 60 marcadores guardados, numerados de 1 a 999. */
export const MARCADORES_GUARDADOS = 60
export const MAIOR_NUMERO = 999

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MARCADOR = /^([a-z]{3})_([0-9]{1,3})$/

export class TabelaDeMarcadores {
  /** Em ordem de uso: o mais recente no fim (é o que fica quando passa de MARCADORES_GUARDADOS). */
  private refs = new Map<string, RefDoMarcador>()
  private proximo = 1

  /** A tabela da memória guardada; o que não estiver no formato é descartado (memória vazia = tabela nova). */
  static de(memoria?: { refs?: unknown; proximo?: unknown } | null): TabelaDeMarcadores {
    const tabela = new TabelaDeMarcadores()
    const refs = memoria?.refs && typeof memoria.refs === 'object' && !Array.isArray(memoria.refs) ? memoria.refs as Record<string, unknown> : {}
    for (const [marcador, ref] of Object.entries(refs)) {
      const m = MARCADOR.exec(marcador)
      const r = ref && typeof ref === 'object' ? ref as Record<string, unknown> : null
      const tipo = m ? TIPO_DO_PREFIXO[m[1]] : undefined
      if (!m || !r || !tipo || r.t !== tipo || typeof r.id !== 'string' || !UUID.test(r.id)) continue
      tabela.refs.set(marcador, { t: tipo, id: r.id })
    }
    const proximo = Number(memoria?.proximo)
    tabela.proximo = Number.isInteger(proximo) && proximo >= 1 && proximo <= MAIOR_NUMERO ? proximo : 1
    return tabela
  }

  /** O marcador de um item: o mesmo uuid do mesmo tipo reaproveita o marcador que já tinha. null se o id não é uuid. */
  emitir(tipo: TipoDeItem, id: string): string | null {
    const uuid = String(id ?? '').toLowerCase()
    if (!UUID.test(uuid) || !PREFIXOS[tipo]) return null
    for (const [marcador, ref] of this.refs) {
      if (ref.t === tipo && ref.id === uuid) {
        this.refs.delete(marcador)
        this.refs.set(marcador, ref)
        return marcador
      }
    }
    const marcador = `${PREFIXOS[tipo]}_${this.numeroLivre()}`
    this.refs.set(marcador, { t: tipo, id: uuid })
    return marcador
  }

  /** O uuid de um marcador, se ele existe e é do tipo pedido; null para o resto. */
  resolver(marcador: string, tipo: TipoDeItem): string | null {
    const ref = this.refs.get(String(marcador ?? ''))
    return ref && ref.t === tipo ? ref.id : null
  }

  /** O tipo de um marcador conhecido; null se não existe. */
  tipoDe(marcador: string): TipoDeItem | null {
    return this.refs.get(String(marcador ?? ''))?.t ?? null
  }

  /** Para gravar na memória: os MARCADORES_GUARDADOS usados mais recentemente e o próximo número. */
  paraGravar(): MemoriaDeMarcadores {
    const entradas = [...this.refs.entries()].slice(-MARCADORES_GUARDADOS)
    return { refs: Object.fromEntries(entradas.map(([m, r]) => [m, { t: r.t, id: r.id }])), proximo: this.proximo }
  }

  /** O próximo número, de 1 a 999; acabou, volta ao menor que não está em uso (a memória dura 30 min: não chega lá). */
  private numeroLivre(): number {
    const usados = new Set([...this.refs.keys()].map((m) => Number(m.split('_')[1])))
    let n = this.proximo
    for (let i = 0; i < MAIOR_NUMERO && usados.has(n); i++) n = n >= MAIOR_NUMERO ? 1 : n + 1
    this.proximo = n >= MAIOR_NUMERO ? 1 : n + 1
    return n
  }
}
