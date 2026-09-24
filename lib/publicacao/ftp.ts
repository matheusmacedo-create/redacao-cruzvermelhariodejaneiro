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
/**
 * Traduz o erro de CONEXÃO para a decisão que ele pede.
 *
 * "certificate has expired" chegou cru na tela de quem publicava, sem dizer
 * de quem era a culpa nem o que fazer. Cada caso conhecido ganha a resposta
 * em português; o desconhecido segue como veio — mensagem original nunca é
 * engolida.
 */
export function explicarErroDeConexao(causa: unknown): string | null {
  const texto = causa instanceof Error ? causa.message : String(causa)
  if (/certificate has expired|CERT_HAS_EXPIRED/i.test(texto)) {
    return 'O certificado TLS do servidor de FTP da hospedagem está VENCIDO — o problema é do servidor da Hostinger, não da Redação. Confira a validade em /api/admin/ftp-check e acione a hospedagem para renovar. Se a publicação não puder esperar, FTP_TLS_INSECURE=1 na Vercel (com redeploy) publica com a conexão cifrada porém sem verificar o certificado — retire a variável assim que a hospedagem renovar.'
  }
  if (/hostname\/ip does not match|altnames|ERR_TLS_CERT_ALTNAME/i.test(texto)) {
    return 'O certificado do servidor não vale para o nome em FTP_HOST. /api/admin/ftp-check mostra para quais nomes ele vale — troque FTP_HOST por um deles.'
  }
  if (/self.signed|unable to (get|verify)/i.test(texto)) {
    return 'O servidor apresentou um certificado que não fecha cadeia de confiança. Confira /api/admin/ftp-check; se for limitação da hospedagem, FTP_TLS_INSECURE=1 é o paliativo consciente.'
  }
  if (/530|login|authentication failed/i.test(texto)) {
    return 'O servidor recusou usuário ou senha do FTP. Confira FTP_USER e FTP_PASSWORD na Vercel (variável nova só entra em build novo).'
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(texto)) {
    return 'O endereço em FTP_HOST não resolveu. Confira o nome na Vercel.'
  }
  return null
}

