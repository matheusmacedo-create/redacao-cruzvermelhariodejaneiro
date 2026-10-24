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
import { ErroDoDiretorio, chamarGoogleAdmin, criarUsuarioNoGoogle, enderecoOcupadoNoGoogle, permissoesDoAdmin } from '@/lib/google/diretorio'
import { ErroDeGrupo, assinaturaDoPlano, avisoDaCaixaDoSetor, consultarEndereco, criarCaixaDoSetor, criarCaixasDosSetores, planoDasCaixas, precisaDeCaixa, redefinirSenhaDaCaixa, sondarAcesso } from '@/lib/google/grupos-regras'
import { DOMINIO_DAS_CONTAS, celularEmE164, separarNome, usuarioSugeridoDoGoogle } from '@/lib/google/contas-regras'
import { baixarMidia, subirMidia, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import { fotoRecebida, TETO_DA_FOTO_DO_VISITANTE } from './portaria-regras'
import { normalizar, type Interativo, type MensagemRecebida } from './regras'
import type { Pessoa } from './acoes'
import { perfilConectado } from './servidor'
import {
  BOTOES_DE_APROVACAO, BOTOES_DA_SEGUNDA_CONFIRMACAO, TEXTO_DE_ENVIADO, TEXTO_DE_RECUSADO, comEnderecoDoCep,
  fichaDoAutocadastro, lerAutocadastro, perguntaDoAutocadastro, proximaEtapa, resumoParaAprovador, seguirNoAutocadastro, textoDaSegundaConfirmacao,
  BOTOES_DE_CAIXAS, PERGUNTA_DAS_CAIXAS, ehCoordenador, linkDoBot, podeDecidir, setorDaEntrada, setorDoPedido, mensagensDaPreviaDasCaixas, mensagensDoResultadoDasCaixas, mensagensDoAcompanhamento, textoDeQuemJaTemConta, BOTOES_DE_EMAIL, textoDaPreviaDoEmail, type LinhaDeSetor, textoDaSenhaDaCaixa, type EntregaDaCaixa, textoDaContaCriada, textoDoLinkDoTime, TEXTO_DA_SENHA_NO_WHATSAPP, type DadosDoAutocadastro,
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
 * só o pedido do próprio setor: o da equipe e o de outro coordenador dele). `userId` é null para o coordenador sem login.
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

/** Quem recebe o pedido: os administradores com o número confirmado e os coordenadores do setor do pedido. */
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
  // O coordenador recebe o pedido do próprio setor: o da equipe e o de outro coordenador (o primeiro do setor, sem ninguém
  // registrado ainda, chega só aos administradores).
  if (d?.coordenacao) {
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

/**
 * "grupos": o diagnóstico para o administrador, só leitura. Diz o que a autorização do Google guardada tem (e o que falta)
 * e, para cada setor, o que o endereço dele é hoje no Google: grupo, apelido (de quem), caixa real ou inexistente.
 * Não altera nada. Para na primeira falha do Google e mostra o motivo.
 */
export async function situacaoDosGrupos(admin: Admin, workspaceId: string, ator: Ator): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'O diagnóstico dos grupos é só de administrador.' }]
  const perm = await permissoesDoAdmin(workspaceId)
  const cabecalho = !perm
    ? '⚠️ Não consegui ler as permissões da autorização do Google (administrador não conectado ou expirado).'
    : perm.faltam.length
      ? `🔴 A autorização do Google NÃO tem: ${perm.faltam.map((e) => e.replace('https://www.googleapis.com/auth/', '')).join(', ')}. Reconecte o administrador e marque TODAS as permissões na tela do Google.`
      : `🟢 A autorização do Google tem todos os escopos pedidos${perm.email ? ` (conta ${perm.email})` : ''}. Os testes abaixo mostram o que de fato responde.`
  const { data: setores } = await admin.from('setores').select('nome, email').eq('workspace_id', workspaceId).eq('ativo', true).order('nome')
  const chamar = chamarGoogleAdmin(workspaceId)
  const sonda = await sondarAcesso(chamar, DOMINIO_DAS_CONTAS)
  const linhas: string[] = []
  let erro: string | null = null
  for (const st of setores ?? []) {
    const endereco = typeof st.email === 'string' && st.email.includes('@') ? st.email.toLowerCase() : null
    if (!endereco) continue
    try {
      const e = await consultarEndereco(chamar, endereco)
      const rotulo = e.tipo === 'grupo' ? '✅ já é grupo' : e.tipo === 'apelido' ? `🔁 apelido de ${e.dono}` : e.tipo === 'caixa_real' ? '📥 caixa real (conta própria)' : '⚪ livre (a caixa do setor pode ser criada)'
      linhas.push(`• ${st.nome} (${endereco}): ${rotulo}`)
    } catch (causa) {
      erro = causa instanceof ErroDeGrupo || causa instanceof ErroDoDiretorio ? causa.message : 'erro inesperado ao consultar o Google'
      break
    }
  }
  return [{ texto: [cabecalho, `*Teste de acesso ao Google:*\n${sonda.join('\n')}`, erro ? `Parei na consulta dos setores: ${erro}` : linhas.length ? linhas.join('\n') : 'Nenhum setor com endereço.'].join('\n\n') }]
}

type SetorComEndereco = { id: string; nome: string; endereco: string }

/** O banco não respondeu: a operação para antes de falar com o Google, em vez de seguir com uma lista vazia que parece "tudo certo". */
class ErroDeBanco extends Error {}
const textoDoErro = (causa: unknown) => causa instanceof ErroDeGrupo || causa instanceof ErroDoDiretorio || causa instanceof ErroDeBanco ? causa.message : 'erro inesperado'

/**
 * Os setores ativos com endereço e, de cada um, os números dos coordenadores registrados (não revogados). Um erro de leitura
 * lança (ErroDeBanco): lista vazia por falha pareceria "nenhum setor precisa de caixa", e coordenadores que não vieram fariam a
 * senha de quem tem coordenação ser descartada. Dois setores com o mesmo endereço contam uma vez só (o primeiro por nome).
 */
