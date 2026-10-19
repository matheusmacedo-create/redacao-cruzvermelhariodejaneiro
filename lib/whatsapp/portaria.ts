import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { diaEmSaoPaulo, hora, quemVisita, type DadosDoVisitante, type RespostaDaVisita } from '@/lib/portaria/regras'
import { apagarFotoDoVisitante, avisarVisitado, guardarFotoDoVisitante, pessoasParaVisitar } from '@/lib/portaria/servidor'
import { normalizarFotoDoVisitante } from '@/lib/portaria/foto-servidor'
import { baixarMidia, configDoWhatsapp } from './servidor'
import {
  TEXTO_SEM_ACAO_PELO_WHATSAPP, acharPeloNome, formatarNumero, situacaoDaVisitaNaLista, textoDaPortaria, type MensagemRecebida, type VisitaNaLista,
} from './regras'
import {
  TETO_DA_FOTO_DO_VISITANTE, comFoto, dadosRedigidos, fotoRecebida, nomeLimpo, perguntaDaVisita, resultadoDaBusca, seguirNoRegistro, textoDaEntradaRegistrada,
  type DadosDaVisita, type FotoNaConversa, type PerguntaDaVisita,
} from './portaria-regras'
import { INDISPONIVEL, encerrarPendencia, podeAgirPeloWhatsapp, semFuncao, type Pendencia, type Pessoa, type Resposta, type ResultadoDaAcao } from './acoes'

/**
 * A portaria pelo WhatsApp (o livro de visitantes, §7.24):
 *
 *  - "portaria" (ou "quem está aqui") lista as visitas abertas do dia — quem
 *    entrou hoje e não saiu, e quem se cadastrou pelo QR e espera a
 *    confirmação —, só com o nome do visitante, para quem, a hora e a
 *    situação. Telefone, empresa, motivo, recado e foto ficam na tela;
 *  - "visitante: João Silva" registra a chegada em etapas, como o cadastro do
 *    QR: o nome, para quem (busca na equipe ativa; com mais de uma pessoa, a
 *    lista para escolher; ou "setor:" e o setor, sem aviso, como o "Setor ou
 *    pessoa" da tela), o telefone do visitante e, com ele, se o visitante
 *    aceita receber a resposta no WhatsApp (a portaria pergunta; só o "Sim"
 *    autoriza), de onde vem, o motivo, o crachá e a foto — tudo opcional,
 *    com Pular e Registrar já — e a conferência ("confirmo"). As etapas são
 *    puras: lib/whatsapp/portaria-regras.ts;
 *  - a foto chega como imagem em qualquer etapa do registro aberto, ou abre o
 *    registro com a legenda "visitante: Nome" (o bot desvia a imagem para cá
 *    antes do envio de fotos e do Drive: receberFotoDaVisita). Na chegada, só
 *    o tipo é conferido e o id da mídia fica na pendência; depois do
 *    "confirmo", com a visita criada, a foto é baixada, normalizada
 *    (lib/portaria/foto-servidor.ts) e gravada no Blob privado, registrada
 *    como quem escreveu (whatsapp_portaria_definir_foto, migração
 *    20261019040000). Foto que não entra não impede o registro: a resposta
 *    diz, e manda tirar pela tela.
 *
 * Quem tem a portaria é quem a tela e o banco dizem (private.pode_portaria):
 * membro do Palácio, menos a equipe da Escola. O registro passa pela MESMA
 * função da tela, portaria_registrar_entrada, chamada como quem escreveu
 * (whatsapp_portaria_registrar_entrada, sessão simulada aal1 — o banco confere
 * de novo a portaria e a verificação em duas etapas, e grava quem registrou),
 * e o aviso a quem é visitado sai pelo mesmo avisarVisitado: a pessoa
 * responde 1, 2 ou 3 como sempre, e quem registrou recebe a resposta.
 *
 * Listar é consulta (vale com a verificação em duas etapas); registrar é
 * ação (podeAgirPeloWhatsapp). As etapas ficam em whatsapp_pendencias (tipo
 * "registrar_visita", migração 20261018213700): antes dela, o banco recusa a
 * pergunta e o bot manda para a tela da portaria. Nada do visitante vai ao
 * registro do bot nem aos logs, e a pendência que acabou é redigida
 * (redigirRegistrosEncerrados).
 */

