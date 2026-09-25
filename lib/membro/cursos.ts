import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { aulasEmOrdem, progresso, type Progresso } from '@/lib/cursos/regras'
import { urlDaCapa } from '@/lib/cursos/capa'
import { dataCurta } from './regras'
import type { Membro } from './sessao'

/**
 * Os cursos vistos pelo voluntário. Só cursos publicados do espaço dele; o
 * progresso e os certificados, só os dele. O gabarito da prova nunca sai
 * daqui (as questões vão sem a coluna `correta`).
 */

export type CursoNoCatalogo = {
  id: string; titulo: string; resumo: string | null; capa: string | null; carga_horaria: number | null
  temProva: boolean; aulas: number; duracao: number; progresso: Progresso; certificado: string | null
}


type Curso = { id: string; titulo: string; resumo: string | null; descricao: string | null; capa_caminho: string | null; carga_horaria: number | null; nota_minima: number | null; validade_meses: number | null; ordem: number }
type Modulo = { id: string; curso_id: string; titulo: string; ordem: number }
type Aula = { id: string; curso_id: string; modulo_id: string; titulo: string; youtube_id: string | null; texto: string | null; material_id: string | null; duracao_min: number | null; ordem: number }

async function carregar(m: Membro, cursoId?: string) {
  const admin = createAdminClient()
  let qc = admin.from('cursos').select('id,titulo,resumo,descricao,capa_caminho,carga_horaria,nota_minima,validade_meses,ordem')
    .eq('workspace_id', m.workspaceId).eq('publicado', true)
  if (cursoId) qc = qc.eq('id', cursoId)
  const { data: cursos } = await qc.order('ordem').order('titulo')
  const ids = (cursos ?? []).map((c) => c.id as string)
  if (!ids.length) return { cursos: [] as Curso[], modulos: [] as Modulo[], aulas: [] as Aula[], feitas: new Set<string>(), questoes: new Map<string, number>(), certificados: new Map<string, string>() }
  // Questões: só a contagem, curso a curso. Trazer as linhas de todos os
  // cursos de uma vez esbarra no teto de 1000 linhas do Supabase, e aí um
  // curso com prova parecia não ter prova.
  const [{ data: modulos }, { data: aulas }, { data: feitas }, { data: certs }, ...contagens] = await Promise.all([
    admin.from('curso_modulos').select('id,curso_id,titulo,ordem').in('curso_id', ids),
    admin.from('curso_aulas').select('id,curso_id,modulo_id,titulo,youtube_id,texto,material_id,duracao_min,ordem').in('curso_id', ids),
    admin.from('membro_aulas_concluidas').select('aula_id').eq('participante_id', m.participanteId).in('curso_id', ids),
    admin.from('certificados').select('curso_id,codigo').eq('participante_id', m.participanteId).is('revogado_em', null).in('curso_id', ids),
    ...ids.map((id) => admin.from('curso_questoes').select('id', { count: 'exact', head: true }).eq('curso_id', id)),
  ])
  const nQuestoes = new Map(ids.map((id, i) => [id, contagens[i]?.count ?? 0]))
  return {
    cursos: (cursos ?? []) as Curso[], modulos: (modulos ?? []) as Modulo[], aulas: (aulas ?? []) as Aula[],
    feitas: new Set((feitas ?? []).map((f) => f.aula_id as string)), questoes: nQuestoes,
    certificados: new Map((certs ?? []).map((c) => [c.curso_id as string, c.codigo as string])),
  }
}

export async function catalogoDoMembro(m: Membro): Promise<CursoNoCatalogo[]> {
  const d = await carregar(m)
  return d.cursos.map((c) => {
    const emOrdem = aulasEmOrdem(d.modulos.filter((x) => x.curso_id === c.id), d.aulas.filter((a) => a.curso_id === c.id))
    return {
      id: c.id, titulo: c.titulo, resumo: c.resumo, capa: urlDaCapa(c.capa_caminho), carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria),
      temProva: c.nota_minima !== null && (d.questoes.get(c.id) ?? 0) > 0, aulas: emOrdem.length,
      duracao: emOrdem.reduce((s, a) => s + (a.duracao_min ?? 0), 0), progresso: progresso(emOrdem, d.feitas), certificado: d.certificados.get(c.id) ?? null,
    }
  }).filter((c) => c.aulas > 0)
}

// ---------------------------------------------------------------- tentativas da prova

/**
 * A regra do banco (`membro_responder_prova`): até 3 tentativas em qualquer
 * janela de 24 horas — janela que corre, não dia do calendário. Se mudar lá,
 * muda aqui: a tela só avisa antes, quem barra é o banco.
 */
export const LIMITE_DE_TENTATIVAS = 3
const JANELA_DAS_TENTATIVAS_MS = 24 * 3_600_000

export type TentativasDaProva = {
  limite: number; usadas: number; restantes: number
  /** Sem tentativas agora: quando a próxima libera (ISO). */
  liberaEm: string | null
  /** Com uma só restante: quando libera de novo se ela também for usada (ISO). */
  liberaEmSeEsgotar: string | null
}

