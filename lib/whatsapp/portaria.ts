import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { diaEmSaoPaulo, hora, quemVisita, type DadosDoVisitante, type RespostaDaVisita } from '@/lib/portaria/regras'
import { avisarVisitado, pessoasParaVisitar } from '@/lib/portaria/servidor'
import {
  BOTOES_DA_CONFERENCIA, BOTOES_DOS_DETALHES, TEXTO_PEDE_MOTIVO_DA_VISITA, TEXTO_PEDE_NOME_DO_VISITANTE, TEXTO_SEM_ACAO_PELO_WHATSAPP,
  acharPeloNome, ehConfirmacao, ehPular, interativoDaEscolha, lerEscolha, lerSetorDaVisita, primeiroNome, situacaoDaVisitaNaLista,
  textoDaConferenciaDaVisita, textoDaEscolha, textoDaPortaria, textoPedeVisitado, type Interativo, type Opcao, type VisitaNaLista,
} from './regras'
import { INDISPONIVEL, encerrarPendencia, podeAgirPeloWhatsapp, semFuncao, type Pendencia, type Pessoa, type Resposta, type ResultadoDaAcao } from './acoes'

/**
 * A portaria pelo WhatsApp (o livro de visitantes, §7.24):
 *
 *  - "portaria" (ou "quem está aqui") lista as visitas abertas do dia — quem
 *    entrou hoje e não saiu, e quem se cadastrou pelo QR e espera a
 *    confirmação —, só com o nome do visitante, para quem, a hora e a
 *    situação. Telefone, empresa, motivo, recado e foto ficam na tela;
 *  - "visitante: João Silva" registra a chegada em etapas: o nome, para quem
 *    (busca na equipe ativa; com mais de uma pessoa, a lista para escolher; ou
 *    "setor:" e o setor, sem aviso, como o "Setor ou pessoa" da tela), o
 *    motivo (opcional) e a conferência ("confirmo"). Documento e foto não vão
 *    por aqui.
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
 * pergunta e o bot manda para a tela da portaria.
 */

type Admin = ReturnType<typeof createAdminClient>

type PessoaNaConversa = { id: string; nome: string; setor: string | null }
type DadosDaVisita = {
  etapa?: 'nome' | 'pessoa' | 'escolher_pessoa' | 'motivo' | 'conferencia'
  nome?: string
  /** A pessoa do Palácio visitada (recebe o aviso)… */
  pessoa?: PessoaNaConversa
  /** …ou o setor em texto livre (ninguém é avisado). */
  setor?: string
  /** As pessoas da lista mostrada, quando a busca achou mais de uma. */
  opcoes?: PessoaNaConversa[]
  /** "" = pulou. */
  motivo?: string
}

/** Na lista para escolher a pessoa, no máximo tantas (cabe numa lista do WhatsApp, com a linha de cancelar). */
const PESSOAS_NA_ESCOLHA = 9

/** Quem tem a portaria: a mesma regra da tela e do banco (membro do Palácio, menos a equipe da Escola). */
export const temPortaria = (pessoa: Pessoa): boolean => !ehEquipeDaEscola(pessoa.papel)

/** O nome como vai ao livro: uma linha, sem a formatação do WhatsApp. */
const nomeLimpo = (t: string) => t.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)

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