type Admin = ReturnType<typeof createAdminClient>

/** Quem tem a portaria: a mesma regra da tela e do banco (membro do Palácio, menos a equipe da Escola). */
export const temPortaria = (pessoa: Pessoa): boolean => !ehEquipeDaEscola(pessoa.papel)

/** Meia-noite de hoje em Brasília, em UTC (o fuso é fixo, UTC−3), como a tela da portaria. */
const inicioDeHoje = () => new Date(`${diaEmSaoPaulo(new Date())}T00:00:00-03:00`).toISOString()

// ------------------------------------------------------------------ as visitas de hoje

type LinhaDaVisita = { id: string; nome: string; visitado_id: string | null; visitado_texto: string | null; entrada_em: string | null; resposta: RespostaDaVisita | null; created_at: string }

/** O "portaria": as visitas abertas de hoje. null para quem não tem a portaria (o bot segue como "desconhecido"). */
export async function visitasDeHoje(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<string | null> {
  if (!temPortaria(pessoa)) return null
  const inicio = inicioDeHoje()
  const colunas = 'id, nome, visitado_id, visitado_texto, entrada_em, resposta, created_at'
  const [dentro, peloQr, registra] = await Promise.all([
    admin.from('portaria_visitas').select(colunas).eq('workspace_id', workspaceId).gte('entrada_em', inicio).is('saida_em', null).is('descartada_em', null)
      .order('entrada_em', { ascending: false }).limit(50),
    admin.from('portaria_visitas').select(colunas).eq('workspace_id', workspaceId).is('entrada_em', null).is('descartada_em', null).gte('created_at', inicio)
      .order('created_at', { ascending: false }).limit(50),
    podeAgirPeloWhatsapp(admin, workspaceId, pessoa),
  ])
  if (dentro.error || peloQr.error) return `Não consegui ler a portaria agora. Veja em ${base}/portaria`
  const quando = (v: LinhaDaVisita) => v.entrada_em ?? v.created_at
  const visitas = [...(dentro.data ?? []), ...(peloQr.data ?? [])] as LinhaDaVisita[]
  visitas.sort((a, b) => quando(b).localeCompare(quando(a)))
  const ids = [...new Set(visitas.map((v) => v.visitado_id).filter((id): id is string => Boolean(id)))]
  const { data: perfis } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]))
  const lista: VisitaNaLista[] = visitas.map((v) => ({
    nome: v.nome, para: quemVisita(v, v.visitado_id ? nomeDe.get(v.visitado_id) : null), hora: hora(quando(v)), situacao: situacaoDaVisitaNaLista(v),
  }))
  return textoDaPortaria({ visitas: lista, total: lista.length, urlBase: base, registra })
}

// ------------------------------------------------------------------ registrar quem chegou (em etapas)

