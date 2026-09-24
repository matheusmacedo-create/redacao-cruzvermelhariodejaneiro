import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { pode, type Papel } from '@/lib/permissoes'
import { nomeExibido } from '@/lib/pessoas/diretorio'
import {
  ehCapa, lerContatos, lerMetricas, mesmoSetor, visiveisPara,
  type Capa, type Contato, type Leitor, type Metricas,
} from '@/lib/pessoas/perfil'

export type PerfilParaLeitura = {
  id: string
  nome: string
  usuario: string | null
  cargo: string | null
  setor: string | null
  iniciais: string | null
  cor: string | null
  avatarPath: string | null
  papel: string
  ativo: boolean
  membroDesde: string | null
  /** Só para quem é o dono ou administrador (mesma regra do Diretório). */
  vistoEm: string | null
  /** Com a Redação aberta nos últimos 5 minutos (só para o dono ou administrador). */
  online: boolean
  bio: string
  pronomes: string
  capa: Capa
  disponibilidade: string
  habilidades: string[]
  /** Já filtrados pela visibilidade: o que não pode ser visto não sai daqui. */
  contatos: Contato[]
  /** Da ficha da Equipe e do setor: institucionais, visíveis a toda a equipe. */
  contatosDaFicha: { canal: 'email' | 'telefone'; valor: string; rotulo: string }[]
  mostrarMetricas: boolean
  metricas: Metricas | null
  leitor: Leitor
  /** Contatos que existem mas este leitor não vê (para dizer "há mais, restritos"). */
  contatosOcultos: number
}

/**
 * Monta o perfil de uma pessoa do espaço para quem está lendo.
 *
 * Lê pelo service role (o RLS de perfil_social só deixa ler o próprio) e
 * aplica aqui a visibilidade de cada contato. Devolve null se a pessoa não
 * é deste espaço.
 */
export async function carregarPerfil(p: { workspaceId: string; leitorId: string; papelDoLeitor: Papel; alvoId: string }): Promise<PerfilParaLeitura | null> {
  if (!/^[0-9a-f-]{36}$/i.test(p.alvoId)) return null
  const admin = createAdminClient()
  const [{ data: vinculos }, { data: perfil }, { data: ficha }, { data: social }] = await Promise.all([
    admin.from('workspace_members').select('user_id, role, coordination, created_at').eq('workspace_id', p.workspaceId).in('user_id', [p.alvoId, p.leitorId]),
    admin.from('profiles').select('id, full_name, username, job_title, initials, color, avatar_path, active, visto_em').eq('id', p.alvoId).maybeSingle(),
    admin.from('equipe_membros').select('nome_social, cargo, setor, email_trabalho, telefone_trabalho, situacao').eq('workspace_id', p.workspaceId).eq('user_id', p.alvoId).maybeSingle(),
    admin.from('perfil_social').select('*').eq('user_id', p.alvoId).maybeSingle(),
  ])
  const vinculo = (vinculos ?? []).find((v) => v.user_id === p.alvoId)
  if (!vinculo || !perfil) return null
  const doLeitor = (vinculos ?? []).find((v) => v.user_id === p.leitorId)

  const setor = (vinculo.coordination as string | null) || (ficha?.setor as string | null) || null
  const ehDono = p.alvoId === p.leitorId
  const ehAdmin = pode(p.papelDoLeitor, 'usuarios.gerenciar')
  const leitor: Leitor = { ehDono, ehAdmin, mesmoSetor: mesmoSetor(setor, doLeitor?.coordination as string | null) }

  const todos = lerContatos(social?.contatos)
  const contatos = visiveisPara(todos, leitor)

  const contatosDaFicha: PerfilParaLeitura['contatosDaFicha'] = []
  if (ficha?.email_trabalho) contatosDaFicha.push({ canal: 'email', valor: String(ficha.email_trabalho), rotulo: 'E-mail de trabalho' })
  if (ficha?.telefone_trabalho) contatosDaFicha.push({ canal: 'telefone', valor: String(ficha.telefone_trabalho), rotulo: 'Telefone de trabalho' })
  if (setor) {
    const { data: s } = await admin.from('setores').select('nome, email').eq('workspace_id', p.workspaceId).ilike('nome', setor).maybeSingle()
    if (s?.email) contatosDaFicha.push({ canal: 'email', valor: String(s.email), rotulo: `Setor ${s.nome}` })
  }

  // As métricas pelo cliente da sessão: a função confere quem pergunta e
  // devolve null se a pessoa as escondeu (e quem lê não é ela nem admin).
  const supabase = await createClient()
  const { data: bruto } = await supabase.rpc('metricas_da_pessoa', { p_workspace_id: p.workspaceId, p_user_id: p.alvoId, p_dias: 90 })

  return {
    id: p.alvoId,
    nome: nomeExibido(String(ficha?.nome_social || perfil.full_name || perfil.username || 'Sem nome')),
    usuario: (perfil.username as string | null) ?? null,
    cargo: (ficha?.cargo as string | null) || (perfil.job_title as string | null) || null,
    setor,
    iniciais: (perfil.initials as string | null) ?? null,
    cor: (perfil.color as string | null) ?? null,
    avatarPath: (perfil.avatar_path as string | null) ?? null,
    papel: String(vinculo.role),
    ativo: perfil.active !== false,
    membroDesde: (vinculo.created_at as string | null) ?? null,
    vistoEm: ehDono || ehAdmin ? ((perfil.visto_em as string | null) ?? null) : null,
    online: (ehDono || ehAdmin) && Boolean(perfil.visto_em) && Date.now() - new Date(String(perfil.visto_em)).getTime() < 5 * 60_000,
    bio: String(social?.bio ?? ''),
    pronomes: String(social?.pronomes ?? ''),
    capa: ehCapa(social?.capa) ? social.capa : 'vermelho',
    disponibilidade: String(social?.disponibilidade ?? ''),
    habilidades: Array.isArray(social?.habilidades) ? (social.habilidades as string[]) : [],
    contatos,
    contatosDaFicha,
    mostrarMetricas: social?.mostrar_metricas !== false,
    metricas: lerMetricas(bruto),
    leitor,
    contatosOcultos: todos.length - contatos.length,
  }
}
