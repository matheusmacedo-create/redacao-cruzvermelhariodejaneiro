/**
 * As escolhas do Início da área do voluntário: qual curso puxar, qual a
 * próxima atividade, que oportunidades mostrar, os números e os primeiros
 * passos de quem acabou de chegar. Puro (sem banco): conferido com um script
 * `npx tsx`. Os tipos vêm só como `import type`, para não arrastar o
 * `server-only` dos módulos que leem o banco.
 */

import type { CursoNoCatalogo } from './cursos'
import type { OportunidadeDoMembro } from './oportunidades'
import { resumoDeHoras } from './regras'
import { estado } from '@/lib/oportunidades/regras'
import { situacaoDaFormacao } from '@/lib/participantes/regras'

// ---------------------------------------------------------------- cursos

type CursoResumido = Pick<CursoNoCatalogo, 'id' | 'titulo' | 'temProva' | 'progresso' | 'certificado'>

/** Onde o curso está para a pessoa. */
export type EtapaDoCurso = 'novo' | 'andamento' | 'prova' | 'concluido'

/**
 * Com certificado, está concluído mesmo que a equipe tenha acrescentado aulas
 * depois. Todas as aulas feitas e sem certificado: falta a prova (se o curso
 * tiver prova). Sem prova, o certificado normalmente sai na última aula, mas
 * pode faltar se a equipe tirou a prova depois ou revogou o certificado:
 * nesse caso o curso conta como concluído (aulas feitas) e não volta para
 * "Continuar". A mesma regra no Início e no catálogo de Cursos.
 */
export function etapaDoCurso(c: CursoResumido): EtapaDoCurso {
  if (c.certificado) return 'concluido'
  if (c.progresso.concluido) return c.temProva ? 'prova' : 'concluido'
  return c.progresso.feitas > 0 ? 'andamento' : 'novo'
}

/** Cursos com as aulas todas feitas e a prova final por fazer, na ordem do catálogo. */
export const provasPendentes = <C extends CursoResumido>(cursos: C[]): C[] => cursos.filter((c) => etapaDoCurso(c) === 'prova')

/**
 * O curso do cartão "Continue seu curso": o em andamento mais adiantado (é o
 * mais perto de virar certificado); sem nenhum, o primeiro não começado, na
 * ordem do catálogo. A prova pendente não entra aqui: ela já tem faixa própria
 * no alto do Início, e repetir o mesmo botão duas vezes na tela só confunde.
 */
export function cursoParaContinuar<C extends CursoResumido>(cursos: C[]): C | null {
  const andamento = cursos.filter((c) => etapaDoCurso(c) === 'andamento')
  if (andamento.length) return andamento.reduce((a, b) => (b.progresso.pct > a.progresso.pct ? b : a))
  return cursos.find((c) => etapaDoCurso(c) === 'novo') ?? null
}

// ---------------------------------------------------------------- oportunidades

type OportunidadeResumida = Pick<OportunidadeDoMembro, 'inicio' | 'fim' | 'inscricoes_ate' | 'cancelada_em' | 'vagas' | 'ocupadas' | 'minha'>

const JA_ESTA = new Set(['inscrito', 'espera'])
const porInicio = (a: { inicio: string }, b: { inicio: string }) => Date.parse(a.inicio) - Date.parse(b.inicio)

/**
 * A próxima atividade em que a pessoa está inscrita ou na lista de espera,
 * inclusive a que está acontecendo agora (ainda não terminou). Cancelada não
 * conta: essa aparece em Oportunidades, com o motivo.
 */
export function proximaAtividade<O extends OportunidadeResumida>(lista: O[], agora: Date): O | null {
  const t = agora.getTime()
  return lista.filter((o) => !o.cancelada_em && Date.parse(o.fim) > t && JA_ESTA.has(o.minha ?? '')).sort(porInicio)[0] ?? null
}

/**
 * As que ainda aceitam inscrição (com vaga ou só com lista de espera) e em que
 * a pessoa não está, das mais próximas às mais distantes. Quem cancelou a
 * própria inscrição pode se inscrever de novo, então ela volta para a lista.
 */
export function oportunidadesAbertas<O extends OportunidadeResumida>(lista: O[], agora: Date): O[] {
  return lista.filter((o) => !JA_ESTA.has(o.minha ?? '') && ['aberta', 'lotada'].includes(estado(o, o.ocupadas, agora))).sort(porInicio)
}

/** Já se inscreveu em alguma (a que cancelou não conta). */
export const temInscricao = (lista: Pick<OportunidadeDoMembro, 'minha'>[]) => lista.some((o) => !!o.minha && o.minha !== 'cancelado')

// ---------------------------------------------------------------- números