/** "visitante: João Silva" (o nome é opcional: o bot pergunta). `foto`: a imagem com essa legenda abriu o registro. */
export async function comecarVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, nome: string, base: string, foto?: FotoNaConversa): Promise<Resposta> {
  if (!temPortaria(pessoa)) return { texto: `A portaria fica no Palácio: ${base}/portaria` }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${base}/portaria` }
  // O que sobrou de registros que acabaram (cancelados, vencidos) sai do banco antes de abrir outro.
  await redigirRegistrosEncerrados(admin)
  const n = nomeLimpo(nome)
  const d: DadosDaVisita = { ...(n.length >= 2 ? { nome: n } : {}), ...(foto ? { foto } : {}) }
  return proximoPasso(admin, workspaceId, d, base, undefined, undefined, foto ? comFoto({}, foto).antes : null)
}

/**
 * A próxima pergunta, até a conferência (portaria-regras.ts, perguntaDaVisita). `busca`: o que a pessoa escreveu para
 * achar quem é visitado; `antes`: o que vai na frente da pergunta ("Foto recebida ✓").
 */
async function proximoPasso(admin: Admin, workspaceId: string, d: DadosDaVisita, base: string, pendenciaId?: number, busca?: string, antes?: string | null): Promise<Resposta> {
  const perguntar = (dados: DadosDaVisita, p: PerguntaDaVisita): Resposta =>
    ({ texto: p.texto, pergunta: { tipo: 'registrar_visita', dados: { ...dados, etapa: p.etapa }, id: pendenciaId }, interativo: p.interativo })
  if (busca && d.nome && !d.pessoa && !d.setor) {
    const achou = resultadoDaBusca(d, busca, acharPeloNome(await pessoasParaVisitar(workspaceId, admin), busca))
    if (achou.pergunta) return perguntar(achou.dados, achou.pergunta)
    d = achou.dados
  }
  return perguntar(d, perguntaDaVisita(d, antes))
}

/**
 * A resposta à pergunta aberta. `estrita` = a pessoa citou a pergunta: o que
 * não serve é pedido de novo; sem citar, devolve null e segue como mensagem comum.
 */
export async function seguirVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDaVisita
  const passo = seguirNoRegistro(d, texto)
  if (passo.tipo === 'repetir') return estrita || passo.sempre ? { texto: passo.texto } : null
  if (passo.tipo === 'seguir' || passo.tipo === 'buscar') {
    const r = await proximoPasso(admin, workspaceId, passo.dados, base, p.id, passo.tipo === 'buscar' ? passo.busca : undefined)
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }
  if (passo.tipo === 'perdido' || !d.nome) {
    await encerrarPendencia(admin, p.id)
    await redigirRegistrosEncerrados(admin)
    return { texto: `Não consegui continuar. Registre pela tela da portaria: ${base}/portaria` }
  }

  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta entrada já foi registrada.' }
  try {
    if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${base}/portaria` }
    return await registrarEntrada(admin, workspaceId, pessoa, { ...d, nome: d.nome }, base)
  } finally {
    // A pendência acabou: o telefone, o id da foto e o resto do visitante saem dela (a visita, se entrou, está no livro).
    await redigirRegistrosEncerrados(admin)
  }
}

/**
 * Grava pela mesma função da tela (portaria_registrar_entrada, como quem escreveu), com o telefone, a autorização,
 * de onde vem, o motivo e o crachá; põe a foto, se veio; e avisa quem é visitado pelo mesmo avisarVisitado.
 */
async function registrarEntrada(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaVisita & { nome: string }, base: string): Promise<Resposta> {
  const abrir = `${base}/portaria`
  // A autorização só vale com telefone e com quem responda (a pessoa avisada): com o setor, não há resposta a mandar.
  const avisar = Boolean(d.telefone && d.pessoa && d.avisar)
  const r = await gravarEntrada(admin, workspaceId, pessoa, {
    nome: d.nome, empresa: d.empresa || null, motivo: d.motivo || null, visitadoId: d.pessoa?.id ?? null, setor: d.setor ?? null,
    telefone: d.telefone || null, avisar, cracha: d.cracha || null, foto: d.foto ?? null,
  }, abrir)
  if (!r.ok) return { texto: r.texto }
  return {
    texto: textoDaEntradaRegistrada({
      nome: d.nome, hora: hora(new Date().toISOString()), pessoa: d.pessoa ?? null, setor: d.setor ?? null, foto: r.foto ?? null, avisar, abrir,
    }),
  }
}

