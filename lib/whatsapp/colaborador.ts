import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { PESSOAS_DA_EQUIPE } from '@/lib/equipe'
import { nomesDosSetores } from '@/lib/setores'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { emailValido } from '@/lib/contas/emails'
import { emailEmUso, numeroEmUso, usuarioLivre } from '@/lib/contas/cadastro'
import { conferirCadastro } from '@/lib/contas/cadastro-regras'
import { montarDiretorio, type LinhaDoDiretorio } from '@/lib/pessoas/diretorio'
import { configDoWhatsapp } from './servidor'
import { criarConfirmacao } from './confirmacoes'
import { acharPeloNome, normalizar, numeroCanonico } from './regras'
import { gerenciaUsuarios } from './admin'
import { encerrarPendencia, podeAgirPeloWhatsapp, type Pendencia, type Pessoa, type Resposta } from './acoes'
import { redigirCadastrosEncerrados } from './colaborador-faxina'
import {
  TEXTO_DO_CADASTRO_COM_DUAS_ETAPAS, TEXTO_DO_EMAIL_EM_USO, TEXTO_SEM_O_DA_FICHA, dadosDoLink, nomeDoColaborador, pedidoDoCadastro, perguntaDoCadastro, quemTemONome,
  reciboDoPasso, resultadoDaBuscaNaEquipe, seguirNoCadastro, textoDoCadastroParaConfirmar, textoDoCadastroPelaTela,
  type DadosDoCadastro, type PessoaNaBusca,
} from './colaborador-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O cadastro de colaborador pelo WhatsApp do Palácio: "colaborador: Ana Lima"
 * (também "novo colaborador", "cadastrar colaborador" e o nome; sem o nome, o
 * bot pergunta), só para quem gerencia usuários ("usuarios.gerenciar", a
 * permissão de "Adicionar pessoas") com o número confirmado e sem a
 * verificação em duas etapas (podeAgirPeloWhatsapp; quem usa é mandado para a
 * tela). A mesma semântica de "Adicionar pessoas", para UMA pessoa, em etapas
 * (lib/whatsapp/colaborador-regras.ts, puro):
 *
 *   nome → "é esta pessoa?" (quem da equipe está sem acesso com o nome: a ficha
 *   do RH é reaproveitada; quem JÁ tem conta com o nome para o cadastro, sem
 *   duplicar) → e-mail (o "já em uso" volta) → WhatsApp (o número ligado a
 *   outra conta é só aviso) — um dos dois, porque o convite precisa de um canal
 *   → coordenação (a lista oficial; "Sem coordenação" vale) → cargo → papel (o
 *   sugerido pelo setor; administrador nunca) → o pedido da ficha do RH no
 *   convite (com WhatsApp) → o resumo com o link de confirmar no Palácio.
 *
 * O bot NÃO cria nada. O fim é o link de uso único (whatsapp_confirmacoes,
 * "cadastrar_colaborador", 15 minutos, como a desativação de conta), e a conta
 * só nasce lá (app/confirmar/[token]), pela sessão de quem pediu e pelo MESMO
 * núcleo de "Adicionar pessoas" (lib/contas/cadastro.ts, cadastrar). O alvo do
 * link é a ficha reaproveitada ou um id novo: a conta ainda não existe.
 *
 * As etapas ficam em whatsapp_pendencias (tipo "cadastrar_colaborador",
 * migração 20261019050000): antes dela, o banco recusa a pergunta e o bot
 * responde que o cadastro é pela tela "Adicionar pessoas", com o link. O
 * e-mail e o WhatsApp da pessoa nova ficam só nos dados da pergunta e do link
 * (o banco os tira quando a conversa acaba; o vencido, a faxina:
 * lib/whatsapp/colaborador-faxina.ts); nos textos, só mascarados, e nada disso
 * vai ao registro do bot (whatsapp_mensagens guarda só o comando) nem a log.
 */

/** A resposta com a pergunta guardada; sem a migração, o texto de ir à tela. */
function perguntar(d: DadosDoCadastro, base: string, pendenciaId?: number, antes?: string | null): Resposta {
  const p = perguntaDoCadastro(d, antes)
  if (!p) return { texto: textoDoCadastroPelaTela(base) }
  return {
    texto: p.texto, interativo: p.interativo, semPergunta: textoDoCadastroPelaTela(base),
    pergunta: { tipo: 'cadastrar_colaborador', dados: { ...d, etapa: p.etapa }, id: pendenciaId },
  }
}

