import 'server-only'
import { randomBytes } from 'node:crypto'
import { del, get, put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode } from '@/lib/permissoes'
import { nomesDosSetores } from '@/lib/setores'
import { buscarCep } from '@/lib/apis-publicas/servidor'
import { normalizarFotoDoVisitante } from '@/lib/portaria/foto-servidor'
import { hashDoConvite } from '@/lib/rh/convites'
import { enviarComSeguranca, hashDoIp } from '@/lib/contas/servidor'
import { emailDeContaDoGoogle } from '@/lib/google/contas-emails'
import { gerarSenhaTemporaria } from '@/lib/usuarios/senha'
import { ErroDoDiretorio, chamarGoogleAdmin, criarUsuarioNoGoogle, enderecoOcupadoNoGoogle } from '@/lib/google/diretorio'
import { ErroDeGrupo, avisoDaConversao, colocarNoGrupo, consultarEndereco, converterEmGrupo } from '@/lib/google/grupos-regras'
import { DOMINIO_DAS_CONTAS, celularEmE164, separarNome, usuarioSugeridoDoGoogle } from '@/lib/google/contas-regras'
import { baixarMidia, subirMidia, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import { fotoRecebida, TETO_DA_FOTO_DO_VISITANTE } from './portaria-regras'
import type { Interativo, MensagemRecebida } from './regras'
import type { Pessoa } from './acoes'
import { perfilConectado } from './servidor'
import {
  BOTOES_DE_APROVACAO, BOTOES_DA_SEGUNDA_CONFIRMACAO, TEXTO_DE_ENVIADO, TEXTO_DE_RECUSADO, comEnderecoDoCep,
  fichaDoAutocadastro, lerAutocadastro, perguntaDoAutocadastro, proximaEtapa, resumoParaAprovador, seguirNoAutocadastro, textoDaSegundaConfirmacao,
  ehCoordenador, linkDoBot, podeDecidir, setorDaEntrada, textoDaContaCriada, textoDoLinkDoTime, TEXTO_DA_SENHA_NO_WHATSAPP, type DadosDoAutocadastro,
} from './autocadastro-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O autocadastro do colaborador pelo WhatsApp (regras puras em autocadastro-regras.ts). A conversa é sempre privada,
 * com quem ainda não tem conta; o pedido vive em colaborador_autocadastros (migração 20261023120000) até um
 * aprovador (usuarios.gerenciar, número confirmado) tocar em Aprovar e, de novo, em "Sim, criar".
 *
 * Nada é criado antes disso. Na aprovação, nesta ordem: a ficha do RH (banco, desfazível), a conta do Google (a senha
 * provisória vai ao e-mail pessoal, nunca ao WhatsApp) e o aviso à pessoa. Se o Google falhar, o pedido volta a
 * "aguardando" e o aprovador pode tocar de novo. Nunca lança: a falha vira texto.
 */

export type Saida = { texto: string; interativo?: Interativo | null }

const PEDIDOS_POR_HORA_NO_ESPACO = 30
const PEDIDOS_POR_NUMERO_EM_24H = 3
const FOTO_NO_BLOB = (workspaceId: string, id: string) => `equipe-cadastro/${workspaceId}/${id}/${crypto.randomUUID()}.jpg`
const ABERTOS = ['em_andamento', 'aguardando']

type Linha = {
  id: string; workspace_id: string; numero: string; status: string; dados: DadosDoAutocadastro; foto_path: string | null
  membro_id: string | null; expira_em: string
}
const COLUNAS = 'id, workspace_id, numero, status, dados, foto_path, membro_id, expira_em'

async function apagarFoto(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('equipe-cadastro/')) return
  try { await del(caminho) } catch (causa) { console.error('[whatsapp] autocadastro: foto não apagada:', causa instanceof Error ? causa.name : 'erro') }
}

/**
 * Um pedido que ficou em "aprovando" por mais de 10 minutos travou no meio (queda do servidor, erro que não voltou o
 * pedido): volta a "aguardando" para o aprovador tentar de novo. A ficha já criada é reaproveitada.
 */
export async function soltarPedidosPresos(admin: Admin): Promise<void> {
  try {
    await admin.from('colaborador_autocadastros').update({ status: 'aguardando' })
      .eq('status', 'aprovando').lt('atualizado_em', new Date(Date.now() - 10 * 60_000).toISOString())
  } catch { /* sem a tabela: nada a soltar */ }
}

