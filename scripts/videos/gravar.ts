/**
 * Grava um vídeo da ajuda (docs/AJUDA.md §14):
 *   npx tsx scripts/videos/gravar.ts <id> [--ensaio] [--credenciais=arquivo.env]
 *
 * 1. a voz de cada fala do roteiro (ElevenLabs, guardada em .videos/voz: o mesmo texto não gasta crédito de novo);
 * 2. o robô entra no Palácio como a conta de gravação, confere que está no espaço de Demonstração e faz a tarefa,
 *    esperando cada fala terminar; a tela é capturada pelo DevTools do Chromium;
 * 3. o ffmpeg monta o MP4 com a voz, a capa e a legenda (scripts/videos/montar.ts).
 *
 * Sem --ensaio: copia a legenda para public/tutoriais, escreve o vídeo em lib/ajuda/videos.json e deixa o MP4 e a capa
 * em .videos/saida, com a versão no nome, para subir ao site (§14). Com --ensaio: os passos marcados `final` (votar,
 * criar) não acontecem, e sai só .videos/saida/<id>.ensaio.mp4, para conferir o ritmo.
 *
 * Precisa de:
 *  - Playwright com o Chromium. Não é dependência do projeto (pesaria no build da Vercel): onde ele estiver instalado
 *    de forma global (NODE_PATH), o script acha; senão, `pnpm dlx playwright install chromium` e NODE_PATH.
 *  - ffmpeg e ffprobe no PATH.
 *  - ELEVENLABS_API_KEY (no ambiente de nuvem do Claude Code, o proxy põe a chave).
 *  - GRAVACAO_USUARIO e GRAVACAO_SENHA: a conta de gravação (§13). A senha nunca aparece na saída.
 *  - PALACIO_URL (opcional): padrão https://palacio.cruzvermelhariodejaneiro.org.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { guiaDaArea } from '../../lib/ajuda'
import { ENDERECO_DOS_VIDEOS, impressaoDaTarefa, type VideoGravado } from '../../lib/ajuda/videos'
import { montarVideo, type FalaNoVideo, type Quadro } from './montar'
import { RoboDoPalacio, SCRIPT_DA_TELA, type PaginaPw } from './robo'
import { ROTEIROS } from './roteiros'
import { falar, type Fala } from './voz'

type QuadroDoDevTools = { data: string; sessionId: number; metadata: { timestamp?: number } }
interface SessaoCdp {
  send(metodo: string, parametros?: Record<string, unknown>): Promise<unknown>
  on(evento: 'Page.screencastFrame', tratar: (quadro: QuadroDoDevTools) => void): void
}
type PaginaDeEntrada = PaginaPw & { fill(seletor: string, valor: string): Promise<void>; click(seletor: string): Promise<void>; screenshot(o: { path: string }): Promise<unknown> }
interface ContextoPw {
  addInitScript(script: { content: string }): Promise<void>
  newPage(): Promise<PaginaDeEntrada>
  newCDPSession(pagina: PaginaDeEntrada): Promise<SessaoCdp>
}
interface NavegadorPw {
  newContext(opcoes: Record<string, unknown>): Promise<ContextoPw>
  close(): Promise<void>
}
type Playwright = { chromium: { launch(opcoes?: Record<string, unknown>): Promise<NavegadorPw> } }

const BASE = (process.env.PALACIO_URL || 'https://palacio.cruzvermelhariodejaneiro.org').replace(/\/$/, '')
const RAIZ = path.resolve('.videos')
const CATALOGO = path.resolve('lib/ajuda/videos.json')
const LEGENDAS = path.resolve('public/tutoriais')

function credenciais(arquivo: string | undefined) {
  const doArquivo = arquivo
    ? Object.fromEntries(readFileSync(arquivo, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {}
  const usuario = process.env.GRAVACAO_USUARIO || doArquivo.GRAVACAO_USUARIO
  const senha = process.env.GRAVACAO_SENHA || doArquivo.GRAVACAO_SENHA
  if (!usuario || !senha) throw new Error('Falta a conta de gravação: GRAVACAO_USUARIO e GRAVACAO_SENHA (ou --credenciais=arquivo.env).')
  return { usuario, senha }
}

async function entrar(pagina: PaginaDeEntrada, conta: { usuario: string; senha: string }) {
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await pagina.fill('input[autocomplete="username"]', conta.usuario)
  await pagina.fill('input[autocomplete="current-password"]', conta.senha)
  await pagina.click('button[type="submit"]')
  await pagina.waitForURL((u) => u.pathname !== '/', { timeout: 30_000 }).catch(() => {
    throw new Error('A conta de gravação não entrou no Palácio: confira o usuário e a senha.')
  })
}

/** Nunca grava fora da Demonstração: o quadro de Pautas diz de qual espaço ele é. */
async function conferirEspaco(robo: RoboDoPalacio, pagina: PaginaPw) {
  await robo.ir('/pautas')
  const naDemonstracao = await pagina.evaluate('document.body.innerText.includes("espaço Demonstração")')
  if (!naDemonstracao) throw new Error('A conta de gravação não está no espaço de Demonstração. Nada foi gravado (docs/AJUDA.md §13).')
}

