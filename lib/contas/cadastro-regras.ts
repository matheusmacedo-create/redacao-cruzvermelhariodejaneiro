/**
 * O cadastro de quem entra na equipe, sem banco nem rede (módulo puro,
 * conferido por `npx tsx scripts/conferir-cadastro.ts`).
 *
 * Um cadastro só, por qualquer porta: "Adicionar pessoas" (/pessoas/adicionar),
 * o quadro "Acesso ao Palácio Virtual" da ficha do RH e — confirmado no
 * Palácio — o pedido feito pelo WhatsApp ("colaborador: Nome"). Todas passam
 * pelo mesmo núcleo do servidor (lib/contas/cadastro.ts), e é daqui que ele
 * tira as conferências antes de criar a conta, o usuário livre a partir do
 * nome, o papel sugerido pelo setor e os textos do resultado.
 *
 * As mensagens de erro são as de sempre da tela (fragmentos: a tela mostra
 * "Nome: mensagem"). Pelo WhatsApp, o administrador nunca é dado
 * (`semAdmin`): administração só pela tela.
 */

import { emailValido } from './emails'
import { SETORES, usuarioSugerido } from '@/lib/equipe'
import { PAPEL, ehPapel, type Papel } from '@/lib/permissoes'
import { TEXTO_DA_ESPERA_DA_COTA, formatarNumero, limpo, mascararNumero, numeroCanonico } from '@/lib/whatsapp/regras'

// ------------------------------------------------------------------ o pedido

/** O pedido de UMA pessoa, como chega da tela (convidarEmLote) ou do link confirmado no Palácio. */
export type PedidoDeCadastro = {
  nome: string; email: string; whatsapp?: string; papel: string; coordenacao: string; cargo: string; fichaId?: string
  /** Sem ficha no RH: cria a ficha junto, já ligada ao login. */
  criarFicha?: boolean
  /** Manda, na mesma mensagem do WhatsApp, o link para a pessoa completar a própria ficha. */
  pedirFicha?: boolean
}

/** Por onde um convite pode sair agora: o WhatsApp do Palácio ligado e o envio de e-mail configurado. */
export type CanaisLigados = { whatsapp: boolean; email: boolean }

/** O pedido conferido: o que o núcleo usa para criar a conta. */
export type CadastroConferido = {
  nome: string
  email: string | null
  /** O WhatsApp informado (canônico): vai para a ficha do RH, mesmo com o WhatsApp do Palácio desligado. */
  numero: string | null
  /** O WhatsApp por onde o convite sai (null com o WhatsApp do Palácio desligado). */
  numeroDoConvite: string | null
  papel: Papel
  /** "" = sem coordenação. */
  coordenacao: string
  cargo: string
  /** A ficha do RH que já existe e ganha o login. */
  fichaId: string | null
  criarFicha: boolean
  pedirFicha: boolean
}

/**
 * As chaves com o contato da pessoa nova nos dados da pergunta do WhatsApp e do link de confirmar: são elas que o
 * banco tira quando a conversa acaba (private.whatsapp_cadastro_sem_contato, migração 20261019050000). Mudou aqui,
 * muda lá.
 */
export const CHAVES_DE_CONTATO = ['email', 'whatsapp'] as const

/** O papel de administrador pelo WhatsApp: nunca. */
export const ERRO_DO_ADMIN = 'o papel de administrador só se dá pela tela (Pessoas → Adicionar)'

const UUID = /^[0-9a-f-]{36}$/

/**
 * Confere o pedido de uma pessoa, na ordem e com as mensagens de sempre da tela: nome e sobrenome, e-mail e
 * WhatsApp no formato, ao menos um canal ligado para o convite, papel e coordenação da lista (vazia vale: sem
 * coordenação). O cargo é opcional (até 120 caracteres).
 */
