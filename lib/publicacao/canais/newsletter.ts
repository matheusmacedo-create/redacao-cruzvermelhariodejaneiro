import type { Adapter, Aviso } from './contrato'

/**
 * A newsletter como destino do pacote, ao lado do Instagram e do site.
 *
 * A escolha de fazer dela um canal, e não uma tela própria, é o que faz ela
 * custar quase nada para a redação: quem escreve a matéria marca mais um
 * destino, a IA adapta o texto, o pacote inteiro vai para a mesma aprovação e
 * sai junto com o resto. Ferramenta nova para aprender seria o motivo mais
 * provável de a newsletter não acontecer.
 *
 * Como o site, ela não passa pelo Upload-Post — o conector é o Resend. E, como
 * as redes que citam a matéria, ela sai DEPOIS do site, porque o botão "ler a
 * matéria completa" precisa de uma página que já esteja no ar.
 */
export const newsletter: Adapter = {
  id: 'newsletter',
  nome: 'Newsletter',
  cor: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  formatos: [
    {
      id: 'edicao',
      rotulo: 'Edição',
      // Uma imagem no topo, e olhe lá: cada imagem de e-mail é uma requisição
      // que a maioria dos clientes bloqueia por padrão, e uma mensagem que só
      // faz sentido com as imagens ligadas é uma mensagem que não se lê.
      midia: { min: 0, max: 1, proporcaoPreferida: '1.91:1', video: 'nao' },
      texto: {
        // Não é limite de protocolo: é limite de leitura. Acima disso o Gmail
        // corta a mensagem e mostra "[Mensagem truncada]", com um link que
        // quase ninguém clica — e o link de saída, que fica no rodapé, some
        // junto. Uma newsletter longa demais vira uma que não dá para sair.
        max: 8_000,
        unidade: 'caracteres',
        // O que aparece na lista da caixa de entrada, ao lado do assunto.
        dobra: 140,
        // Hashtag em e-mail não vira link nem alcance: só ruído.
        maxHashtags: 0,
      },
    },
  ],
  camposExtras: [
    {
      chave: 'assunto',
      rotulo: 'Assunto do e-mail',
      tipo: 'texto',
      max: 90,
      dica: 'O que decide se a mensagem é aberta. Até 90 caracteres — o celular corta perto de 40, então ponha o essencial no começo.',
    },
    {
      chave: 'chamada',
      rotulo: 'Chamada',
      tipo: 'texto',
      max: 140,
      dica: 'A linha que a caixa de entrada mostra ao lado do assunto. Em branco, o começo do texto entra no lugar.',
    },
    {
      chave: 'rotuloDoBotao',
      rotulo: 'Texto do botão',
      tipo: 'texto',
      max: 40,
      dica: 'Em branco, "Ler a matéria completa". O botão só aparece quando o pacote também publica no site.',
    },
  ],
  aoGerar(variante, mestre) {
    const assunto = variante.extras.assunto || mestre.titulo || primeiraLinha(mestre.corpo)
    return {
      ...variante,
      extras: {
        ...variante.extras,
        assunto: assunto.slice(0, 90),
        chamada: variante.extras.chamada || (mestre.subtitulo ?? '').slice(0, 140),
      },
    }
  },
  validarExtras(variante): Aviso[] {
    const avisos: Aviso[] = []
    const assunto = variante.extras.assunto?.trim() ?? ''

    if (!assunto) {
      avisos.push({ nivel: 'erro', mensagem: 'A edição precisa de um assunto — é ele que decide se a mensagem é aberta.' })
    } else if (assunto.length > 90) {
      avisos.push({ nivel: 'erro', mensagem: `O assunto tem ${assunto.length} caracteres; o limite é 90.` })
    } else if (assunto.length > 60) {
      avisos.push({ nivel: 'aviso', mensagem: 'Assunto acima de 60 caracteres costuma ser cortado no celular. Ponha o essencial no começo.' })
    }

    // Assunto TODO EM MAIÚSCULA e excesso de exclamação são dois dos sinais que
    // os filtros de spam mais pontuam. Não é superstição: é o que separa a
    // caixa de entrada da pasta de spam.
    if (assunto.length > 8 && assunto === assunto.toUpperCase() && /[A-ZÀ-Ú]/.test(assunto)) {
      avisos.push({ nivel: 'aviso', mensagem: 'Assunto todo em maiúsculas é um dos sinais que os filtros de spam mais pontuam.' })
    }
    if ((assunto.match(/!/g) ?? []).length > 1) {
      avisos.push({ nivel: 'aviso', mensagem: 'Mais de uma exclamação no assunto pesa contra na filtragem de spam.' })
    }

    if (!variante.corpo?.trim()) {
      avisos.push({ nivel: 'erro', mensagem: 'A edição precisa de texto.' })
    }

    return avisos
  },
}

function primeiraLinha(texto: string): string {
  return (texto.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 90)
}
