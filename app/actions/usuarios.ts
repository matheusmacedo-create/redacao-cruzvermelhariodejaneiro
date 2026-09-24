'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as criarClienteAvulso } from '@supabase/supabase-js'
import { obterWorkspaceSemVerificacao, requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicSupabaseEnv } from '@/lib/supabase/env'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { ehPapel, PAPEL, type Papel } from '@/lib/permissoes'
import { NOMES_DOS_SETORES } from '@/lib/equipe'
import { gerarSenhaTemporaria, problemaDaSenha } from '@/lib/usuarios/senha'

/**
 * Gestão de usuários e acessos.
 *
 * Três cercas, de fora para dentro:
 *  1. `requirePermissao('usuarios.gerenciar')` em toda action — a tela não é
 *     a autoridade.
 *  2. O que muda vínculo (papel, coordenação) vai pelo cliente da PRÓPRIA
 *     pessoa logada: o RLS confere de novo que ela é admin, e o gatilho de
 *     auditoria registra quem fez.
 *  3. O banco recusa deixar o espaço sem administrador ativo, venha o pedido
 *     de onde vier (gatilhos em 20260924160000_cvrj_usuarios_e_permissoes).
 *
 * O service role só entra no que o RLS não alcança por desenho: criar a conta
 * no Auth, trocar senha de terceiro, desativar e escrever a auditoria.
 *
 * Senha nunca vai para log, auditoria ou mensagem de erro. A temporária volta
 * UMA vez na resposta, para o administrador repassar, e não é guardada.
 */

type Resultado = { erro?: string; recado?: string; senhaTemporaria?: string; usuario?: string }

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const emailInterno = (usuario: string) => `${usuario}@usuarios.cvrj.local`
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/
// "Para sempre" no Auth: o ban só termina quando um admin reativa.
const BAN_PERMANENTE = '876000h'

function lerCoordenacao(f: FormData): string {
  const valor = texto(f, 'coordenacao')
  if (valor && !NOMES_DOS_SETORES.includes(valor)) throw new Error('Escolha uma coordenação da lista.')
  return valor
}

function lerPapel(f: FormData): Papel {
  const papel = texto(f, 'papel')
  if (!ehPapel(papel)) throw new Error('Escolha um papel válido.')
  return papel
}

function lerNome(f: FormData): string {
  const nome = texto(f, 'nome').replace(/\s+/g, ' ')
  if (nome.length < 3 || nome.length > 120) throw new Error('Informe o nome completo (3 a 120 caracteres).')
  return nome
}

/** Mensagem do gatilho "precisa de um administrador" chega intacta; o resto, genérica. */
function erroDoBanco(error: { code?: string; message?: string } | null, padrao: string): Error {
  if (error?.code === 'P0001' && error.message) return new Error(error.message)
  return new Error(padrao)
}

type Admin = ReturnType<typeof createAdminClient>

async function auditar(admin: Admin, linha: { workspace_id: string; ator_id: string; alvo_id: string | null; acao: string; detalhes?: Record<string, unknown> }) {
  const { error } = await admin.from('auditoria_de_acesso').insert({ ...linha, detalhes: linha.detalhes ?? {} })
  // Auditoria que falha não desfaz a ação já feita, mas não pode sumir calada.
  if (error) console.error('[usuarios] auditoria não gravada:', linha.acao, error.message)
}

