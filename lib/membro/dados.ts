import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { cache } from 'react'
import { NINGUEM, type Membro } from './sessao'
import { urlDaFotoDoMembro } from './foto'

/**
 * As leituras da área do membro. Cada função recebe a sessão e filtra pelo
 * participante dela — é a única porta para os dados do voluntário.
 */

export const COLUNAS_DO_PERFIL = 'nome,nome_social,email,telefone,vinculo,funcao,setores,cpf_mascara,data_nascimento,cep,logradouro,numero,complemento,bairro,cidade,uf,emergencia_nome,emergencia_telefone,emergencia_parentesco,habilidades,idiomas,disponibilidade,aprovado_em,created_at,avisos_por_email'

export type Perfil = {
  nome: string; nome_social: string | null; email: string | null; telefone: string | null; vinculo: string; funcao: string | null; setores: string[]
  cpf_mascara: string | null; data_nascimento: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; uf: string | null; emergencia_nome: string | null; emergencia_telefone: string | null
  emergencia_parentesco: string | null; habilidades: string[]; idiomas: string[]; disponibilidade: string[]; aprovado_em: string | null; created_at: string
  avisos_por_email: boolean
}

/** O perfil de mentira da prévia geral: nenhum dado de pessoa real. */
const PERFIL_DA_PREVIA: Perfil = {
  nome: 'Voluntário', nome_social: null, email: 'voluntario@exemplo', telefone: null, vinculo: 'voluntario', funcao: null, setores: [], cpf_mascara: null,
  data_nascimento: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, emergencia_nome: null,
  emergencia_telefone: null, emergencia_parentesco: null, habilidades: [], idiomas: [], disponibilidade: [], aprovado_em: null, created_at: new Date().toISOString(), avisos_por_email: true,
}

export async function perfilDoMembro(m: Membro): Promise<Perfil> {
  if (m.participanteId === NINGUEM) return PERFIL_DA_PREVIA
  const { data, error } = await createAdminClient().from('participantes').select(COLUNAS_DO_PERFIL).eq('id', m.participanteId).single()
  if (error || !data) throw new Error('Não foi possível carregar o seu cadastro.')
  return data as Perfil
}

/**
 * O endereço da foto de perfil do voluntário da sessão, ou null. Uma consulta
 * por requisição (o cabeçalho e o perfil pedem a mesma). A foto é enfeite: se
 * a leitura falhar, a área abre com as iniciais.
 */
export const fotoDoMembro = cache(async (participanteId: string): Promise<string | null> => {
  if (participanteId === NINGUEM) return null
  const { data, error } = await createAdminClient().from('participantes').select('foto_path').eq('id', participanteId).maybeSingle()
  if (error) return null
  return urlDaFotoDoMembro(data?.foto_path as string | null | undefined)
})

export type Formacao = { id: string; titulo: string; instituicao: string | null; concluido_em: string | null; valido_ate: string | null }
export type Atividade = { id: string; data: string; horas: number; atividade: string }

export async function historicoDoMembro(m: Membro) {
  const admin = createAdminClient()
  const [{ data: formacoes }, { data: horas }] = await Promise.all([
    admin.from('participante_formacoes').select('id,titulo,instituicao,concluido_em,valido_ate').eq('participante_id', m.participanteId).order('concluido_em', { ascending: false, nullsFirst: false }),
    admin.from('participante_horas').select('id,data,horas,atividade').eq('participante_id', m.participanteId).order('data', { ascending: false }).limit(1000),
  ])
  return {
    formacoes: (formacoes ?? []) as Formacao[],
    atividades: ((horas ?? []) as Atividade[]).map((h) => ({ ...h, horas: Number(h.horas) })),
  }
}