export function conferirCadastro(c: PedidoDeCadastro, ctx: { setores: string[]; canais: CanaisLigados; semAdmin?: boolean }):
  { ok: true; cadastro: CadastroConferido } | { ok: false; nome: string; erro: string } {
  const nome = String(c.nome ?? '').trim().replace(/\s+/g, ' ')
  const falha = (erro: string) => ({ ok: false as const, nome, erro })
  if (nome.split(' ').length < 2 || nome.length > 120) return falha('informe nome e sobrenome')
  const brutoDoEmail = String(c.email ?? '').trim()
  const email = brutoDoEmail ? emailValido(brutoDoEmail) : null
  if (brutoDoEmail && !email) return falha('e-mail inválido')
  const brutoDoNumero = String(c.whatsapp ?? '').trim()
  const numero = brutoDoNumero ? numeroCanonico(brutoDoNumero) : null
  if (brutoDoNumero && !numero) return falha('WhatsApp inválido (use DDD e número)')
  // Sem o WhatsApp do Palácio ligado, o número ainda vai para a ficha, mas o convite não sai por ele.
  const numeroDoConvite = ctx.canais.whatsapp ? numero : null
  if (!email && !numeroDoConvite) return falha(numero ? 'o WhatsApp do Palácio não está ligado: informe o e-mail' : 'informe o e-mail ou o WhatsApp')
  if (!numeroDoConvite && !ctx.canais.email) return falha(ctx.canais.whatsapp ? 'o envio de e-mail não está configurado: informe o WhatsApp' : 'nem o e-mail nem o WhatsApp do Palácio estão ligados')
  if (!ehPapel(c.papel)) return falha('papel inválido')
  if (ctx.semAdmin && c.papel === 'admin') return falha(ERRO_DO_ADMIN)
  const coordenacao = String(c.coordenacao ?? '')
  if (coordenacao && !ctx.setores.includes(coordenacao)) return falha('escolha um setor da lista')
  const fichaId = c.fichaId && UUID.test(c.fichaId) ? c.fichaId : null
  return {
    ok: true,
    cadastro: {
      nome, email, numero, numeroDoConvite, papel: c.papel, coordenacao, cargo: String(c.cargo ?? '').trim().slice(0, 120),
      fichaId, criarFicha: !fichaId && Boolean(c.criarFicha), pedirFicha: Boolean(c.pedirFicha),
    },
  }
}

// ------------------------------------------------------------------ usuário e papel

/** O login: letras minúsculas, números, ponto, hífen ou sublinhado, de 3 a 40. */
export const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/

export function problemaDoUsuario(usuario: string): string | null {
  return USUARIO_VALIDO.test(usuario) ? null : 'O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.'
}

/** A base do usuário a partir do nome: nome.sobrenome (lib/equipe, usuarioSugerido), com folga para o número. */
export const baseDoUsuario = (nome: string) => usuarioSugerido(nome).slice(0, 36) || 'pessoa'

/**
 * O primeiro usuário livre: a base, ou base2, base3… se já existir (ou se a base tiver menos de 3 letras). `usados`:
 * os usuários do banco que começam pela base e os já reservados nesta leva. null = nenhum livre até 99.
 */
export function usuarioLivreEntre(base: string, usados: Set<string>): string | null {
  if (!usados.has(base) && base.length >= 3) return base
  for (let i = 2; i < 100; i++) if (!usados.has(`${base}${i}`)) return `${base}${i}`
  return null
}

const SUGERIDO_POR_SETOR = new Map(SETORES.map((s) => [s.nome, s.papelSugerido]))

/**
 * O papel que vem marcado: o sugerido pelo setor (lib/equipe), como em "Adicionar pessoas"; fora da lista ou sem
 * setor, colaborador — o mais restrito. `semAdmin` (o WhatsApp): o setor que sugere administrador cai em
 * colaborador, porque administração só se dá pela tela.
 */
export function papelSugerido(setor: string | null | undefined, opcoes: { semAdmin?: boolean } = {}): Papel {
  const papel = (setor && SUGERIDO_POR_SETOR.get(setor)) || 'colaborador'
  return opcoes.semAdmin && papel === 'admin' ? 'colaborador' : papel
}

// ------------------------------------------------------------------ a ficha do RH

/** Endereço da instituição vai para o e-mail de trabalho da ficha; o resto, para o pessoal. */
export const DOMINIO_DA_INSTITUICAO = '@cruzvermelhariodejaneiro.org'

export const campoDoEmailNaFicha = (email: string): 'email_trabalho' | 'email_pessoal' =>
  email.endsWith(DOMINIO_DA_INSTITUICAO) ? 'email_trabalho' : 'email_pessoal'

// ------------------------------------------------------------------ o convite

