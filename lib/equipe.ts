/**
 * A equipe da filial e os setores dela, como a instituição os descreve hoje.
 *
 * É a fonte do campo "Coordenação" (Registrar, Usuários) e da lista "da equipe,
 * ainda sem acesso" na tela de Usuários — é ali que cada pessoa daqui ganha
 * login, com um clique do administrador. Nenhuma conta nasce sozinha a partir
 * deste arquivo: estar aqui não dá acesso a nada.
 *
 * `papelSugerido` é só o valor que vem pré-selecionado na criação; quem decide
 * é o administrador, na hora de criar. Mudou a equipe, muda aqui.
 */

import type { Papel } from './permissoes'

export type Pessoa = { nome: string; cargo?: string }
export type Setor = { nome: string; descricao: string; papelSugerido: Papel; pessoas: Pessoa[] }

export const SETORES: Setor[] = [
  {
    nome: 'Diretoria',
    descricao: 'Presidência, vice-presidência e diretoria financeira da filial.',
    papelSugerido: 'colaborador',
    pessoas: [
      { nome: 'Luiz Carlos dos Santos', cargo: 'Presidente' },
      { nome: 'Antonio Pedregal', cargo: 'Vice-Presidente' },
      { nome: 'Jorge Braz', cargo: 'Diretor Financeiro' },
    ],
  },
  {
    nome: 'Jurídico',
    descricao: 'Contratos, convênios e a conformidade dos atos da filial.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Jorge Magno' }, { nome: 'João Stogmiller' }, { nome: 'Marcelo Laia' }],
  },
  {
    nome: 'Comunicação Social',
    descricao: 'Canais oficiais, site, redes e relacionamento com a imprensa.',
    papelSugerido: 'editor',
    pessoas: [{ nome: 'Maria Eduarda Neves' }, { nome: 'Matheus Macedo' }, { nome: 'Daniel Lamim' }, { nome: 'Salomão Pedregal' }],
  },
  {
    nome: 'Tecnologia da Informação',
    descricao: 'Sistemas, site e infraestrutura digital da filial.',
    papelSugerido: 'admin',
    pessoas: [{ nome: 'Matheus Neves' }],
  },
  {
    nome: 'Humanitário',
    descricao: 'Ações de assistência e apoio às comunidades do estado.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Dayse Oliveira' }],
  },
  {
    nome: 'Educação e Saúde',
    descricao: 'A Escola de Educação e Saúde CVB-RJ e os cursos presenciais na sede.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Marcio Romero' }, { nome: 'Alessandra Rachel' }],
  },
  {
    nome: 'Primeiros Socorros',
    descricao: 'Formação em primeiros socorros e cobertura de eventos e ações.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Luiz Anjo' }],
  },
  {
    nome: 'GRD',
    descricao: 'Gestão de Riscos de Desastres: preparação e resposta a emergências.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Éder Hipólito' }],
  },
  {
    nome: 'Voluntariado',
    descricao: 'Cadastro, formação inicial e acompanhamento dos voluntários.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Elisabete Souza' }],
  },
  {
    nome: 'Juventude',
    descricao: 'Frentes conduzidas por jovens voluntários da filial.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Hannah Terto' }],
  },
  {
    nome: 'Psicologia / Serviço Social',
    descricao: 'Apoio psicossocial nas ações e às equipes.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Rejane Romero' }, { nome: 'Rebecca Romero' }],
  },
  {
    nome: 'Esportes',
    descricao: 'Atividades esportivas e de integração com a comunidade.',
    papelSugerido: 'colaborador',
    pessoas: [{ nome: 'Clara Gracie' }],
  },
]

export const NOMES_DOS_SETORES = SETORES.map((s) => s.nome)

/** Comparação de nomes sem acento, caixa ou espaço extra: "Éder" = "eder". */
export const chaveDoNome = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Usuário sugerido: primeiro e último nome, sem acento — o mesmo formato
 * `nome.sobrenome` que a tela de login pede. "Éder Hipólito" → "eder.hipolito".
 */
export function usuarioSugerido(nome: string): string {
  const partes = chaveDoNome(nome).replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean)
  if (!partes.length) return ''
  const base = partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`
  return base.slice(0, 40)
}

/** Todas as pessoas da equipe, cada uma com o setor e a sugestão de acesso. */
export const PESSOAS_DA_EQUIPE = SETORES.flatMap((s) =>
  s.pessoas.map((p) => ({ nome: p.nome, cargo: p.cargo ?? '', setor: s.nome, papel: s.papelSugerido, usuario: usuarioSugerido(p.nome) })),
)
