import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { aulasEmOrdem, progresso, type Progresso } from '@/lib/cursos/regras'
import { urlDaCapa } from '@/lib/cursos/capa'
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
  const [{ data: modulos }, { data: aulas }, { data: feitas }, { data: questoes }, { data: certs }] = await Promise.all([
    admin.from('curso_modulos').select('id,curso_id,titulo,ordem').in('curso_id', ids),
    admin.from('curso_aulas').select('id,curso_id,modulo_id,titulo,youtube_id,texto,material_id,duracao_min,ordem').in('curso_id', ids),
    admin.from('membro_aulas_concluidas').select('aula_id').eq('participante_id', m.participanteId).in('curso_id', ids),
    admin.from('curso_questoes').select('curso_id').in('curso_id', ids),
    admin.from('certificados').select('curso_id,codigo').eq('participante_id', m.participanteId).is('revogado_em', null).in('curso_id', ids),
  ])
  const nQuestoes = new Map<string, number>()
  for (const q of questoes ?? []) nQuestoes.set(q.curso_id as string, (nQuestoes.get(q.curso_id as string) ?? 0) + 1)
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

export type CursoDoMembro = {
  curso: Curso & { capa: string | null }; modulos: (Modulo & { aulas: (Aula & { feita: boolean })[] })[]
  emOrdem: Aula[]; progresso: Progresso; temProva: boolean; certificado: string | null
  ultimaProva: { nota: number; aprovado: boolean; created_at: string } | null
}

export async function cursoDoMembro(m: Membro, cursoId: string): Promise<CursoDoMembro | null> {
  if (!/^[0-9a-f-]{36}$/.test(cursoId)) return null
  const d = await carregar(m, cursoId)
  const curso = d.cursos[0]
  if (!curso) return null
  const emOrdem = aulasEmOrdem(d.modulos, d.aulas)
  if (!emOrdem.length) return null
  const { data: prova } = await createAdminClient().from('membro_provas').select('nota,aprovado,created_at')
    .eq('participante_id', m.participanteId).eq('curso_id', cursoId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return {
    curso: { ...curso, carga_horaria: curso.carga_horaria === null ? null : Number(curso.carga_horaria), capa: urlDaCapa(curso.capa_caminho) },
    modulos: [...d.modulos].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)).map((mo) => ({
      ...mo, aulas: emOrdem.filter((a) => a.modulo_id === mo.id).map((a) => ({ ...a, feita: d.feitas.has(a.id) })),
    })).filter((mo) => mo.aulas.length),
    emOrdem, progresso: progresso(emOrdem, d.feitas),
    temProva: curso.nota_minima !== null && (d.questoes.get(curso.id) ?? 0) > 0,
    certificado: d.certificados.get(curso.id) ?? null,
    ultimaProva: (prova as CursoDoMembro['ultimaProva']) ?? null,
  }
}

/** As questões na mesma ordem que o banco corrige (ordem, id) — sem o gabarito. */
export async function questoesDaProva(cursoId: string) {
  const { data } = await createAdminClient().from('curso_questoes').select('id,enunciado,alternativas').eq('curso_id', cursoId).order('ordem').order('id')
  return (data ?? []) as { id: string; enunciado: string; alternativas: string[] }[]
}

export type Apostila = { id: string; titulo: string; descricao: string | null; tamanho: number; curso: string | null; created_at: string }

export async function apostilasDoMembro(m: Membro): Promise<Apostila[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('materiais').select('id,titulo,descricao,tamanho,created_at,curso_id,cursos(titulo,publicado)')
    .eq('workspace_id', m.workspaceId).eq('publicado', true).order('created_at', { ascending: false }).limit(500)
  return (data ?? []).map((x) => {
    const c = (Array.isArray(x.cursos) ? x.cursos[0] : x.cursos) as { titulo: string; publicado: boolean } | null
    return { id: x.id as string, titulo: x.titulo as string, descricao: x.descricao as string | null, tamanho: Number(x.tamanho), created_at: x.created_at as string, curso: c?.publicado ? c.titulo : null }
  })
}

/** O caminho da apostila, se ela for visível para este voluntário. */
export async function caminhoDaApostila(m: Membro, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await createAdminClient().from('materiais').select('caminho,nome_original')
    .eq('id', id).eq('workspace_id', m.workspaceId).eq('publicado', true).maybeSingle()
  return data as { caminho: string; nome_original: string } | null
}

export type CertificadoDoMembro = { codigo: string; curso_titulo: string; emitido_em: string; valido_ate: string | null; carga_horaria: number | null; nota: number | null; nome: string }

export async function certificadosDoMembro(m: Membro): Promise<CertificadoDoMembro[]> {
  const { data } = await createAdminClient().from('certificados').select('codigo,curso_titulo,emitido_em,valido_ate,carga_horaria,nota,nome')
    .eq('participante_id', m.participanteId).is('revogado_em', null).order('emitido_em', { ascending: false })
  return ((data ?? []) as CertificadoDoMembro[]).map((c) => ({ ...c, carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria) }))
}