/** `pelaCota`: o WhatsApp ficou para o dia seguinte pela cota diária de conversas (lib/whatsapp/fila.ts). */
export type EnvioDoConvite = { email: boolean; whatsapp: 'enviada' | 'na_fila' | 'falhou' | null; erroDoWhatsapp?: string; pelaCota?: boolean }

/** O convite saiu por algum canal (o WhatsApp na fila conta: sai sozinho). */
export const saiu = (e: EnvioDoConvite) => e.email || e.whatsapp === 'enviada' || e.whatsapp === 'na_fila'

/** "por e-mail e WhatsApp", "pelo WhatsApp (sai às 7h)"… para o recado da tela. */
export function comoSaiu(e: EnvioDoConvite, email: string | null, numero: string | null): string {
  const partes: string[] = []
  if (e.email && email) partes.push(`por e-mail (${email})`)
  if (e.whatsapp === 'enviada' && numero) partes.push(`pelo WhatsApp (${formatarNumero(numero)})`)
  if (e.whatsapp === 'na_fila' && numero) {
    partes.push(`pelo WhatsApp (${formatarNumero(numero)}, ${e.pelaCota ? `${TEXTO_DA_ESPERA_DA_COTA}; o link de senha conta as horas desde agora` : 'assim que a fila andar; de 22h às 7h, de manhã'})`)
  }
  return partes.join(' e ')
}

/** Como o convite foi, para a auditoria (detalhes.senha de "usuario_criado"). */
export const modoDoConvite = (email: string | null, numeroDoConvite: string | null) =>
  numeroDoConvite ? (email ? 'convite_por_email_e_whatsapp' : 'convite_por_whatsapp') : 'convite_por_email'

/** A linha do resultado na tela ("convite enviado … (usuário @x); ficha do RH criada"). */
export function mensagemDoCadastro(p: { envio: EnvioDoConvite; email: string | null; numeroDoConvite: string | null; usuario: string; sobreAFicha: string }): string {
  const principal = saiu(p.envio)
    ? `convite enviado ${comoSaiu(p.envio, p.email, p.numeroDoConvite)} (usuário @${p.usuario})`
    : `conta @${p.usuario} criada, mas o convite não saiu${p.envio.erroDoWhatsapp ? ` (${p.envio.erroDoWhatsapp})` : ''}: use "Reenviar"`
  return [principal, p.sobreAFicha].filter(Boolean).join('; ')
}

// ------------------------------------------------------------------ o que aparece fora da tela (WhatsApp, sino, confirmação)

/**
 * O e-mail mascarado (a•••a@exemplo.org): o domínio fica, para quem pediu reconhecer o endereço; o resto não vai ao
 * WhatsApp, ao sino nem ao histórico da confirmação.
 */
export function mascararEmail(email: string | null | undefined): string {
  const e = String(email ?? '').trim()
  const arroba = e.lastIndexOf('@')
  if (arroba < 1 || arroba === e.length - 1) return '—'
  const local = e.slice(0, arroba)
  return `${local[0]}•••${local.length > 2 ? local[local.length - 1] : ''}${e.slice(arroba)}`
}

/** Como o convite foi (ou não foi), com o contato mascarado: o retorno pelo WhatsApp e o aviso no sino. */
export function comoSaiuMascarado(e: EnvioDoConvite, email: string | null, numero: string | null): string[] {
  const partes: string[] = []
  if (email) partes.push(e.email ? `convite por e-mail (${mascararEmail(email)})` : `o e-mail (${mascararEmail(email)}) não saiu`)
  if (numero) {
    const n = mascararNumero(numero)
    if (e.whatsapp === 'enviada') partes.push(`convite pelo WhatsApp (${n})`)
    else if (e.whatsapp === 'na_fila') partes.push(`convite pelo WhatsApp (${n}) na fila: ${e.pelaCota ? `sai ${TEXTO_DA_ESPERA_DA_COTA}` : 'sai assim que a fila andar (de 22h às 7h, de manhã)'}`)
    else if (e.whatsapp === 'falhou') partes.push(`o WhatsApp (${n}) não saiu${e.erroDoWhatsapp ? ` (${limpo(e.erroDoWhatsapp, 160)})` : ''}`)
  }
  return partes
}