async function setoresDasCaixas(admin: Admin, workspaceId: string): Promise<{ setores: SetorComEndereco[]; numerosPorSetor: Map<string, string[]> }> {
  const [{ data: lista, error: erroSetores }, { data: coords, error: erroCoords }] = await Promise.all([
    admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId).eq('ativo', true).order('nome'),
    admin.from('setor_coordenadores').select('setor_id, numero').eq('workspace_id', workspaceId).is('revogado_em', null),
  ])
  if (erroSetores || erroCoords) throw new ErroDeBanco('Não consegui ler os setores e coordenadores no banco agora. Tente de novo em instantes.')
  const vistos = new Set<string>()
  const setores = (lista ?? []).flatMap((st) => {
    const endereco = typeof st.email === 'string' && st.email.includes('@') ? st.email.toLowerCase() : null
    if (!endereco || vistos.has(endereco)) return []
    vistos.add(endereco)
    return [{ id: String(st.id), nome: String(st.nome), endereco }]
  })
  const numerosPorSetor = new Map<string, string[]>()
  for (const c of coords ?? []) numerosPorSetor.set(String(c.setor_id), [...(numerosPorSetor.get(String(c.setor_id)) ?? []), String(c.numero)])
  return { setores, numerosPorSetor }
}

/** Os endereços (minúsculos) dos setores → números dos coordenadores registrados: quem recebe a senha de cada caixa. */
const destinatariosPorEndereco = (setores: SetorComEndereco[], numerosPorSetor: Map<string, string[]>) =>
  Object.fromEntries(setores.map((st) => [st.endereco, numerosPorSetor.get(st.id) ?? []]))

/**
 * "caixas dos setores": a PRÉVIA, só leitura, para o administrador. Mostra, setor por setor, o que será feito (apagar o
 * apelido e criar a caixa, ou só criar) e o que fica como está, com os botões "Sim, criar" e "Não". Nada é mexido aqui.
 */
export async function previaDasCaixas(admin: Admin, workspaceId: string, ator: Ator): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'Criar a caixa dos setores é só de administrador.' }]
  try {
    const { setores, numerosPorSetor } = await setoresDasCaixas(admin, workspaceId)
    const plano = await planoDasCaixas(chamarGoogleAdmin(workspaceId), setores.map(({ nome, endereco }) => ({ nome, endereco })))
    const comCoordenador = new Set(setores.filter((st) => numerosPorSetor.get(st.id)?.length).map((st) => st.endereco))
    const assinatura = assinaturaDoPlano(plano, destinatariosPorEndereco(setores, numerosPorSetor))
    return [...mensagensDaPreviaDasCaixas(plano, comCoordenador).map((texto) => ({ texto })), ...(plano.some(precisaDeCaixa) ? [{ texto: PERGUNTA_DAS_CAIXAS, interativo: BOTOES_DE_CAIXAS(assinatura) }] : [])]
  } catch (causa) {
    console.error('[whatsapp] caixas dos setores: prévia:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    return [{ texto: `Não consegui consultar agora: ${textoDoErro(causa)}` }]
  }
}

/** Depois deste instante nenhum setor novo começa: o webhook tem prazo, e parar entre um setor e outro é melhor que no meio de um. */
const PRAZO_DAS_CAIXAS_MS = 120_000
/** Folga que se deixa, no fim do prazo do lote do webhook, para o setor em curso terminar (consultas, apagar, esperas de 409 de até ~31 s, criar, devolver). */
const FOLGA_DO_LOTE_MS = 150_000
const JANELA_DO_LOTE_MIN = 10
const ACAO_LOTE_INICIO = 'google_caixas_dos_setores_inicio'
const ACAO_LOTE_FIM = 'google_caixas_dos_setores'
/** A caixa de um setor foi ENTREGUE (a senha chegou a alguém): daí em diante tem responsável e a senha dela nunca mais é redefinida por aqui. */
const ACAO_CAIXA_ENTREGUE = 'google_caixa_do_setor_entregue'

async function marcarCaixaEntregue(admin: Admin, workspaceId: string, userId: string | null, setorId: string, endereco: string, via: string) {
  // Duas tentativas: sem a marca a caixa segue "sem dono" e a próxima aprovação a redefiniria (só a guarda de último acesso protege).
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { error } = await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: userId, action: ACAO_CAIXA_ENTREGUE, entity_type: 'setor', entity_id: setorId, metadata: { email: endereco, via },
    })
    if (!error) return
    console.error('[whatsapp] caixa do setor: entrega não registrada:', error.message)
  }
}

/**
 * Pede a vez de rodar um lote: grava o início e confere se há outro lote mais antigo, começado há menos de 10 minutos e ainda
 * sem fim. Dois toques seguidos (ou dois administradores) com a mesma prévia passam os dois pela assinatura do plano — a trava
 * é o que faz o segundo esperar. `id` null = não deu para gravar (segue sem trava: o Google não deixa duplicar a conta).
 */
async function pedirVezDoLote(admin: Admin, workspaceId: string, userId: string | null): Promise<{ id: string | null; ocupado: boolean }> {
  const { data: meu, error } = await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: userId, action: ACAO_LOTE_INICIO, entity_type: 'google_conta', entity_id: null, metadata: {},
  }).select('id, created_at').single()
  if (error || !meu) { console.error('[whatsapp] caixas dos setores: lote sem trava:', error?.message); return { id: null, ocupado: false } }
  const desde = new Date(Date.now() - JANELA_DO_LOTE_MIN * 60_000).toISOString()
  const [{ data: inicios, error: erroInicios }, { data: fins, error: erroFins }] = await Promise.all([
    admin.from('activity_log').select('id, created_at').eq('workspace_id', workspaceId).eq('action', ACAO_LOTE_INICIO).gte('created_at', desde),
    admin.from('activity_log').select('metadata').eq('workspace_id', workspaceId).eq('action', ACAO_LOTE_FIM).gte('created_at', desde),
  ])
  // Sem conseguir ler quem mais está rodando, NÃO roda: falhar aberto deixaria dois lotes apagarem apelidos ao mesmo tempo.
  if (erroInicios || erroFins) return { id: String(meu.id), ocupado: true }
  const terminados = new Set((fins ?? []).map((f) => (f.metadata as { inicio?: string } | null)?.inicio).filter(Boolean))
  const antes = (inicios ?? []).filter((x) => x.id !== meu.id && !terminados.has(x.id) && (String(x.created_at) < String(meu.created_at) || (String(x.created_at) === String(meu.created_at) && String(x.id) < String(meu.id))))
  return { id: String(meu.id), ocupado: antes.length > 0 }
}

