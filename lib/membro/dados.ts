import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Membro } from './sessao'

/**
 * As leituras da área do membro. Cada função recebe a sessão e filtra pelo
 * participante dela — é a única porta para os dados do voluntário.
 */

export const COLUNAS_DO_PERFIL = 'nome,nome_social,email,telefone,vinculo,funcao,setores,cpf_mascara,data_nascimento,cep,logradouro,numero,complemento,bairro,cidade,uf,emergencia_nome,emergencia_telefone,emergencia_parentesco,habilidades,idiomas,disponibilidade,aprovado_em,created_at'

export type Perfil = {
  nome: string; nome_social: string | null; email: string | null; telefone: string | null; vinculo: string; funcao: string | null; setores: string[]
  cpf_mascara: string | null; data_nascimento: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; uf: string | null; emergencia_nome: string | null; emergencia_telefone: string | null
  emergencia_parentesco: string | null; habilidades: string[]; idiomas: string[]; disponibilidade: string[]; aprovado_em: string | null; created_at: string
}

export async function perfilDoMembro(m: Membro): Promise<Perfil> {
  const { data, error } = await createAdminClient().from('participantes').select(COLUNAS_DO_PERFIL).eq('id', m.participanteId).single()
  if (error || !data) throw new Error('Não foi possível carregar o seu cadastro.')
  return data as Perfil
}

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
