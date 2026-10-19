import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode } from '@/lib/permissoes'
import { notificar } from '@/lib/notificacoes/servidor'
import { ambienteDoCadastro, cadastrar, emailEmUso, usuarioLivre, type AmbienteDoCadastro } from '@/lib/contas/cadastro'
import { conferirCadastro, linhasDoCadastro, textoDoResultadoDoCadastro, type CadastroConferido, type PedidoDeCadastro } from '@/lib/contas/cadastro-regras'
import {
  PAPEIS_DA_CONFIRMACAO, TEXTO_DO_NUMERO_EM_USO, conferirAjustes, pedidoDoLink, textoDoCadastroNaoFeito, tituloDoAvisoDoCadastro,
  type AjustesDoCadastro,
} from './colaborador-regras'
import type { Confirmacao } from './confirmacoes'
import type { Descricao, QuemConfirma } from './confirmar-no-palacio'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A confirmação, no Palácio, do cadastro de colaborador pedido pelo WhatsApp
 * (acao "cadastrar_colaborador": lib/whatsapp/colaborador.ts). A página de
 * confirmar (app/confirmar/[token]) já conferiu a sessão de quem pediu, a
 * verificação das telas e o portão da Escola; aqui:
 *
 *  - descreverCadastro: o pedido lido do link e conferido AGORA com as regras
 *    da tela (os canais ligados agora, a lista oficial, administrador nunca),
 *    a ficha do RH ainda sem login, o e-mail ainda livre e o usuário sugerido
 *    ainda livre (senão, o próximo livre). O contato aparece mascarado. Dá para
 *    mudar só o usuário e o papel; o resto, pela tela "Adicionar pessoas";
 *  - faltaNoCadastro: as mesmas conferências, com o usuário e o papel
 *    escolhidos, ANTES de gastar o link — o que não serve volta sem gastar;
 *  - executarCadastro: depois de gastar o link (uso único: consumirConfirmacao,
 *    um clique só passa), cria pelo MESMO núcleo de "Adicionar pessoas"
 *    (lib/contas/cadastro.ts, cadastrar) pela sessão de quem confirma: a conta
 *    em modo convite, o vínculo, a ficha do RH ligada ou criada, o pedido da
 *    ficha no convite, o convite e a auditoria "usuario_criado" (com origem
 *    "whatsapp"). Avisa no sino; o retorno pelo WhatsApp é o da página.
 *
 * Os dados do link são lidos ANTES de gastar (ao gastar, o banco tira o e-mail
 * e o WhatsApp: migração 20261019050000). O resultado — na tela, no sino, no
 * histórico da confirmação e no WhatsApp — leva o contato só mascarado
 * (textoDoResultadoDoCadastro); nada de contato vai a log.
 */

type Preparo = { pedido: PedidoDeCadastro; cadastro: CadastroConferido; ambiente: AmbienteDoCadastro; usuario: string; numeroEmUso: boolean }

const TELA = '/pessoas/adicionar'
const PELA_TELA = 'Cadastre pela tela "Adicionar pessoas".'

/** O pedido do link, conferido agora (sem gastar nada). `ajustes`: o usuário e o papel escolhidos na tela. */
async function preparar(admin: Admin, c: Confirmacao, quem: QuemConfirma, ajustes?: AjustesDoCadastro | null): Promise<Preparo | { erro: string }> {
  if (!pode(quem.papel, 'usuarios.gerenciar')) return { erro: 'Cadastrar colaboradores é só de quem gerencia os usuários.' }
  const lido = pedidoDoLink(c.dados)
  const escolha = conferirAjustes(ajustes, { usuario: lido.usuario, papel: lido.pedido.papel })
  if (!escolha.ok) return { erro: escolha.erro }
  const pedido = { ...lido.pedido, papel: escolha.papel }
  const ambiente = await ambienteDoCadastro(admin, { workspaceId: quem.workspaceId, adminId: quem.userId, convidadoPor: quem.nome ?? 'Um administrador' })
  const conferido = conferirCadastro(pedido, { setores: ambiente.setores, canais: ambiente.canais, semAdmin: true })
  if (!conferido.ok) return { erro: `Não dá para cadastrar ${conferido.nome || 'esta pessoa'}: ${conferido.erro}. ${PELA_TELA}` }
  const cadastro = conferido.cadastro
  if (cadastro.fichaId) {
    const { data: ficha } = await admin.from('equipe_membros').select('user_id').eq('id', cadastro.fichaId).eq('workspace_id', quem.workspaceId).maybeSingle()
    if (!ficha) return { erro: `A ficha do RH de ${cadastro.nome} não foi achada. ${PELA_TELA}` }
    if (ficha.user_id) return { erro: `${cadastro.nome} ganhou acesso ao Palácio no meio-tempo: a ficha do RH já está ligada a um login. Confira em Pessoas.` }
  }
  if (cadastro.email && await emailEmUso(admin, cadastro.email)) return { erro: `O e-mail informado já está em uso por outra conta. ${PELA_TELA}` }
  return { pedido, cadastro, ambiente, usuario: escolha.usuario, numeroEmUso: lido.numeroEmUso }
}

