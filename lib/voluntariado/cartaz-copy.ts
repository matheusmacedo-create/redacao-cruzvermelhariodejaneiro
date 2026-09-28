import type { CopyDoVoluntariado } from './cartaz'

/**
 * A copy dos cartazes do Voluntariado, por alvo. A primeira de cada alvo é a
 * de sempre (chave "padrao", lib/voluntariado/cartaz.ts); as outras entram no
 * seletor na ordem daqui.
 *
 * Saiu de um painel de redação (3 ângulos × 3 lentes: leitura a 3 m, voz da
 * casa, encaixe no alvo), com as melhores revisadas à mão. O cartaz de
 * inscrição fala com quem ainda não é voluntário; o da área, com quem já é.
 * Sem marcadores: nada aqui depende de cadastro. Conferido por
 * scripts/conferir-cartaz-do-voluntariado.ts.
 */
export const COPY_DO_VOLUNTARIADO: CopyDoVoluntariado = {
  inscricao: {
    padrao: { rotulo: 'Tem um tempo? Seja voluntário.', titulo: ['Tem um tempo?', 'Seja voluntário.'], texto: 'Ações humanitárias, primeiros socorros, campanhas de saúde e emergências. Há lugar para você, e formação para quem chega.' },
    'faca-parte': { rotulo: 'Faça parte da Cruz Vermelha', titulo: ['Faça parte', 'da Cruz Vermelha.'], texto: 'Doe tempo e cuidado a quem precisa. A inscrição leva poucos minutos, e a coordenação entra em contato com você.' },
    ajudar: { rotulo: 'Ajudar começa aqui', titulo: ['Ajudar', 'começa aqui.'], texto: 'Sem experiência? A Cruz Vermelha forma quem chega. Inscreva-se pelo celular.' },
    'rio-precisa': { rotulo: 'O Rio precisa de voluntários', titulo: ['O Rio precisa', 'de voluntários.'], texto: 'Emergências, saúde, doações, Juventude. Na inscrição, você diz onde quer atuar.' },
    'quer-ajudar': { rotulo: 'Quer ajudar? Comece pela inscrição.', titulo: ['Quer ajudar?', 'Comece pela inscrição.'], texto: 'Ações humanitárias, primeiros socorros, campanhas e emergências. Você recebe formação e entra numa equipe que já atua no Rio.' },
    'estar-presente': { rotulo: 'Estar presente onde alguém precisa', titulo: ['Estar presente', 'onde alguém precisa.'], texto: 'É assim que a Cruz Vermelha atua no Rio. Você pode fazer parte: há formação para quem chega e trabalho que faz diferença.' },
    'se-aprende': { rotulo: 'Servir quem precisa se aprende aqui', titulo: ['Servir quem precisa', 'se aprende aqui.'], texto: 'Ninguém chega pronto. Quem entra no voluntariado passa por cursos e aprende com quem já está no campo.' },
  },
  area: {
    padrao: { rotulo: 'Voluntário, sua área é aqui', titulo: ['Voluntário,', 'sua área é aqui.'], texto: 'Horas, certificados, plantões e avisos, tudo num só lugar. Entre com o seu e-mail.' },
    'proxima-acao': { rotulo: 'Próxima ação? Inscreva-se aqui.', titulo: ['Próxima ação?', 'Inscreva-se aqui.'], texto: 'Plantões, eventos e cursos abertos na Área do Voluntário. Garanta a sua vaga e acompanhe os avisos.' },
    'suas-horas': { rotulo: 'Suas horas já estão lá', titulo: ['Suas horas', 'já estão lá.'], texto: 'Confira o registro, baixe os certificados e inscreva-se na próxima ação.' },
    coordenacao: { rotulo: 'Fique por dentro e fale com a coordenação', titulo: ['Fique por dentro', 'e fale com a coordenação.'], texto: 'Avisos, cursos novos e o que vem pela frente estão na Área do Voluntário. Se precisar, é por lá que você fala com a equipe.' },
    'cada-hora': { rotulo: 'Cada hora sua faz parte da história', titulo: ['Cada hora sua', 'faz parte da história.'], texto: 'Na Área do Voluntário você acompanha as horas registradas, se inscreve em ações e plantões e baixa os certificados.' },
  },
}