/**
 * O resultado do cadastro em uma mensagem (o retorno a quem pediu pelo WhatsApp, o aviso no sino e o histórico da
 * confirmação): a conta e o usuário, por onde o convite foi — com honestidade: o WhatsApp para quem nunca escreveu
 * ao Palácio pode ficar na fila ou falhar —, o que houve com a ficha do RH e, sem e-mail e sem o WhatsApp entregue, a
 * recomendação de cadastrar o e-mail (Usuários). Nada de contato inteiro: só mascarado.
 */
export function textoDoResultadoDoCadastro(p: {
  nome: string; usuario: string; envio: EnvioDoConvite; email: string | null; numeroDoConvite: string | null; sobreAFicha: string
}): string {
  const nome = limpo(p.nome, 80)
  const conta = `Conta de *${nome}* criada, usuário *@${limpo(p.usuario, 40)}*`
  const canais = comoSaiuMascarado(p.envio, p.email, p.numeroDoConvite)
  const linhas = [`${[conta, ...canais].join('; ')}.`]
  if (!saiu(p.envio)) linhas.push('O convite NÃO saiu: use “Reenviar” em Pessoas → Adicionar (convites pendentes), ou “Redefinir senha” em Usuários.')
  if (!p.email && p.envio.whatsapp !== 'enviada') {
    // O e-mail salvo em Usuários só vale depois de confirmado pela pessoa (atualizarUsuario); aí o convite vai por ele.
    linhas.push('Sem e-mail, o convite depende só do WhatsApp, que pode demorar ou não chegar a quem nunca escreveu ao Palácio. Se puder, cadastre o e-mail da pessoa em Usuários: depois de confirmado, o convite pode ir por ele (“Enviar convite de primeiro acesso”).')
  }
  if (p.sobreAFicha) linhas.push(`Ficha do RH: ${limpo(sobreAFichaPeloEnvio(p.sobreAFicha, p.envio), 300)}.`)
  return linhas.join('\n\n')
}

/**
 * O pedido da ficha só viaja dentro do convite pelo WhatsApp: com ele na fila ou sem sair, "junto" não é verdade —
 * o texto de fora da tela diz o que houve (a tela segue com a linha de sempre, mensagemDoCadastro).
 */
function sobreAFichaPeloEnvio(sobreAFicha: string, envio: EnvioDoConvite): string {
  const junto = 'pedido para completar a ficha junto'
  if (!sobreAFicha.includes(junto) || envio.whatsapp === 'enviada') return sobreAFicha
  return sobreAFicha.replace(junto, envio.whatsapp === 'na_fila'
    ? 'o pedido da ficha vai junto do convite na fila'
    : 'o pedido da ficha ia no WhatsApp e não saiu: mande por Recursos humanos')
}

/** Rótulo da coordenação: vazia é "Sem coordenação" (como a tela de Usuários deixa). */
export const rotuloDaCoordenacao = (coordenacao: string | null | undefined) => (coordenacao?.trim() ? coordenacao.trim() : 'Sem coordenação')

/**
 * O resumo do pedido, linha a linha, com o contato mascarado: a conferência no WhatsApp e a tela de confirmar no
 * Palácio. O usuário é o sugerido (gerado como a tela gera); no Palácio, dá para mudar.
 */
export function linhasDoCadastro(c: CadastroConferido & { usuario: string }):
  { rotulo: string; valor: string }[] {
  return [
    { rotulo: 'Nome', valor: c.nome },
    { rotulo: 'Usuário', valor: `@${c.usuario}` },
    { rotulo: 'E-mail', valor: c.email ? mascararEmail(c.email) : 'sem e-mail' },
    { rotulo: 'WhatsApp', valor: c.numero ? mascararNumero(c.numero) : 'sem WhatsApp' },
    { rotulo: 'Coordenação', valor: rotuloDaCoordenacao(c.coordenacao) },
    { rotulo: 'Cargo', valor: c.cargo || '—' },
    { rotulo: 'Papel', valor: PAPEL[c.papel].rotulo },
    { rotulo: 'Ficha do RH', valor: c.fichaId ? 'a que já existe, ligada ao acesso' : c.criarFicha ? 'criada junto' : 'sem ficha' },
    // Como no núcleo: o pedido vai dentro do convite pelo WhatsApp, então só com o convite saindo por ele e com ficha.
    { rotulo: 'Completar a ficha', valor: c.pedirFicha && c.numeroDoConvite && (c.fichaId || c.criarFicha) ? 'pedido na mesma mensagem do WhatsApp' : 'não' },
  ]
}
