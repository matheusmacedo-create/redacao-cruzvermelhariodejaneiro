import 'server-only'
import { Client } from 'basic-ftp'
import { Readable, Writable } from 'node:stream'

export type FtpConfig = { host: string; user: string; password: string; baseDir: string }

/** Como negociar TLS. A ordem aqui é da mais segura para a menos segura. */
export type TlsMode = 'ftps-estrito' | 'ftps-sem-verificar' | 'sem-tls'

export class FtpConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Faltam variáveis de ambiente do FTP: ${missing.join(', ')}.`)
    this.name = 'FtpConfigError'
  }
}

/**
 * Lê a configuração do FTP do ambiente. Nenhuma destas variáveis pode ganhar o
 * prefixo NEXT_PUBLIC_: isso mandaria a senha do site para o navegador de
 * qualquer visitante.
 */
export function ftpConfig(): FtpConfig {
  const host = process.env.FTP_HOST
  const user = process.env.FTP_USER
  const password = process.env.FTP_PASSWORD
  const baseDir = process.env.FTP_BASE_DIR || '/'

  const missing = [
    ['FTP_HOST', host],
    ['FTP_USER', user],
    ['FTP_PASSWORD', password],
  ].filter(([, value]) => !value).map(([name]) => name as string)

  if (missing.length) throw new FtpConfigError(missing)
  return { host: host!, user: user!, password: password!, baseDir }
}

/**
 * O modo padrão de produção. `ftps-estrito` exige certificado válido, o que só
 * funciona quando FTP_HOST é um nome — certificado não casa com endereço IP.
 * `FTP_TLS_INSECURE=1` afrouxa a verificação: a sessão continua cifrada contra
 * escuta passiva, mas deixa de provar com quem estamos falando.
 */
export function defaultTlsMode(): TlsMode {
  return process.env.FTP_TLS_INSECURE === '1' ? 'ftps-sem-verificar' : 'ftps-estrito'
}

/**
 * Abre uma sessão e garante o fechamento, inclusive em caso de erro — conexão
 * pendurada consome slot no servidor compartilhado da Hostinger.
 *
 * FTPS aqui é o explícito: AUTH TLS na mesma porta 21, não uma porta separada.
 */
export async function withFtp<T>(
  run: (client: Client, config: FtpConfig) => Promise<T>,
  mode: TlsMode = defaultTlsMode(),
  timeoutMs = 30_000,
): Promise<T> {
  const config = ftpConfig()
  const client = new Client(timeoutMs)
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: mode !== 'sem-tls',
      secureOptions:
        mode === 'ftps-estrito'
          ? { servername: config.host }
          : { rejectUnauthorized: false },
    })
    return await run(client, config)
  } finally {
    client.close()
  }
}

/**
 * Lê do próprio servidor os nomes para os quais o certificado TLS dele vale.
 *
 * Existe para responder à pergunta que trava a produção: FTP_HOST está com o
 * IP do servidor, o certificado só casa com nome — mas QUAL nome? A hospedagem
 * não documenta. A resposta está no certificado que o servidor apresenta, e é
 * pública por definição (qualquer um que conecta na porta 21 a recebe): aqui
 * conectamos sem verificar só para lê-la e mostrar no diagnóstico.
 */
export async function nomesDoCertificado(timeoutMs = 30_000): Promise<{ sujeito: string; nomes: string[] }> {
  const config = ftpConfig()
  const client = new Client(timeoutMs)
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    })
    const socket = client.ftp.socket as import('node:tls').TLSSocket
    if (typeof socket.getPeerCertificate !== 'function') return { sujeito: '', nomes: [] }
    const cert = socket.getPeerCertificate()
    const nomes = (cert.subjectaltname ?? '')
      .split(',')
      .map((parte) => parte.trim())
      .filter((parte) => parte.startsWith('DNS:'))
      .map((parte) => parte.slice(4))
    return { sujeito: cert.subject?.CN ?? '', nomes }
  } finally {
    client.close()
  }
}

export class FtpEscopoError extends Error {
  constructor(caminho: string) {
    super(`Caminho fora da pasta permitida: ${caminho}`)
    this.name = 'FtpEscopoError'
  }
}

/**
 * Resolve um caminho relativo dentro de FTP_BASE_DIR e recusa qualquer um que
 * escape dela.
 *
 * Por que isto existe: a conta de FTP entrou na raiz do site, ao lado do
 * index.html mantido pela outra equipe. Enquanto ela não for reduzida à pasta
 * de notícias, o único freio contra um slug malformado sobrescrever a home é
 * este aqui. Um slug vem de texto digitado por uma pessoa; "../index.html" não
 * precisa de má intenção para acontecer, basta um bug na geração dele.
 */
export function caminhoSeguro(baseDir: string, relativo: string): string {
  const base = ('/' + baseDir).replace(/\/+/g, '/').replace(/\/$/, '') || '/'

  const partes: string[] = []
  for (const parte of relativo.split('/')) {
    if (!parte || parte === '.') continue
    if (parte === '..') {
      // Subir para além da base é exatamente o que não pode acontecer.
      if (!partes.length) throw new FtpEscopoError(relativo)
      partes.pop()
      continue
    }
    partes.push(parte)
  }

  if (!partes.length) throw new FtpEscopoError(relativo)
  const resolvido = `${base === '/' ? '' : base}/${partes.join('/')}`

  // Cinto e suspensório: mesmo com a normalização acima, conferimos o prefixo.
  const prefixo = base === '/' ? '/' : `${base}/`
  if (!resolvido.startsWith(prefixo)) throw new FtpEscopoError(relativo)
  return resolvido
}

/**
 * Entra na pasta de trabalho, criando-a se preciso, e devolve o cliente já
 * posicionado. Todo caminho depois disto é relativo a ela.
 */
export async function entrarNaBase(client: Client, config: FtpConfig): Promise<string> {
  if (config.baseDir && config.baseDir !== '/') await client.ensureDir(config.baseDir)
  return client.pwd()
}

/**
 * Grava um arquivo dentro de FTP_BASE_DIR, criando as pastas do caminho.
 *
 * O caminho passa por caminhoSeguro antes de qualquer coisa: ele nasce de um
 * slug, que nasce de um título digitado por uma pessoa, e "../index.html" não
 * precisa de má intenção para acontecer — basta um bug na geração do slug.
 *
 * ensureDir muda o diretório de trabalho da sessão, então voltamos para a base
 * ao fim de cada arquivo. Sem isso o segundo arquivo de uma mesma remessa
 * subiria relativo à pasta do primeiro.
 */
export async function enviarArquivo(
  client: Client,
  config: FtpConfig,
  relativo: string,
  conteudo: Buffer | string,
): Promise<string> {
  const destino = caminhoSeguro(config.baseDir, relativo)
  const pasta = destino.slice(0, destino.lastIndexOf('/')) || '/'
  const nome = destino.slice(destino.lastIndexOf('/') + 1)

  await client.ensureDir(pasta)
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  await client.uploadFrom(Readable.from(bytes), nome)
  await client.cd('/')
  return destino
}

/**
 * Baixa um arquivo e devolve o conteúdo como texto.
 *
 * Não passa por caminhoSeguro de propósito: LER é diferente de escrever, e
 * quem chama precisa poder olhar a raiz do site (onde mora a home) sem que a
 * trava de escrita, que existe para impedir um slug malformado de sobrescrever
 * a home, atrapalhe uma leitura inofensiva.
 */
export async function baixarTexto(client: Client, caminho: string): Promise<string> {
  const pedacos: Buffer[] = []
  const destino = new Writable({
    write(pedaco, _codificacao, pronto) { pedacos.push(Buffer.from(pedaco)); pronto() },
  })
  await client.downloadTo(destino, caminho)
  return Buffer.concat(pedacos).toString('utf8')
}

/**
 * Nomes que podem ser escritos FORA da pasta de matérias.
 *
 * A trava caminhoSeguro impede que um slug malformado escape da pasta de
 * notícias e sobrescreva a home — e ela continua valendo para tudo que vem de
 * texto digitado. Ligar o formulário da newsletter, porém, precisa escrever
 * justamente na home; então existe esta porta, e ela é estreita: uma lista
 * fechada de nomes literais, nunca um caminho montado a partir de entrada de
 * ninguém. O que não está aqui não é gravável por esta função.
 */
const NOMES_PERMITIDOS_NA_RAIZ = new Set(['index.html'])

/**
 * Grava um arquivo na raiz do site, fora da pasta de matérias.
 *
 * Só aceita nome da lista acima, e só nome — barra no valor é recusada, para
 * que não haja caminho a interpretar.
 */
export async function enviarNaRaizDoSite(
  client: Client,
  raiz: string,
  nome: string,
  conteudo: string,
): Promise<string> {
  if (nome.includes('/') || nome.includes('\\') || !NOMES_PERMITIDOS_NA_RAIZ.has(nome)) {
    throw new FtpEscopoError(nome)
  }
  await client.cd(raiz)
  await client.uploadFrom(Readable.from(Buffer.from(conteudo, 'utf8')), nome)
  await client.cd('/')
  return `${raiz.replace(/\/$/, '')}/${nome}`
}

/**
 * Regrava uma página .html num caminho que foi DESCOBERTO por listagem.
 *
 * Existe para o enxerto do Analytics, que anda pelo site inteiro. A guarda é
 * diferente da raiz (lista fechada de nomes) porque aqui o conjunto de
 * páginas não é conhecido de antemão — o que se trava é a forma: só .html,
 * caminho absoluto vindo da própria listagem, sem `..` para interpretar.
 * Quem chama é responsável por só passar caminhos que listou do servidor.
 */
export async function regravarPaginaListada(
  client: Client,
  caminho: string,
  conteudo: string,
): Promise<void> {
  if (!caminho.startsWith('/') || caminho.includes('..') || !caminho.toLowerCase().endsWith('.html')) {
    throw new FtpEscopoError(caminho)
  }
  await client.uploadFrom(Readable.from(Buffer.from(conteudo, 'utf8')), caminho)
}