/** "visitante: João Silva" (o nome é opcional: o bot pergunta). */
export async function comecarVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, nome: string, base: string): Promise<Resposta> {
  if (!temPortaria(pessoa)) return { texto: `A portaria fica no Palácio: ${base}/portaria` }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${base}/portaria` }
  const n = nomeLimpo(nome)
  return proximoPasso(admin, workspaceId, n.length >= 2 ? { nome: n } : {}, base)
}

/** A próxima pergunta, até a conferência. `busca`: o que a pessoa escreveu para achar quem é visitado. */
async function proximoPasso(admin: Admin, workspaceId: string, d: DadosDaVisita, base: string, pendenciaId?: number, busca?: string): Promise<Resposta> {
  const perguntar = (dados: DadosDaVisita, texto: string, interativo: Interativo | null = null): Resposta =>
    ({ texto, pergunta: { tipo: 'registrar_visita', dados, id: pendenciaId }, interativo })

  if (!d.nome) return perguntar({ ...d, etapa: 'nome' }, TEXTO_PEDE_NOME_DO_VISITANTE)
  const nome = d.nome

  if (!d.pessoa && !d.setor) {
    if (!busca) return perguntar({ ...d, etapa: 'pessoa' }, textoPedeVisitado(nome))
    const achadas = acharPeloNome(await pessoasParaVisitar(workspaceId, admin), busca)
    if (achadas.length === 1) {
      d = { ...d, pessoa: achadas[0], opcoes: undefined }
    } else if (achadas.length > 1 && achadas.length <= PESSOAS_NA_ESCOLHA) {
      const opcoes: Opcao[] = achadas.map((p) => ({ nome: p.nome, detalhe: p.setor }))
      return perguntar({ ...d, etapa: 'escolher_pessoa', opcoes: achadas },
        textoDaEscolha({ pergunta: `Achei mais de uma pessoa com “${busca}”. Qual delas vai receber *${nome}*?`, opcoes }),
        interativoDaEscolha(opcoes, { cancelar: 'Não registrar a entrada' }))
    } else {
      return perguntar({ ...d, etapa: 'pessoa', opcoes: undefined }, achadas.length
        ? `Achei ${achadas.length} pessoas com “${busca}”. Escreva mais do nome (o sobrenome, por exemplo), ou *setor:* e o setor.`
        : `Não achei “${busca}” na equipe do Palácio. Escreva de outro jeito (o primeiro nome ou o sobrenome), ou *setor:* e o setor (aí ninguém é avisado).`)
    }
  }

  // O motivo é opcional: "pular" (ou "não") registra sem ele.
  if (d.motivo === undefined) return perguntar({ ...d, etapa: 'motivo' }, TEXTO_PEDE_MOTIVO_DA_VISITA, BOTOES_DOS_DETALHES)
  return perguntar({ ...d, etapa: 'conferencia' }, textoDaConferenciaDaVisita({ nome, pessoa: d.pessoa ?? null, setor: d.setor ?? null, motivo: d.motivo || null }), BOTOES_DA_CONFERENCIA)
}

/**
 * A resposta à pergunta aberta. `estrita` = a pessoa citou a pergunta: o que
 * não serve é pedido de novo; sem citar, devolve null e segue como mensagem comum.
 */
export async function seguirVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDaVisita
  const deNovo = (t: string) => (estrita ? { texto: t } : null)
  const avancar = async (dados: DadosDaVisita, busca?: string) => {
    const r = await proximoPasso(admin, workspaceId, dados, base, p.id, busca)
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }
  const numero = lerEscolha(texto, 99) !== null

  if (d.etapa === 'nome') {
    const nome = nomeLimpo(texto)
    if (nome.length < 2 || numero) return deNovo('Escreva o nome do visitante, ou *cancelar*.')
    return avancar({ ...d, nome })
  }
  if (d.etapa === 'pessoa' || d.etapa === 'escolher_pessoa') {
    const n = d.etapa === 'escolher_pessoa' && d.opcoes ? lerEscolha(texto, d.opcoes.length) : null
    if (n && d.opcoes) return avancar({ ...d, pessoa: d.opcoes[n - 1], opcoes: undefined })
    const setor = lerSetorDaVisita(texto)
    if (setor) return avancar({ ...d, setor: nomeLimpo(setor), opcoes: undefined })
    // Na lista, também vale escrever outro nome em vez do número.
    const busca = texto.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (busca.length < 2 || numero) {
      return deNovo(d.opcoes ? `Responda com o número da pessoa (1 a ${d.opcoes.length}), ou *cancelar*.` : 'Escreva o nome de quem vai receber, ou *setor:* e o setor.')
    }
    return avancar({ ...d, opcoes: undefined }, busca)
  }
  if (d.etapa === 'motivo') {
    const pula = ehPular(texto)
    const motivo = pula ? '' : texto.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (!pula && (motivo.length < 2 || numero)) return deNovo('Escreva o motivo em poucas palavras, ou responda *pular*.')
    return avancar({ ...d, motivo })
  }
  if (d.etapa !== 'conferencia' || !d.nome) {
    await encerrarPendencia(admin, p.id)
    return { texto: `Não consegui continuar. Registre pela tela da portaria: ${base}/portaria` }
  }

  if (!ehConfirmacao(texto)) return estrita ? { texto: 'Para registrar, responda a conferência com *confirmo*; para desistir, *cancelar*.' } : null
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta entrada já foi registrada.' }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${base}/portaria` }
  return registrarEntrada(admin, workspaceId, pessoa, { ...d, nome: d.nome }, base)
}

