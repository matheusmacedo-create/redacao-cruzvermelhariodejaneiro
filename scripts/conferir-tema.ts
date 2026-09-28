/**
 * Confere o modo escuro: `npx tsx scripts/conferir-tema.ts`. O script do
 * <head> (escrito à mão, em ES5) tem de decidir igual a escuroNaPagina() em
 * toda combinação de escolha, página e sistema. Sai com código 1 se algo estiver errado.
 */
import { SCRIPT_DO_TEMA, TEMAS, escuroNaPagina, lerTema } from '../lib/tema'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU ${nome}: ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`) }
}

/** Roda o script do <head> num navegador de mentira e devolve se o <html> ficou escuro. */
function rodarScript(cookie: string, caminho: string, sistemaEscuro: boolean): boolean {
  const classes = new Set<string>()
  const html = { classList: { toggle: (c: string, liga: boolean) => { if (liga) classes.add(c); else classes.delete(c) } }, style: { colorScheme: '' } }
  const document = { cookie, documentElement: html }
  const window = { matchMedia: (q: string) => ({ matches: q.includes('dark') && sistemaEscuro }) }
  const location = { pathname: caminho }
  new Function('document', 'window', 'location', SCRIPT_DO_TEMA)(document, window, location)
  confere(`color-scheme ${cookie} ${caminho}`, html.style.colorScheme, classes.has('dark') ? 'dark' : 'light')
  return classes.has('dark')
}

confere('sem cookie = claro', lerTema(''), 'claro')
confere('cookie inválido = claro', lerTema('tema=roxo'), 'claro')
confere('cookie no meio', lerTema('a=1; tema=escuro; b=2'), 'escuro')
confere('outro cookie terminado em tema não conta', lerTema('meutema=escuro'), 'claro')

const caminhos = ['/dashboard', '/membro', '/chamados/novo', '/verificar/ABC123', '/cracha/xyz', '/portaria/cartaz', '/portaria/crachas', '/envios/cartaz', '/envios', '/verificarx', '/']
for (const cookie of ['', 'tema=roxo', ...TEMAS.map((t) => `tema=${t}`), 'x=1; tema=escuro']) {
  for (const caminho of caminhos) {
    for (const sistema of [false, true]) {
      confere(`${cookie || '(sem cookie)'} ${caminho} sistema ${sistema ? 'escuro' : 'claro'}`, rodarScript(cookie, caminho, sistema), escuroNaPagina(lerTema(cookie), caminho, sistema))
    }
  }
}
confere('ofício sempre claro', escuroNaPagina('escuro', '/verificar/X', true), false)
confere('envios (tela) segue o tema', escuroNaPagina('escuro', '/envios', false), true)
confere('automático segue o sistema', [escuroNaPagina('sistema', '/dashboard', true), escuroNaPagina('sistema', '/dashboard', false)], [true, false])

console.log(falhas ? `${falhas} falha(s).` : 'Tema: tudo certo.')
process.exit(falhas ? 1 : 0)
