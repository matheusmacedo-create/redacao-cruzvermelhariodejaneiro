import 'server-only'

import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { nivelDoNome, type Nivel } from './regras'

/**
 * O nível de quem está logado na Equipe: admin tem tudo; os demais, o que um
 * admin concedeu. O banco aplica a mesma regra (private.nivel_equipe); aqui é
 * para a tela e as actions saberem o que mostrar.
 */
export async function contextoDaEquipe() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  let nivel: Nivel = 0
  if (context.role === 'admin') nivel = 4
  else {
    const { data } = await supabase.from('equipe_acesso').select('nivel').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
    nivel = nivelDoNome(data?.nivel)
  }
  return { context, supabase, nivel }
}

// As colunas cifradas não são liberadas para a API: toda leitura lista as colunas.
export const COLUNAS_DO_MEMBRO = 'id,user_id,situacao,nome,nome_social,email_trabalho,telefone_trabalho,vinculo,cargo,setor,gestor_id,admissao,jornada_semanal,horario,local_trabalho,desligamento,motivo_desligamento,tem_documentos,cpf_mascara,tem_banco,observacoes,created_at,updated_at'
export const COLUNAS_PESSOAIS = 'email_pessoal,telefone_pessoal,data_nascimento,cep,logradouro,numero,complemento,bairro,cidade,uf,emergencia_nome,emergencia_telefone,emergencia_parentesco'

export type Membro = {
  id: string; user_id: string | null; situacao: string; nome: string; nome_social: string | null; email_trabalho: string | null; telefone_trabalho: string | null
  vinculo: string; cargo: string | null; setor: string | null; gestor_id: string | null; admissao: string | null; jornada_semanal: number | null
  horario: string | null; local_trabalho: string | null; desligamento: string | null; motivo_desligamento: string | null; tem_documentos: boolean
  cpf_mascara: string | null; tem_banco: boolean; observacoes: string | null; created_at: string; updated_at: string
}
export type Pessoais = {
  email_pessoal: string | null; telefone_pessoal: string | null; data_nascimento: string | null; cep: string | null; logradouro: string | null
  numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null
  emergencia_nome: string | null; emergencia_telefone: string | null; emergencia_parentesco: string | null
}
