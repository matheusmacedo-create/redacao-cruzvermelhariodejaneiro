import { descricaoCurta, MAXIMO_DO_TEXTO, montarChamadas, type Chamada, type ChamadaPronta, type Marcadores } from '@/lib/cartaz/copy'
import { normalizar } from '@/lib/chamados/setores'

/**
 * O cartaz com QR de matrícula de cada curso da Escola (/escola/cartaz): o QR
 * leva à página do curso cadastrada no Marketing (a de venda ou de inscrição)
 * ou, sem ela, à página de matrícula dos cursos presenciais no site da
 * filial. É um cartaz para o público: mural da sede, unidades parceiras,
 * escolas, empresas.
 *
 * A copy é escolhida na hora de imprimir (lib/cartaz/copy.ts): chamadas
 * genéricas (valem para qualquer curso), chamadas escritas para os cursos
 * conhecidos (lib/escola/cartaz-copy.ts, pelo modelo que a palavra no nome
 * indica) e título e frase livres.
 *
 * Puro: a página e a conferência (`npx tsx scripts/conferir-cartaz-dos-cursos.ts`)
 * usam as mesmas regras.
 */

/** A página de matrícula dos cursos presenciais, no site da filial. */
export const MATRICULA_NO_SITE = 'https://cruzvermelhariodejaneiro.org/matricula-cursos-presenciais/'
export const PARAMETRO_DO_CURSO = 'curso'
export const CHAVE_PADRAO = 'inscricoes'
export const TEXTO_PADRAO = 'Curso presencial na Cruz Vermelha RJ, com certificado. Aponte a câmera e faça a matrícula pelo celular.'
/** Nome de curso mais comprido que isto não cabe na linha do título: vai para a frase. */
export const NOME_LONGO = 40
const TEXTO_PADRAO_CURTO = 'Curso presencial na Cruz Vermelha RJ, com certificado.'

export type CursoDoCartaz = { id: string; nome: string; descricao: string | null; paginaUrl: string | null }

/** Para onde o QR leva: a página do curso cadastrada (só https) ou, sem ela, a matrícula no site. */
export function linkDeMatricula(c: { paginaUrl: string | null }): { url: string; daPagina: boolean } {
  const u = c.paginaUrl?.trim() ?? ''
  return /^https:\/\/[^\s]+$/.test(u) ? { url: u, daPagina: true } : { url: MATRICULA_NO_SITE, daPagina: false }
}

/**
 * Os cursos conhecidos, pela palavra no nome (sem acento): a chave é a da
 * copy escrita para ele. O Lei Lucas vem antes de Primeiros Socorros porque
 * o nome dele também tem "Primeiros Socorros".
 */
const MODELOS: [string, RegExp][] = [
  ['lei-lucas', /lei lucas|crianca/],
  ['primeiros-socorros', /primeiros socorros|socorrista/],
  ['sbv', /suporte basico|\bsbv\b|reanimacao|\brcp\b/],
  ['puncao', /puncao|venosa/],
  ['bombeiro', /bombeiro|brigad|incendio/],
  ['cuidador', /cuidador/],
  ['micropigmentacao', /micropigmenta|labial/],
]
export function modeloDoCurso(nome: string): string | null {
  const n = normalizar(nome)
  return MODELOS.find(([, re]) => re.test(n))?.[0] ?? null
}

/**
 * Marcadores deste cartaz (lib/cartaz/copy.ts):
 *   {curso}     o nome do curso, como cadastrado
 *   {descricao} a descrição do curso, se cabe na folha (ou a primeira frase, ou o texto padrão)
 * Nunca o nome do curso por extenso: o cadastro pode mudar. Com nome comprido
 * (NOME_LONGO), as chamadas que põem {curso} no título saem do seletor e a de
 * sempre vira INSCRICOES_NOME_LONGO, com o nome na frase.
 */
export const CHAMADAS_DO_CURSO: Record<string, Chamada> = {
  inscricoes: { rotulo: 'Inscrições abertas', titulo: ['Inscrições abertas:', '{curso}.'], texto: '{descricao}' },
  vagas: { rotulo: 'Vagas abertas. Matricule-se.', titulo: ['Vagas abertas.', 'Matricule-se.'], texto: '{curso}: presencial, na sede, com certificado da Cruz Vermelha.' },
  'nova-turma': { rotulo: 'Nova turma. Garanta a vaga.', titulo: ['Nova turma.', 'Garanta a vaga.'], texto: '{curso}, presencial, na sede. A secretaria confirma turma e horário.' },
  aprenda: { rotulo: 'Aprenda com a Cruz Vermelha', titulo: ['Aprenda com', 'a Cruz Vermelha.'], texto: '{curso}, presencial, com certificado no seu currículo.' },
  'na-cruz-vermelha': { rotulo: '… na Cruz Vermelha', titulo: ['{curso}', 'na Cruz Vermelha.'], texto: 'Aulas presenciais na sede, no Centro do Rio, e o certificado no seu currículo. Faça a matrícula pelo site.' },
  'no-curriculo': { rotulo: 'No currículo: …', titulo: ['No currículo:', '{curso}.'], texto: 'Certificado da Cruz Vermelha, aulas presenciais na sede e uma habilidade que abre portas. Faça a matrícula pelo site; a secretaria confirma a turma.' },
}

const INSCRICOES_NOME_LONGO: Chamada = { rotulo: 'Inscrições abertas', titulo: ['Inscrições abertas.', 'Matricule-se.'], texto: '{curso}: {descricao}' }
export const nomeLongo = (c: { nome: string }) => c.nome.trim().length > NOME_LONGO

/** A copy escrita para cada curso conhecido, pelo modelo: lib/escola/cartaz-copy.ts. */
export type CopyPorCurso = Record<string, Record<string, Chamada>>

export function marcadoresDoCurso(c: CursoDoCartaz): Marcadores {
  const nome = c.nome.trim()
  // Com o nome na frase, a descrição divide o espaço com ele.
  const cabe = nomeLongo(c) ? MAXIMO_DO_TEXTO - nome.length - 2 : MAXIMO_DO_TEXTO
  return { valores: { curso: nome, descricao: descricaoCurta(c.descricao, cabe, nomeLongo(c) ? TEXTO_PADRAO_CURTO : TEXTO_PADRAO) } }
}

/** As chamadas que valem para este curso, na ordem do seletor: a de sempre, as escritas para ele, as outras genéricas. */
export function chamadasDoCurso(c: CursoDoCartaz, porModelo: CopyPorCurso): ChamadaPronta[] {
  const modelo = modeloDoCurso(c.nome)
  const longo = nomeLongo(c)
  const fonte: [string, Chamada][] = [
    [CHAVE_PADRAO, longo ? INSCRICOES_NOME_LONGO : CHAMADAS_DO_CURSO[CHAVE_PADRAO]],
    ...Object.entries(modelo ? porModelo[modelo] ?? {} : {}),
    ...Object.entries(CHAMADAS_DO_CURSO).filter(([k, ch]) => k !== CHAVE_PADRAO && !(longo && ch.titulo.some((t) => t.includes('{curso}')))),
  ]
  return montarChamadas(fonte, marcadoresDoCurso(c))
}

/** Os três passos impressos no cartaz (para o público, sem login). */
export const PASSOS_DA_MATRICULA = [
  'Aponte a câmera do celular para o código.',
  'Veja as datas, o valor e o programa do curso.',
  'Faça a matrícula pelo próprio celular. A secretaria confirma turma e horário.',
] as const