/**
 * "colaborador: Ana Lima" (o nome é opcional). null para quem não gerencia usuários (o bot segue como sempre: para
 * os outros, a palavra nem vira comando).
 */
export async function comecarCadastro(admin: Admin, workspaceId: string, pessoa: Pessoa, nome: string, base: string): Promise<Resposta | null> {
  if (!gerenciaUsuarios(pessoa)) return null
  const tela = `${base}/pessoas/adicionar`
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_DO_CADASTRO_COM_DUAS_ETAPAS}\n\n${tela}` }
  // O que sobrou de cadastros que acabaram (cancelados, vencidos) sai do banco antes de abrir outro.
  await redigirCadastrosEncerrados(admin)
  try {
    const [setores, whatsapp] = await Promise.all([nomesDosSetores(admin, workspaceId), configDoWhatsapp(workspaceId)])
    const d: DadosDoCadastro = { setores, canais: { whatsapp: Boolean(whatsapp), email: emailConfigurado() } }
    const valido = nomeDoColaborador(nome)
    if (!valido) return perguntar(d, base)
    return await depoisDoNome(admin, workspaceId, { ...d, nome: valido }, base)
  } catch (causa) {
    console.error('[whatsapp] cadastro de colaborador não começou:', causa instanceof Error ? causa.message : causa)
    return { texto: `Não consegui começar o cadastro agora. Cadastre pela tela: ${tela}` }
  }
}

/** O nome chegou: quem da equipe tem esse nome (para o "é esta pessoa?" ou para parar, se já tem conta). */
async function depoisDoNome(admin: Admin, workspaceId: string, d: DadosDoCadastro & { nome: string }, base: string, pendenciaId?: number): Promise<Resposta> {
  const achados = quemTemONome(await pessoasDaEquipe(admin, workspaceId, d.nome), d.nome)
  const r = resultadoDaBuscaNaEquipe(d, achados, base)
  if ('parar' in r) {
    if (pendenciaId) {
      await encerrarPendencia(admin, pendenciaId)
      await redigirCadastrosEncerrados(admin)
    }
    return { texto: r.parar }
  }
  return perguntar(r.dados, base, pendenciaId)
}

/**
 * A resposta à pergunta aberta. `estrita` = a pessoa citou a pergunta: o que não serve é pedido de novo; sem citar,
 * devolve null e segue como mensagem comum.
 */
export async function seguirCadastro(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const tela = `${base}/pessoas/adicionar`
  // O papel pode ter mudado no meio da conversa: quem não gerencia mais usuários não continua.
  if (!gerenciaUsuarios(pessoa)) {
    await encerrarPendencia(admin, p.id)
    await redigirCadastrosEncerrados(admin)
    return { texto: 'O cadastro de colaboradores é só de quem gerencia os usuários. Nada foi criado.' }
  }
  const d = p.dados as unknown as DadosDoCadastro
  try {
    const passo = seguirNoCadastro(d, texto)
    if (passo.tipo === 'repetir') return estrita || passo.sempre ? { texto: passo.texto } : null
    if (passo.tipo === 'perdido') {
      await encerrarPendencia(admin, p.id)
      await redigirCadastrosEncerrados(admin)
      return { texto: `Não consegui continuar este cadastro. Cadastre pela tela: ${tela}` }
    }
    if (passo.tipo === 'buscar') return await depoisDoNome(admin, workspaceId, { ...passo.dados, nome: passo.dados.nome ?? '' }, base, p.id)

    let dados: DadosDoCadastro
    let conferir: 'email' | 'whatsapp' | undefined
    if (passo.tipo === 'da_ficha') {
      const valor = await contatoDaFicha(admin, workspaceId, d.daEquipe?.fichaId ?? null, passo.campo)
      if (!valor) return { texto: TEXTO_SEM_O_DA_FICHA }
      dados = { ...d, [passo.campo]: valor }
      conferir = passo.campo
    } else {
      dados = passo.dados
      conferir = passo.conferir
    }
    // As conferências do banco: o e-mail em uso por outra conta volta (como na tela); o número ligado a outra conta é só aviso.
    if (conferir === 'email' && dados.email && await emailEmUso(admin, dados.email)) return { texto: TEXTO_DO_EMAIL_EM_USO }
    if (conferir === 'whatsapp' && dados.whatsapp) dados = { ...dados, numeroEmUso: await numeroEmUso(admin, dados.whatsapp) || undefined }

    if (perguntaDoCadastro(dados)) return perguntar(dados, base, p.id, reciboDoPasso(d, dados))
    return await pedirConfirmacao(admin, workspaceId, pessoa, p, dados, base)
  } catch (causa) {
    console.error('[whatsapp] cadastro de colaborador não seguiu:', causa instanceof Error ? causa.message : causa)
    return { texto: `Não consegui seguir com o cadastro agora. Tente de novo, ou cadastre pela tela: ${tela}` }
  }
}

/**
 * O fim da conversa: a pergunta encerra (só uma entrega passa), o pedido é conferido com as regras da tela (os
 * canais ligados agora, a lista oficial, administrador recusado), o usuário sugerido é gerado como a tela gera, e
 * sai o link de confirmar no Palácio com o resumo mascarado. Nada é criado aqui.
 */
async function pedirConfirmacao(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, d: DadosDoCadastro, base: string): Promise<Resposta> {
  const tela = `${base}/pessoas/adicionar`
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Este cadastro já foi enviado para confirmar no Palácio.' }
  try {
    // Ligou a verificação em duas etapas no meio da conversa: o cadastro vai para a tela.
    if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_DO_CADASTRO_COM_DUAS_ETAPAS}\n\n${tela}` }
    const [setores, whatsapp] = await Promise.all([nomesDosSetores(admin, workspaceId), configDoWhatsapp(workspaceId)])
    const pedido = pedidoDoCadastro(d)
    const conferido = conferirCadastro(pedido, { setores, canais: { whatsapp: Boolean(whatsapp), email: emailConfigurado() }, semAdmin: true })
    if (!conferido.ok) return { texto: `Não deu para pedir o cadastro de ${conferido.nome || 'esta pessoa'}: ${conferido.erro}. Comece de novo, ou cadastre pela tela: ${tela}` }
    const usuario = await usuarioLivre(admin, conferido.cadastro.nome, new Set())
    const link = await criarConfirmacao(admin, {
      workspaceId, userId: pessoa.id, acao: 'cadastrar_colaborador',
      // A conta ainda não existe: o alvo é a ficha reaproveitada ou um id só deste pedido.
      alvoId: conferido.cadastro.fichaId ?? randomUUID(),
      dados: dadosDoLink(pedido, { usuario, numeroEmUso: d.numeroEmUso }),
    })
    if ('erro' in link) return { texto: link.erro === 'limite' ? `Muitos links pedidos na última hora. Cadastre pela tela: ${tela}` : textoDoCadastroPelaTela(base) }
    return { texto: textoDoCadastroParaConfirmar({ ...conferido.cadastro, usuario }, link.url, { numeroEmUso: d.numeroEmUso }), semFila: true }
  } catch (causa) {
    console.error('[whatsapp] cadastro de colaborador não pedido:', causa instanceof Error ? causa.message : causa)
    return { texto: `Não consegui montar o pedido agora. Cadastre pela tela: ${tela}` }
  } finally {
    // A pergunta acabou: o nome, o contato e o resto saem dela (o pedido, agora, está só no link).
    await redigirCadastrosEncerrados(admin)
  }
}