export async function withFtp<T>(
  run: (client: Client, config: FtpConfig) => Promise<T>,
  mode: TlsMode = defaultTlsMode(),
  timeoutMs = 30_000,
): Promise<T> {
  const config = ftpConfig()
  const client = new Client(timeoutMs)
  try {
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
    } catch (causa) {
      const dica = explicarErroDeConexao(causa)
      if (dica) {
        const original = causa instanceof Error ? causa.message : String(causa)
        throw new Error(`${dica} (erro do servidor: ${original.slice(0, 120)})`)
      }
      throw causa
    }
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
export type ValidadeDoCertificado = {
  de: string
  ate: string
  expirado: boolean
  diasRestantes: number
}

export async function nomesDoCertificado(timeoutMs = 30_000): Promise<{
  sujeito: string
  nomes: string[]
  validade?: ValidadeDoCertificado
}> {
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

    // A validade responde o caso que o nome não explica: certificado com o
    // nome certo e VENCIDO. Foi exatamente o "certificate has expired" que
    // travou a publicação sem dizer de quem era a culpa.
    let validade: ValidadeDoCertificado | undefined
    if (cert.valid_to) {
      const ate = new Date(cert.valid_to)
      validade = {
        de: cert.valid_from ?? '',
        ate: cert.valid_to,
        expirado: ate.getTime() < Date.now(),
        diasRestantes: Math.floor((ate.getTime() - Date.now()) / 86_400_000),
      }
    }
    return { sujeito: cert.subject?.CN ?? '', nomes, validade }
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
const NOMES_PERMITIDOS_NA_RAIZ = new Set(['index.html', 'sitemap.xml', 'robots.txt'])

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

/** Pastas de página fixa que o app pode criar na raiz do site. Lista fechada. */
const PASTAS_PERMITIDAS_NA_RAIZ = new Set(['privacidade', 'termos', 'transparencia', 'canais-oficiais'])

/**
 * Grava a index.html de uma pasta fixa na raiz do site (ex.: /privacidade/).
 *
 * Mesma disciplina de enviarNaRaizDoSite: só nomes da lista, nunca um caminho
 * a interpretar. A pasta é criada se não existir.
 */
export async function enviarPastaFixaNaRaiz(
  client: Client,
  raiz: string,
  pasta: string,
  conteudo: string,
): Promise<string> {
  if (!PASTAS_PERMITIDAS_NA_RAIZ.has(pasta)) throw new FtpEscopoError(pasta)
  const destino = `${raiz.replace(/\/$/, '')}/${pasta}`
  await client.ensureDir(destino)
  await client.uploadFrom(Readable.from(Buffer.from(conteudo, 'utf8')), `${destino}/index.html`)
  await client.cd('/')
  return `${destino}/index.html`
}

/**
 * Remove a pasta de uma matéria publicada — o desfazer do enviarArquivo.
 *
 * O guarda é o mesmo do envio: o caminho nasce de um slug e passa por
 * caminhoSeguro, então só se apaga DENTRO de FTP_BASE_DIR. O formato do slug
 * é conferido de novo aqui porque removeDir("/") apaga um servidor inteiro —
 * e uma linha de defesa a mais não custa o que um erro custaria.
 */
export async function removerPastaDeMateria(
  client: Client,
  config: FtpConfig,
  slug: string,
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new FtpEscopoError(slug)
  const destino = caminhoSeguro(config.baseDir, slug)
  await client.removeDir(destino)
  await client.cd('/')
}

/**
 * Os arquivos públicos da trilha de auditoria, dentro de /verificar/ no site.
 *
 * A página /verificar/ em si (e o .htaccess que a mantém fora dos buscadores)
 * é do repositório do site, nunca desta função. Aqui entram só as provas: a
 * chave pública (a atual e uma cópia permanente por impressão digital, para
 * conferir lotes antigos depois de uma troca de chave), o índice dos lotes e os
 * cinco arquivos de cada dia — nomes literais, data e impressão validadas, nada
 * montado a partir de texto de ninguém.
 */
const ARQUIVO_DE_VERIFICACAO =
  /^(chave-publica\.pem|chaves\/[0-9a-f]{16}\.pem|lotes\/indice\.json|lotes\/\d{4}-\d{2}-\d{2}\/(manifesto\.json|manifesto\.json\.sig|manifesto\.json\.tsr|compromisso\.bin|compromisso\.bin\.ots))$/

export async function enviarArquivoDeVerificacao(
  client: Client,
  raiz: string,
  relativo: string,
  conteudo: Buffer | string,
): Promise<string> {
  if (!ARQUIVO_DE_VERIFICACAO.test(relativo)) throw new FtpEscopoError(relativo)
  const destino = `${raiz.replace(/\/$/, '')}/verificar/${relativo}`
  const pasta = destino.slice(0, destino.lastIndexOf('/'))
  await client.ensureDir(pasta)
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  await client.uploadFrom(Readable.from(bytes), destino.slice(destino.lastIndexOf('/') + 1))
  await client.cd('/')
  return destino
}

/**
 * Os outros arquivos das pastas do portal de transparência e dos canais
 * oficiais: o .htaccess de cada pasta e os PDFs do portal, com o nome que
 * lib/transparencia/regras.ts monta (título + 12 hex do SHA-256). Nome fora do
 * padrão é recusado; o index.html de cada pasta sobe por enviarPastaFixaNaRaiz.
 */
const ARQUIVO_DO_PORTAL = /^(\.htaccess|arquivos\/[a-z0-9][a-z0-9-]{0,60}-[0-9a-f]{12}\.pdf)$/

export async function enviarArquivoDoPortal(
  client: Client,
  raiz: string,
  pasta: 'transparencia' | 'canais-oficiais',
  relativo: string,
  conteudo: Buffer | string,
): Promise<string> {
  if (!ARQUIVO_DO_PORTAL.test(relativo) || (pasta === 'canais-oficiais' && relativo !== '.htaccess')) throw new FtpEscopoError(`${pasta}/${relativo}`)
  const destino = `${raiz.replace(/\/$/, '')}/${pasta}/${relativo}`
  await client.ensureDir(destino.slice(0, destino.lastIndexOf('/')))
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  await client.uploadFrom(Readable.from(bytes), destino.slice(destino.lastIndexOf('/') + 1))
  await client.cd('/')
  return destino
}

/**
 * Apaga um PDF do portal de transparência (documento retirado). Só nome no
 * padrão dos PDFs do portal, sem caminho; arquivo que já não existe não é falha.
 */
export async function removerArquivoDoPortal(client: Client, raiz: string, nome: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,60}-[0-9a-f]{12}\.pdf$/.test(nome)) throw new FtpEscopoError(`transparencia/arquivos/${nome}`)
  try {
    await client.remove(`${raiz.replace(/\/$/, '')}/transparencia/arquivos/${nome}`)
  } catch (causa) {
    const texto = causa instanceof Error ? causa.message : String(causa)
    if (!/550|not found|no such/i.test(texto)) throw causa
  }
  await client.cd('/')
}

