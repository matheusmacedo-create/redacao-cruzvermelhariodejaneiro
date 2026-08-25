import 'server-only'
import { Client } from 'basic-ftp'

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
): Promise<T> {
  const config = ftpConfig()
  const client = new Client(30_000)
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