/**
 * O "Sim, criar" (válido por 15 minutos desde a prévia): relê o que cada endereço é AGORA e só segue se for exatamente o que
 * a prévia mostrou (a assinatura do plano vai no botão: endereços, estados, donos dos apelidos e quem receberá a senha — por
 * isso o segundo toque no mesmo botão, depois de concluído, não faz nada). Cria a caixa de cada setor; o apelido, quando há,
 * é apagado logo antes e volta se a caixa não nascer. A senha provisória vai ao WhatsApp dos coordenadores já registrados do
 * setor; sem coordenador, é descartada — a caixa fica sem dono e é entregue (senha nova) na aprovação da coordenação. A senha
 * só existe em memória (e, enquanto espera na fila do WhatsApp, no texto da mensagem, que some depois de enviada — categoria
 * "conta"); nunca vai a activity_log nem à resposta. Cada conta é registrada e entregue LOGO depois de criada (`aoCriar`), não
 * no fim do lote: se o processo for cortado, o que já nasceu não fica sem registro.
 */
export async function criarCaixasDosSetoresPeloBotao(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, ator: Ator, botao: { acao: 'sim' | 'nao'; vencido: boolean; assinatura: string }, opcoes: { prazoDoLote?: number } = {}): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'Criar a caixa dos setores é só de administrador.' }]
  if (botao.acao === 'nao') return [{ texto: 'Certo, nada foi criado.' }]
  if (botao.vencido) return [{ texto: 'Essa confirmação venceu (vale 15 minutos). Mande *caixas dos setores* de novo para ver a lista e confirmar.' }]
  const vez = await pedirVezDoLote(admin, workspaceId, ator.userId)
  const encerrar = async (metadata: Record<string, unknown>) => {
    if (!vez.id) return
    const { error } = await admin.from('activity_log').insert({ workspace_id: workspaceId, actor_id: ator.userId, action: ACAO_LOTE_FIM, entity_type: 'google_conta', entity_id: null, metadata: { inicio: vez.id, ...metadata } })
    if (error) console.error('[whatsapp] caixas dos setores: fim do lote não registrado:', error.message)
  }
  if (vez.ocupado) {
    await encerrar({ desistiu: true })
    return [{ texto: 'Já tem um lote de caixas em andamento (começou há pouco). Espere o resultado dele. Se em 10 minutos não chegar nada, mande *caixas dos setores* de novo: o que já foi criado não é refeito.' }]
  }
  try {
    const chamar = chamarGoogleAdmin(workspaceId)
    const { setores, numerosPorSetor } = await setoresDasCaixas(admin, workspaceId)
    const plano = await planoDasCaixas(chamar, setores.map(({ nome, endereco }) => ({ nome, endereco })))
    if (assinaturaDoPlano(plano, destinatariosPorEndereco(setores, numerosPorSetor)) !== botao.assinatura) {
      await encerrar({ recusado: 'plano mudou' })
      return [{ texto: plano.some(precisaDeCaixa) ? 'A situação dos setores mudou desde a prévia (ou mudou quem recebe a senha). Mande *caixas dos setores* de novo para ver o que vai ser feito e confirmar.' : 'Não há mais nada a criar: as caixas dos setores já foram feitas. ✓' }]
    }
    const aCriar = plano.filter(precisaDeCaixa)
    const senhas = new Map(aCriar.map((p) => [p.endereco.toLowerCase(), gerarSenhaTemporaria()]))
    const ate = Math.min(Date.now() + PRAZO_DAS_CAIXAS_MS, (opcoes.prazoDoLote ?? Number.POSITIVE_INFINITY) - FOLGA_DO_LOTE_MS)

    const resultados = await criarCaixasDosSetores(chamar, aCriar.map((p) => ({ nome: p.nome, endereco: p.endereco, senha: senhas.get(p.endereco.toLowerCase()) as string })), {
      ate,
      aoCriar: async (r) => {
        const setor = setores.find((st) => st.endereco === r.endereco.toLowerCase())
        if (!setor) return { registro: 'falhou' as const }
        const { error: erroConta } = await admin.from('google_contas').insert({
          workspace_id: workspaceId, convite_id: null, email: setor.endereco, nome: setor.nome, setor_id: setor.id, grupo_email: null, grupo_ok: false,
          google_id: null, ip_hash: hashDoIp(`caixa-do-setor:${setor.id}`),
        })
        if (erroConta) console.error('[whatsapp] caixas dos setores: google_contas:', erroConta.message)
        // O Palácio lê e envia pelo "enviar como" do contato@: sem o apelido, o endereço deixa de existir lá. Alinha agora, em vez de
        // esperar a sincronização (1 h ao abrir o /correio, ou o cron diário), para não oferecer um remetente que já não vale.
        if (r.apelidoApagado) {
          const { error: erroCaixas } = await admin.from('caixas_de_email').update({ no_gmail: false, sincronizada_em: new Date().toISOString() }).eq('workspace_id', workspaceId).ilike('email', setor.endereco)
          if (erroCaixas) console.error('[whatsapp] caixas dos setores: caixa do Palácio não atualizada:', erroCaixas.message)
        }
        const registro = erroConta ? ('falhou' as const) : ('ok' as const)
        // Quem coordena o setor É LIDO DE NOVO agora: o lote leva minutos, e uma coordenação aprovada no meio dele não pode ter a
        // senha descartada. Se a leitura falha, vale o que a prévia mostrou (e a caixa segue "sem dono", reenviável pelo comando).
        const { data: agora, error: erroAgora } = await admin.from('setor_coordenadores').select('numero').eq('workspace_id', workspaceId).eq('setor_id', setor.id).is('revogado_em', null)
        const numeros = erroAgora ? (numerosPorSetor.get(setor.id) ?? []) : (agora ?? []).map((c) => String(c.numero))
        if (!numeros.length) return { registro, entrega: 'sem_coordenador' as const }
        // A senha só existe aqui, em memória: sai para o WhatsApp de quem coordena o setor.
        const texto = textoDaSenhaDaCaixa({ setor: setor.nome, email: setor.endereco, senha: senhas.get(setor.endereco) as string })
        let entrega: EntregaDaCaixa = 'enviada'
        for (const numero of numeros) {
          const e = await entregar(admin, workspaceId, { numero, userId: null, tipo: 'aviso', categoria: 'conta', texto }, { config })
          if (e.situacao === 'falhou') entrega = 'falhou'
          else if (e.situacao === 'na_fila' && entrega === 'enviada') entrega = 'na_fila'
        }
        // Só "entregue" quando TODOS os coordenadores receberam (ou estão na fila): entrega parcial deixa a caixa sem dono, e
        // "caixa do setor: <nome>" redefine a senha e reenvia a todos (a guarda de uso protege quem já tiver entrado).
        if (entrega !== 'falhou') await marcarCaixaEntregue(admin, workspaceId, ator.userId, setor.id, setor.endereco, 'lote')
        return { registro, entrega }
      },
    })

    // O resultado, sem senha nenhuma. As caixas que existem mas ficaram sem registro são avisadas na própria resposta.
    await encerrar({ origem: 'whatsapp', resultados: resultados.map((r) => ({ endereco: r.endereco, resultado: r.resultado, apelido_apagado: r.apelidoApagado ?? false, apelido_devolvido: r.apelidoDevolvido ?? null, incerto: r.incerto ?? false, entrega: r.entrega ?? null, registro: r.registro ?? null, motivo: r.motivo ?? null })) })
    return mensagensDoResultadoDasCaixas(resultados).map((texto) => ({ texto }))
  } catch (causa) {
    console.error('[whatsapp] caixas dos setores: criar:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    await encerrar({ erro: true })
    return [{ texto: `Não consegui concluir: ${textoDoErro(causa)}. Mande *caixas dos setores* para ver o que sobrou — e confira os endereços dos setores no Admin do Google antes, se a falha foi no meio.` }]
  }
}

