// Confere as regras puras da voz da instituição (lib/voz) e o "Ouça esta matéria" da página. Sem rede e sem banco.
// Uso: npx tsx scripts/conferir-voz.ts
import {
  TAMANHO_DO_TRECHO, TETO_DO_WHATSAPP, dividirEmTrechos, ehAudioDeNarracao, ehMp3, ehOgg, lerConfigDaVoz, textoParaFalarNoWhatsapp, textoParaNarrar,
} from '../lib/voz/regras'
import { nomeDoAudio } from '../lib/voz/nome-do-audio'
import { montarPaginaDoArtigo } from '../lib/site/artigo-html'
import { problemasDaPagina } from '../lib/site/guarda-da-pagina'

let erros = 0
let casos = 0
const conferir = (ok: boolean, m: string) => { casos++; if (!ok) { erros++; console.error('✗', m) } }
const semEspaco = (t: string) => t.replace(/\s+/g, '')

// ---------------------------------------------------------------- o texto da matéria
const corpo = [
  '![Voluntários na sede](https://exemplo.invalido/foto.jpg)',
  'A filial abriu as inscrições para o curso de [primeiros socorros](https://cruzvermelhariodejaneiro.org/cursos/) neste sábado',
  '## Como participar',
  '- Leve um documento com foto\n- Chegue 15 minutos antes',
  '> A formação salva vidas, disse a coordenadora.',
  'Mais em https://cruzvermelhariodejaneiro.org/noticias/ e no site.',
].join('\n\n')
const narrado = textoParaNarrar({ titulo: 'Curso de primeiros socorros', subtitulo: 'Inscrições abertas', corpo })
conferir(narrado.startsWith('Curso de primeiros socorros.\n\nInscrições abertas.'), `título e linha fina primeiro, com ponto: ${JSON.stringify(narrado.slice(0, 60))}`)
conferir(!/https?:|www\.|\.jpg|!\[|\]\(/.test(narrado), `sem endereço, foto nem Markdown: ${narrado}`)
conferir(narrado.includes('primeiros socorros neste sábado.'), 'o texto do link fica, o endereço sai')
conferir(narrado.includes('Leve um documento com foto. Chegue 15 minutos antes.'), `lista vira frases: ${narrado}`)
conferir(narrado.includes('Como participar.'), 'intertítulo entra, com ponto')
conferir(!narrado.includes('Voluntários na sede'), 'a legenda da foto não é lida')
conferir(textoParaNarrar({ titulo: '  ', corpo: '' }) === '', 'matéria vazia: nada a narrar')

// ---------------------------------------------------------------- os trechos
const paragrafo = (n: number) => `Parágrafo ${n}. ` + 'A Cruz Vermelha atua no Rio de Janeiro com voluntários formados na sede. '.repeat(20)
const longo = Array.from({ length: 30 }, (_, i) => paragrafo(i + 1)).join('\n\n')
const trechos = dividirEmTrechos(longo)
conferir(trechos.length > 1, 'texto longo vira vários trechos')
conferir(trechos.every((t) => t.length <= TAMANHO_DO_TRECHO), `nenhum trecho passa do tamanho: ${Math.max(...trechos.map((t) => t.length))}`)
conferir(semEspaco(trechos.join('')) === semEspaco(longo), 'nada se perde nem se repete entre os trechos')
conferir(trechos.every((t) => /^Parágrafo \d+\./.test(t)), 'o corte cai no começo de parágrafo')
const gigante = 'Frase com bastante coisa dentro dela para encher. '.repeat(400)
const deGigante = dividirEmTrechos(gigante, 1000)
conferir(deGigante.every((t) => t.length <= 1000) && semEspaco(deGigante.join('')) === semEspaco(gigante), 'parágrafo gigante é cortado em frases sem perda')
const semPonto = 'palavra '.repeat(1000).trim()
const deSemPonto = dividirEmTrechos(semPonto, 500)
conferir(deSemPonto.every((t) => t.length <= 500) && semEspaco(deSemPonto.join('')) === semEspaco(semPonto), 'frase sem ponto é cortada no espaço sem perda')
conferir(dividirEmTrechos('').length === 0, 'texto vazio: nenhum trecho')
conferir(dividirEmTrechos('Curto.').length === 1, 'texto curto: um trecho')

// ---------------------------------------------------------------- o nome do arquivo
const n1 = nomeDoAudio('texto', 'voz12345', 'eleven_v4')
conferir(ehAudioDeNarracao(n1), `nome no padrão: ${n1}`)
conferir(nomeDoAudio('texto', 'voz12345', 'eleven_v4') === n1, 'mesmo texto, mesmo nome (republicar não gasta)')
conferir(nomeDoAudio('texto editado', 'voz12345', 'eleven_v4') !== n1, 'texto mudou, nome muda')
conferir(nomeDoAudio('texto', 'outraVoz99', 'eleven_v4') !== n1, 'voz mudou, nome muda')
conferir(nomeDoAudio('texto', 'voz12345', 'eleven_flash_v2_5') !== n1, 'modelo mudou, nome muda')
conferir(!ehAudioDeNarracao('index.html') && !ehAudioDeNarracao('../ouvir-aaaaaaaaaaaa.mp3') && !ehAudioDeNarracao('ouvir-AAAAAAAAAAAA.mp3'), 'só o padrão exato é narração')

// ---------------------------------------------------------------- o que se fala no WhatsApp
const resposta = 'Você tem *2 aprovações* pendentes:\n1. Matéria da campanha de inverno\n2. Post do Dia do Voluntário\nAbra em https://palacio.cruzvermelhariodejaneiro.org/aprovacoes 👍'
const falada = textoParaFalarNoWhatsapp(resposta)
conferir(falada !== null && !/https?:|\*|👍/.test(falada), `sem link, marcação nem emoji: ${falada}`)
conferir(Boolean(falada?.includes('Matéria da campanha de inverno. Post do Dia do Voluntário.')), `itens viram frases: ${falada}`)
conferir(textoParaFalarNoWhatsapp('Pronto.') === null, 'curto demais não vira áudio')
conferir(textoParaFalarNoWhatsapp('a'.repeat(10) + ' ' + 'Texto comprido de verdade. '.repeat(40)) === null, `acima de ${TETO_DO_WHATSAPP} caracteres não vira áudio`)
conferir(textoParaFalarNoWhatsapp('Seu código é 482 913 e o protocolo 2026-10-23-0042-7781.') === null, 'quase só número não vira áudio')
conferir(textoParaFalarNoWhatsapp('https://palacio.cruzvermelhariodejaneiro.org/chamados/123') === null, 'só um link não vira áudio')

// ---------------------------------------------------------------- formatos
conferir(ehOgg(Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0x00])), 'OggS é Ogg')
conferir(!ehOgg(Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00])), 'ID3 não é Ogg')
conferir(ehMp3(Uint8Array.from([0x49, 0x44, 0x33, 0x04])) && ehMp3(Uint8Array.from([0xff, 0xfb, 0x90])), 'ID3 e quadro de sincronia são MP3')
conferir(!ehMp3(Uint8Array.from([0x4f, 0x67, 0x67, 0x53])), 'Ogg não é MP3')

