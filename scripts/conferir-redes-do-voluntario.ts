/**
 * Confere as regras das redes sociais do voluntário (lib/participantes/regras.ts):
 * o que a pessoa digita vira o endereço certo, o que não é link é recusado, e
 * o formulário só mexe nas redes quando os campos vieram.
 *
 *   npx tsx scripts/conferir-redes-do-voluntario.ts
 */
import { CHAVES_DAS_REDES, lerFormulario, lerRedes, lerRedesGuardadas, normalizarRede, textoDaRede } from '../lib/participantes/regras'

let falhas = 0
const igual = (nome: string, obtido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok ' : 'ERRO'} ${nome}${ok ? '' : `\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`}`)
}
const url = (r: ReturnType<typeof normalizarRede>) => (r && 'url' in r ? r.url : r && 'erro' in r ? 'ERRO' : null)

// Instagram: @usuário, usuário, link com e sem https, link com www e com barra no fim.
igual('instagram @usuário', url(normalizarRede('instagram', ' @cruzvermelha.rj ')), 'https://www.instagram.com/cruzvermelha.rj')
igual('instagram usuário sem @', url(normalizarRede('instagram', 'cruzvermelha_rj')), 'https://www.instagram.com/cruzvermelha_rj')
igual('instagram link sem https', url(normalizarRede('instagram', 'instagram.com/cruzvermelha.rj/')), 'https://instagram.com/cruzvermelha.rj')
igual('instagram link completo', url(normalizarRede('instagram', 'https://www.instagram.com/cruzvermelha.rj?igsh=abc')), 'https://www.instagram.com/cruzvermelha.rj?igsh=abc')
igual('instagram http vira https', url(normalizarRede('instagram', 'http://www.instagram.com/fulana')), 'https://www.instagram.com/fulana')
igual('instagram de outro site é recusado', url(normalizarRede('instagram', 'https://tiktok.com/@fulana')), 'ERRO')
igual('instagram host parecido é recusado', url(normalizarRede('instagram', 'https://instagram.com.golpe.br/fulana')), 'ERRO')
igual('instagram só o site, sem perfil, é recusado', url(normalizarRede('instagram', 'instagram.com')), 'ERRO')
igual('instagram @ com barra é recusado', url(normalizarRede('instagram', '@fulana/x')), 'ERRO')
igual('instagram usuário com espaço é recusado', url(normalizarRede('instagram', '@fulana da silva')), 'ERRO')
igual('instagram vazio é null', normalizarRede('instagram', '   '), null)
igual('instagram javascript: é recusado', url(normalizarRede('instagram', 'javascript:alert(1)')), 'ERRO')

// LinkedIn e Facebook.
igual('linkedin link', url(normalizarRede('linkedin', 'linkedin.com/in/fulana-silva-123/')), 'https://linkedin.com/in/fulana-silva-123')
igual('linkedin usuário vira /in/', url(normalizarRede('linkedin', 'fulana-silva')), 'https://www.linkedin.com/in/fulana-silva')
igual('linkedin de outro site é recusado', url(normalizarRede('linkedin', 'https://facebook.com/fulana')), 'ERRO')
igual('facebook link com www', url(normalizarRede('facebook', 'https://www.facebook.com/fulana.silva')), 'https://www.facebook.com/fulana.silva')
igual('facebook subdomínio m.', url(normalizarRede('facebook', 'm.facebook.com/fulana')), 'https://m.facebook.com/fulana')

// Outro: qualquer http(s) com domínio; sem domínio, sem esquema estranho, sem senha.
igual('outro site sem https', url(normalizarRede('outro', 'fulana.com.br/portfolio')), 'https://fulana.com.br/portfolio')
igual('outro tiktok', url(normalizarRede('outro', 'https://www.tiktok.com/@fulana')), 'https://www.tiktok.com/@fulana')
igual('outro sem domínio é recusado', url(normalizarRede('outro', 'fulana')), 'ERRO')
igual('outro ftp é recusado', url(normalizarRede('outro', 'ftp://arquivos.com/x')), 'ERRO')
igual('outro com senha é recusado', url(normalizarRede('outro', 'https://a:b@site.com/x')), 'ERRO')
igual('outro longo demais é recusado', url(normalizarRede('outro', 'https://site.com/' + 'a'.repeat(300))), 'ERRO')
igual('outro tira a âncora', url(normalizarRede('outro', 'https://site.com/pagina#topo')), 'https://site.com/pagina')

// Como aparece na tela.
igual('texto do instagram vira @', textoDaRede('instagram', 'https://www.instagram.com/cruzvermelha.rj'), '@cruzvermelha.rj')
igual('texto do instagram com parâmetro não vira @', textoDaRede('instagram', 'https://www.instagram.com/cruzvermelha.rj?igsh=abc'), 'instagram.com/cruzvermelha.rj?igsh=abc')
igual('texto do linkedin sem https', textoDaRede('linkedin', 'https://www.linkedin.com/in/fulana'), 'linkedin.com/in/fulana')
igual('texto de outro', textoDaRede('outro', 'https://fulana.com.br/'), 'fulana.com.br')

// O que o banco guardou: só chaves conhecidas com link http(s), na ordem das redes.
igual('redes guardadas na ordem', lerRedesGuardadas({ outro: 'https://x.com', instagram: 'https://www.instagram.com/a', tiktok: 'https://t', linkedin: 'javascript:x' }), [['instagram', 'https://www.instagram.com/a'], ['outro', 'https://x.com']])
igual('redes guardadas vazio', lerRedesGuardadas(null), [])
igual('chaves das redes', CHAVES_DAS_REDES, ['instagram', 'linkedin', 'facebook', 'outro'])

// O formulário: sem os campos, não mexe; com os campos, vazio limpa; inválido dá erro.
const f0 = new FormData(); f0.set('nome', 'Fulana')
igual('formulário sem campos de rede não mexe', lerRedes(f0), null)
igual('lerFormulario sem campos de rede', 'redes' in lerFormulario(f0, '2026-10-02').dados, false)
const f1 = new FormData(); f1.set('rede_instagram', '@fulana'); f1.set('rede_linkedin', ''); f1.set('rede_outro', 'fulana.com.br')
igual('formulário lê e normaliza', lerRedes(f1), { redes: { instagram: 'https://www.instagram.com/fulana', outro: 'https://fulana.com.br' }, erros: [] })
igual('lerFormulario leva as redes', lerFormulario(f1, '2026-10-02').dados.redes, { instagram: 'https://www.instagram.com/fulana', outro: 'https://fulana.com.br' })
const f2 = new FormData(); f2.set('rede_instagram', 'https://tiktok.com/@x'); f2.set('rede_facebook', '')
igual('formulário com link errado dá erro', lerRedes(f2)?.erros, ['Link do Instagram inválido. Cole o endereço do perfil ou informe o @usuário.'])
igual('lerFormulario repassa o erro', lerFormulario(f2, '2026-10-02').erros, ['Link do Instagram inválido. Cole o endereço do perfil ou informe o @usuário.'])
const f3 = new FormData(); f3.set('rede_instagram', ''); f3.set('rede_linkedin', ''); f3.set('rede_facebook', ''); f3.set('rede_outro', '')
igual('todos vazios limpam as redes', lerRedes(f3), { redes: {}, erros: [] })

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