/**
 * Quantas tentativas a pessoa ainda tem e, sem nenhuma, quando volta a ter.
 * O banco conta as de `created_at > now() - 24 h`; a contagem cai abaixo do
 * limite quando a 3ª mais recente sai da janela, então é ela (+24 h) que
 * libera. As 3 mais recentes bastam para tudo isso.
 */
export function tentativasDaProva(datas: string[], agora: Date): TentativasDaProva {
  const limite = LIMITE_DE_TENTATIVAS
  const desde = agora.getTime() - JANELA_DAS_TENTATIVAS_MS
  const recentes = datas.map((d) => Date.parse(d)).filter((t) => Number.isFinite(t) && t > desde).sort((a, b) => b - a)
  const restantes = Math.max(0, limite - recentes.length)
  const libera = (t: number | undefined) => (t === undefined ? null : new Date(t + JANELA_DAS_TENTATIVAS_MS).toISOString())
  return {
    limite, usadas: recentes.length, restantes,
    liberaEm: restantes === 0 ? libera(recentes[limite - 1]) : null,
    // Com mais uma agora, a que hoje é a 2ª mais recente vira a 3ª: é ela que vai liberar.
    liberaEmSeEsgotar: restantes === 1 ? libera(recentes[limite - 2]) : null,
  }
}

/**
 * "26/09 às 14h05" (horário de São Paulo). Arredonda para o minuto de cima:
 * às 14h05m30s o banco ainda barra, então dizer "14h05" mandaria a pessoa
 * tentar cedo demais.
 */
export function liberacaoLegivel(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(Math.ceil(t / 60_000) * 60_000)
  const [h, min] = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).split(':')
  return `${dataCurta(d.toISOString(), { ano: false })} às ${Number(h)}h${min === '00' ? '' : min}`
}

// ---------------------------------------------------------------- um curso

export type CursoDoMembro = {
  curso: Curso & { capa: string | null }; modulos: (Modulo & { aulas: (Aula & { feita: boolean })[] })[]
  emOrdem: Aula[]; progresso: Progresso; temProva: boolean; questoes: number; certificado: string | null
  ultimaProva: { nota: number; aprovado: boolean; created_at: string } | null
  tentativas: TentativasDaProva
}

/**
 * Um curso com as aulas, o progresso e a situação da prova. Em `cache` (uma
 * leitura por requisição): o título da aba (`generateMetadata`) e a página
 * pedem o mesmo curso. A sessão também é única por requisição, então o
 * mesmo `m` chega aos dois e a chave bate.
 */
export const cursoDoMembro = cache(async (m: Membro, cursoId: string): Promise<CursoDoMembro | null> => {
  if (!/^[0-9a-f-]{36}$/.test(cursoId)) return null
  const d = await carregar(m, cursoId)
  const curso = d.cursos[0]
  if (!curso) return null
  const emOrdem = aulasEmOrdem(d.modulos, d.aulas)
  if (!emOrdem.length) return null
  // As 3 mais recentes: a última nota e a contagem da janela de 24 h saem daqui.
  const { data: provas } = await createAdminClient().from('membro_provas').select('nota,aprovado,created_at')
    .eq('participante_id', m.participanteId).eq('curso_id', cursoId).order('created_at', { ascending: false }).limit(LIMITE_DE_TENTATIVAS)
  const recentes = (provas ?? []) as NonNullable<CursoDoMembro['ultimaProva']>[]
  const questoes = d.questoes.get(curso.id) ?? 0
  return {
    curso: { ...curso, carga_horaria: curso.carga_horaria === null ? null : Number(curso.carga_horaria), capa: urlDaCapa(curso.capa_caminho) },
    modulos: [...d.modulos].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)).map((mo) => ({
      ...mo, aulas: emOrdem.filter((a) => a.modulo_id === mo.id).map((a) => ({ ...a, feita: d.feitas.has(a.id) })),
    })).filter((mo) => mo.aulas.length),
    emOrdem, progresso: progresso(emOrdem, d.feitas),
    temProva: curso.nota_minima !== null && questoes > 0, questoes,
    certificado: d.certificados.get(curso.id) ?? null,
    ultimaProva: recentes[0] ?? null,
    tentativas: tentativasDaProva(recentes.map((p) => p.created_at), new Date()),
  }
})

/** As questões na mesma ordem que o banco corrige (ordem, id) — sem o gabarito. */
export async function questoesDaProva(cursoId: string) {
  const { data } = await createAdminClient().from('curso_questoes').select('id,enunciado,alternativas').eq('curso_id', cursoId).order('ordem').order('id')
  return (data ?? []) as { id: string; enunciado: string; alternativas: string[] }[]
}

/** `curso*` só vem quando o curso está publicado: apostila de curso em rascunho aparece como material geral. */
export type Apostila = { id: string; titulo: string; descricao: string | null; tamanho: number; curso: string | null; curso_id: string | null; curso_ordem: number | null; created_at: string }