/**
 * Em que pé está a caixa de um setor que já existe: 'sem_dono' (é uma das nossas — há linha em google_contas com o endereço do
 * setor — e a senha dela ainda não chegou a ninguém: nenhum registro de entrega), 'entregue' (já tem responsável), 'nao_nossa'
 * (nenhuma linha em google_contas: criada à mão, ou o contato@) ou 'desconhecido' (o banco não respondeu — NUNCA vale como
 * "sem dono": decidir "pode redefinir a senha" com uma leitura que falhou seria falhar aberto). Só 'sem_dono' pode ser entregue
 * por redefinição de senha, e mesmo assim a redefinição recusa caixa em que alguém já entrou (`redefinirSenhaDaCaixa`).
 */
async function estadoDaCaixaDoSetor(admin: Admin, workspaceId: string, setorId: string, endereco: string): Promise<'sem_dono' | 'entregue' | 'nao_nossa' | 'desconhecido'> {
  const [{ data: conta, error: erroConta }, { data: entregue, error: erroEntregue }] = await Promise.all([
    admin.from('google_contas').select('id').eq('workspace_id', workspaceId).eq('setor_id', setorId).eq('email', endereco.toLowerCase()).limit(1),
    admin.from('activity_log').select('id').eq('workspace_id', workspaceId).eq('action', ACAO_CAIXA_ENTREGUE).eq('entity_type', 'setor').eq('entity_id', setorId).limit(1),
  ])
  if (erroConta || erroEntregue) return 'desconhecido'
  if (!conta?.length) return 'nao_nossa'
  return entregue?.length ? 'entregue' : 'sem_dono'
}
const caixaSemDono = async (admin: Admin, workspaceId: string, setorId: string, endereco: string) => (await estadoDaCaixaDoSetor(admin, workspaceId, setorId, endereco)) === 'sem_dono'

type CaixaDoSetorPronta = { nome: string; email: string; senha: string }

/**
 * Dá a caixa própria a um setor: cria (endereço livre) ou, com `entregarExistente`, entrega a que já existe sem dono (senha
 * redefinida). Devolve a caixa com a senha provisória — que sai uma vez e não é gravada — ou só a nota que diz por que nada foi
 * feito. `nova`: a conta acabou de nascer (quem chama registra em google_contas). Nunca lança: a falha vira nota.
 */