/** A pessoa-alvo, desde que seja deste espaço. Nunca confie no id vindo da tela. */
async function carregarAlvo(admin: Admin, workspaceId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Usuário não encontrado.')
  const { data } = await admin.from('workspace_members')
    .select('user_id, role, coordination, profiles(id, username, full_name, active)')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
  const perfil = data && (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as { id: string; username: string; full_name: string; active: boolean } | null
  if (!data || !perfil) throw new Error('Usuário não encontrado neste espaço.')
  return { papel: data.role as Papel, coordenacao: (data.coordination as string | null) ?? '', ...perfil }
}

/**
 * O Correio usa `setor_membros` para decidir por qual caixa cada pessoa envia.
 * Quando a coordenação muda, o setor de mesmo nome acompanha — só ele: outros
 * vínculos de setor que o admin fez à mão no Correio ficam como estão.
 */
async function sincronizarSetor(admin: Admin, workspaceId: string, userId: string, antiga: string, nova: string) {
  if (antiga === nova) return
  const { data: setores } = await admin.from('setores').select('id, nome').eq('workspace_id', workspaceId)
  const achar = (nome: string) => nome ? (setores ?? []).find((s) => s.nome.toLowerCase() === nome.toLowerCase()) : undefined
  const velho = achar(antiga)
  const novo = achar(nova)
  if (velho) await admin.from('setor_membros').delete().eq('setor_id', velho.id).eq('user_id', userId)
  if (novo) await admin.from('setor_membros').upsert({ setor_id: novo.id, user_id: userId, workspace_id: workspaceId }, { onConflict: 'setor_id,user_id' })
}

async function encerrarSessoes(admin: Admin, userId: string): Promise<boolean> {
  const { error } = await admin.rpc('encerrar_sessoes_do_usuario', { p_user_id: userId })
  if (error) console.error('[usuarios] não foi possível encerrar as sessões:', error.message)
  return !error
}

function revalidar() {
  revalidatePath('/usuarios')
  revalidatePath('/pessoas')
  revalidatePath('/configuracoes')
}

// ------------------------------------------------------------------ criar

export async function criarUsuario(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const nome = lerNome(formData)
    const usuario = texto(formData, 'usuario').toLowerCase()
    if (!USUARIO_VALIDO.test(usuario)) throw new Error('O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.')
    const papel = lerPapel(formData)
    const coordenacao = lerCoordenacao(formData)
    const cargo = texto(formData, 'cargo').slice(0, 120)

    const gerar = texto(formData, 'modoSenha') !== 'definir'
    const senha = gerar ? gerarSenhaTemporaria() : String(formData.get('senha') ?? '')
    if (!gerar) {
      const problema = problemaDaSenha(senha, { usuario, nome })
      if (problema) throw new Error(problema)
    }

    const admin = createAdminClient()
    const { data: existente } = await admin.from('profiles').select('id').eq('username', usuario).maybeSingle()
    if (existente) throw new Error(`O usuário @${usuario} já existe.`)

    const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
      email: emailInterno(usuario), password: senha, email_confirm: true,
      user_metadata: { username: usuario, full_name: nome },
    })
    if (erroAuth || !criado.user) throw new Error('Não foi possível criar a conta. Confira se o usuário já não existe.')
    const userId = criado.user.id

    // Daqui em diante, qualquer falha desfaz a conta: conta sem perfil ou sem
    // vínculo existe no Auth e não entra em lugar nenhum.
    const { error: erroPerfil } = await admin.from('profiles').insert({
      id: userId, username: usuario, full_name: nome, job_title: cargo, initials: iniciais(nome), trocar_senha: true,
    })
    if (erroPerfil) {
      await admin.auth.admin.deleteUser(userId)
      throw new Error('Não foi possível criar o perfil.')
    }

    const supabase = await createClient()
    const { error: erroVinculo } = await supabase.from('workspace_members').insert({
      workspace_id: context.workspace.id, user_id: userId, role: papel, coordination: coordenacao || null,
    })
    if (erroVinculo) {
      await admin.auth.admin.deleteUser(userId)
      throw new Error('Não foi possível vincular a pessoa ao espaço.')
    }

    await sincronizarSetor(admin, context.workspace.id, userId, '', coordenacao)
    await auditar(admin, {
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: userId, acao: 'usuario_criado',
      detalhes: { usuario, papel, coordenacao, senha: gerar ? 'temporaria_gerada' : 'definida_pelo_admin' },
    })

    revalidar()
    return {
      recado: `Acesso de ${nome} criado como ${PAPEL[papel].rotulo.toLowerCase()}. No primeiro login, a pessoa troca a senha.`,
      usuario,
      senhaTemporaria: gerar ? senha : undefined,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o usuário.') }
  }
}

// ------------------------------------------------------------------ editar