// ------------------------------------------------------------------ a equipe

/**
 * O Diretório (lib/pessoas/diretorio.ts, montarDiretorio), lido pelo serviço — a função `diretorio` do banco é da
 * sessão, e aqui não há sessão — só com quem pode ter o nome: as contas do espaço, as fichas do RH sem login (menos
 * os desligados) e a lista oficial dos setores. Da ficha, só se há e-mail e celular (o valor fica nela).
 */
async function pessoasDaEquipe(admin: Admin, workspaceId: string, nome: string): Promise<PessoaNaBusca[]> {
  const [{ data: membros }, { data: fichas }] = await Promise.all([
    admin.from('workspace_members').select('user_id, role, coordination, profiles(full_name, username, active)').eq('workspace_id', workspaceId),
    admin.from('equipe_membros').select('id, nome, nome_social, cargo, setor, email_trabalho, situacao').eq('workspace_id', workspaceId).is('user_id', null).neq('situacao', 'desligado'),
  ])
  const linhas: LinhaDoDiretorio[] = []
  const usuarios = new Map<string, string | null>()
  for (const m of membros ?? []) {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string | null; username?: string | null; active?: boolean } | null
    if (!perfil) continue
    const id = m.user_id as string
    usuarios.set(id, perfil.username ?? null)
    linhas.push(linha({ tipo: 'conta', user_id: id, nome: perfil.full_name?.trim() || perfil.username || '', setor: (m.coordination as string | null) ?? null, papel: m.role as string, acesso: perfil.active === false ? 'desativado' : 'ativo' }))
  }
  for (const f of fichas ?? []) {
    linhas.push(linha({
      tipo: 'ficha', ficha_id: f.id as string, nome: ((f.nome_social as string | null)?.trim() || (f.nome as string | null) || ''), cargo: (f.cargo as string | null) ?? null,
      setor: (f.setor as string | null) ?? null, email: (f.email_trabalho as string | null) ?? null,
    }))
  }
  const pessoas = montarDiretorio(linhas, PESSOAS_DA_EQUIPE.map((p) => ({ nome: p.nome, cargo: p.cargo, setor: p.setor })))
  // Só para quem bate com o nome: o celular da ficha (equipe_pessoais) e, de quem tem conta, se já entrou (convite pendente).
  const chave = normalizar(nome)
  const fichasAchadas = acharPeloNome(pessoas.filter((p) => p.acesso === 'sem_acesso'), nome).map((p) => p.ficha_id).filter((id): id is string => Boolean(id))
  const contasAchadas = pessoas.filter((p) => p.origem === 'conta' && p.acesso === 'ativo' && p.user_id && normalizar(p.nome) === chave).map((p) => p.user_id as string)
  const [{ data: pessoais }, entradas] = await Promise.all([
    fichasAchadas.length ? admin.from('equipe_pessoais').select('membro_id, telefone_pessoal, email_pessoal').in('membro_id', fichasAchadas) : Promise.resolve({ data: [] }),
    Promise.all(contasAchadas.slice(0, 5).map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        return data.user && !data.user.last_sign_in_at ? id : null
      } catch {
        return null
      }
    })),
  ])
  const convites = new Set(entradas.filter((id): id is string => Boolean(id)))
  const pessoaisDe = new Map((pessoais ?? []).map((x) => [x.membro_id as string, x as { telefone_pessoal?: string | null; email_pessoal?: string | null }]))
  return pessoas.map((p): PessoaNaBusca => {
    const extra = p.ficha_id ? pessoaisDe.get(p.ficha_id) : undefined
    return {
      origem: p.origem, nome: p.nome, usuario: p.user_id ? usuarios.get(p.user_id) ?? null : null,
      acesso: p.user_id && convites.has(p.user_id) ? 'convite' : p.acesso, fichaId: p.ficha_id, setor: p.setor, cargo: p.cargo,
      temEmail: Boolean(p.email || extra?.email_pessoal), temWhatsapp: Boolean(numeroCanonico(extra?.telefone_pessoal ?? '')),
    }
  })
}