/** Os pedidos que passaram do prazo saem: o dado pessoal e a foto vão embora (até 50 por vez). Melhor esforço. */
export async function expirarAutocadastros(admin: Admin): Promise<void> {
  await soltarPedidosPresos(admin)
  try {
    const { data } = await admin.from('colaborador_autocadastros').select('id, foto_path').in('status', [...ABERTOS])
      .lt('expira_em', new Date().toISOString()).limit(50)
    for (const l of data ?? []) {
      await apagarFoto(l.foto_path as string | null)
      await admin.from('colaborador_autocadastros').update({ status: 'expirado' }).eq('id', l.id).in('status', [...ABERTOS])
    }
  } catch { /* sem a tabela (migração pendente) ou sem rede: o pedido vence na próxima rodada */ }
}

/** O pedido aberto deste número, ou null (também sem a tabela). */
export async function autocadastroAberto(admin: Admin, workspaceId: string, numero: string): Promise<Linha | null> {
  const { data, error } = await admin.from('colaborador_autocadastros').select(COLUNAS)
    .eq('workspace_id', workspaceId).eq('numero', numero).in('status', [...ABERTOS]).gt('expira_em', new Date().toISOString()).maybeSingle()
  if (error) return null
  return (data as Linha | null) ?? null
}

/** Esta mensagem pertence ao autocadastro? (a frase de entrada, ou um pedido aberto do número). */
export async function ehDoAutocadastro(admin: Admin, workspaceId: string, m: MensagemRecebida): Promise<boolean> {
  if (!m.numero) return false
  if (!m.midia && lerAutocadastro(m.texto)) return true
  return Boolean(await autocadastroAberto(admin, workspaceId, m.numero))
}

// ------------------------------------------------------------------ quem se cadastra

export async function conversarNoAutocadastro(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: MensagemRecebida): Promise<Saida[]> {
  const numero = m.numero
  if (!numero) return []
  try {
    await expirarAutocadastros(admin)
    let linha = await autocadastroAberto(admin, workspaceId, numero)

    if (!linha) {
      if (m.midia || !lerAutocadastro(m.texto)) return []
      const hora = new Date(Date.now() - 3_600_000).toISOString()
      const dia = new Date(Date.now() - 86_400_000).toISOString()
      const [{ count: noEspaco }, { count: doNumero }] = await Promise.all([
        admin.from('colaborador_autocadastros').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('criado_em', hora),
        admin.from('colaborador_autocadastros').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('numero', numero).gte('criado_em', dia),
      ])
      if ((noEspaco ?? 0) >= PEDIDOS_POR_HORA_NO_ESPACO) return [{ texto: 'Estamos recebendo muitos cadastros agora. Tente de novo em uma hora.' }]
      if ((doNumero ?? 0) >= PEDIDOS_POR_NUMERO_EM_24H) return [{ texto: 'Você já fez alguns pedidos hoje. Fale com a sua coordenação para acompanhar o cadastro.' }]
      const setores = await nomesDosSetores(admin, workspaceId)
      // O link do time de um coordenador já traz o setor ("quero me cadastrar em Tecnologia da Informação").
      const doLink = setorDaEntrada(m.texto, setores)
      const dados: DadosDoAutocadastro = { setores, ...(doLink ? { coordenacao: doLink } : {}) }
      const { data, error } = await admin.from('colaborador_autocadastros').insert({ workspace_id: workspaceId, numero, dados }).select(COLUNAS).single()
      if (error || !data) return [{ texto: 'O cadastro pelo WhatsApp ainda não está ligado. Fale com a sua coordenação.' }]
      const p = perguntaDoAutocadastro(data.dados as DadosDoAutocadastro)
      return p ? [{ texto: p.texto, interativo: p.interativo }] : []
    }

    if (linha.status === 'aguardando') return [{ texto: 'Seu cadastro já foi enviado e está aguardando a aprovação da coordenação. Assim que decidirem, aviso você por aqui.' }]
    return await avancar(admin, workspaceId, config, linha, m)
  } catch (causa) {
    console.error('[whatsapp] autocadastro:', causa instanceof Error ? causa.message : causa)
    return [{ texto: 'Não consegui continuar agora. Mande a mesma mensagem de novo em instantes.' }]
  }
}