// ---------------------------------------------------------------- a configuração da tela
conferir(lerConfigDaVoz({ materias: true }).ok === false, 'ligar sem voz é recusado')
conferir(lerConfigDaVoz({ vozId: '../etc', materias: false }).ok === false, 'id de voz inválido é recusado')
conferir(lerConfigDaVoz({ vozId: '21m00Tcm4TlvDq8ikWAM', modelo: 'gpt-4' }).ok === false, 'modelo desconhecido é recusado')
const lida = lerConfigDaVoz({ vozId: '21m00Tcm4TlvDq8ikWAM', vozNome: '  Rachel  ', materias: true, whatsapp: 'sim' })
conferir(lida.ok && lida.valor.materias && !lida.valor.whatsapp && lida.valor.modelo === 'eleven_v4' && lida.valor.vozNome === 'Rachel', 'leitura padrão (só true liga; modelo padrão; nome limpo)')
conferir(lerConfigDaVoz({}).ok, 'tudo desligado e sem voz vale')

// ---------------------------------------------------------------- a página
const base = { titulo: 'Curso de primeiros socorros', subtitulo: 'Inscrições abertas', corpo: 'A filial abriu as inscrições.', slug: 'curso', baseUrl: 'https://cruzvermelhariodejaneiro.org/noticias', publicadoEm: new Date('2026-10-23T12:00:00Z') }
const comAudio = montarPaginaDoArtigo({ ...base, audio: { nome: n1 } })
conferir(comAudio.includes(`<audio controls preload="none" src="${n1}">`), 'a página toca o MP3 da própria pasta')
conferir(comAudio.includes('Ouça esta matéria') && comAudio.includes('voz gerada por inteligência artificial'), 'título e aviso de IA')
conferir(comAudio.includes('"AudioObject"') && comAudio.includes(`https://cruzvermelhariodejaneiro.org/noticias/curso/${n1}`), 'JSON-LD com o áudio no endereço público')
conferir(problemasDaPagina(comAudio).length === 0, `a guarda da página aceita: ${problemasDaPagina(comAudio).join('; ')}`)
const semAudio = montarPaginaDoArtigo(base)
conferir(!semAudio.includes('<audio') && !semAudio.includes('news-ouvir'), 'sem narração, nada de player nem CSS dele')
const malicioso = montarPaginaDoArtigo({ ...base, audio: { nome: '"><script>alert(1)</script>.mp3' } })
conferir(!malicioso.includes('<audio') && !malicioso.includes('alert(1)'), 'nome fora do padrão não entra na página')

console.log(erros ? `${erros} erro(s) em ${casos} casos` : `ok: ${casos} casos`)
process.exit(erros ? 1 : 0)