export async function atualizarUsuario(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const admin = createAdminClient()
    const alvo = await carregarAlvo(admin, context.workspace.id, texto(formData, 'userId'))
    const nome = lerNome(formData)
    const cargo = texto(formData, 'cargo').slice(0, 120)
    const coordenacao = lerCoordenacao(formData)
    const papel = lerPapel(formData)

    // Tirar o próprio papel de admin por engano tranca a pessoa fora desta
    // tela no mesmo clique. Outro admin faz, se for o caso.
    if (alvo.id === context.user.id && papel !== alvo.papel) throw new Error('Você não pode mudar o seu próprio papel. Peça a outro administrador.')

    const { error } = await admin.from('profiles')
      .update({ full_name: nome, job_title: cargo, initials: iniciais(nome), updated_at: new Date().toISOString() })
      .eq('id', alvo.id)
    if (error) throw new Error('Não foi possível salvar os dados.')
    if (nome !== alvo.full_name) {
      await auditar(admin, { workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: alvo.id, acao: 'dados_alterados', detalhes: { nome_anterior: alvo.full_name, nome_novo: nome } })
    }

    if (papel !== alvo.papel || coordenacao !== alvo.coordenacao) {
      // Pelo cliente da pessoa logada: RLS confere o admin, o gatilho audita.
      const supabase = await createClient()
      const { data, error } = await supabase.from('workspace_members')
        .update({ role: papel, coordination: coordenacao || null })
        .eq('workspace_id', context.workspace.id).eq('user_id', alvo.id)
        .select('user_id').maybeSingle()
      if (error) throw erroDoBanco(error, 'Não foi possível alterar o acesso.')
      if (!data) throw new Error('Não foi possível alterar o acesso.')
      await sincronizarSetor(admin, context.workspace.id, alvo.id, alvo.coordenacao, coordenacao)
    }

    revalidar()
    return { recado: `Dados de ${nome} salvos.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

// ------------------------------------------------------------------ senha de terceiro

export async function redefinirSenha(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const admin = createAdminClient()
    const alvo = await carregarAlvo(admin, context.workspace.id, texto(formData, 'userId'))
    if (alvo.id === context.user.id) throw new Error('Para a sua própria senha, use Meu perfil → Segurança.')
    if (!alvo.active) throw new Error('Reative a conta antes de redefinir a senha.')

    const gerar = texto(formData, 'modoSenha') !== 'definir'
    const senha = gerar ? gerarSenhaTemporaria() : String(formData.get('senha') ?? '')
    if (!gerar) {
      const problema = problemaDaSenha(senha, { usuario: alvo.username, nome: alvo.full_name })
      if (problema) throw new Error(problema)
    }

    const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: senha })
    if (error) throw new Error('Não foi possível redefinir a senha.')
    await admin.from('profiles').update({ trocar_senha: true, updated_at: new Date().toISOString() }).eq('id', alvo.id)
    // Quem estava logado com a senha antiga — inclusive quem a roubou — sai.
    const encerradas = await encerrarSessoes(admin, alvo.id)

    await auditar(admin, {
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: alvo.id, acao: 'senha_redefinida',
      detalhes: { senha: gerar ? 'temporaria_gerada' : 'definida_pelo_admin', sessoes_encerradas: encerradas },
    })
    revalidar()
    return {
      recado: `Senha de ${alvo.full_name} redefinida. ${encerradas ? 'As sessões abertas foram encerradas. ' : ''}No próximo login, a pessoa troca a senha.`,
      usuario: alvo.username,
      senhaTemporaria: gerar ? senha : undefined,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível redefinir a senha.') }
  }
}

// ------------------------------------------------------------------ desativar / reativar

/**
 * Desativar, e não apagar: o nome de quem saiu continua nas pautas, nos votos
 * e no histórico — apagar a conta levaria tudo isso junto (ON DELETE CASCADE)
 * ou deixaria buracos sem autor. A conta desativada não entra, não renova
 * sessão e não enxerga dado nenhum (RLS), e pode ser reativada.
 */
export async function desativarUsuario(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const admin = createAdminClient()
    const alvo = await carregarAlvo(admin, context.workspace.id, texto(formData, 'userId'))
    if (alvo.id === context.user.id) throw new Error('Você não pode desativar a sua própria conta.')
    if (!alvo.active) return { recado: `${alvo.full_name} já estava desativado.` }

    // Primeiro o perfil: é ele que o gatilho confere ("último admin ativo") e
    // é ele que o RLS lê. Se o banco recusar, nada mais acontece.
    const { error } = await admin.from('profiles')
      .update({ active: false, desativado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', alvo.id)
    if (error) throw erroDoBanco(error, 'Não foi possível desativar a conta.')

    const { error: erroBan } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: BAN_PERMANENTE })
    if (erroBan) console.error('[usuarios] ban não aplicado:', erroBan.message)
    const encerradas = await encerrarSessoes(admin, alvo.id)

    await auditar(admin, {
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: alvo.id, acao: 'usuario_desativado',
      detalhes: { login_bloqueado: !erroBan, sessoes_encerradas: encerradas },
    })
    revalidar()
    return { recado: `${alvo.full_name} foi desativado e não consegue mais entrar.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desativar a conta.') }
  }
}