async function gravar(admin: Admin, l: Linha, dados: DadosDoAutocadastro, extra: Record<string, unknown> = {}): Promise<boolean> {
  const { data } = await admin.from('colaborador_autocadastros').update({ dados, ...extra }).eq('id', l.id).eq('status', 'em_andamento').select('id').maybeSingle()
  return Boolean(data)
}

async function avancar(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, m: MensagemRecebida): Promise<Saida[]> {
  let d = l.dados
  const etapa = proximaEtapa(d)

  // A foto: só a imagem vale na etapa dela. O arquivo vai já ao Blob privado (a mídia da Meta não dura até a aprovação).
  if (m.midia) {
    if (etapa !== 'foto') return [{ texto: 'Por enquanto preciso só de texto.' }, ...saidaDa(d)]
    const lida = fotoRecebida(m.midia)
    if (!lida) return [{ texto: 'Mande a foto como imagem, não como documento.' }]
    if ('erro' in lida) return [{ texto: lida.erro }]
    const baixada = await baixarMidia(config, lida.foto.midia, TETO_DA_FOTO_DO_VISITANTE, lida.foto.endereco)
    if (!baixada.ok) return [{ texto: 'Não consegui baixar a foto. Mande de novo.' }]
    const bytes = await normalizarFotoDoVisitante(baixada.conteudo)
    if (!bytes) return [{ texto: 'Não consegui abrir essa imagem. Tire a foto pela câmera do WhatsApp e mande de novo.' }]
    const caminho = FOTO_NO_BLOB(workspaceId, l.id)
    await put(caminho, Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
    const ok = await gravar(admin, l, { ...d, fotoMidia: '1' }, { foto_path: caminho })
    if (!ok) { await apagarFoto(caminho); return [{ texto: 'Este cadastro já foi encerrado. Envie *quero me cadastrar* para começar de novo.' }] }
    await apagarFoto(l.foto_path)
    d = { ...d, fotoMidia: '1' }
    return saidaDa(d, 'Foto recebida ✓')
  }

  const passo = seguirNoAutocadastro(d, m.texto)
  if (passo.tipo === 'repetir') return [{ texto: passo.texto }]
  if (passo.tipo === 'cancelar') {
    await apagarFoto(l.foto_path)
    await admin.from('colaborador_autocadastros').update({ status: 'cancelado' }).eq('id', l.id).eq('status', 'em_andamento')
    return [{ texto: 'Cadastro cancelado. Nada foi guardado. Para recomeçar, envie *quero me cadastrar*.' }]
  }
  if (passo.tipo === 'consultar_cep') {
    const achado = await buscarCep(passo.dados.cep ?? '').catch(() => null)
    d = comEnderecoDoCep(passo.dados, achado)
    await gravar(admin, l, d)
    return saidaDa(d)
  }
  d = passo.dados
  if (!(await gravar(admin, l, d))) return [{ texto: 'Este cadastro já foi encerrado. Envie *quero me cadastrar* para começar de novo.' }]

  if (proximaEtapa(d) === 'pronto') return await enviarParaAprovacao(admin, workspaceId, config, l, d)
  return saidaDa(d, passo.recibo)
}

function saidaDa(d: DadosDoAutocadastro, antes?: string | null): Saida[] {
  const p = perguntaDoAutocadastro(d, antes)
  return p ? [{ texto: p.texto, interativo: p.interativo }] : []
}

// ------------------------------------------------------------------ quem aprova

type Aprovador = { userId: string | null; numero: string }

/**
 * Quem decide o cadastro: um administrador (usuarios.gerenciar, qualquer pedido) ou o coordenador do setor (pelo número,
 * só o pedido do próprio setor e nunca o de outro coordenador). `userId` é null para o coordenador sem login no Palácio.
 */
export type Ator = { userId: string | null; nome: string | null; numero: string; admin: boolean; setores: string[] }

/** O ator desta mensagem, ou null se o número não decide cadastro nenhum (o bot segue como sempre). Sem a tabela, só o administrador. */
export async function atorDeAprovacao(admin: Admin, workspaceId: string, numero: string, pessoa: Pessoa | null): Promise<Ator | null> {
  const ehAdmin = Boolean(pessoa && pode(pessoa.papel, 'usuarios.gerenciar'))
  let setores: string[] = []
  const { data, error } = await admin.from('setor_coordenadores').select('setores(nome)').eq('workspace_id', workspaceId).eq('numero', numero).is('revogado_em', null)
  if (!error) {
    setores = (data ?? []).flatMap((c) => {
      const s = (Array.isArray(c.setores) ? c.setores[0] : c.setores) as { nome?: string } | null
      return s?.nome ? [s.nome] : []
    })
  }
  if (!ehAdmin && !setores.length) return null
  return { userId: pessoa?.id ?? null, nome: pessoa?.nome ?? null, numero, admin: ehAdmin, setores }
}

/** Quem recebe o pedido: os administradores com o número confirmado e, quando o pedido é de uma equipe, os coordenadores do setor. */
async function aprovadores(admin: Admin, workspaceId: string, d?: DadosDoAutocadastro): Promise<Aprovador[]> {
  const { data: membros } = await admin.from('workspace_members').select('user_id, role, profiles(active)').eq('workspace_id', workspaceId)
  const ids = (membros ?? []).filter((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { active?: boolean } | null
    return perfil?.active !== false && pode(m.role as string, 'usuarios.gerenciar')
  }).map((m) => m.user_id as string)
  const quem: Aprovador[] = []
  if (ids.length) {
    const { data: contas } = await admin.from('whatsapp_contas').select('user_id, numero').in('user_id', ids)
    for (const c of contas ?? []) quem.push({ userId: c.user_id as string, numero: c.numero as string })
  }
  // O coordenador só recebe o pedido da própria equipe (o de outro coordenador é só de administrador).
  if (d?.coordenacao && !ehCoordenador(d.cargo)) {
    const { data, error } = await admin.from('setor_coordenadores').select('numero, setores!inner(nome)')
      .eq('workspace_id', workspaceId).eq('setores.nome', d.coordenacao).is('revogado_em', null)
    if (!error) for (const c of data ?? []) if (!quem.some((q) => q.numero === c.numero)) quem.push({ userId: null, numero: c.numero as string })
  }
  return quem
}

async function enviarParaAprovacao(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, d: DadosDoAutocadastro): Promise<Saida[]> {
  const { data: ok } = await admin.from('colaborador_autocadastros').update({ status: 'aguardando', expira_em: new Date(Date.now() + 7 * 86_400_000).toISOString() })
    .eq('id', l.id).eq('status', 'em_andamento').select('id').maybeSingle()
  if (!ok) return []
  await avisarAprovadores(admin, workspaceId, config, l.id, d, l.foto_path)
  return [{ texto: TEXTO_DE_ENVIADO }]
}

/** A foto vai no cabeçalho dos botões, dentro da janela de 24 h; fora dela, o texto, e o aprovador pede "cadastros". Melhor esforço. */
async function avisarAprovadores(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, id: string, d: DadosDoAutocadastro, fotoPath: string | null) {
  try {
    const quem = await aprovadores(admin, workspaceId, d)
    let imagem: string | null = null
    if (fotoPath) {
      const bytes = await lerDoBlob(fotoPath)
      const enviada = bytes ? await subirMidia(config, bytes) : null
      if (enviada?.ok) imagem = enviada.id
    }
    const interativo = BOTOES_DE_APROVACAO(id)
    const comFoto: Interativo = interativo.tipo === 'botoes' ? { ...interativo, imagem } : interativo
    for (const a of quem) {
      await entregar(admin, workspaceId, {
        numero: a.numero, userId: a.userId, tipo: 'aviso', categoria: 'equipe',
        texto: `${resumoParaAprovador(d)}\n\nToque em um botão. Se ele não aparecer, responda *cadastros*.`, interativo: comFoto,
      }, { config })
    }
  } catch (causa) {
    console.error('[whatsapp] autocadastro: aprovadores não avisados:', causa instanceof Error ? causa.message : causa)
  }
}

async function lerDoBlob(caminho: string): Promise<Uint8Array | null> {
  try {
    const r = await get(caminho, { access: 'private' })
    if (!r || r.statusCode !== 200) return null
    return new Uint8Array(await new Response(r.stream).arrayBuffer())
  } catch { return null }
}

/**
 * O acompanhamento: todo aprovador (quem gerencia usuários, com o número confirmado) recebe o que acontece com um
 * pedido, menos quem acabou de agir (esse já leu a resposta). Só o nome e o resultado, nunca dado pessoal. Melhor esforço.
 */
async function avisarAcompanhamento(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, texto: string, d: DadosDoAutocadastro, exceto?: string) {
  try {
    for (const a of await aprovadores(admin, workspaceId, d)) {
      if (a.numero === exceto) continue
      await entregar(admin, workspaceId, { numero: a.numero, userId: a.userId, tipo: 'aviso', categoria: 'equipe', texto }, { config })
    }
  } catch (causa) {
    console.error('[whatsapp] autocadastro: acompanhamento não enviado:', causa instanceof Error ? causa.message : causa)
  }
}

/** "cadastros": os pedidos que esperam e que este ator pode decidir, cada um com os botões. */
export async function pendentesDeAprovacao(admin: Admin, workspaceId: string, ator: Ator): Promise<Saida[]> {
  await soltarPedidosPresos(admin)
  const { data } = await admin.from('colaborador_autocadastros').select(COLUNAS).eq('workspace_id', workspaceId).eq('status', 'aguardando')
    .gt('expira_em', new Date().toISOString()).order('criado_em').limit(20)
  const meus = ((data ?? []) as Linha[]).filter((l) => podeDecidir(ator, l.dados)).slice(0, 5)
  if (!meus.length) return [{ texto: 'Nenhum cadastro esperando a sua aprovação. ✓' }]
  return meus.map((l) => ({ texto: resumoParaAprovador(l.dados), interativo: BOTOES_DE_APROVACAO(l.id) }))
}

/** "link do time": o link de cadastro de cada setor que o coordenador coordena. */
export async function linkDoTime(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, ator: Ator): Promise<Saida[]> {
  if (!ator.setores.length) return [{ texto: 'O link do time é de quem coordena um setor. Para o link geral, peça o "quero me cadastrar" ao bot.' }]
  const numero = (await perfilConectado(config).catch(() => null))?.numero
  if (!numero) return [{ texto: 'Não consegui ler o número do WhatsApp do Palácio agora. Tente de novo em instantes.' }]
  return [{ texto: textoDoLinkDoTime(ator.setores.map((setor) => ({ setor, link: linkDoBot(numero, setor) }))) }]
}

const uuidDe = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

export async function decidirAutocadastro(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, ator: Ator, botao: { acao: 'aprovar' | 'recusar' | 'sim' | 'voltar'; id: string }): Promise<Saida[]> {
  try {
    const id = uuidDe(botao.id)
    if (botao.acao === 'voltar') return [{ texto: 'Certo, nada foi criado. Responda *cadastros* quando quiser decidir.' }]
    const { data } = await admin.from('colaborador_autocadastros').select(COLUNAS).eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
    const l = data as Linha | null
    if (!l || l.status !== 'aguardando') return [{ texto: 'Este cadastro já foi decidido ou venceu.' }]
    // O coordenador decide só a equipe do próprio setor; cargo de coordenador é só de administrador.
    if (!podeDecidir(ator, l.dados)) return [{ texto: 'Este cadastro não é do seu setor. Quem decide é um administrador.' }]

    if (botao.acao === 'aprovar') {
      const aviso = ator.admin ? await avisoDoEnderecoDoSetor(admin, workspaceId, l.dados.coordenacao) : null
      return [{ texto: `${textoDaSegundaConfirmacao(l.dados)}${aviso ? `\n\n${aviso}` : ''}`, interativo: BOTOES_DA_SEGUNDA_CONFIRMACAO(l.id) }]
    }

    if (botao.acao === 'recusar') {
      const { data: ok } = await admin.from('colaborador_autocadastros').update({ status: 'recusado', decidido_por: ator.userId, decidido_em: new Date().toISOString() })
        .eq('id', l.id).eq('status', 'aguardando').select('id').maybeSingle()
      if (!ok) return [{ texto: 'Este cadastro já foi decidido.' }]
      await apagarFoto(l.foto_path)
      await avisarPessoa(admin, workspaceId, config, l.numero, TEXTO_DE_RECUSADO)
      await avisarAcompanhamento(admin, workspaceId, config, `${ator.nome ?? 'Um aprovador'} recusou o cadastro de ${l.dados.nome ?? 'um colaborador'}.`, l.dados, ator.numero)
      return [{ texto: 'Cadastro recusado. A pessoa foi avisada e os dados dela foram apagados.' }]
    }

    // "Sim, criar": o primeiro a tocar trava o pedido (dois cliques, uma conta).
    const { data: preso } = await admin.from('colaborador_autocadastros').update({ status: 'aprovando', decidido_por: ator.userId })
      .eq('id', l.id).eq('status', 'aguardando').select(COLUNAS).maybeSingle()
    if (!preso) return [{ texto: 'Este cadastro já está sendo decidido.' }]
    return [{ texto: await criarTudo(admin, workspaceId, config, preso as Linha, ator) }]
  } catch (causa) {
    console.error('[whatsapp] autocadastro: decisão:', causa instanceof Error ? causa.message : causa)
    // O pedido que travou em "aprovando" (o "Sim, criar" já tinha gasto a vez) volta para o aprovador tentar de novo.
    await admin.from('colaborador_autocadastros').update({ status: 'aguardando' }).eq('id', uuidDe(botao.id)).eq('status', 'aprovando')
    return [{ texto: 'Não consegui concluir agora. O cadastro continua esperando: responda *cadastros* e tente de novo.' }]
  }
}

/**
 * O que a aprovação vai mudar no endereço do setor (apelido que vira grupo, endereço que será criado). Só para quem pode
 * converter (administrador). Se o Google não responde, sem aviso: a confirmação segue, e a conversão diz o que houve.
 */
async function avisoDoEnderecoDoSetor(admin: Admin, workspaceId: string, setor: string | undefined): Promise<string | null> {
  if (!setor) return null
  try {
    const { data } = await admin.from('setores').select('email').eq('workspace_id', workspaceId).eq('ativo', true).eq('nome', setor).maybeSingle()
    const endereco = typeof data?.email === 'string' && data.email.includes('@') ? data.email.toLowerCase() : null
    return endereco ? avisoDaConversao(await consultarEndereco(chamarGoogleAdmin(workspaceId), endereco), endereco) : null
  } catch {
    return null
  }
}

async function avisarPessoa(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, numero: string, texto: string) {
  await entregar(admin, workspaceId, { numero, userId: null, tipo: 'aviso', categoria: 'equipe', texto }, { config })
}

const mascarar = (e: string) => e.replace(/^(.).*(@.*)$/, '$1•••$2')

/** O usuário livre: o sugerido, depois .2, .3… (caixa de setor, conta já criada ou existente no Google contam como ocupado). */
async function usuarioLivreNoGoogle(admin: Admin, workspaceId: string, nome: string): Promise<string | null> {
  const base = usuarioSugeridoDoGoogle(nome)
  if (!base) return null
  for (let i = 1; i <= 9; i++) {
    const usuario = i === 1 ? base : `${base}${i}`
    const email = `${usuario}@${DOMINIO_DAS_CONTAS}`
    const [{ data: caixa }, { data: conta }] = await Promise.all([
      admin.from('caixas_de_email').select('id').eq('workspace_id', workspaceId).eq('email', email).maybeSingle(),
      admin.from('google_contas').select('id').eq('workspace_id', workspaceId).eq('email', email).maybeSingle(),
    ])
    if (!caixa && !conta && !(await enderecoOcupadoNoGoogle(workspaceId, email))) return usuario
  }
  return null
}

/**
 * Depois do "Sim, criar": a ficha (banco), a conta do Google e o aviso com a senha. Devolve o texto para quem aprovou.
 * Se a ficha ou o Google falham — inclusive por exceção, como a conexão de administrador que expirou —, o pedido volta
 * a "aguardando" com o motivo (a ficha já criada é reaproveitada na próxima tentativa).
 */
async function criarTudo(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, aprovador: Ator): Promise<string> {
  const voltar = async (motivo: string) => {
    await admin.from('colaborador_autocadastros').update({ status: 'aguardando' }).eq('id', l.id).eq('status', 'aprovando')
    return `${motivo} Nada ficou pela metade: o cadastro continua esperando. Corrija e responda *cadastros* para tentar de novo.`
  }
  const quem = aprovador.nome ?? 'Um aprovador'
  const nomeDoPedido = l.dados.nome ?? 'um colaborador'
  try {
    const texto = await executarCriacao(admin, workspaceId, config, l, aprovador, voltar)
    await avisarAcompanhamento(admin, workspaceId, config, `${quem} aprovou o cadastro de ${nomeDoPedido}.\n${texto}`, l.dados, aprovador.numero)
    return texto
  } catch (causa) {
    console.error('[whatsapp] autocadastro: criação:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    // As mensagens do diretório do Google já dizem o que fazer ("Reconecte em Configurações → E-mail dos setores").
    const motivo = causa instanceof ErroDoDiretorio ? causa.message : 'Aconteceu um erro inesperado ao criar a conta.'
    const texto = await voltar(motivo)
    await avisarAcompanhamento(admin, workspaceId, config, `${quem} tentou aprovar o cadastro de ${nomeDoPedido}, mas não deu certo.\n${texto}`, l.dados, aprovador.numero)
    return texto
  }
}

async function executarCriacao(
  admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, aprovador: Ator, voltar: (motivo: string) => Promise<string>,
): Promise<string> {
  const d = l.dados
  const nome = separarNome(d.nome ?? '')
  const emailPessoal = (d.emailPessoal ?? '').toLowerCase()
  if ('erro' in nome || !emailPessoal) return await voltar('O pedido está incompleto.')

  // 1. A ficha do RH, pelas mesmas funções da página pública.
  const token = randomBytes(32).toString('base64url')
  const hash = hashDoConvite(token)
  const { data: membroId, error: erroFicha } = await admin.rpc('whatsapp_autocadastro_criar_ficha', { p_autocadastro_id: l.id, p_token_hash: hash, p_aprovador: aprovador.userId })
  if (erroFicha || !membroId) return await voltar('Não consegui criar a ficha do RH.')
  const { error: erroDados } = await admin.rpc('equipe_preencher_pelo_convite', { p_token_hash: hash, p: fichaDoAutocadastro(d, `+${l.numero}`) })
  if (erroDados) return await voltar(`A ficha foi criada, mas os dados não entraram (${erroDados.message.slice(0, 120)}).`)

  // 2. O e-mail institucional (a primeira ida ao Google: sem a conexão de administrador em dia, a exceção sai daqui).
  const usuario = await usuarioLivreNoGoogle(admin, workspaceId, d.nome ?? '')
  if (!usuario) return await voltar('Não achei um endereço livre para esse nome.')
  const email = `${usuario}@${DOMINIO_DAS_CONTAS}`
  const { data: setor } = await admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId).eq('ativo', true).eq('nome', d.coordenacao ?? '').maybeSingle()
  const celular = celularEmE164(l.numero)
  let googleId = ''
  const senha = gerarSenhaTemporaria()
  try {
    googleId = await criarUsuarioNoGoogle(workspaceId, {
      email, primeiroNome: nome.primeiro, sobrenome: nome.resto, senha, emailDeRecuperacao: emailPessoal,
      celularDeRecuperacao: typeof celular === 'string' && celular ? celular : undefined, setor: d.coordenacao,
    })
  } catch (causa) {
    return await voltar(`O Google não criou a conta (${causa instanceof Error ? causa.message.slice(0, 160) : 'erro'}).`)
  }
  // O endereço do setor: se ainda é apelido, só um administrador o converte em grupo (muda a entrega do e-mail do setor);
  // quem entra como coordenador(a) é gerente do grupo, os demais são membros. Falha aqui nunca desfaz a conta.
  const grupo = typeof setor?.email === 'string' && setor.email.includes('@') ? setor.email.toLowerCase() : null
  let grupoOk = false
  let grupoNota = ''
  if (grupo) {
    const chamar = chamarGoogleAdmin(workspaceId)
    try {
      const conversao = aprovador.admin ? await converterEmGrupo(chamar, { endereco: grupo, nome: String(setor?.nome ?? d.coordenacao ?? grupo) }) : null
      if (conversao?.feito === 'nao_converteu') {
        grupoNota = ` O endereço ${grupo} é uma caixa real, não um grupo: a pessoa não entrou nele.`
      } else {
        grupoOk = await colocarNoGrupo(chamar, grupo, email, ehCoordenador(d.cargo) ? 'MANAGER' : 'MEMBER')
        if (conversao?.feito === 'convertido') grupoNota = ` O endereço ${grupo} virou um grupo do Google (as mensagens continuam chegando em ${conversao.dono}).`
        else if (conversao?.feito === 'criado') grupoNota = ` O endereço ${grupo} foi criado como grupo do Google.`
        if (grupoOk && ehCoordenador(d.cargo)) grupoNota += ' A pessoa é gerente do grupo.'
        if (!grupoOk) grupoNota = ` O endereço ${grupo} ainda é apelido, não um grupo: a pessoa não entrou nele. Um administrador precisa aprovar um cadastro desse setor para ele virar grupo.`
      }
    } catch (causa) {
      grupoOk = false
      grupoNota = ` O grupo ${grupo} não foi alterado: ${causa instanceof ErroDeGrupo || causa instanceof ErroDoDiretorio ? causa.message : 'erro inesperado'}`
      console.error('[whatsapp] autocadastro: grupo do setor:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    }
  }

  // 3. Daqui em diante a conta existe: o que falhar vira aviso, nunca desfaz.
  const nomeCompleto = d.nome ?? ''
  await admin.from('google_contas').insert({
    workspace_id: workspaceId, convite_id: null, email, nome: nomeCompleto, setor_id: setor?.id ?? null, grupo_email: grupo, grupo_ok: grupoOk,
    google_id: googleId || null, ip_hash: hashDoIp(`autocadastro:${l.id}`),
  })
  await admin.from('equipe_membros').update({ email_trabalho: email }).eq('id', membroId as string).eq('workspace_id', workspaceId)

  // Quem entrou como coordenador(a) passa a aprovar a equipe do próprio setor (só um administrador chega aqui com esse cargo).
  if (ehCoordenador(d.cargo) && setor?.id && aprovador.admin) {
    const { error: erroCoord } = await admin.from('setor_coordenadores').insert({
      workspace_id: workspaceId, setor_id: setor.id, numero: l.numero, membro_id: membroId as string, criado_por: aprovador.userId,
    })
    if (erroCoord && erroCoord.code !== '23505') console.error('[whatsapp] autocadastro: coordenador não registrado:', erroCoord.message)
  }

  // 4. A senha provisória vai ao WhatsApp da pessoa (decisão do responsável, 23/10/2026), com o passo a passo; nunca é
  // gravada. "categoria conta": o texto some da fila depois do envio. Se o WhatsApp falhar, o mesmo vai ao e-mail pessoal.
  const entrega = await entregar(admin, workspaceId, {
    numero: l.numero, userId: null, tipo: 'aviso', categoria: 'conta',
    texto: textoDaContaCriada({ nome: nomeCompleto, email, senha, grupo: grupoOk ? grupo : null }),
  }, { config })
  const peloWhatsapp = entrega.situacao !== 'falhou'
  const peloEmail = peloWhatsapp ? false : await enviarComSeguranca(emailPessoal, emailDeContaDoGoogle({ nome: nomeCompleto, email, senha, setor: d.coordenacao ?? '', grupo: grupoOk ? grupo : null }))
  await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: aprovador.userId, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null,
    metadata: { email, origem: 'autocadastro_whatsapp', autocadastro: l.id, aprovado_por: aprovador.admin ? 'administrador' : 'coordenador', grupo, grupo_ok: grupoOk, whatsapp: entrega.situacao, email_enviado: peloEmail },
  })
  // A foto passou para a ficha (foto_cadastro_path); sair do pedido apaga os dados pessoais dele (gatilho do banco).
  await admin.from('colaborador_autocadastros').update({ status: 'aprovado', decidido_em: new Date().toISOString() }).eq('id', l.id)

  const grupoAviso = grupoNota
  if (peloWhatsapp) {
    return `Pronto ✓ ${nomeCompleto} foi cadastrado(a). E-mail: ${email}. ${entrega.situacao === 'na_fila' ? 'A senha provisória e o passo a passo estão na fila e saem em instantes.' : TEXTO_DA_SENHA_NO_WHATSAPP}${grupoAviso}`
  }
  return peloEmail
    ? `A conta ${email} foi criada. O WhatsApp da pessoa não recebeu, então a senha provisória foi para ${mascarar(emailPessoal)}.${grupoAviso}`
    : `A conta ${email} foi criada, mas a senha NÃO chegou à pessoa (WhatsApp e e-mail falharam). Peça uma senha nova pelo Admin do Google e avise a pessoa.`
}
