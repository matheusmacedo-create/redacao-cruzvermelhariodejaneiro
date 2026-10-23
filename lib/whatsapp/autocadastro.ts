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
import { ErroDoDiretorio, adicionarAoGrupo, criarUsuarioNoGoogle, enderecoOcupadoNoGoogle } from '@/lib/google/diretorio'
import { DOMINIO_DAS_CONTAS, celularEmE164, separarNome, usuarioSugeridoDoGoogle } from '@/lib/google/contas-regras'
import { baixarMidia, subirMidia, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import { fotoRecebida, TETO_DA_FOTO_DO_VISITANTE } from './portaria-regras'
import type { Interativo, MensagemRecebida } from './regras'
import type { Pessoa } from './acoes'
import {
  BOTOES_DE_APROVACAO, BOTOES_DA_SEGUNDA_CONFIRMACAO, TEXTO_DE_ENVIADO, TEXTO_DE_RECUSADO, comEnderecoDoCep,
  fichaDoAutocadastro, lerAutocadastro, perguntaDoAutocadastro, proximaEtapa, resumoParaAprovador, seguirNoAutocadastro, textoDaSegundaConfirmacao,
  textoDaContaCriada, TEXTO_DA_SENHA_NO_WHATSAPP, type DadosDoAutocadastro,
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
      const dados: DadosDoAutocadastro = { setores: await nomesDosSetores(admin, workspaceId) }
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

type Aprovador = { userId: string; numero: string }

/** Quem gerencia usuários e tem o número confirmado. */
async function aprovadores(admin: Admin, workspaceId: string): Promise<Aprovador[]> {
  const { data: membros } = await admin.from('workspace_members').select('user_id, role, profiles(active)').eq('workspace_id', workspaceId)
  const ids = (membros ?? []).filter((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { active?: boolean } | null
    return perfil?.active !== false && pode(m.role as string, 'usuarios.gerenciar')
  }).map((m) => m.user_id as string)
  if (!ids.length) return []
  const { data: contas } = await admin.from('whatsapp_contas').select('user_id, numero').in('user_id', ids)
  return (contas ?? []).map((c) => ({ userId: c.user_id as string, numero: c.numero as string }))
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
    const quem = await aprovadores(admin, workspaceId)
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

/** "cadastros": os pedidos que esperam, cada um com os botões. */
export async function pendentesDeAprovacao(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<Saida[]> {
  if (!pode(pessoa.papel, 'usuarios.gerenciar')) return []
  await soltarPedidosPresos(admin)
  const { data } = await admin.from('colaborador_autocadastros').select(COLUNAS).eq('workspace_id', workspaceId).eq('status', 'aguardando')
    .gt('expira_em', new Date().toISOString()).order('criado_em').limit(5)
  if (!data?.length) return [{ texto: 'Nenhum cadastro esperando aprovação. ✓' }]
  return data.map((l) => ({ texto: resumoParaAprovador((l as Linha).dados), interativo: BOTOES_DE_APROVACAO((l as Linha).id) }))
}

const uuidDe = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

export async function decidirAutocadastro(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, pessoa: Pessoa, botao: { acao: 'aprovar' | 'recusar' | 'sim' | 'voltar'; id: string }): Promise<Saida[]> {
  if (!pode(pessoa.papel, 'usuarios.gerenciar')) return [{ texto: 'Só quem gerencia os usuários decide os cadastros.' }]
  try {
    const id = uuidDe(botao.id)
    if (botao.acao === 'voltar') return [{ texto: 'Certo, nada foi criado. Responda *cadastros* quando quiser decidir.' }]
    const { data } = await admin.from('colaborador_autocadastros').select(COLUNAS).eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
    const l = data as Linha | null
    if (!l || l.status !== 'aguardando') return [{ texto: 'Este cadastro já foi decidido ou venceu.' }]

    if (botao.acao === 'aprovar') return [{ texto: textoDaSegundaConfirmacao(l.dados), interativo: BOTOES_DA_SEGUNDA_CONFIRMACAO(l.id) }]

    if (botao.acao === 'recusar') {
      const { data: ok } = await admin.from('colaborador_autocadastros').update({ status: 'recusado', decidido_por: pessoa.id, decidido_em: new Date().toISOString() })
        .eq('id', l.id).eq('status', 'aguardando').select('id').maybeSingle()
      if (!ok) return [{ texto: 'Este cadastro já foi decidido.' }]
      await apagarFoto(l.foto_path)
      await avisarPessoa(admin, workspaceId, config, l.numero, TEXTO_DE_RECUSADO)
      return [{ texto: 'Cadastro recusado. A pessoa foi avisada e os dados dela foram apagados.' }]
    }

    // "Sim, criar": o primeiro a tocar trava o pedido (dois cliques, uma conta).
    const { data: preso } = await admin.from('colaborador_autocadastros').update({ status: 'aprovando', decidido_por: pessoa.id })
      .eq('id', l.id).eq('status', 'aguardando').select(COLUNAS).maybeSingle()
    if (!preso) return [{ texto: 'Este cadastro já está sendo decidido.' }]
    return [{ texto: await criarTudo(admin, workspaceId, config, preso as Linha, pessoa) }]
  } catch (causa) {
    console.error('[whatsapp] autocadastro: decisão:', causa instanceof Error ? causa.message : causa)
    // O pedido que travou em "aprovando" (o "Sim, criar" já tinha gasto a vez) volta para o aprovador tentar de novo.
    await admin.from('colaborador_autocadastros').update({ status: 'aguardando' }).eq('id', uuidDe(botao.id)).eq('status', 'aprovando')
    return [{ texto: 'Não consegui concluir agora. O cadastro continua esperando: responda *cadastros* e tente de novo.' }]
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
async function criarTudo(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, aprovador: Pessoa): Promise<string> {
  const voltar = async (motivo: string) => {
    await admin.from('colaborador_autocadastros').update({ status: 'aguardando' }).eq('id', l.id).eq('status', 'aprovando')
    return `${motivo} Nada ficou pela metade: o cadastro continua esperando. Corrija e responda *cadastros* para tentar de novo.`
  }
  try {
    return await executarCriacao(admin, workspaceId, config, l, aprovador, voltar)
  } catch (causa) {
    console.error('[whatsapp] autocadastro: criação:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    // As mensagens do diretório do Google já dizem o que fazer ("Reconecte em Configurações → E-mail dos setores").
    if (causa instanceof ErroDoDiretorio) return await voltar(causa.message)
    return await voltar('Aconteceu um erro inesperado ao criar a conta.')
  }
}

async function executarCriacao(
  admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, l: Linha, aprovador: Pessoa, voltar: (motivo: string) => Promise<string>,
): Promise<string> {
  const d = l.dados
  const nome = separarNome(d.nome ?? '')
  const emailPessoal = (d.emailPessoal ?? '').toLowerCase()
  if ('erro' in nome || !emailPessoal) return await voltar('O pedido está incompleto.')

  // 1. A ficha do RH, pelas mesmas funções da página pública.
  const token = randomBytes(32).toString('base64url')
  const hash = hashDoConvite(token)
  const { data: membroId, error: erroFicha } = await admin.rpc('whatsapp_autocadastro_criar_ficha', { p_autocadastro_id: l.id, p_token_hash: hash, p_aprovador: aprovador.id })
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
  const grupo = typeof setor?.email === 'string' && setor.email.includes('@') ? setor.email.toLowerCase() : null
  let grupoOk = false
  if (grupo) { try { grupoOk = await adicionarAoGrupo(workspaceId, grupo, email) } catch { /* a conta existe; o painel mostra quem ficou fora */ } }

  // 3. Daqui em diante a conta existe: o que falhar vira aviso, nunca desfaz.
  const nomeCompleto = d.nome ?? ''
  await admin.from('google_contas').insert({
    workspace_id: workspaceId, convite_id: null, email, nome: nomeCompleto, setor_id: setor?.id ?? null, grupo_email: grupo, grupo_ok: grupoOk,
    google_id: googleId || null, ip_hash: hashDoIp(`autocadastro:${l.id}`),
  })
  await admin.from('equipe_membros').update({ email_trabalho: email }).eq('id', membroId as string).eq('workspace_id', workspaceId)

  // 4. A senha provisória vai ao WhatsApp da pessoa (decisão do responsável, 23/10/2026), com o passo a passo; nunca é
  // gravada. "categoria conta": o texto some da fila depois do envio. Se o WhatsApp falhar, o mesmo vai ao e-mail pessoal.
  const entrega = await entregar(admin, workspaceId, {
    numero: l.numero, userId: null, tipo: 'aviso', categoria: 'conta',
    texto: textoDaContaCriada({ nome: nomeCompleto, email, senha, grupo: grupoOk ? grupo : null }),
  }, { config })
  const peloWhatsapp = entrega.situacao !== 'falhou'
  const peloEmail = peloWhatsapp ? false : await enviarComSeguranca(emailPessoal, emailDeContaDoGoogle({ nome: nomeCompleto, email, senha, setor: d.coordenacao ?? '', grupo: grupoOk ? grupo : null }))
  await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: aprovador.id, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null,
    metadata: { email, origem: 'autocadastro_whatsapp', autocadastro: l.id, grupo, grupo_ok: grupoOk, whatsapp: entrega.situacao, email_enviado: peloEmail },
  })
  // A foto passou para a ficha (foto_cadastro_path); sair do pedido apaga os dados pessoais dele (gatilho do banco).
  await admin.from('colaborador_autocadastros').update({ status: 'aprovado', decidido_em: new Date().toISOString() }).eq('id', l.id)

  const grupoAviso = grupo && !grupoOk ? ' O endereço do setor ainda não é um grupo do Google: a pessoa não entrou nele.' : ''
  if (peloWhatsapp) {
    return `Pronto ✓ ${nomeCompleto} foi cadastrado(a). E-mail: ${email}. ${entrega.situacao === 'na_fila' ? 'A senha provisória e o passo a passo estão na fila e saem em instantes' : TEXTO_DA_SENHA_NO_WHATSAPP}${grupoAviso}`
  }
  return peloEmail
    ? `A conta ${email} foi criada. O WhatsApp da pessoa não recebeu, então a senha provisória foi para ${mascarar(emailPessoal)}.${grupoAviso}`
    : `A conta ${email} foi criada, mas a senha NÃO chegou à pessoa (WhatsApp e e-mail falharam). Peça uma senha nova pelo Admin do Google e avise a pessoa.`
}