export async function reativarUsuario(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const admin = createAdminClient()
    const alvo = await carregarAlvo(admin, context.workspace.id, texto(formData, 'userId'))
    if (alvo.active) return { recado: `${alvo.full_name} já estava ativo.` }

    const { error: erroBan } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: 'none' })
    if (erroBan) throw new Error('Não foi possível liberar o login.')
    // Volta com senha nova obrigatória: quem ficou fora pode ter perdido o
    // controle da antiga, e ninguém lembra de trocar depois.
    const senha = gerarSenhaTemporaria()
    const { error: erroSenha } = await admin.auth.admin.updateUserById(alvo.id, { password: senha })
    if (erroSenha) throw new Error('Não foi possível gerar a senha temporária.')
    const { error } = await admin.from('profiles')
      .update({ active: true, desativado_em: null, trocar_senha: true, updated_at: new Date().toISOString() })
      .eq('id', alvo.id)
    if (error) throw new Error('Não foi possível reativar a conta.')

    await auditar(admin, { workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: alvo.id, acao: 'usuario_reativado', detalhes: { senha: 'temporaria_gerada' } })
    revalidar()
    return { recado: `${alvo.full_name} foi reativado com uma senha temporária.`, usuario: alvo.username, senhaTemporaria: senha }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível reativar a conta.') }
  }
}

// ------------------------------------------------------------------ a própria senha

/**
 * A pessoa troca a própria senha — no perfil ou na troca obrigatória.
 *
 * Pede a senha atual: sem isso, uma sessão esquecida aberta num computador
 * da sede bastaria para alguém tomar a conta. Depois da troca, TODAS as
 * sessões caem (inclusive a de quem roubou a antiga) e esta é refeita.
 */
export async function trocarMinhaSenha(formData: FormData): Promise<{ erro?: string }> {
  // Só dois destinos possíveis: o valor vem do formulário e não pode virar
  // redirecionamento aberto para qualquer endereço.
  const destino = texto(formData, 'origem') === 'perfil' ? '/perfil?senha=trocada' : '/dashboard'
  try {
    // Sem requireWorkspace: este é justamente o caminho de quem está preso na
    // troca obrigatória — e ela vem antes do código do app autenticador.
    const context = await obterWorkspaceSemVerificacao()
    if (!context) redirect('/')
    const usuario = String(context.profile?.username ?? '')
    const atual = String(formData.get('senhaAtual') ?? '')
    const nova = String(formData.get('novaSenha') ?? '')
    if (nova !== String(formData.get('confirmacao') ?? '')) throw new Error('A confirmação não confere com a nova senha.')
    if (nova === atual) throw new Error('A nova senha precisa ser diferente da atual.')
    const problema = problemaDaSenha(nova, { usuario, nome: context.profile?.full_name })
    if (problema) throw new Error(problema)

    // Confere a senha atual num cliente avulso, que não mexe nos cookies
    // desta sessão, e encerra na hora a sessão que a conferência abriu.
    const { url, key } = publicSupabaseEnv()
    const avulso = criarClienteAvulso(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: conferido, error: erroAtual } = await avulso.auth.signInWithPassword({ email: emailInterno(usuario), password: atual })
    if (erroAtual || conferido.user?.id !== context.user.id) throw new Error('A senha atual não confere.')
    await avulso.auth.signOut()

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(context.user.id, { password: nova })
    if (error) throw new Error('Não foi possível trocar a senha.')
    await admin.from('profiles').update({ trocar_senha: false, updated_at: new Date().toISOString() }).eq('id', context.user.id)
    await encerrarSessoes(admin, context.user.id)
    await auditar(admin, { workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: context.user.id, acao: 'senha_trocada' })

    // Todas as sessões caíram, inclusive esta: entra de novo com a nova.
    const supabase = await createClient()
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: emailInterno(usuario), password: nova })
    if (erroLogin) redirect('/')
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível trocar a senha.') }
  }
  revalidatePath('/', 'layout')
  redirect(destino)
}