async function darCaixaAoSetor(admin: Admin, workspaceId: string, p: { setorId: string; endereco: string; nome: string; recuperacaoEmail?: string; recuperacaoCelular?: string; entregarExistente: boolean }): Promise<{ caixa?: CaixaDoSetorPronta; nova?: boolean; nota: string }> {
  try {
    const chamar = chamarGoogleAdmin(workspaceId)
    const senha = gerarSenhaTemporaria()
    const r = await criarCaixaDoSetor(chamar, { endereco: p.endereco, nome: p.nome, senha, recuperacaoEmail: p.recuperacaoEmail, recuperacaoCelular: p.recuperacaoCelular })
    if (r.feito === 'criada') return { caixa: { nome: p.nome, email: p.endereco, senha }, nova: true, nota: `A caixa do setor ${p.nome} (${p.endereco}) foi criada.` }
    if (r.motivo === 'apelido') return { nota: `A caixa do setor NÃO foi criada: ${p.endereco} ainda é apelido de ${r.dono ?? 'outra caixa'}. Mande *caixas dos setores*: ela cria a caixa e, com a coordenação registrada, a senha vai para ela.` }
    if (r.motivo === 'grupo') return { nota: `${p.endereco} é um grupo do Google: nada foi criado para o setor.` }
    const pe = await estadoDaCaixaDoSetor(admin, workspaceId, p.setorId, p.endereco)
    if (p.entregarExistente && pe === 'sem_dono') {
      const nova = gerarSenhaTemporaria()
      const feito = await redefinirSenhaDaCaixa(chamar, { endereco: p.endereco, senha: nova, recuperacaoEmail: p.recuperacaoEmail, recuperacaoCelular: p.recuperacaoCelular })
      if (feito === 'redefinida') return { caixa: { nome: p.nome, email: p.endereco, senha: nova }, nota: `A caixa do setor ${p.nome} (${p.endereco}) já existia sem responsável: foi entregue, com senha nova.` }
      if (feito === 'em_uso') return { nota: `A caixa ${p.endereco} já foi usada (alguém entrou nela, ou o Google não informou o último acesso): não redefini a senha. Se for o caso, redefina no Admin do Google.` }
    }
    return { nota: pe === 'entregue' ? `${p.endereco} já é uma caixa que foi entregue a alguém: nada foi mudado nela.` : pe === 'nao_nossa' ? `${p.endereco} já existe, mas não foi criada pelo Palácio (por exemplo, o contato@): nada foi mudado nela.` : pe === 'desconhecido' ? `${p.endereco} já existe, mas não consegui conferir no banco se ela tem responsável: nada foi mudado nela. Tente de novo em instantes.` : `${p.endereco} já existe sem responsável, mas o setor ainda não tem coordenador(a) registrado(a): nada foi mudado. A caixa é entregue na aprovação da coordenação.` }
  } catch (causa) {
    console.error('[whatsapp] autocadastro: caixa do setor:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    return { nota: `A caixa do setor ${p.nome} NÃO foi entregue: ${causa instanceof ErroDeGrupo || causa instanceof ErroDoDiretorio ? causa.message : 'erro inesperado'}` }
  }
}

/**
 * "caixa do setor: <nome>" (só administrador): dá a caixa a UM setor — cria, ou entrega a que já existe sem dono se o setor
 * já tem coordenador. É o atalho para um setor só (um setor novo, uma coordenação que entrou depois, ou uma entrega que não
 * chegou); para todos de uma vez, "caixas dos setores". A senha provisória vai ao WhatsApp de quem coordena o setor
 * (registrado em setor_coordenadores); sem coordenador registrado a caixa é criada sem dono e NINGUÉM recebe senha — entra na
 * aprovação da coordenação, como no comando em lote.
 */
export async function criarCaixaDoSetorPeloComando(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, ator: Ator, pedido: string): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'Criar a caixa de um setor é só de administrador.' }]
  const { data, error: erroSetores } = await admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId).eq('ativo', true)
  if (erroSetores) return [{ texto: 'Não consegui ler os setores no banco agora; nada foi mexido no Google. Mande de novo em instantes.' }]
  const lista = (data ?? []) as { id: string; nome: string; email: string | null }[]
  const nome = setorDoPedido(pedido, lista.map((x) => x.nome))
  const setor = lista.find((x) => x.nome === nome)
  if (!setor) return [{ texto: `Não achei o setor "${pedido}". Escreva o nome inteiro, como em: ${lista.map((x) => x.nome).join(', ')}.` }]
  const endereco = typeof setor.email === 'string' && setor.email.includes('@') ? setor.email.toLowerCase() : null
  if (!endereco) return [{ texto: `O setor ${setor.nome} não tem endereço cadastrado.` }]

  const { data: coords, error: erroCoords } = await admin.from('setor_coordenadores').select('numero').eq('workspace_id', workspaceId).eq('setor_id', setor.id).is('revogado_em', null)
  // Sem ler os coordenadores a caixa seria criada com a senha descartada mesmo havendo coordenação: não cria.
  if (erroCoords) return [{ texto: 'Não consegui ler os coordenadores no banco agora; nada foi mexido no Google. Mande de novo em instantes.' }]
  const numeros = (coords ?? []).map((c) => c.numero as string)
  const resultado = await darCaixaAoSetor(admin, workspaceId, { setorId: setor.id, endereco, nome: setor.nome, entregarExistente: numeros.length > 0 })
  if (!resultado.caixa) return [{ texto: resultado.nota }]

  if (resultado.nova) {
    const { error: erroConta } = await admin.from('google_contas').insert({
      workspace_id: workspaceId, convite_id: null, email: resultado.caixa.email, nome: setor.nome, setor_id: setor.id, grupo_email: null, grupo_ok: false,
      google_id: null, ip_hash: hashDoIp(`caixa-do-setor:${setor.id}`),
    })
    if (erroConta) console.error('[whatsapp] caixa do setor: google_contas:', erroConta.message)
  }
  await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: ator.userId, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null,
    metadata: { email: endereco, origem: 'whatsapp_caixa_do_setor', setor: setor.nome, nova: Boolean(resultado.nova), entregue_a_coordenadores: numeros.length },
  })
  // Sem coordenador registrado, a senha NÃO vai a ninguém (nem ao administrador que pediu): a caixa fica sem dono até a aprovação
  // da coordenação, quando é entregue com senha nova. Uma senha solta num chat de administrador é uma caixa sem responsável.
  if (!numeros.length) return [{ texto: `${resultado.nota} Ela está *sem dono*: ninguém recebeu a senha. Quando a coordenação do setor se cadastrar e um administrador aprovar, a caixa é entregue a ela, com senha nova por WhatsApp.` }]
  const texto = textoDaSenhaDaCaixa({ setor: setor.nome, email: endereco, senha: resultado.caixa.senha })
  let enviadas = 0
  let naFila = 0
  for (const numero of numeros) {
    const e = await entregar(admin, workspaceId, { numero, userId: null, tipo: 'aviso', categoria: 'conta', texto }, { config })
    if (e.situacao === 'enviada') enviadas++
    else if (e.situacao === 'na_fila') naFila++
  }
  if (enviadas + naFila === numeros.length) await marcarCaixaEntregue(admin, workspaceId, ator.userId, setor.id, endereco, 'comando')
  const quem = `d${numeros.length === 1 ? 'o(a) coordenador(a)' : 'os coordenadores'} do setor`
  // A senha não volta no texto da resposta: ele pode ser repassado e fica no histórico. Se não chegou, o mesmo comando reenvia.
  if (enviadas + naFila < numeros.length) return [{ texto: `${resultado.nota} Mas a senha NÃO chegou a todos os coordenadores${enviadas + naFila ? '' : ' (a nenhum deles)'}. Mande este comando de novo: a caixa ainda não foi entregue, e a senha é redefinida e reenviada a todos. Se alguém já tiver entrado na caixa, o comando recusa — e a redefinição é no Admin do Google.` }]
  // "na fila" (silêncio da noite, cota): sai quando o WhatsApp liberar. Dizer "enviada" seria prometer o que ainda não aconteceu.
  return [{ texto: naFila
    ? `${resultado.nota} A senha provisória está na fila do WhatsApp ${quem} e chega quando ele liberar${enviadas ? ` (já foi a ${enviadas})` : ''}. Se não chegar, redefina a senha no Admin do Google: este comando não reenvia depois que a senha entra na fila.`
    : `Pronto ✓ ${resultado.nota} A senha provisória foi enviada ao WhatsApp ${quem}.` }]
}

/**
 * "acompanhamento": quem já se cadastrou e quem falta, por setor. O administrador vê todos os setores; o coordenador, só os
 * que coordena. Só leitura. "Quem falta" é medido pelo que o sistema sabe: coordenações ainda sem cadastro e, por setor, quantas
 * pessoas da equipe já têm e-mail institucional (o sistema não tem uma lista de quem DEVERIA se cadastrar além da equipe).
 */