/**
 * A entrada no livro de visitantes, pela MESMA função da tela (portaria_registrar_entrada): pelo WhatsApp, como quem
 * escreveu (whatsapp_portaria_registrar_entrada, sessão simulada aal1); com `sessao`, pela sessão de quem está logado
 * (o plano do assistente confirmado no Palácio). Do registro em etapas vêm também o telefone do visitante (canônico;
 * vai ao livro formatado, como a tela mostra), a autorização (`avisar`, que o banco só grava com telefone), o crachá
 * e a foto mandada ao WhatsApp — esta entra antes do aviso, com a visita criada (guardarFotoDaConversa). Avisa quem
 * é visitado pelo mesmo avisarVisitado. Nunca lança: devolve ResultadoDaAcao (o plano do assistente decide por
 * `ok`); `foto`: 'ok', 'falhou' ou null (não veio foto).
 */
export async function gravarEntrada(admin: Admin, workspaceId: string, pessoa: Pessoa, d: {
  nome: string; empresa: string | null; motivo: string | null; visitadoId: string | null; setor?: string | null
  telefone?: string | null; avisar?: boolean; cracha?: string | null; foto?: FotoNaConversa | null
}, abrir: string, sessao?: SupabaseClient): Promise<ResultadoDaAcao & { foto?: 'ok' | 'falhou' | null }> {
  try {
    const telefone = d.telefone ? formatarNumero(d.telefone) : ''
    const dados: DadosDoVisitante = {
      nome: d.nome, telefone, empresa: d.empresa ?? '', motivo: d.motivo ?? '', visitado_texto: d.setor ?? '', avisar_visitante: Boolean(telefone && d.avisar),
      ...(d.visitadoId ? { visitado_id: d.visitadoId } : {}), ...(d.cracha ? { cracha_numero: d.cracha } : {}),
    }
    const { data, error } = sessao
      ? await sessao.rpc('portaria_registrar_entrada', { p_workspace_id: workspaceId, p: dados })
      : await admin.rpc('whatsapp_portaria_registrar_entrada', { p_user_id: pessoa.id, p_workspace_id: workspaceId, p: dados })
    if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: `${INDISPONIVEL}: ${abrir}` }
    if (error || !data) {
      return { ok: false, codigo: error?.code === '42501' ? 'sem_permissao' : 'erro', texto: `${error?.code === 'P0001' && error.message ? error.message : 'Não foi possível registrar a entrada.'} ${abrir}` }
    }
    const visitaId = data as string
    // A foto do WhatsApp só existe no registro em etapas (sem sessão): entra antes do aviso, para quem é visitado já a ter.
    const foto = d.foto && !sessao ? (await guardarFotoDaConversa(admin, workspaceId, pessoa, visitaId, d.foto) ? 'ok' as const : 'falhou' as const) : null
    await avisarVisitado({ workspaceId, visitaId, visitadoId: d.visitadoId, nome: d.nome, empresa: d.empresa, motivo: d.motivo }, pessoa.id)
    return { ok: true, codigo: 'feito', texto: `Entrada de *${d.nome}* registrada. ${abrir}`, link: abrir, foto }
  } catch (causa) {
    console.error('[whatsapp] portaria: entrada não registrada:', causa instanceof Error ? causa.message : causa)
    return { ok: false, codigo: 'erro', texto: `Não foi possível registrar a entrada. ${abrir}` }
  }
}

// ------------------------------------------------------------------ a foto do visitante

/**
 * Uma imagem de quem tem a portaria, já desviada pelo bot (portaria-regras.ts, destinoDaImagem): `foto` entra no
 * registro aberto, `comecar` abre um registro novo com ela (a legenda "visitante: Nome"). Na chegada, só o tipo é
 * conferido e o id da mídia fica na pendência — gravado já, mesmo que a resposta não saia (o teto de respostas do
 * bot); a pergunta de agora sai de novo, com "Foto recebida ✓" na frente. O arquivo só vem depois do "confirmo".
 */