const hojeNaFilial = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function main() {
  const args = process.argv.slice(2)
  const id = args.find((a) => !a.startsWith('--'))
  const ensaio = args.includes('--ensaio')
  const roteiro = ROTEIROS.find((r) => r.id === id)
  if (!roteiro) {
    console.error(`Use: npx tsx scripts/videos/gravar.ts <id> [--ensaio] [--credenciais=arquivo.env]\nVídeos: ${ROTEIROS.map((r) => r.id).join(', ')}`)
    process.exit(1)
  }
  const tarefa = guiaDaArea(roteiro.area)?.tarefas.find((t) => t.id === roteiro.tarefa)
  if (!tarefa) throw new Error(`A tarefa ${roteiro.area}#${roteiro.tarefa} não existe na ajuda.`)
  const conta = credenciais(args.find((a) => a.startsWith('--credenciais='))?.split('=')[1])

  const pastaQuadros = path.join(RAIZ, 'quadros', roteiro.id)
  const pastaSaida = path.join(RAIZ, 'saida')
  rmSync(pastaQuadros, { recursive: true, force: true })
  mkdirSync(pastaQuadros, { recursive: true })
  mkdirSync(pastaSaida, { recursive: true })

  // 1. As falas primeiro: se a voz falhar, nada é gravado.
  const textos = [roteiro.abertura, ...roteiro.passos.map((p) => p.fala), roteiro.fechamento]
  const falas: Fala[] = []
  for (let i = 0; i < textos.length; i++) falas.push(await falar(textos[i], path.join(RAIZ, 'voz'), { anterior: textos[i - 1], seguinte: textos[i + 1] }))
  console.log(`${roteiro.id}: ${falas.length} falas, ${falas.reduce((s, f) => s + f.duracao, 0).toFixed(1)} s de voz${ensaio ? ' (ensaio)' : ''}`)

  // 2. O navegador, já na conta de gravação e conferido o espaço.
  const exigir = createRequire(path.join(process.cwd(), 'package.json'))
  let playwright: Playwright
  try {
    playwright = exigir('playwright') as Playwright
  } catch {
    throw new Error('Não achei o Playwright: instale-o fora do projeto e aponte NODE_PATH para ele (docs/AJUDA.md §14).')
  }
  // Em português também na interface do navegador: o campo de data mostra dd/mm/aaaa, como para a equipe.
  const navegador = await playwright.chromium.launch({ args: ['--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } })
  try {
    const contexto = await navegador.newContext({
      viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light',
    })
    await contexto.addInitScript({ content: SCRIPT_DA_TELA })
    const pagina = await contexto.newPage()
    await entrar(pagina, conta)
    const robo = new RoboDoPalacio(pagina, BASE)
    await conferirEspaco(robo, pagina)
    await robo.ir(roteiro.inicio)

    // 3. A gravação: imagens da tela pelo DevTools (nítidas, e só quando algo muda).
    const cdp = await contexto.newCDPSession(pagina)
    const quadros: Quadro[] = []
    let n = 0
    cdp.on('Page.screencastFrame', (q) => {
      const arquivo = path.join(pastaQuadros, `q${String(n++).padStart(6, '0')}.jpg`)
      writeFileSync(arquivo, Buffer.from(q.data, 'base64'))
      quadros.push({ arquivo, t: q.metadata.timestamp ?? Date.now() / 1000 })
      cdp.send('Page.screencastFrameAck', { sessionId: q.sessionId }).catch(() => undefined)
    })
    await robo.cartao('Palácio Virtual · Como fazer', roteiro.titulo, 'O passo a passo da ajuda, na tela de verdade, com dados fictícios.')
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
    await robo.esperar(500)
    const t0 = Date.now() / 1000
    const agora = () => Date.now() / 1000 - t0
    const noVideo: FalaNoVideo[] = [{ fala: falas[0], inicio: agora() }]
    await robo.esperar((falas[0].duracao + 0.5) * 1000)
    await robo.tirarCartao()

    for (let i = 0; i < roteiro.passos.length; i++) {
      const passo = roteiro.passos[i]
      const fala = falas[i + 1]
      const inicio = agora()
      noVideo.push({ fala, inicio })
      await robo.esperar(250)
      if (passo.acao && !(ensaio && passo.final)) {
        await passo.acao(robo).catch(async (causa) => {
          const foto = path.join(pastaSaida, `${roteiro.id}.erro.png`)
          await pagina.screenshot({ path: foto }).catch(() => undefined)
          throw new Error(`O passo ${i + 1} falhou em ${new URL(pagina.url()).pathname} (tela em ${path.relative(process.cwd(), foto)}): ${causa instanceof Error ? causa.message.split('\n')[0] : causa}`)
        })
      }
      const falta = inicio + fala.duracao + (passo.pausa ?? 500) / 1000 - agora()
      if (falta > 0) await robo.esperar(falta * 1000)
      console.log(`  passo ${i + 1}/${roteiro.passos.length}${ensaio && passo.final ? ' (ensaio: ação pulada)' : ''}`)
    }

    await robo.apagar()
    await robo.cartao('Palácio Virtual · Ajuda', 'Ficou alguma dúvida?', 'Toque em ? no alto de qualquer tela: o passo a passo, o “Ouvir” e os vídeos estão lá.')
    await robo.esperar(400)
    const ultima = falas[falas.length - 1]
    noVideo.push({ fala: ultima, inicio: agora() })
    await robo.esperar((ultima.duracao + 1) * 1000)
    await cdp.send('Page.stopScreencast')
    const tFim = Date.now() / 1000

    // 4. A montagem.
    const nome = ensaio ? `${roteiro.id}.ensaio` : roteiro.id
    const pronto = montarVideo({ quadros, t0, tFim, falas: noVideo, pasta: pastaSaida, nome })
    rmSync(pastaQuadros, { recursive: true, force: true })
    const mb = (statSync(pronto.mp4).size / 1_048_576).toFixed(1)
    console.log(`Pronto: ${path.relative(process.cwd(), pronto.mp4)} (${pronto.duracao.toFixed(1)} s, ${mb} MB, ${quadros.length} imagens)`)
    if (ensaio) return

    const versao = createHash('sha256').update(readFileSync(pronto.mp4)).digest('hex').slice(0, 8)
    const video = `${roteiro.id}-${versao}.mp4`
    const capa = `${roteiro.id}-${versao}.jpg`
    const legenda = `${roteiro.id}.vtt`
    copyFileSync(pronto.mp4, path.join(pastaSaida, video))
    copyFileSync(pronto.capa, path.join(pastaSaida, capa))
    mkdirSync(LEGENDAS, { recursive: true })
    copyFileSync(pronto.vtt, path.join(LEGENDAS, legenda))
    const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8')) as Record<string, VideoGravado>
    catalogo[roteiro.id] = {
      titulo: tarefa.titulo, area: roteiro.area, tarefa: roteiro.tarefa, duracao: Number(pronto.duracao.toFixed(1)),
      gravadoEm: hojeNaFilial(), impressao: await impressaoDaTarefa(tarefa), video, capa, legenda,
    }
    const ordenado = Object.fromEntries(Object.keys(catalogo).sort().map((k) => [k, catalogo[k]]))
    writeFileSync(CATALOGO, `${JSON.stringify(ordenado, null, 2)}\n`)
    console.log(`Catálogo: lib/ajuda/videos.json e public/tutoriais/${legenda} atualizados.`)
    console.log(`Falta subir ao site: .videos/saida/${video} e .videos/saida/${capa} → ${ENDERECO_DOS_VIDEOS}`)
  } finally {
    await navegador.close()
  }
}

main().catch((causa) => {
  console.error(causa instanceof Error ? causa.message : causa)
  process.exit(1)
})
