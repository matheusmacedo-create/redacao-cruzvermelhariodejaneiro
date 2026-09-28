import type { CopyPorCurso } from './cartaz'

/**
 * A copy do cartaz de matrícula escrita para cada curso conhecido, pelo
 * modelo que a palavra no nome indica (lib/escola/cartaz.ts, modeloDoCurso).
 * Entra no seletor logo depois de "Inscrições abertas", antes das genéricas.
 *
 * Saiu de um painel de redação (3 ângulos × 3 lentes: leitura a 3 m, voz da
 * casa, regras técnicas), com os melhores de cada curso revisados à mão. A
 * copy de um curso pode citar o tema dele (a Lei Lucas, a punção); nunca
 * preço, data ou carga horária. Conferido por scripts/conferir-cartaz-dos-cursos.ts.
 */
export const COPY_POR_CURSO: CopyPorCurso = {
  'primeiros-socorros': {
    'saber-agir': { rotulo: 'Saber agir salva vidas', titulo: ['Saber agir', 'salva vidas.'], texto: 'Aprenda a socorrer nos primeiros minutos. Matrícula aberta na Cruz Vermelha.' },
    'o-que-fazer': { rotulo: 'Saber o que fazer quando alguém precisa', titulo: ['Saber o que fazer', 'quando alguém precisa.'], texto: 'Em casa, na rua ou no trabalho, os primeiros minutos fazem diferença. Aprenda a agir com calma e faça sua matrícula pelo site.' },
  },
  'lei-lucas': {
    'trabalha-com-criancas': { rotulo: 'Trabalha com crianças? Tenha o certificado', titulo: ['Trabalha com crianças?', 'Tenha o certificado.'], texto: 'A Lei Lucas exige preparo em primeiros socorros em escolas e creches. Com o certificado da Cruz Vermelha, você atende à lei e valoriza o currículo.' },
    'quem-cuida': { rotulo: 'Quem cuida de crianças sabe o que fazer', titulo: ['Quem cuida de crianças', 'sabe o que fazer.'], texto: 'A Lei Lucas exige e as crianças merecem: quem trabalha com elas precisa saber agir num engasgo ou numa queda. Matricule-se pelo site.' },
  },
  puncao: {
    'com-seguranca': { rotulo: 'Punção venosa com segurança', titulo: ['Punção venosa', 'com segurança.'], texto: 'Prática presencial para quem atua na saúde. Certificado da Cruz Vermelha.' },
    'mao-firme': { rotulo: 'Mão firme e cuidado em cada punção', titulo: ['Mão firme e cuidado', 'em cada punção.'], texto: 'Para profissionais e estudantes da saúde: técnica, segurança e respeito a quem está do outro lado da agulha. Matricule-se pelo site.' },
  },
  sbv: {
    'saiba-agir': { rotulo: 'Parada cardíaca: saiba agir', titulo: ['Parada cardíaca:', 'saiba agir.'], texto: 'Aprenda a reanimar e a pedir o socorro certo. Matrícula aberta.' },
    'voce-pode-agir': { rotulo: 'Parada cardíaca: você pode agir', titulo: ['Parada cardíaca:', 'você pode agir.'], texto: 'Reconhecer os sinais e começar a reanimação até o socorro chegar salva vidas. Um curso para qualquer pessoa. Matricule-se pelo site.' },
  },
  bombeiro: {
    'entrar-na-area': { rotulo: 'Quer trabalhar com combate a incêndio?', titulo: ['Quer trabalhar', 'com combate a incêndio?'], texto: 'Formação em prevenção e combate a incêndio, com prática e o certificado da Cruz Vermelha. Um passo firme para quem quer entrar na área. Matricule-se.' },
    'combater-o-fogo': { rotulo: 'Combater o fogo é profissão', titulo: ['Combater o fogo', 'é profissão.'], texto: 'Formação presencial em prevenção e combate a incêndio. Matricule-se.' },
  },
  cuidador: {
    'quem-cuidou': { rotulo: 'Cuidar de quem cuidou de nós', titulo: ['Cuidar de quem', 'cuidou de nós.'], texto: 'Para quem cuida de uma pessoa idosa em casa ou quer trabalhar cuidando: técnica, paciência e respeito. Matricule-se pelo site.' },
    profissao: { rotulo: 'Cuidar de idosos pode ser a sua profissão', titulo: ['Cuidar de idosos', 'pode ser a sua profissão.'], texto: 'Formação para quem cuida ou quer trabalhar cuidando de pessoas idosas, com o certificado da Cruz Vermelha no currículo. Matricule-se pelo site.' },
  },
  micropigmentacao: {
    'estetica-labial': { rotulo: 'Estética labial com segurança', titulo: ['Estética labial', 'com segurança.'], texto: 'Técnica e biossegurança para profissionais da estética. Matricule-se.' },
    'beleza-com-cuidado': { rotulo: 'Beleza com técnica, segurança e cuidado', titulo: ['Beleza com técnica,', 'segurança e cuidado.'], texto: 'Para profissionais da estética que querem oferecer um resultado bonito com biossegurança e respeito ao cliente. Matricule-se pelo site.' },
  },
}
