import { validarImportacao, type MidiaImportada, type Problema } from '@/lib/publicacao/importar-pacote'

/**
 * Importação no modo "atualizar": corrige por JSON uma matéria que já existe
 * num pacote (achada pelo `mestre.slug`), em vez de criar outra.
 *
 * Módulo puro (sem banco, sem rede), conferido por
 * scripts/conferir-importar-pacote.ts. Os limites são os MESMOS da criação:
 * em vez de repeti-los, o arquivo passa por validarImportacao com o que só a
 * criação exige (origem, agendarPara) já resolvido.
 *
 * Diferenças para a criação:
 * - `mestre.slug` é obrigatório: é por ele que o pacote é achado, e ele nunca
 *   muda (os links já compartilhados continuam valendo);
 * - `subtitulo` e `notas` ausentes mantêm o que está no pacote; presentes,
 *   mesmo vazios, substituem;
 * - `midias` ausente ou vazia mantém fotos e legendas atuais; com itens,
 *   substitui as duas coisas;
 * - `tituloInterno`, `origem` e `agendarPara` são ignorados: o nome interno
 *   e a agenda do pacote não mudam por aqui.
 *
 * Saber o modo do arquivo (a tela precisa) está em ./modo-da-importacao.ts,
 * que não puxa node:crypto para o navegador.
 */

export type AtualizacaoImportada = {
  slug: string
  titulo: string
  corpo: string
  /** undefined = manter o que está no pacote. */
  subtitulo?: string
  notas?: string
  /** Vazia = manter fotos e legendas atuais. */
  midias: MidiaImportada[]
}

const eObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lê o arquivo no modo atualizar e devolve a correção já limpa, ou a lista de problemas. */
export function validarAtualizacao(conteudo: string): { atualizacao?: AtualizacaoImportada; problemas: Problema[] } {
  let bruto: unknown
  try { bruto = JSON.parse(conteudo) } catch {
    return { problemas: [{ campo: 'arquivo', mensagem: 'não é um JSON válido.' }] }
  }
  if (!eObjeto(bruto)) return { problemas: [{ campo: 'arquivo', mensagem: 'o JSON deve ser um objeto.' }] }
  if (bruto.modo !== 'atualizar') return { problemas: [{ campo: 'modo', mensagem: 'deve ser "atualizar".' }] }

  const problemas: Problema[] = []
  const m = bruto.mestre
  // Sem slug, a criação inventaria um a partir do título — aqui isso acharia
  // o pacote errado (ou nenhum). Exigido antes de tudo.
  const slugBruto = eObjeto(m) ? m.slug : undefined
  if (typeof slugBruto !== 'string' || !slugBruto.trim()) {
    problemas.push({ campo: 'mestre.slug', mensagem: 'obrigatório no modo "atualizar": é por ele que a matéria é achada.' })
  }

  // O resto passa pela validação da criação, com os mesmos limites. O que a
  // criação exige e a atualização ignora entra resolvido.
  // (undefined some no JSON.stringify.)
  const comoCriacao = { ...bruto, modo: undefined, origem: 'livre', agendarPara: null, tituloInterno: undefined }
  const { pacote, problemas: daCriacao } = validarImportacao(JSON.stringify(comoCriacao))
  problemas.push(...daCriacao)
  if (problemas.length || !pacote) return { problemas }

  const mestre = m as Record<string, unknown>
  const presente = (chave: string) => mestre[chave] !== undefined && mestre[chave] !== null
  return {
    problemas,
    atualizacao: {
      slug: pacote.mestre.slug,
      titulo: pacote.mestre.titulo,
      corpo: pacote.mestre.corpo,
      ...(presente('subtitulo') ? { subtitulo: pacote.mestre.subtitulo } : {}),
      ...(presente('notas') ? { notas: pacote.mestre.notas } : {}),
      midias: pacote.midias,
    },
  }
}

/** O que está no pacote hoje, do jeito que o resumo precisa. */
export type MestreAtual = { titulo: string; subtitulo: string; corpo: string; notas: string; fotos: number }

/** As mudanças em linguagem de gente, para a tela mostrar antes de confirmar. */
export function resumoDasMudancas(atual: MestreAtual, nova: AtualizacaoImportada): string[] {
  const linhas: string[] = []
  if (atual.titulo !== nova.titulo) linhas.push(`Título: “${atual.titulo || '(vazio)'}” → “${nova.titulo}”`)
  if (nova.subtitulo !== undefined && atual.subtitulo !== nova.subtitulo) {
    linhas.push(nova.subtitulo ? 'Linha fina: muda.' : 'Linha fina: será apagada.')
  }
  if (atual.corpo !== nova.corpo) {
    const dif = nova.corpo.length - atual.corpo.length
    linhas.push(`Texto: muda (${dif === 0 ? 'mesmo tamanho' : `${dif > 0 ? '+' : ''}${dif} caracteres`}).`)
  }
  if (nova.notas !== undefined && atual.notas !== nova.notas) {
    linhas.push(nova.notas ? 'Notas internas: mudam.' : 'Notas internas: serão apagadas.')
  }
  if (nova.midias.length) {
    linhas.push(`Fotos: as ${atual.fotos} atuais saem e entram ${nova.midias.length} nova${nova.midias.length === 1 ? '' : 's'}, com as legendas do arquivo.`)
  } else {
    linhas.push('Fotos e legendas: ficam como estão.')
  }
  return linhas
}