/**
 * Os arquivos de /acervo/ no site (lib/acervo/publicacao.ts): as páginas (início, coleção,
 * paginação e item), o .htaccess e as versões para a web em arquivos/. Lista fechada: coleção
 * da lista, slug e nome de arquivo nos formatos de lib/acervo/regras.ts, nada montado com texto
 * livre. A página de item e a de paginação ficam cada uma na sua pasta.
 */
const COLECAO_DO_ACERVO = '(documentos|fotos|videos|imprensa|historia)'
const SLUG_DO_ACERVO = '[a-z0-9]+(-[a-z0-9]+)*'
const ARQUIVO_DO_ACERVO = new RegExp(
  `^(index\\.html|\\.htaccess|${COLECAO_DO_ACERVO}/index\\.html|${COLECAO_DO_ACERVO}/pagina/[2-9]\\d{0,3}/index\\.html|` +
  `${COLECAO_DO_ACERVO}/${SLUG_DO_ACERVO}/index\\.html|arquivos/${SLUG_DO_ACERVO}-[0-9a-f]{12}(-\\d{2,4})?\\.(webp|pdf))$`,
)
const PASTA_DO_ACERVO = new RegExp(`^(${COLECAO_DO_ACERVO}/pagina/[2-9]\\d{0,3}|${COLECAO_DO_ACERVO}/${SLUG_DO_ACERVO})$`)

function destinoNoAcervo(raiz: string, relativo: string, padrao: RegExp): string {
  if (relativo.length > 200 || !padrao.test(relativo) || /(^|\/)pagina\/index\.html$/.test(relativo)) throw new FtpEscopoError(`acervo/${relativo}`)
  return `${raiz.replace(/\/$/, '')}/acervo/${relativo}`
}

export async function enviarArquivoDoAcervo(client: Client, raiz: string, relativo: string, conteudo: Buffer | string): Promise<string> {
  const destino = destinoNoAcervo(raiz, relativo, ARQUIVO_DO_ACERVO)
  await client.ensureDir(destino.slice(0, destino.lastIndexOf('/')))
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  await client.uploadFrom(Readable.from(bytes), destino.slice(destino.lastIndexOf('/') + 1))
  await client.cd('/')
  return destino
}

const naoExiste = (causa: unknown) => /550|not found|no such/i.test(causa instanceof Error ? causa.message : String(causa))

/** Apaga um arquivo de /acervo/ (lista fechada); o que já não existe não é falha. */
export async function removerArquivoDoAcervo(client: Client, raiz: string, relativo: string): Promise<void> {
  const destino = destinoNoAcervo(raiz, relativo, ARQUIVO_DO_ACERVO)
  try {
    await client.remove(destino)
  } catch (causa) {
    if (!naoExiste(causa)) throw causa
  }
  await client.cd('/')
}

/**
 * Tira do ar a página de um item ou de uma paginação: apaga o index.html e a pasta, que só
 * pode estar vazia — nunca uma remoção recursiva a partir de um caminho montado.
 */
export async function removerPaginaDoAcervo(client: Client, raiz: string, pasta: string): Promise<void> {
  const destino = destinoNoAcervo(raiz, pasta, PASTA_DO_ACERVO)
  for (const passo of [() => client.remove(`${destino}/index.html`), () => client.removeEmptyDir(destino)]) {
    try {
      await passo()
    } catch (causa) {
      if (!naoExiste(causa)) throw causa
    }
  }
  await client.cd('/')
}

/** As páginas de paginação que existem hoje numa coleção (para apagar as que sobraram). */
export async function paginasDaColecaoNoSite(client: Client, raiz: string, colecao: string): Promise<number[]> {
  if (!new RegExp(`^${COLECAO_DO_ACERVO}$`).test(colecao)) throw new FtpEscopoError(`acervo/${colecao}`)
  // Entra na pasta antes de listar: LIST de pasta que não existe abre conexão de dados à toa, e
  // o 550 que volta desencontrou o diálogo do FTP num teste (o comando seguinte recebeu a resposta
  // errada). O CWD falha limpo, numa resposta só.
  try {
    await client.cd(`${raiz.replace(/\/$/, '')}/acervo/${colecao}/pagina`)
  } catch (causa) {
    await client.cd('/')
    if (naoExiste(causa)) return []
    throw causa
  }
  try {
    const lista = await client.list()
    return lista.filter((f) => f.isDirectory && /^[2-9]\d{0,3}$/.test(f.name)).map((f) => Number(f.name))
  } finally {
    await client.cd('/')
  }
}