export async function acompanhamentoDoCadastro(admin: Admin, workspaceId: string, ator: Ator): Promise<Saida[]> {
  try {
    const [setoresR, coordsR, pedidosR, membrosR, contasR, entreguesR] = await Promise.all([
      admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId).eq('ativo', true).order('nome'),
      admin.from('setor_coordenadores').select('setor_id').eq('workspace_id', workspaceId).is('revogado_em', null),
      admin.from('colaborador_autocadastros').select('dados').eq('workspace_id', workspaceId).in('status', ['aguardando', 'aprovando']),
      admin.from('equipe_membros').select('setor, email_trabalho').eq('workspace_id', workspaceId).eq('situacao', 'ativo'),
      admin.from('google_contas').select('setor_id, email').eq('workspace_id', workspaceId).not('setor_id', 'is', null),
      admin.from('activity_log').select('entity_id').eq('workspace_id', workspaceId).eq('action', ACAO_CAIXA_ENTREGUE),
    ])
    if ([setoresR, coordsR, pedidosR, membrosR, contasR, entreguesR].some((r) => r.error)) throw new ErroDeBanco('Não consegui ler o andamento no banco agora. Tente de novo em instantes.')
    const coordenados = new Set((coordsR.data ?? []).map((c) => String(c.setor_id)))
    const entregues = new Set((entreguesR.data ?? []).map((e) => String(e.entity_id)))
    const caixas = new Set((contasR.data ?? []).filter((g) => typeof g.email === 'string').map((g) => `${g.setor_id}|${String(g.email).toLowerCase()}`))
    const pedidos = (pedidosR.data ?? []).map((p) => p.dados as { coordenacao?: string; cargo?: string } | null)
    const linhas: LinhaDeSetor[] = (setoresR.data ?? [])
      .filter((st) => ator.admin || ator.setores.includes(String(st.nome)))
      .map((st) => {
        const doSetor = pedidos.filter((d) => d?.coordenacao === st.nome)
        const membros = (membrosR.data ?? []).filter((m) => m.setor === st.nome)
        const endereco = typeof st.email === 'string' ? st.email.toLowerCase() : ''
        const existe = caixas.has(`${st.id}|${endereco}`)
        return {
          setor: String(st.nome),
          coordenacao: coordenados.has(String(st.id)) ? 'cadastrada' : doSetor.some((d) => ehCoordenador(d?.cargo)) ? 'aguardando' : 'nenhuma',
          caixa: existe ? (entregues.has(String(st.id)) ? 'entregue' : 'sem_dono') : endereco ? 'nao_nossa' : 'nao_criada',
          pessoas: membros.length,
          comEmail: membros.filter((m) => m.email_trabalho).length,
          aguardando: doSetor.length,
        } as LinhaDeSetor
      })
    if (!linhas.length) return [{ texto: ator.admin ? 'Não achei nenhum setor para acompanhar.' : 'Você não coordena nenhum setor no Palácio ainda.' }]
    return mensagensDoAcompanhamento(linhas).map((texto) => ({ texto }))
  } catch (causa) {
    console.error('[whatsapp] acompanhamento:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    return [{ texto: `Não consegui montar o andamento agora: ${textoDoErro(causa)}` }]
  }
}

/** "quero me cadastrar" de quem JÁ tem conta: diz que já está cadastrado(a) e se falta o e-mail institucional (só leitura). */
export async function jaTemContaNoCadastro(admin: Admin, workspaceId: string, pessoa: { id: string; nome: string | null }): Promise<Saida[]> {
  const { data, error } = await admin.from('equipe_membros').select('email_trabalho').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).limit(1)
  if (error) return [{ texto: 'Você já tem conta no Palácio Virtual, então não precisa se cadastrar de novo. Para o e-mail institucional, fale com a sua coordenação.' }]
  const email = typeof data?.[0]?.email_trabalho === 'string' && data[0].email_trabalho ? data[0].email_trabalho : null
  return [{ texto: textoDeQuemJaTemConta(pessoa.nome, email) }]
}

type MembroSemEmail = { id: string; user_id: string; nome: string; setor: string | null }

/** Quem da equipe tem conta, está ativo e ainda não tem e-mail institucional, achado pelo nome (todas as palavras do pedido). */
async function membrosSemEmail(admin: Admin, workspaceId: string, pedido: string): Promise<MembroSemEmail[] | null> {
  const { data, error } = await admin.from('equipe_membros').select('id, user_id, nome, setor').eq('workspace_id', workspaceId).eq('situacao', 'ativo').is('email_trabalho', null).not('user_id', 'is', null)
  if (error) return null
  const palavras = normalizar(pedido).split(' ').filter(Boolean)
  return ((data ?? []) as MembroSemEmail[]).filter((m) => { const n = normalizar(m.nome); return palavras.every((p) => n.split(' ').includes(p)) })
}

const numeroDaConta = async (admin: Admin, userId: string): Promise<string | null> => {
  const { data } = await admin.from('whatsapp_contas').select('numero').eq('user_id', userId).not('confirmado_em', 'is', null).limit(1)
  return typeof data?.[0]?.numero === 'string' ? data[0].numero : null
}

/**
 * "criar email de <nome>" (só administrador): o e-mail institucional de quem JÁ tem conta e ficha e ainda não tem e-mail (o
 * cadastro pelo WhatsApp é de quem não tem conta). A PRÉVIA mostra quem e qual endereço, e pede "Sim, criar". Só leitura.
 */
export async function previaDoEmailDePessoa(admin: Admin, workspaceId: string, ator: Ator, pedido: string): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'Criar o e-mail institucional de alguém é só de administrador.' }]
  const achados = await membrosSemEmail(admin, workspaceId, pedido)
  if (achados === null) return [{ texto: 'Não consegui ler a equipe no banco agora. Tente de novo em instantes.' }]
  if (!achados.length) return [{ texto: `Não achei ninguém ativo na equipe com esse nome e sem e-mail institucional ("${pedido}"). Se a pessoa já tem e-mail, ou não tem conta no Palácio, este comando não se aplica.` }]
  if (achados.length > 1) return [{ texto: `Achei mais de uma pessoa: ${achados.map((m) => m.nome).join('; ')}. Escreva o nome completo.` }]
  const m = achados[0]
  const numero = await numeroDaConta(admin, m.user_id)
  if (!numero) return [{ texto: `${m.nome} não tem WhatsApp confirmado no Palácio, e a senha provisória vai por WhatsApp. Nada foi criado.` }]
  const usuario = await usuarioLivreNoGoogle(admin, workspaceId, m.nome).catch(() => null)
  if (!usuario) return [{ texto: `Não achei um endereço livre para "${m.nome}" (ou o Google não respondeu agora). Nada foi criado.` }]
  return [{ texto: textoDaPreviaDoEmail({ nome: m.nome, setor: m.setor, email: `${usuario}@${DOMINIO_DAS_CONTAS}`, finalDoNumero: numero.slice(-4) }), interativo: BOTOES_DE_EMAIL(m.id) }]
}

