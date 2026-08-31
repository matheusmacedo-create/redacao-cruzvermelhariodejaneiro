import { randomBytes } from 'node:crypto'

/**
 * As regras da inscrição, separadas de onde ela acontece.
 *
 * Módulo puro de propósito: validar endereço é a parte que mais erra e a que
 * mais barato se testa. O que depende de banco e de rede fica na rota.
 */

/**
 * O texto que a pessoa aceita ao se inscrever.
 *
 * Fica aqui, numa constante, porque uma cópia dele é gravada em cada linha da
 * lista: se amanhã a redação mudar a redação do aviso, o que foi aceito ontem
 * continua registrado como era. É isso que a LGPD pede para poder provar o
 * consentimento — e é por isso que ele não pode ser montado na tela.
 */
export const TEXTO_DO_CONSENTIMENTO =
  'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu '
  + 'e-mail notícias, campanhas e informações sobre cursos. Sei que posso sair da lista '
  + 'a qualquer momento pelo link presente em todas as mensagens.'

/** Limites do protocolo (RFC 5321), não invenção nossa. */
const MAX_TOTAL = 254
const MAX_LOCAL = 64

/**
 * Normaliza e valida um endereço.
 *
 * Devolve o endereço pronto para gravar, ou null se não for aproveitável.
 *
 * A validação é deliberadamente permissiva no formato e rígida no que
 * quebraria o envio: endereço de verdade é mais estranho do que a maioria das
 * expressões regulares supõe (o "+" das etiquetas do Gmail é o exemplo diário),
 * e recusar um endereço bom é pior do que aceitar um ruim — o ruim a
 * confirmação por e-mail filtra sozinha, o bom vira uma pessoa que desistiu.
 */
export function normalizarEmail(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  // \s pega tabulação e quebra de linha, que colagem de planilha traz junto.
  const limpo = bruto.trim().toLowerCase().replace(/\s+/g, '')
  if (!limpo || limpo.length > MAX_TOTAL) return null

  // Exatamente uma arroba: nem zero, nem duas.
  const partes = limpo.split('@')
  if (partes.length !== 2) return null
  const [local, dominio] = partes

  if (!local || local.length > MAX_LOCAL) return null
  if (!dominio || dominio.length > 253) return null

  // Ponto no começo, no fim ou dobrado não existe em endereço válido, e é a
  // assinatura de campo digitado com pressa.
  if (/^\.|\.$|\.\./.test(local) || /^\.|\.$|\.\./.test(dominio)) return null

  // Domínio precisa de um ponto e de um TLD com pelo menos duas letras: sem
  // isso, "fulano@localhost" e "fulano@gmail" entrariam na lista para virar
  // devolução na primeira remessa.
  if (!/^[a-z0-9.-]+$/.test(dominio)) return null
  if (!/\.[a-z]{2,}$/.test(dominio)) return null
  if (/^-|-$/.test(dominio.replace(/\..*/, ''))) return null

  // Caracteres que o SMTP aceita no local sem precisar de aspas.
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return null

  return limpo
}

/**
 * Limpa o nome digitado.
 *
 * Corta em 80 porque o nome vai no "Olá, fulano" do e-mail; e tira caracteres
 * de controle porque nome vindo de formulário público entra em HTML depois.
 * (O escape do HTML continua sendo feito na hora de montar a mensagem — isto
 * aqui é a primeira barreira, não a única.)
 */
export function normalizarNome(bruto: unknown): string {
  if (typeof bruto !== 'string') return ''
  return bruto
    // Escapes, não os caracteres literais: caractere de controle cru no
    // fonte transforma o arquivo em binário para o git e para o grep.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * Token de uso único para os links de confirmação e de saída.
 *
 * 24 bytes de aleatoriedade criptográfica. Não pode ser Math.random nem
 * derivado do e-mail: quem adivinhasse o token de saída de terceiros poderia
 * descadastrar a lista inteira, e quem adivinhasse o de confirmação inscreveria
 * o endereço de outra pessoa sem ela clicar em nada.
 */
export function novoToken(): string {
  return randomBytes(24).toString('hex')
}

/** Quanto tempo o convite de confirmação vale. */
export const HORAS_PARA_CONFIRMAR = 72

export function prazoDeConfirmacao(agora = new Date()): string {
  return new Date(agora.getTime() + HORAS_PARA_CONFIRMAR * 3600_000).toISOString()
}

/**
 * O endereço de IP de quem enviou o formulário, para o registro de consentimento.
 *
 * Atrás da borda da Vercel, o IP da conexão é o do proxy; o de verdade vem no
 * cabeçalho. Pega-se o PRIMEIRO da lista do x-forwarded-for porque é o do
 * cliente — os seguintes são os proxies do caminho. Cabeçalho é forjável, mas
 * aqui ele serve como registro do consentimento, não como controle de acesso.
 */
export function ipDoPedido(cabecalhos: Headers): string | null {
  const encadeado = cabecalhos.get('x-forwarded-for')
  const primeiro = encadeado?.split(',')[0]?.trim()
  const bruto = primeiro || cabecalhos.get('x-real-ip')?.trim() || ''
  // A coluna é inet: valor que não for endereço faria o insert inteiro falhar.
  return /^[0-9a-f:.]+$/i.test(bruto) && bruto.length >= 3 ? bruto : null
}
