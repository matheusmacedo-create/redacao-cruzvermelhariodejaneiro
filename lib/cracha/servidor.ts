import 'server-only'
import { createHash } from 'node:crypto'
import { get } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { NINGUEM, type Membro } from '@/lib/membro/sessao'
import { fotoDoParticipante } from '@/lib/membro/foto'
import { urlBase } from '@/lib/newsletter/contexto'
import { codigoDoCracha, faixaDoVinculo, fatorRhPorExtenso, lerCodigoDoCracha, mesAno, nomeDeDestaque, situacaoDaFotoDoCracha, type Cracha, type Origem } from './regras'

/**
 * O crachá virtual no servidor: de quem é (RH, Voluntários ou só a conta do
 * Palácio), o código assinado do QR e a verificação pública. Tudo pelo
 * service role, sempre a partir da pessoa da sessão — nunca de um id vindo do
 * navegador. A verificação pública lê só o que está no código assinado.
 */

/** CRACHA_SEGREDO; na falta, derivado da chave de serviço (como o limite da trilha pública). */
function segredo(): string {
  return process.env.CRACHA_SEGREDO?.trim()
    || createHash('sha256').update(`cracha:assinatura:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest('hex')
}

export type CrachaPronto = Cracha & { codigo: string; urlDeVerificacao: string; fotoCaminho: string | null }

const pronto = (c: Cracha & { fotoCaminho: string | null }): CrachaPronto => {
  const codigo = codigoDoCracha(c.origem, c.id, segredo())
  // A foto vai pela rota do próprio crachá: o mesmo endereço serve ao perfil, à Área do Voluntário e à verificação.
  const foto = c.fotoCaminho && c.ativo ? `/cracha/${codigo}/foto` : null
  return { ...c, foto, codigo, urlDeVerificacao: `${urlBase()}/cracha/${codigo}` }
}

type LinhaDaEquipe = { id: string; workspace_id: string; nome: string; nome_social: string | null; cargo: string | null; setor: string | null; admissao: string | null; cpf_mascara: string | null; situacao: string; user_id: string | null }
type LinhaDoVoluntario = { id: string; nome: string; nome_social: string | null; funcao: string | null; setores: string[]; aprovado_em: string | null; created_at: string; cpf_mascara: string | null; situacao: string; foto_path: string | null; foto_cracha_path: string | null; foto_cracha_recusada_path: string | null; foto_cracha_motivo: string | null; user_id: string | null; workspace_id: string }

const COLUNAS_DA_EQUIPE = 'id,workspace_id,nome,nome_social,cargo,setor,admissao,cpf_mascara,situacao,user_id'
const COLUNAS_DO_VOLUNTARIO = 'id,nome,nome_social,funcao,setores,aprovado_em,created_at,cpf_mascara,situacao,foto_path,foto_cracha_path,foto_cracha_recusada_path,foto_cracha_motivo,user_id,workspace_id'

/** O tipo sanguíneo, só para o crachá da própria pessoa. Sem a migração 20260929030000, fica "não informado". */
async function fatorRh(participanteId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc('cracha_fator_rh', { p_participante_id: participanteId })
  return error ? null : fatorRhPorExtenso(data as string | null)
}

function daEquipe(e: LinhaDaEquipe, avatar: string | null): Cracha & { fotoCaminho: string | null } {
  return {
    origem: 'equipe', id: e.id, nomeDeDestaque: nomeDeDestaque(e.nome, e.nome_social), nomeCompleto: e.nome,
    funcao: e.cargo, setor: e.setor, faixa: faixaDoVinculo('equipe'), cpf: e.cpf_mascara, desde: mesAno(e.admissao),
    fatorRh: null, foto: null, fotoCaminho: avatar, ativo: e.situacao !== 'desligado',
  }
}

/** Voluntário: só a foto que o Voluntariado aprovou (nada da foto de perfil da conta). */
function doVoluntario(v: LinhaDoVoluntario, rh: string | null): Cracha & { fotoCaminho: string | null } {
  const situacaoDaFoto = situacaoDaFotoDoCracha({ foto: v.foto_path, aprovada: v.foto_cracha_path, recusada: v.foto_cracha_recusada_path })
  const foto = situacaoDaFoto === 'aprovada' && fotoDoParticipante(v.foto_path, v.workspace_id, v.id) ? v.foto_path : null
  return {
    situacaoDaFoto, motivoDaFoto: situacaoDaFoto === 'recusada' ? v.foto_cracha_motivo : null,
    origem: 'voluntario', id: v.id, nomeDeDestaque: nomeDeDestaque(v.nome, v.nome_social), nomeCompleto: v.nome,
    funcao: v.funcao, setor: v.setores[0] ?? null, faixa: faixaDoVinculo('voluntario'), cpf: v.cpf_mascara,
    desde: mesAno(v.aprovado_em ?? v.created_at), fatorRh: rh, foto: null, fotoCaminho: foto, ativo: v.situacao === 'ativo',
  }
}

/**
 * O crachá de quem está no Palácio Virtual: a ficha do RH, se houver; senão o
 * cadastro de voluntário ligado à conta; senão a própria conta (nome, cargo e
 * coordenação do perfil).
 */
export async function crachaDaConta(userId: string, workspaceId: string): Promise<CrachaPronto> {
  const admin = createAdminClient()
  const [{ data: equipe }, { data: voluntario }, { data: perfil }, { data: membro }] = await Promise.all([
    admin.from('equipe_membros').select(COLUNAS_DA_EQUIPE).eq('workspace_id', workspaceId).eq('user_id', userId).neq('situacao', 'desligado').limit(1).maybeSingle(),
    admin.from('participantes').select(COLUNAS_DO_VOLUNTARIO).eq('workspace_id', workspaceId).eq('user_id', userId).eq('situacao', 'ativo').limit(1).maybeSingle(),
    admin.from('profiles').select('full_name,job_title,avatar_path').eq('id', userId).maybeSingle(),
    admin.from('workspace_members').select('coordination,created_at').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
  ])
  const avatar = (perfil?.avatar_path as string | null) ?? null
  if (equipe) {
    // Ficha do RH incompleta (sem cargo ou setor): completa com o perfil e a coordenação da conta.
    const e = equipe as LinhaDaEquipe
    return pronto(daEquipe({ ...e, cargo: e.cargo || (perfil?.job_title as string | null) || null, setor: e.setor || (membro?.coordination as string | null) || null }, avatar))
  }
  if (voluntario) {
    const v = voluntario as LinhaDoVoluntario
    return pronto(doVoluntario(v, await fatorRh(v.id)))
  }
  const nome = (perfil?.full_name as string | null)?.trim() || 'Colaborador'
  return pronto({
    origem: 'conta', id: userId, nomeDeDestaque: nomeDeDestaque(nome), nomeCompleto: nome,
    funcao: (perfil?.job_title as string | null) || null, setor: (membro?.coordination as string | null) || null,
    faixa: faixaDoVinculo('conta'), cpf: null, desde: mesAno(membro?.created_at as string | undefined), fatorRh: null,
    foto: null, fotoCaminho: avatar, ativo: Boolean(membro),
  })
}

/** O crachá do voluntário da Área do Voluntário. Na prévia geral (sem pessoa), null. */
export async function crachaDoMembro(m: Membro): Promise<CrachaPronto | null> {
  if (m.participanteId === NINGUEM) return null
  const admin = createAdminClient()
  const { data } = await admin.from('participantes').select(COLUNAS_DO_VOLUNTARIO).eq('id', m.participanteId).maybeSingle()
  if (!data) return null
  const v = data as LinhaDoVoluntario
  // Na visualização da equipe ("ver como"), o tipo sanguíneo não aparece: é só da própria pessoa.
  return pronto(doVoluntario(v, m.previa ? null : await fatorRh(v.id)))
}

// ---------------------------------------------------------------- verificação pública

export type Verificacao =
  | { estado: 'invalido' }
  | { estado: 'indisponivel' }
  | { estado: 'ativo' | 'inativo'; nomeCompleto: string; funcao: string | null; setor: string | null; faixa: string; desde: string | null; temFoto: boolean }

/** Resolve um código do QR para o que a página pública pode mostrar (nada de CPF, saúde ou contato). */
async function resolver(codigo: string): Promise<{ v: Verificacao; fotoCaminho: string | null }> {
  const lido = lerCodigoDoCracha(codigo, segredo())
  if (!lido) return { v: { estado: 'invalido' }, fotoCaminho: null }
  const admin = createAdminClient()
  try {
    let c: (Cracha & { fotoCaminho: string | null }) | null = null
    if (lido.origem === 'equipe') {
      const { data, error } = await admin.from('equipe_membros').select(COLUNAS_DA_EQUIPE).eq('id', lido.id).maybeSingle()
      if (error) throw error
      if (data) {
        const e = data as LinhaDaEquipe
        const [{ data: perfil }, { data: membro }] = e.user_id
          ? await Promise.all([
            admin.from('profiles').select('job_title,avatar_path').eq('id', e.user_id).maybeSingle(),
            admin.from('workspace_members').select('coordination').eq('workspace_id', e.workspace_id).eq('user_id', e.user_id).maybeSingle(),
          ])
          : [{ data: null }, { data: null }]
        // O mesmo complemento do crachá (crachaDaConta): o que a ficha não tem vem da conta.
        c = daEquipe({ ...e, cargo: e.cargo || (perfil?.job_title as string | null) || null, setor: e.setor || (membro?.coordination as string | null) || null }, (perfil?.avatar_path as string | null) ?? null)
      }
    } else if (lido.origem === 'voluntario') {
      const { data, error } = await admin.from('participantes').select(COLUNAS_DO_VOLUNTARIO).eq('id', lido.id).is('anonimizado_em', null).maybeSingle()
      if (error) throw error
      if (data) {
        c = doVoluntario(data as LinhaDoVoluntario, null)
      }
    } else {
      const [{ data: perfil, error }, { data: membros }] = await Promise.all([
        admin.from('profiles').select('full_name,job_title,avatar_path').eq('id', lido.id).maybeSingle(),
        admin.from('workspace_members').select('coordination,created_at').eq('user_id', lido.id).limit(1),
      ])
      if (error) throw error
      if (perfil) {
        const nome = (perfil.full_name as string | null)?.trim() || 'Colaborador'
        const m = membros?.[0]
        c = { origem: 'conta' as Origem, id: lido.id, nomeDeDestaque: nomeDeDestaque(nome), nomeCompleto: nome, funcao: (perfil.job_title as string | null) || null,
          setor: (m?.coordination as string | null) || null, faixa: faixaDoVinculo('conta'), cpf: null, desde: mesAno(m?.created_at as string | undefined),
          fatorRh: null, foto: null, fotoCaminho: (perfil.avatar_path as string | null) ?? null, ativo: Boolean(m) }
      }
    }
    if (!c) return { v: { estado: 'invalido' }, fotoCaminho: null }
    return {
      v: { estado: c.ativo ? 'ativo' : 'inativo', nomeCompleto: c.nomeCompleto, funcao: c.funcao, setor: c.setor, faixa: c.faixa, desde: c.desde, temFoto: c.ativo && Boolean(c.fotoCaminho) },
      fotoCaminho: c.ativo ? c.fotoCaminho : null,
    }
  } catch {
    return { v: { estado: 'indisponivel' }, fotoCaminho: null }
  }
}

export async function verificarCracha(codigo: string): Promise<Verificacao> {
  return (await resolver(codigo)).v
}

/** A foto do crachá para a página pública — só de quem está ativo, pelo código assinado. */
export async function caminhoDaFotoPublica(codigo: string): Promise<string | null> {
  return (await resolver(codigo)).fotoCaminho
}

/** Os bytes de uma foto privada do Blob (para o PDF). Falhou, null: o crachá sai com a silhueta. */
export async function bytesDaFoto(caminho: string | null): Promise<Uint8Array | null> {
  if (!caminho) return null
  try {
    const r = await get(caminho, { access: 'private' })
    if (!r || r.statusCode !== 200 || !r.stream) return null
    return new Uint8Array(await new Response(r.stream).arrayBuffer())
  } catch {
    return null
  }
}