/**
 * Grava pela mesma função da tela (portaria_registrar_entrada, como quem
 * escreveu) e avisa quem é visitado pelo mesmo avisarVisitado. Sem telefone,
 * empresa, crachá nem foto: isso fica na tela.
 */
async function registrarEntrada(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaVisita & { nome: string }, base: string): Promise<Resposta> {
  const abrir = `${base}/portaria`
  const r = await gravarEntrada(admin, workspaceId, pessoa, { nome: d.nome, empresa: null, motivo: d.motivo || null, visitadoId: d.pessoa?.id ?? null, setor: d.setor ?? null }, abrir)
  if (!r.ok) return { texto: r.texto }
  const agora = hora(new Date().toISOString())
  return {
    texto: d.pessoa
      ? `Pronto: entrada de *${d.nome}* registrada às ${agora}. ${primeiroNome(d.pessoa.nome) || 'Quem vai receber'} recebeu o aviso; quando responder, você é avisado. Foto e crachá, na tela da portaria: ${abrir}`
      : `Pronto: entrada de *${d.nome}* registrada às ${agora}, para ${d.setor ?? 'o setor'}. Ninguém foi avisado: confirme com o setor. Foto e crachá, na tela da portaria: ${abrir}`,
  }
}

/**
 * A entrada no livro de visitantes, pela MESMA função da tela (portaria_registrar_entrada): pelo WhatsApp, como quem
 * escreveu (whatsapp_portaria_registrar_entrada, sessão simulada aal1); com `sessao`, pela sessão de quem está logado
 * (o plano do assistente confirmado no Palácio). Avisa quem é visitado pelo mesmo avisarVisitado. Sem telefone, crachá
 * nem foto. Nunca lança: devolve ResultadoDaAcao (o plano do assistente decide por `ok`).
 */
export async function gravarEntrada(admin: Admin, workspaceId: string, pessoa: Pessoa, d: {
  nome: string; empresa: string | null; motivo: string | null; visitadoId: string | null; setor?: string | null
}, abrir: string, sessao?: SupabaseClient): Promise<ResultadoDaAcao> {
  try {
    const dados: DadosDoVisitante = {
      nome: d.nome, telefone: '', empresa: d.empresa ?? '', motivo: d.motivo ?? '', visitado_texto: d.setor ?? '', avisar_visitante: false,
      ...(d.visitadoId ? { visitado_id: d.visitadoId } : {}),
    }
    const { data, error } = sessao
      ? await sessao.rpc('portaria_registrar_entrada', { p_workspace_id: workspaceId, p: dados })
      : await admin.rpc('whatsapp_portaria_registrar_entrada', { p_user_id: pessoa.id, p_workspace_id: workspaceId, p: dados })
    if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: `${INDISPONIVEL}: ${abrir}` }
    if (error || !data) {
      return { ok: false, codigo: error?.code === '42501' ? 'sem_permissao' : 'erro', texto: `${error?.code === 'P0001' && error.message ? error.message : 'Não foi possível registrar a entrada.'} ${abrir}` }
    }
    await avisarVisitado({ workspaceId, visitaId: data as string, visitadoId: d.visitadoId, nome: d.nome, empresa: d.empresa, motivo: d.motivo }, pessoa.id)
    return { ok: true, codigo: 'feito', texto: `Entrada de *${d.nome}* registrada. ${abrir}`, link: abrir }
  } catch (causa) {
    console.error('[whatsapp] portaria: entrada não registrada:', causa instanceof Error ? causa.message : causa)
    return { ok: false, codigo: 'erro', texto: `Não foi possível registrar a entrada. ${abrir}` }
  }
}