const usuarioExiste = async (admin: Admin, usuario: string) =>
  Boolean((await admin.from('profiles').select('id').eq('username', usuario).maybeSingle()).data)

/** O que a tela de confirmar mostra: o resumo mascarado, com o usuário e o papel para mudar. */
export async function descreverCadastro(admin: Admin, c: Confirmacao, quem: QuemConfirma): Promise<Descricao | { erro: string; link: string }> {
  const p = await preparar(admin, c, quem)
  if ('erro' in p) return { erro: p.erro, link: TELA }
  // O sugerido no WhatsApp foi tomado no meio-tempo: o próximo livre, como a tela gera.
  const usuario = p.usuario && !await usuarioExiste(admin, p.usuario) ? p.usuario : await usuarioLivre(admin, p.cadastro.nome, new Set())
  return {
    titulo: `Cadastrar ${p.cadastro.nome}`,
    linhas: linhasDoCadastro({ ...p.cadastro, usuario }).filter((l) => l.rotulo !== 'Usuário' && l.rotulo !== 'Papel'),
    efeito: [
      'Ao confirmar, a conta nasce em modo convite e o convite sai para a pessoa criar a senha. O e-mail e o WhatsApp aparecem mascarados; para mudar algo além do usuário e do papel, cadastre pela tela "Adicionar pessoas".',
      p.numeroEmUso ? TEXTO_DO_NUMERO_EM_USO.replace(/^⚠️ /, '') : '',
    ].filter(Boolean).join(' '),
    botao: 'Confirmar o cadastro', link: TELA,
    cadastro: { usuario, papel: p.cadastro.papel, papeis: PAPEIS_DA_CONFIRMACAO },
  }
}

/** As conferências antes de gastar o link, com o usuário e o papel escolhidos: o que não serve volta sem gastar. */
export async function faltaNoCadastro(admin: Admin, c: Confirmacao, quem: QuemConfirma, ajustes?: AjustesDoCadastro | null): Promise<string | null> {
  const p = await preparar(admin, c, quem, ajustes)
  if ('erro' in p) return p.erro
  if (await usuarioExiste(admin, p.usuario)) return `O usuário @${p.usuario} já existe. Escolha outro.`
  return null
}

/**
 * Cria pelo núcleo de "Adicionar pessoas", depois de gastar o link. `ok` verdadeiro quando a conta nasceu (mesmo que
 * o convite não tenha saído: o texto diz, com o caminho para reenviar); falso quando nada foi criado.
 */
export async function executarCadastro(admin: Admin, sessao: SupabaseClient, c: Confirmacao, quem: QuemConfirma, ajustes?: AjustesDoCadastro | null): Promise<{ ok: boolean; mensagem: string }> {
  const p = await preparar(admin, c, quem, ajustes)
  if ('erro' in p) return { ok: false, mensagem: p.erro }
  const r = await cadastrar(admin, sessao, p.ambiente, p.pedido, { usuario: p.usuario, semAdmin: true, origem: 'whatsapp' })
  if (!r.conta) return { ok: false, mensagem: textoDoCadastroNaoFeito(r.nome, r.mensagem) }
  const mensagem = textoDoResultadoDoCadastro({
    nome: r.nome, usuario: r.conta.usuario, envio: r.conta.envio, email: r.conta.email, numeroDoConvite: r.conta.numeroDoConvite, sobreAFicha: r.conta.sobreAFicha,
  })
  // O sino de quem pediu (o WhatsApp vai pela resposta da página, sem repetir aqui).
  await notificar(admin, {
    workspaceId: quem.workspaceId, para: [quem.userId], atorId: null, categoria: 'equipe', semWhatsapp: [quem.userId],
    titulo: tituloDoAvisoDoCadastro(r.nome), mensagem: mensagem.replace(/\*/g, ''), link: '/usuarios',
  })
  return { ok: true, mensagem }
}
