import { validarImportacao, type PacoteImportado, type Problema } from '@/lib/publicacao/importar-pacote'

/**
 * Importação de ADVERTORIAL por arquivo JSON: o mesmo formato do "Importar
 * pacote" (lib/publicacao/importar-pacote.ts), com `"tipo": "advertorial"` e
 * um bloco `advertorial` com o destino do botão de matrícula.
 *
 * Módulo puro (sem banco, sem rede), conferido por
 * scripts/conferir-importar-advertorial.ts.
 *
 * O advertorial não vira pacote: nasce pelo mesmo caminho da tela
 * (escola_adv_criar), como matéria em rascunho no editor de conteúdo. O que
 * a importação acrescenta é o texto pronto, as fotos no corpo e a troca dos
 * links do curso pelo botão rastreado — o passo que antes era copiar e colar.
 */

const LIMITES = { destino: 800, angulo: 60 } as const

export type AdvertorialImportado = PacoteImportado & {
  advertorial: { destinoUrl: string; angulo: string; campanhaId: string }
}

const eObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Valida o arquivo inteiro: o que vale para a matéria e o bloco do advertorial. */
export function validarAdvertorial(conteudo: string): { advertorial?: AdvertorialImportado; problemas: Problema[] } {
  const { pacote, problemas } = validarImportacao(conteudo)
  let bruto: unknown
  try { bruto = JSON.parse(conteudo) } catch { return { problemas } }
  if (!eObjeto(bruto)) return { problemas }

  if (bruto.tipo !== 'advertorial') problemas.push({ campo: 'tipo', mensagem: 'deve ser "advertorial".' })
  const a = bruto.advertorial
  let destinoUrl = '', angulo = '', campanhaId = ''
  if (!eObjeto(a)) {
    problemas.push({ campo: 'advertorial', mensagem: 'campo obrigatório (objeto com destinoUrl).' })
  } else {
    destinoUrl = typeof a.destinoUrl === 'string' ? a.destinoUrl.trim() : ''
    if (!/^https:\/\/\S+$/.test(destinoUrl)) {
      problemas.push({ campo: 'advertorial.destinoUrl', mensagem: 'informe para onde o botão de matrícula leva (endereço com https://).' })
    } else if (destinoUrl.length > LIMITES.destino) {
      problemas.push({ campo: 'advertorial.destinoUrl', mensagem: `passa do limite de ${LIMITES.destino} caracteres (recebi ${destinoUrl.length}).` })
    }
    if (a.angulo !== undefined && a.angulo !== null && typeof a.angulo !== 'string') {
      problemas.push({ campo: 'advertorial.angulo', mensagem: 'deve ser um texto.' })
    } else {
      angulo = typeof a.angulo === 'string' ? a.angulo.trim() : ''
      if (angulo.length > LIMITES.angulo) {
        problemas.push({ campo: 'advertorial.angulo', mensagem: `passa do limite de ${LIMITES.angulo} caracteres (recebi ${angulo.length}).` })
      }
    }
    if (a.campanhaId !== undefined && a.campanhaId !== null && a.campanhaId !== '') {
      campanhaId = typeof a.campanhaId === 'string' ? a.campanhaId.trim() : ''
      if (!/^[0-9a-f-]{36}$/.test(campanhaId)) problemas.push({ campo: 'advertorial.campanhaId', mensagem: 'deve ser o código (uuid) de uma campanha.' })
    }
  }
  // O slug é a chave contra duplicata: no advertorial ele vem explícito.
  const slugEscrito = eObjeto(bruto.mestre) ? bruto.mestre.slug : undefined
  if (pacote && (typeof slugEscrito !== 'string' || !slugEscrito.trim())) {
    problemas.push({ campo: 'mestre.slug', mensagem: 'no advertorial, o endereço (slug) é obrigatório.' })
  }
  if (!pacote || problemas.length) return { problemas }
  return { problemas, advertorial: { ...pacote, advertorial: { destinoUrl, angulo, campanhaId } } }
}

const semBarraNoFim = (u: string) => u.replace(/\/+$/, '')

/**
 * Troca pelos links do botão rastreado todo link do corpo que aponta para o
 * destino de matrícula (com ou sem barra no fim) e o marcador `{{botao}}`.
 * Devolve quantos trocou: zero quer dizer advertorial sem botão.
 */
export function trocarLinksDoBotao(corpo: string, destinoUrl: string, linkRastreado: string): { corpo: string; trocados: number } {
  let trocados = 0
  const alvo = semBarraNoFim(destinoUrl)
  const novo = corpo
    .replace(/\]\((https:\/\/[^)\s]+)\)/g, (todo, url: string) => {
      if (semBarraNoFim(url) !== alvo) return todo
      trocados++
      return `](${linkRastreado})`
    })
    .replace(/\{\{botao\}\}/g, () => { trocados++; return linkRastreado })
  return { corpo: novo, trocados }
}