/** O "Sim, criar" do e-mail de quem já tem conta: cria no Google, grava na ficha e manda a senha ao WhatsApp da pessoa. */
export async function criarEmailDePessoa(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, ator: Ator, botao: { acao: 'sim' | 'nao'; vencido: boolean; membro: string }): Promise<Saida[]> {
  if (!ator.admin) return [{ texto: 'Criar o e-mail institucional de alguém é só de administrador.' }]
  if (botao.acao === 'nao') return [{ texto: 'Certo, nada foi criado.' }]
  if (botao.vencido) return [{ texto: 'Essa confirmação venceu (vale 15 minutos). Mande *criar email de <nome>* de novo.' }]
  try {
    const { data, error } = await admin.from('equipe_membros').select('id, user_id, nome, setor, email_trabalho').eq('workspace_id', workspaceId).eq('situacao', 'ativo').not('user_id', 'is', null)
    if (error) return [{ texto: 'Não consegui ler a equipe no banco agora; nada foi criado. Tente de novo em instantes.' }]
    const m = (data ?? []).find((x) => String(x.id).replace(/-/g, '').startsWith(botao.membro))
    if (!m) return [{ texto: 'Não achei mais essa pessoa na equipe. Nada foi criado.' }]
    if (m.email_trabalho) return [{ texto: `${m.nome} já tem e-mail institucional (${m.email_trabalho}): nada a criar.` }]
    const numero = await numeroDaConta(admin, String(m.user_id))
    const nome = separarNome(String(m.nome))
    if (!numero || 'erro' in nome) return [{ texto: `Não dá para criar o e-mail de ${m.nome}: ${!numero ? 'sem WhatsApp confirmado' : 'o nome na ficha precisa ter nome e sobrenome'}. Nada foi criado.` }]
    const usuario = await usuarioLivreNoGoogle(admin, workspaceId, String(m.nome))
    if (!usuario) return [{ texto: `Não achei um endereço livre para ${m.nome}. Nada foi criado.` }]
    const email = `${usuario}@${DOMINIO_DAS_CONTAS}`
    const senha = gerarSenhaTemporaria()
    const celular = celularEmE164(numero)
    const googleId = await criarUsuarioNoGoogle(workspaceId, { email, primeiroNome: nome.primeiro, sobrenome: nome.resto, senha, celularDeRecuperacao: typeof celular === 'string' && celular ? celular : undefined, setor: m.setor ? String(m.setor) : undefined })
    // Daqui em diante a conta existe: o que falhar vira aviso, nunca desfaz.
    const { error: erroFicha } = await admin.from('equipe_membros').update({ email_trabalho: email }).eq('id', m.id).eq('workspace_id', workspaceId)
    const setorId = m.setor ? (await admin.from('setores').select('id').eq('workspace_id', workspaceId).eq('nome', String(m.setor)).maybeSingle()).data?.id ?? null : null
    await admin.from('google_contas').insert({ workspace_id: workspaceId, convite_id: null, email, nome: String(m.nome), setor_id: setorId, grupo_email: null, grupo_ok: false, google_id: googleId || null, ip_hash: hashDoIp(`email-de-quem-ja-tem-conta:${m.id}`) })
    await admin.from('activity_log').insert({ workspace_id: workspaceId, actor_id: ator.userId, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null, metadata: { email, origem: 'whatsapp_email_de_quem_ja_tem_conta', membro: m.id } })
    const entrega = await entregar(admin, workspaceId, { numero, userId: null, tipo: 'aviso', categoria: 'conta', texto: textoDaContaCriada({ nome: String(m.nome), email, senha }) }, { config })
    const avisos = [erroFicha ? ' ⚠️ O e-mail não ficou gravado na ficha: avise a TI.' : '', entrega.situacao === 'falhou' ? ' ⚠️ A senha NÃO chegou ao WhatsApp dela(e): redefina no Admin do Google e avise.' : ''].join('')
    return [{ texto: `Pronto ✓ O e-mail ${email} foi criado para ${m.nome}.${entrega.situacao === 'falhou' ? '' : entrega.situacao === 'na_fila' ? ' A senha provisória está na fila e sai em instantes.' : ' A senha provisória e o passo a passo foram enviados ao WhatsApp dela(e).'}${avisos}` }]
  } catch (causa) {
    console.error('[whatsapp] email de quem já tem conta:', causa instanceof Error ? `${causa.name}: ${causa.message}` : causa)
    return [{ texto: `Não consegui criar o e-mail: ${textoDoErro(causa)}. Confira no Admin do Google se a conta chegou a nascer antes de tentar de novo.` }]
  }
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
    // O coordenador decide só o próprio setor: a equipe e outros coordenadores dele.
    if (!podeDecidir(ator, l.dados)) return [{ texto: 'Este cadastro não é do seu setor. Quem decide é um administrador.' }]

    if (botao.acao === 'aprovar') {
      const aviso = await avisoDaCaixaNaConfirmacao(admin, workspaceId, ator, l.dados)
      return [{ texto: `${textoDaSegundaConfirmacao(l.dados, ator.admin)}${aviso ? `\n\n${aviso}` : ''}`, interativo: BOTOES_DA_SEGUNDA_CONFIRMACAO(l.id) }]
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
 * O que a aprovação diz sobre a caixa do setor: só quando quem entra é coordenador(a) e quem aprova é administrador. Mostra
 * se a caixa própria do setor será criada (endereço livre) ou por que não (ainda é apelido, já é caixa real ou grupo).
 * Se o Google não responde, sem aviso: a confirmação segue, e o resultado diz o que houve.
 */
async function avisoDaCaixaNaConfirmacao(admin: Admin, workspaceId: string, ator: Ator, d: DadosDoAutocadastro): Promise<string | null> {
  if (!ator.admin || !ehCoordenador(d.cargo) || !d.coordenacao) return null
  try {
    const { data } = await admin.from('setores').select('id, nome, email').eq('workspace_id', workspaceId).eq('ativo', true).eq('nome', d.coordenacao).maybeSingle()
    const endereco = typeof data?.email === 'string' && data.email.includes('@') ? data.email.toLowerCase() : null
    if (!endereco || !data) return null
    const estado = await consultarEndereco(chamarGoogleAdmin(workspaceId), endereco)
    const semDono = estado.tipo === 'caixa_real' && await caixaSemDono(admin, workspaceId, String(data.id), endereco)
    return avisoDaCaixaDoSetor(estado, { endereco, nome: String(data.nome), quem: (d.nome ?? '').split(' ')[0], semDono })
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
  // A caixa PRÓPRIA do setor (conta de verdade, privada) vai para quem coordena quando um administrador o aprova: se o endereço
  // está livre, ela nasce agora; se já existe sem responsável (criada por "caixas dos setores"), é ENTREGUE — senha redefinida,
  // recuperação passa a ser dele(a). Apelido, grupo e caixa que já tem responsável (o contato@ nunca é nossa) não se tocam.
  // Falha aqui nunca desfaz a conta pessoal.
  const enderecoDoSetor = typeof setor?.email === 'string' && setor.email.includes('@') ? setor.email.toLowerCase() : null
  let caixaDoSetor: { nome: string; email: string; senha: string } | null = null
  let setorNota = ''
  if (enderecoDoSetor && setor && ehCoordenador(d.cargo) && aprovador.admin) {
    const resultado = await darCaixaAoSetor(admin, workspaceId, { setorId: String(setor.id), endereco: enderecoDoSetor, nome: String(setor.nome), recuperacaoEmail: emailPessoal, recuperacaoCelular: typeof celular === 'string' && celular ? celular : undefined, entregarExistente: true })
    if (resultado.caixa) caixaDoSetor = resultado.caixa
    setorNota = ` ${resultado.nota}`
    if (resultado.caixa && resultado.nova) {
      const { error: erroCaixa } = await admin.from('google_contas').insert({
        workspace_id: workspaceId, convite_id: null, email: resultado.caixa.email, nome: resultado.caixa.nome, setor_id: setor.id, grupo_email: null, grupo_ok: false,
        google_id: null, ip_hash: hashDoIp(`autocadastro-setor:${l.id}`),
      })
      if (erroCaixa) { console.error('[whatsapp] autocadastro: google_contas da caixa do setor:', erroCaixa.message); setorNota += ' ⚠️ A caixa foi criada mas NÃO ficou registrada no Palácio: avise a TI, ou ela não poderá ser entregue de novo.' }
    }
  }

  // 3. Daqui em diante a conta existe: o que falhar vira aviso, nunca desfaz.
  const nomeCompleto = d.nome ?? ''
  await admin.from('google_contas').insert({
    workspace_id: workspaceId, convite_id: null, email, nome: nomeCompleto, setor_id: setor?.id ?? null, grupo_email: null, grupo_ok: false,
    google_id: googleId || null, ip_hash: hashDoIp(`autocadastro:${l.id}`),
  })
  await admin.from('equipe_membros').update({ email_trabalho: email }).eq('id', membroId as string).eq('workspace_id', workspaceId)

  // Quem entrou como coordenador(a) passa a aprovar o próprio setor. Aprova esse cargo um administrador ou outro coordenador
  // do mesmo setor (podeDecidir); a caixa própria do setor, acima, continua só com a aprovação de administrador.
  if (ehCoordenador(d.cargo) && setor?.id && (aprovador.admin || aprovador.setores.includes(String(setor.nome)))) {
    const { error: erroCoord } = await admin.from('setor_coordenadores').insert({
      workspace_id: workspaceId, setor_id: setor.id, numero: l.numero, membro_id: membroId as string, criado_por: aprovador.userId,
    })
    if (erroCoord && erroCoord.code !== '23505') console.error('[whatsapp] autocadastro: coordenador não registrado:', erroCoord.message)
  }

  // 4. A senha provisória vai ao WhatsApp da pessoa (decisão do responsável, 23/10/2026), com o passo a passo; nunca é
  // gravada. "categoria conta": o texto some da fila depois do envio. Se o WhatsApp falhar, o mesmo vai ao e-mail pessoal.
  const entrega = await entregar(admin, workspaceId, {
    numero: l.numero, userId: null, tipo: 'aviso', categoria: 'conta',
    texto: textoDaContaCriada({ nome: nomeCompleto, email, senha, caixaDoSetor }),
  }, { config })
  const peloWhatsapp = entrega.situacao !== 'falhou'
  const peloEmail = peloWhatsapp ? false : await enviarComSeguranca(emailPessoal, emailDeContaDoGoogle({ nome: nomeCompleto, email, senha, setor: d.coordenacao ?? '', grupo: null, caixaDoSetor }))
  // A caixa do setor só passa a ter responsável quando a senha dela chegou à pessoa (WhatsApp ou e-mail): sem isso ela segue
  // "sem dono" e o comando "caixa do setor: <nome>" a reenvia.
  if (caixaDoSetor && setor?.id && (peloWhatsapp || peloEmail)) await marcarCaixaEntregue(admin, workspaceId, aprovador.userId, String(setor.id), caixaDoSetor.email, 'aprovacao')
  await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: aprovador.userId, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null,
    metadata: { email, origem: 'autocadastro_whatsapp', autocadastro: l.id, aprovado_por: aprovador.admin ? 'administrador' : 'coordenador', caixa_do_setor: caixaDoSetor?.email ?? null, whatsapp: entrega.situacao, email_enviado: peloEmail },
  })
  // A foto passou para a ficha (foto_cadastro_path); sair do pedido apaga os dados pessoais dele (gatilho do banco).
  await admin.from('colaborador_autocadastros').update({ status: 'aprovado', decidido_em: new Date().toISOString() }).eq('id', l.id)

  const grupoAviso = setorNota
  if (peloWhatsapp) {
    return `Pronto ✓ ${nomeCompleto} foi cadastrado(a). E-mail: ${email}. ${entrega.situacao === 'na_fila' ? 'A senha provisória e o passo a passo estão na fila e saem em instantes.' : TEXTO_DA_SENHA_NO_WHATSAPP}${grupoAviso}`
  }
  return peloEmail
    ? `A conta ${email} foi criada. O WhatsApp da pessoa não recebeu, então a senha provisória foi para ${mascarar(emailPessoal)}.${grupoAviso}`
    : `A conta ${email} foi criada, mas a senha NÃO chegou à pessoa (WhatsApp e e-mail falharam). Peça uma senha nova pelo Admin do Google e avise a pessoa.${grupoAviso}${caixaDoSetor ? ` A senha da caixa ${caixaDoSetor.email} também NÃO chegou: redefina-a no Admin do Google.` : ''}`
}