export type NumerosDoInicio = { horasNoAno: number; horasTotal: number; acoesNoAno: number; formacoesEmDia: number; vazio: boolean }

/**
 * A faixa de números: horas no ano e no total, ações no ano e formações em dia
 * (não vencidas; sem validade conta como em dia). `vazio` quando tudo é zero:
 * aí a faixa some, em vez de mostrar uma parede de zeros a quem acabou de chegar.
 */
export function numerosDoInicio(atividades: { data: string; horas: number }[], formacoes: { valido_ate: string | null }[], hoje: string): NumerosDoInicio {
  const h = resumoDeHoras(atividades, hoje)
  const formacoesEmDia = formacoes.filter((f) => situacaoDaFormacao(f.valido_ate, hoje) !== 'vencida').length
  return { horasNoAno: h.noAno, horasTotal: h.total, acoesNoAno: h.acoesNoAno, formacoesEmDia, vazio: h.total === 0 && h.acoesNoAno === 0 && formacoesEmDia === 0 }
}

// ---------------------------------------------------------------- primeiros passos

export type PrimeiroPasso = { chave: 'emergencia' | 'curso' | 'acao'; rotulo: string; texto: string; href: string; botao: string; feito: boolean }

const preenchido = (s: string | null | undefined) => !!s && s.trim().length > 0

/**
 * Os primeiros passos de quem acabou de chegar: só aparecem quando ainda não há
 * horas, formações nem inscrições (depois disso o Início já tem o que mostrar).
 * Fora desse caso → null. O passo do curso só entra se houver curso publicado,
 * para não mandar a pessoa a uma lista vazia; com um curso já começado, o
 * botão leva direto a ele.
 */
export function primeirosPassos(d: {
  horas: number; formacoes: number; inscrito: boolean
  emergencia: { nome: string | null; telefone: string | null }
  cursos: CursoResumido[]
}): PrimeiroPasso[] | null {
  if (d.horas > 0 || d.formacoes > 0 || d.inscrito) return null
  const passos: PrimeiroPasso[] = [{
    chave: 'emergencia', rotulo: 'Complete seu contato de emergência', texto: 'Quem a coordenação deve avisar se algo acontecer durante uma ação.',
    href: '/membro/perfil#emergencia', botao: 'Completar agora', feito: preenchido(d.emergencia.nome) && preenchido(d.emergencia.telefone),
  }]
  if (d.cursos.length) {
    const comecado = cursoParaContinuar(d.cursos)
    const andamento = comecado && etapaDoCurso(comecado) === 'andamento' ? comecado : null
    passos.push({
      chave: 'curso', rotulo: 'Faça seu primeiro curso', texto: 'Os cursos ficam aqui na área. Concluiu, o certificado sai na hora.',
      href: andamento ? `/membro/cursos/${andamento.id}` : '/membro/cursos', botao: andamento ? 'Continuar o curso' : 'Ver cursos',
      feito: d.cursos.some((c) => !!c.certificado),
    })
  }
  passos.push({
    chave: 'acao', rotulo: 'Inscreva-se numa ação', texto: 'Ações, plantões e eventos da filial. Com a presença confirmada, as horas entram no seu cadastro.',
    href: '/membro/oportunidades', botao: 'Ver oportunidades', feito: d.inscrito,
  })
  return passos
}

// ---------------------------------------------------------------- textos

/**
 * O vínculo em forma neutra, para a linha sob o nome. "Voluntário" some: toda
 * pessoa desta área é voluntária, e a linha de baixo já diz "No voluntariado".
 * Vínculo desconhecido também some, em vez de mostrar a chave do banco.
 */
const VINCULO_NEUTRO: Record<string, string | null> = { voluntario: null, jovem: 'Juventude', instrutor: 'Equipe de instrução' }

/** "Socorrista · Humanitário, GRD" (vínculo neutro, função e setores). Vazio → ''. */
export function linhaDoPerfil(p: { vinculo: string; funcao: string | null; setores: string[] | null }): string {
  const vinculo = Object.hasOwn(VINCULO_NEUTRO, p.vinculo) ? VINCULO_NEUTRO[p.vinculo] : null
  const setores = (p.setores ?? []).map((s) => s.trim()).filter(Boolean).join(', ')
  return [vinculo, p.funcao?.trim(), setores].filter(Boolean).join(' · ')
}

/**
 * A instituição da formação, menos quando é a própria Área do Voluntário (o
 * certificado dos cursos daqui grava "… (Área do Voluntário)"): repetir isso
 * em cada linha não informa nada.
 */
export function instituicaoVisivel(instituicao: string | null | undefined): string | null {
  const s = instituicao?.trim()
  return s && !/\(Área do Voluntário\)$/i.test(s) ? s : null
}

/** "A", "A e B", "A, B e C". */
export function listaLegivel(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}