/** Uma linha do Diretório com o resto em branco (montarDiretorio só usa o nome, o tipo e os ids). */
const linha = (l: Partial<LinhaDoDiretorio> & Pick<LinhaDoDiretorio, 'tipo' | 'nome'>): LinhaDoDiretorio => ({
  user_id: null, ficha_id: null, cargo: null, setor: null, email: null, telefone: null, avatar_path: null, iniciais: null, cor: null, papel: null,
  acesso: 'sem_acesso', gestor: null, visto_em: null, criado_em: null, ...l,
})

/**
 * O e-mail (o de trabalho, senão o pessoal) ou o celular da ficha escolhida, no formato do cadastro; null sem ficha
 * ou sem o dado. Lido na hora: o valor nunca fica na pendência antes de a pessoa escolher "Usar o da ficha".
 */
async function contatoDaFicha(admin: Admin, workspaceId: string, fichaId: string | null, campo: 'email' | 'whatsapp'): Promise<string | null> {
  if (!fichaId) return null
  const [{ data: ficha }, { data: pessoais }] = await Promise.all([
    admin.from('equipe_membros').select('email_trabalho').eq('id', fichaId).eq('workspace_id', workspaceId).is('user_id', null).maybeSingle(),
    admin.from('equipe_pessoais').select('email_pessoal, telefone_pessoal').eq('membro_id', fichaId).maybeSingle(),
  ])
  if (!ficha) return null
  if (campo === 'email') return emailValido(String(ficha.email_trabalho ?? '')) ?? emailValido(String(pessoais?.email_pessoal ?? ''))
  return numeroCanonico(String(pessoais?.telefone_pessoal ?? ''))
}
