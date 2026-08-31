import type { Adapter, Aviso } from './contrato'

/**
 * O conector remove do texto qualquer endereço que o X transformaria em link
 * clicável — schemes, www., encurtadores e domínio com caminho — antes de
 * publicar, porque o X cobra 13× mais por post com link. Não é opção nossa e
 * não dá para desligar aqui: o que dá é avisar antes, em vez de deixar a
 * chamada para a ação sumir depois de publicada.
 */
const LINK_NO_TEXTO = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.[a-z]{2,}\/\S+)/i

export const x: Adapter = {
  id: 'x',
  nome: 'X',
  cor: 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200',
  formatos: [
    // 280 é a dobra, não o teto: acima disso o conector quebra em thread
    // automaticamente. O aviso existe para ninguém publicar uma thread sem
    // querer; o erro só vem no limite real.
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 25_000, unidade: 'ponderado_x', dobra: 280 } },
    { id: 'feed', rotulo: 'Post', midia: { min: 0, max: 4, proporcaoPreferida: '16:9', video: 'permitido' },
      texto: { max: 25_000, unidade: 'ponderado_x', dobra: 280 } },
  ],
  camposExtras: [],
  validarExtras(variante): Aviso[] {
    if (LINK_NO_TEXTO.test(variante.corpo)) {
      return [{
        nivel: 'aviso',
        mensagem: 'O X publica sem o link: o conector remove endereços clicáveis do texto. Deixe a chamada para a ação sem depender do link.',
      }]
    }
    return []
  },
}