export async function apostilasDoMembro(m: Membro): Promise<Apostila[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('materiais').select('id,titulo,descricao,tamanho,created_at,curso_id,cursos(titulo,publicado,ordem)')
    .eq('workspace_id', m.workspaceId).eq('publicado', true).order('created_at', { ascending: false }).limit(500)
  return (data ?? []).map((x) => {
    const c = (Array.isArray(x.cursos) ? x.cursos[0] : x.cursos) as { titulo: string; publicado: boolean; ordem: number | null } | null
    const publicado = !!c?.publicado
    return {
      id: x.id as string, titulo: x.titulo as string, descricao: x.descricao as string | null, tamanho: Number(x.tamanho), created_at: x.created_at as string,
      curso: publicado ? c!.titulo : null, curso_id: publicado ? (x.curso_id as string | null) : null, curso_ordem: publicado ? (c!.ordem ?? null) : null,
    }
  })
}

export type GrupoDeApostilas = { titulo: string; cursoId: string | null; itens: Apostila[] }

/**
 * Um grupo por curso, na ordem do catálogo, e os materiais sem curso (ou de
 * curso ainda não publicado) em "Materiais gerais", primeiro: é onde fica o
 * que vale para todo voluntário, como o manual. Dentro do grupo, a ordem de
 * chegada (as mais novas primeiro, como vêm do banco).
 */
export function agruparApostilas(lista: Apostila[]): GrupoDeApostilas[] {
  const grupos = new Map<string, GrupoDeApostilas & { ordem: number }>()
  for (const a of lista) {
    const chave = a.curso_id ?? ''
    const g = grupos.get(chave) ?? { titulo: a.curso ?? 'Materiais gerais', cursoId: a.curso_id, ordem: a.curso_id ? (a.curso_ordem ?? Number.MAX_SAFE_INTEGER) : -Number.MAX_SAFE_INTEGER, itens: [] }
    g.itens.push(a)
    grupos.set(chave, g)
  }
  return [...grupos.values()].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR')).map(({ titulo, cursoId, itens }) => ({ titulo, cursoId, itens }))
}

/** O caminho da apostila, se ela for visível para este voluntário. */
export async function caminhoDaApostila(m: Membro, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await createAdminClient().from('materiais').select('caminho,nome_original')
    .eq('id', id).eq('workspace_id', m.workspaceId).eq('publicado', true).maybeSingle()
  return data as { caminho: string; nome_original: string } | null
}

/**
 * `formacao_id` é a formação que o banco registrou no cadastro junto com o
 * certificado (`emitir_certificado`): é por ele, e não pelo título, que
 * Certificados sabe o que não repetir em "Outras formações".
 */
export type CertificadoDoMembro = {
  codigo: string; curso_titulo: string; emitido_em: string; valido_ate: string | null; carga_horaria: number | null; nota: number | null; nome: string
  curso_id: string | null; formacao_id: string | null
}

export async function certificadosDoMembro(m: Membro): Promise<CertificadoDoMembro[]> {
  const { data } = await createAdminClient().from('certificados').select('codigo,curso_titulo,emitido_em,valido_ate,carga_horaria,nota,nome,curso_id,formacao_id')
    .eq('participante_id', m.participanteId).is('revogado_em', null).order('emitido_em', { ascending: false })
  return ((data ?? []) as CertificadoDoMembro[]).map((c) => ({ ...c, carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria), curso_id: c.curso_id ?? null, formacao_id: c.formacao_id ?? null }))
}

/** O mesmo emissor impresso no PDF (`lib/cursos/certificado-pdf.ts`). */
const EMISSOR = 'Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro'

const anoEMes = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d).split('-').map(Number)

/**
 * "Adicionar ao LinkedIn": o formulário de certificação do perfil já vem
 * preenchido (nome, emissor, mês de emissão e de validade, código e o link
 * público de verificação). Emissão no mês de São Paulo; validade é data pura.
 */
export function linkDoLinkedin(c: Pick<CertificadoDoMembro, 'codigo' | 'curso_titulo' | 'emitido_em' | 'valido_ate'>, urlDeVerificacao: string): string {
  const u = new URL('https://www.linkedin.com/profile/add')
  u.searchParams.set('startTask', 'CERTIFICATION_NAME')
  u.searchParams.set('name', c.curso_titulo)
  u.searchParams.set('organizationName', EMISSOR)
  const emitido = new Date(c.emitido_em)
  if (Number.isFinite(emitido.getTime())) {
    const [ano, mes] = anoEMes(emitido)
    u.searchParams.set('issueYear', String(ano))
    u.searchParams.set('issueMonth', String(mes))
  }
  const validade = c.valido_ate?.match(/^(\d{4})-(\d{2})-\d{2}/)
  if (validade) {
    u.searchParams.set('expirationYear', validade[1])
    u.searchParams.set('expirationMonth', String(Number(validade[2])))
  }
  u.searchParams.set('certUrl', urlDeVerificacao)
  u.searchParams.set('certId', c.codigo)
  return u.toString()
}
