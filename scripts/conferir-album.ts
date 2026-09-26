/**
 * Confere as regras do Álbum do evento: `npx tsx scripts/conferir-album.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import { ehMiniaturaDoEnvio, entraNoAlbum, lerEvento, miniaturaDaChave, nomeDoZip, nomesNoZip, resumoDoAlbum } from '../lib/envios/album'
import { chaveDoArquivo, ehChaveDeEnvio, nomeCanonico, nomeDaChave } from '../lib/envios/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
  }
}

const envio = '1f0c2d9a-3b4c-4d5e-8f60-718293a4b5c6'
const chave = chaveDoArquivo(envio, '2026-09', 'a1b2c3d4', 'IMG 0001.JPG')
igual(ehChaveDeEnvio(chave, envio), true, 'chave do arquivo segue válida')
const mini = miniaturaDaChave(chave)
igual(mini, `entrada/envios/2026-09/${envio}/mini/a1b2c3d4.jpg`, 'miniatura ao lado do arquivo')
igual(ehMiniaturaDoEnvio(mini!, envio), true, 'miniatura reconhecida')
igual(ehMiniaturaDoEnvio(mini!, '00000000-0000-0000-0000-000000000000'), false, 'miniatura de outro envio não passa')
igual(ehChaveDeEnvio(mini!, envio), false, 'miniatura não é confundida com arquivo')
igual(miniaturaDaChave('outra/coisa.jpg'), null, 'chave estranha não vira miniatura')

igual(lerEvento({ nome: '  Ação  na Central  ', data: '2026-10-03', local: ' Central do Brasil ' }).dados, { nome: 'Ação na Central', data_do_evento: '2026-10-03', local: 'Central do Brasil' }, 'ficha do evento')
igual(Boolean(lerEvento({ nome: 'ab' }).erro), true, 'nome curto recusado')
igual(Boolean(lerEvento({ nome: 'Evento', data: '03/10/2026' }).erro), true, 'data em outro formato recusada')

const nomes = nomesNoZip([
  { id: '1', nome: '2026-09-26-acao-na-central-ana-souza-001.jpg', autor: 'Ana Souza' },
  { id: '2', nome: 'IMG_0001.jpg', autor: 'Ana Lima' },
  { id: '3', nome: 'IMG_0001.jpg', autor: 'Ana Costa' },
  { id: '4', nome: 'a/b:c.mp4', autor: 'Bruno' },
])
igual([...nomes.values()], ['2026-09-26-acao-na-central-ana-souza-001.jpg', 'Ana - IMG_0001.jpg', 'Ana - IMG_0001 (2).jpg', 'Bruno - a-b-c.mp4'], 'nomes no zip: canônico como está; antigo com o autor; sem repetir nem barra')

igual(resumoDoAlbum([{ categoria: 'foto', autor: 'Ana' }, { categoria: 'foto', autor: 'ana ' }, { categoria: 'video', autor: 'Bruno' }]), '2 fotos e 1 vídeo de 2 pessoas', 'resumo do álbum')
igual(resumoDoAlbum([]), 'Nenhuma foto ainda', 'álbum vazio')
igual(nomeDoZip('Ação de Prevenção — Central!'), 'acao-de-prevencao-central.zip', 'nome do zip')
igual(nomeDoZip('Ação', true), 'acao-fotos.zip', 'zip só de fotos')
igual([
  entraNoAlbum({ id: '1', nome: 'a', categoria: 'foto', tamanho: 1, autor: 'x' }),
  entraNoAlbum({ id: '2', nome: 'a', categoria: 'audio', tamanho: 1, autor: 'x' }),
  entraNoAlbum({ id: '3', nome: 'a', categoria: 'foto', tamanho: 1, autor: 'x', oculto: true }),
  entraNoAlbum({ id: '4', nome: 'a', categoria: 'video', tamanho: 1, autor: 'x', estado: 'enviando' }),
], [true, false, false, false], 'o que entra no álbum')

// Nomes para SEO e guarda longa
const base = { titulo: 'Ação de prevenção na Central do Brasil', data: '2026-09-26', hoje: '2026-09-27', autor: 'Ana Maria de Souza', indice: 1, nomeOriginal: 'IMG_4821.JPEG' }
igual(nomeCanonico(base), '2026-09-26-acao-de-prevencao-na-central-do-brasil-ana-souza-001.jpg', 'nome canônico: data, assunto, autor, número')
igual(nomeCanonico({ ...base, data: null, indice: 12, nomeOriginal: 'video.MOV', autor: 'Bruno' }), '2026-09-27-acao-de-prevencao-na-central-do-brasil-bruno-012.mov', 'sem data usa hoje; extensão minúscula')
igual(nomeCanonico({ ...base, titulo: '!!!', nomeOriginal: 'sem-extensao' }), '2026-09-26-acao-ana-souza-001', 'título vazio e sem extensão')
const longo = nomeCanonico({ ...base, titulo: 'Grande mutirão de vacinação e prevenção de doenças respiratórias na zona norte do Rio de Janeiro em setembro', autor: 'Maria Aparecida dos Santos Oliveira Pereira' })
igual(longo.length <= 110 && !/--|-\./.test(longo), true, `nome longo cortado sem hífen solto (${longo})`)
const chaveNova = chaveDoArquivo(envio, '2026-09', 'a1b2c3d4', nomeCanonico(base))
igual(ehChaveDeEnvio(chaveNova, envio), true, 'chave com nome canônico é válida')
igual(nomeDaChave(chaveNova), '2026-09-26-acao-de-prevencao-na-central-do-brasil-ana-souza-001.jpg', 'nome lido de volta da chave')
igual(nomeDaChave(chave), 'IMG 0001.jpg', 'envio antigo: nome original (extensão já em minúscula)')

if (falhas) { console.error(`\n${falhas} verificação(ões) falharam.`); process.exit(1) }
console.log('Álbum do evento: tudo certo.')
