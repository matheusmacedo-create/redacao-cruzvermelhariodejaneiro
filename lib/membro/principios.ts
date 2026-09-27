/**
 * Os sete Princípios Fundamentais do Movimento Internacional da Cruz Vermelha
 * e do Crescente Vermelho, no texto do Manual de Identidade Institucional da
 * CVB (p. 52), e a regra do perfil pessoal nas redes (p. 48, regra 9).
 * Puro: o Início e a página /membro/principios da Área do Voluntário usam os
 * mesmos. O texto oficial vai sem mudança; o resumo é a frase curta do Início.
 */

export type Principio = { nome: string; resumo: string; texto: string }

export const PRINCIPIOS: readonly Principio[] = [
  {
    nome: 'Humanidade',
    resumo: 'Evitar e aliviar o sofrimento humano, proteger a vida e a saúde e fazer respeitar cada pessoa.',
    texto: 'A Cruz Vermelha, nascida da preocupação de prestar socorro, indistintamente, aos feridos nos campos de batalha, esforça-se, no âmbito internacional e nacional, em evitar e aliviar o sofrimento humano sob quaisquer circunstâncias. Procura não só proteger a vida e a saúde, como também fazer respeitar o ser humano. Promove a compreensão mútua, a amizade, a cooperação e a paz duradoura entre todos os povos.',
  },
  {
    nome: 'Imparcialidade',
    resumo: 'Ajudar sem distinção de nacionalidade, raça, religião, condição social ou opinião política, primeiro quem mais precisa.',
    texto: 'A Cruz Vermelha não faz nenhuma discriminação de nacionalidade, raça, religião, condição social ou opinião política. Procura apenas minorar o sofrimento humano, dando prioridade aos casos mais urgentes de infortúnio.',
  },
  {
    nome: 'Neutralidade',
    resumo: 'Não tomar partido em conflitos nem em controvérsias políticas, raciais, religiosas ou ideológicas, para ter a confiança de todos.',
    texto: 'A fim de merecer a confiança de todos, a Cruz Vermelha se abstém de tomar partido em hostilidades ou de participar, em qualquer tempo, de controvérsias de natureza política, racial, religiosa ou ideológica.',
  },
  {
    nome: 'Independência',
    resumo: 'Auxiliar os poderes públicos, mas com autonomia para agir sempre de acordo com os Princípios.',
    texto: 'A Cruz Vermelha é independente. As Sociedades Nacionais, auxiliares dos poderes públicos em suas atividades humanitárias, sujeitas às leis que regem seus respectivos países, devem, no entanto, manter sua autonomia, a fim de poderem agir sempre de acordo com os Princípios Fundamentais da Cruz Vermelha.',
  },
  {
    nome: 'Voluntariado',
    resumo: 'Socorrer por vontade própria, sem nenhuma finalidade lucrativa.',
    texto: 'A Cruz Vermelha é uma Instituição voluntária de Socorros sem nenhuma finalidade lucrativa.',
  },
  {
    nome: 'Unidade',
    resumo: 'Uma só Cruz Vermelha em cada país, aberta a todos, em todo o território.',
    texto: 'Só pode existir uma Sociedade de Cruz Vermelha em cada país. Ela está aberta a todos e exerce sua ação humanitária em todo território do mesmo.',
  },
  {
    nome: 'Universalidade',
    resumo: 'Uma instituição mundial: todas as Sociedades têm os mesmos direitos e deveres e se ajudam.',
    texto: 'A Cruz Vermelha é uma instituição mundial, na qual todas as Sociedades têm iguais direitos e dividem iguais responsabilidades e deveres, ajudando-se mutuamente.',
  },
]

export const ORIGEM_DOS_PRINCIPIOS = 'Adotados por unanimidade pela XX Conferência Internacional da Cruz Vermelha, em Viena, em outubro de 1965.'

/** A regra 9 das mídias sociais (O Perfil), em linguagem direta, e o texto do manual. */
export const REGRA_DO_PERFIL = {
  pontos: [
    'Pense antes de publicar: quem é da Cruz Vermelha é visto como parte dela, também no perfil pessoal.',
    'Não use o emblema da Cruz Vermelha na foto ou no nome do seu perfil, a não ser em campanhas da própria instituição.',
    'Não publique assuntos pessoais nas páginas oficiais da Cruz Vermelha.',
    'Pode, sim, postar textos e fotos das suas ações voluntárias.',
  ],
  texto: 'Funcionário, voluntário, membros e parceiros da Cruz Vermelha Brasileira deverão analisar previamente suas publicações na Rede. Salvo quando em campanhas próprias da instituição, essas pessoas não estão autorizadas a usar o emblema da Cruz Vermelha em seus perfis nas Mídias Sociais. Também não estão autorizadas a usar as Páginas Institucionais nas Redes com publicações pessoais. Não há proibição em postar textos ou imagens referentes às suas ações voluntárias. Porém, a liturgia dos cargos que ocupam na instituição deve ser sempre considerada quando da propagação de comentários parciais que conflitam com os ideais da instituição e/ou que venham causar prejuízo à sua imagem.',
  /** O emblema é protegido por lei: só a Cruz Vermelha Brasileira pode usá-lo em tempo de paz. */
  lei: 'Decreto nº 2.380, de 31 de dezembro de 1910: somente à Cruz Vermelha Brasileira é lícito empregar, em tempo de paz, o nome e o sinal da cruz vermelha. O uso ilegal do emblema é crime.',
}