export async function receberFotoDaVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, m: MensagemRecebida, p: {
  destino: 'foto' | 'comecar'; aberto: Pendencia | null; legenda: string | null; base: string
}): Promise<Resposta | null> {
  const lida = fotoRecebida(m.midia)
  if (!lida) return null
  if ('erro' in lida) return { texto: lida.erro }
  if (p.destino === 'comecar' || !p.aberto) return comecarVisita(admin, workspaceId, pessoa, p.legenda ?? '', p.base, lida.foto)
  const { dados, antes } = comFoto(p.aberto.dados as unknown as DadosDaVisita, lida.foto)
  const { data } = await admin.from('whatsapp_pendencias').update({ dados }).eq('id', p.aberto.id).is('encerrada_em', null).select('id').maybeSingle()
  if (!data) return { texto: 'Este registro já foi encerrado. Para registrar outra chegada, mande a foto com a legenda *visitante:* e o nome.' }
  return proximoPasso(admin, workspaceId, dados, p.base, p.aberto.id, undefined, antes)
}

/**
 * A foto mandada ao WhatsApp, depois do "confirmo" e com a visita criada: baixa da Kapso, normaliza
 * (normalizarFotoDoVisitante: girada pelo EXIF, até 1024 px, JPEG sem metadados), grava no Blob privado e registra
 * como quem escreveu (whatsapp_portaria_definir_foto: a mesma portaria_definir_foto da tela). Se o banco recusar
 * (ou a migração não estiver aplicada), o arquivo sai do Blob. Nunca lança; false = a foto não entrou (a entrada
 * vale do mesmo jeito). No log, só a etapa que falhou — nada do visitante.
 */
async function guardarFotoDaConversa(admin: Admin, workspaceId: string, pessoa: Pessoa, visitaId: string, foto: FotoNaConversa): Promise<boolean> {
  const falhou = (etapa: string) => {
    console.error('[whatsapp] portaria: a foto do visitante não entrou:', etapa)
    return false
  }
  let caminho: string | null = null
  try {
    const config = await configDoWhatsapp(workspaceId)
    if (!config) return falhou('sem a configuração do WhatsApp')
    const baixada = await baixarMidia(config, foto.midia, TETO_DA_FOTO_DO_VISITANTE, foto.endereco)
    if (!baixada.ok) return falhou('download')
    const bytes = await normalizarFotoDoVisitante(baixada.conteudo)
    if (!bytes) return falhou('imagem que não abre')
    caminho = await guardarFotoDoVisitante(workspaceId, visitaId, bytes)
    const { data, error } = await admin.rpc('whatsapp_portaria_definir_foto', { p_user_id: pessoa.id, p_id: visitaId, p_foto_path: caminho })
    if (error) {
      await apagarFotoDoVisitante(caminho)
      return falhou(semFuncao(error) ? 'função ausente (migração 20261019040000)' : `banco ${error.code ?? ''}`.trim())
    }
    const anterior = (data as string | null) ?? null
    if (anterior && anterior !== caminho) await apagarFotoDoVisitante(anterior)
    return true
  } catch (causa) {
    await apagarFotoDoVisitante(caminho)
    return falhou(causa instanceof Error ? causa.name : 'erro')
  }
}

// ------------------------------------------------------------------ a faxina

/**
 * O registro em etapas guarda na pendência o que a conversa precisa (o nome, o telefone, o id da foto do visitante…).
 * Quando ela acaba — registrada, cancelada, trocada por outra pergunta ou vencida —, isso sai do banco: fica só a
 * etapa (portaria-regras.ts, dadosRedigidos). Roda no começo e no fim de cada registro, até 50 por vez, e alcança as
 * de todo o espaço (a portaria registra todo dia). Melhor esforço; nunca lança.
 */
export async function redigirRegistrosEncerrados(admin: Admin): Promise<void> {
  try {
    const agora = new Date().toISOString()
    const { data, error } = await admin.from('whatsapp_pendencias').select('id, dados').eq('tipo', 'registrar_visita')
      .or(`encerrada_em.not.is.null,expira_em.lt.${agora}`).is('dados->>redigida', null).limit(50)
    if (error) return
    await Promise.all((data ?? []).map((l) => admin.from('whatsapp_pendencias').update({ dados: dadosRedigidos(l.dados) }).eq('id', l.id as number)))
  } catch {
    // Melhor esforço: o próximo registro tenta de novo.
  }
}
