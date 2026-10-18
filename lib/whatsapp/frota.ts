import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { agoraEmBrasilia } from '@/lib/agenda/datas'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { hora } from '@/lib/portaria/regras'
import { nivelDoNome } from '@/lib/patrimonio/regras'
import { FINALIDADES_DE_USO, impedimento, pedidoDeRetorno, pedidoDeSaida, placaLegivel, type FinalidadeDeUso, type RetornoDaViagem } from '@/lib/patrimonio/frota'
import { avisarManutencaoVencida } from '@/lib/patrimonio/frota-servidor'
import {
  BOTOES_DA_CONFERENCIA, BOTOES_DOS_DETALHES, FINALIDADES_NA_CONVERSA, TEXTO_PEDE_DESTINO, TEXTO_PEDE_OCORRENCIAS, TEXTO_SEM_ACAO_PELO_WHATSAPP,
  acharPeloNome, acharVeiculo, botoesDoHodometro, ehConfirmacao, ehPular, interativoDaEscolha, lerEscolha, lerHodometroDaConversa, nomeDoVeiculo,
  quandoEmSaoPaulo, textoDaConferenciaDaSaida, textoDaConferenciaDoRetorno, textoDaEscolha, textoDaFrota, textoDoRetornoRegistrado, textoPedeHodometro,
  type Interativo, type Opcao,
} from './regras'
import { INDISPONIVEL, encerrarPendencia, podeAgirPeloWhatsapp, semFuncao, type Pendencia, type Pessoa, type Resposta } from './acoes'

/**
 * A Frota pelo WhatsApp (o diário de bordo do Patrimônio → Frota):
 *
 *  - "veículos" (ou "frota") mostra a frota agora: os disponíveis com o
 *    hodômetro, os em viagem (com quem, para onde e desde quando) e os em
 *    manutenção ou fora de uso. É consulta: vale para quem vê a Frota e com a
 *    verificação em duas etapas;
 *  - "saída ABC1D23" registra a saída em etapas: o veículo (pela placa, o fim
 *    dela ou o apelido; sem ele, a lista dos disponíveis), quem dirige (só os
 *    condutores ativos que podem levar aquele veículo hoje — impedimento, a
 *    mesma regra da tela), o hodômetro ("mesmo" mantém o último), a
 *    finalidade, o destino e a conferência;
 *  - "retorno ABC1D23" registra a volta: o veículo em viagem (um só em
 *    viagem vai direto), o hodômetro na chegada, as ocorrências (opcional) e a
 *    conferência. Manutenção vencida por km na viagem avisa quem opera a
 *    frota, pelo mesmo aviso do botão da tela.
 *
 * Quem vê e quem opera é quem a tela deixa: o nível do Patrimônio lido como o
 * banco lê (private.nivel_patrimonio: admin tem tudo; os outros, o que
 * pat_acesso diz) — "ver" consulta, "operar" ou "gestão" registra. A equipe da
 * Escola não abre o Patrimônio. A gravação é a MESMA da tela: a conferência de
 * pedidoDeSaida / pedidoDeRetorno (lib/patrimonio/frota.ts) e as funções
 * frota_sair / frota_retornar, chamadas como quem escreveu por
 * whatsapp_frota_sair / whatsapp_frota_retornar (sessão simulada aal1: o banco
 * confere de novo o nível, a CNH, o curso de emergência, o km e a viagem
 * aberta). Registrar é ação (podeAgirPeloWhatsapp). Abastecimento, serviço,
 * documento e projeto da viagem ficam na tela.
 *
 * As etapas ficam em whatsapp_pendencias (tipos "frota_saida" e
 * "frota_retorno", migração 20261018233000): antes dela, o banco recusa a
 * pergunta e o bot manda para a tela do veículo.
 */

type Admin = ReturnType<typeof createAdminClient>

type VeiculoNaConversa = { id: string; nome: string; placa: string; tipo: string; km: number }
type CondutorNaConversa = { id: string; nome: string; detalhe: string | null }
type UsoNaConversa = { id: string; kmSaida: number; condutor: string | null; destino: string | null }
type DadosDaViagem = {
  etapa?: 'veiculo' | 'condutor' | 'km' | 'finalidade' | 'destino' | 'ocorrencias' | 'conferencia'
  veiculo?: VeiculoNaConversa
  /** Os veículos da lista mostrada, quando a busca achou mais de um. */
  opcoes?: VeiculoNaConversa[]
  /** A viagem aberta (no retorno). */
  uso?: UsoNaConversa
  /** As viagens abertas dos veículos da lista (no retorno), na ordem de `opcoes`. */
  usos?: UsoNaConversa[]
  condutor?: { id: string; nome: string }
  condutores?: CondutorNaConversa[]
  km?: number
  finalidade?: FinalidadeDeUso
  destino?: string
  /** "" = pulou. */
  observacao?: string
}

/** Na lista para escolher o veículo ou quem dirige, no máximo tantos (cabe numa lista do WhatsApp, com a linha de cancelar). */
const NA_ESCOLHA = 9
/** O banco recusa um salto maior que este acima do hodômetro (private.frota_km): a conversa avisa antes. */
const SALTO_MAXIMO_KM = 20_000

/** O nível no Patrimônio (Frota e Estoque), como o banco lê sem sessão; a equipe da Escola não abre a área (0). */
export async function nivelNoPatrimonio(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<number> {
  if (ehEquipeDaEscola(pessoa.papel)) return 0
  if (pessoa.papel === 'admin') return 3
  try {
    const { data } = await admin.from('pat_acesso').select('nivel').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
    return nivelDoNome(data?.nivel as string | null | undefined)
  } catch {
    return 0
  }
}

type VeiculoDaFrota = {
  id: string; placa: string; apelido: string | null; tipo: string; marca: string | null; modelo: string | null; km: number; situacao: string
  uso: (UsoNaConversa & { saidaEm: string }) | null
}

/** Os veículos do espaço, com a viagem aberta de cada um. null quando não deu para ler. */
async function veiculosDoEspaco(admin: Admin, workspaceId: string): Promise<VeiculoDaFrota[] | null> {
  const [{ data: veiculos, error }, { data: usos, error: erroDosUsos }] = await Promise.all([
    admin.from('frota_veiculos').select('id, placa, apelido, tipo, marca, modelo, km_atual, situacao').eq('workspace_id', workspaceId)
      .order('apelido', { nullsFirst: false }).order('placa').limit(300),
    admin.from('frota_usos').select('id, veiculo_id, destino, saida_em, km_saida, frota_condutores(nome)').eq('workspace_id', workspaceId).is('retorno_em', null).limit(300),
  ])
  if (error || erroDosUsos) return null
  const usoDe = new Map((usos ?? []).map((u) => {
    const condutor = (Array.isArray(u.frota_condutores) ? u.frota_condutores[0] : u.frota_condutores) as { nome?: string | null } | null
    return [u.veiculo_id as string, { id: u.id as string, kmSaida: Number(u.km_saida), condutor: condutor?.nome ?? null, destino: (u.destino as string | null) ?? null, saidaEm: u.saida_em as string }]
  }))
  return (veiculos ?? []).map((v) => ({
    id: v.id as string, placa: v.placa as string, apelido: (v.apelido as string | null) ?? null, tipo: v.tipo as string, marca: (v.marca as string | null) ?? null,
    modelo: (v.modelo as string | null) ?? null, km: Number(v.km_atual), situacao: v.situacao as string, uso: usoDe.get(v.id as string) ?? null,
  }))
}

const naConversa = (v: VeiculoDaFrota): VeiculoNaConversa => ({ id: v.id, nome: nomeDoVeiculo(v), placa: v.placa, tipo: v.tipo, km: v.km })
const usoNaConversa = (v: VeiculoDaFrota): UsoNaConversa | undefined => (v.uso ? { id: v.uso.id, kmSaida: v.uso.kmSaida, condutor: v.uso.condutor, destino: v.uso.destino } : undefined)
const disponivel = (v: VeiculoDaFrota) => v.situacao === 'ativo' && !v.uso

// ------------------------------------------------------------------ a frota agora

/** O "veículos". null para quem não vê a Frota (o bot segue como "desconhecido"). */
export async function frotaAgora(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<string | null> {
  const nivel = await nivelNoPatrimonio(admin, workspaceId, pessoa)
  if (nivel < 1) return null
  const frota = await veiculosDoEspaco(admin, workspaceId)
  if (!frota) return `Não consegui ler a frota agora. Veja em ${base}/patrimonio/frota`
  return textoDaFrota({
    veiculos: frota.map((v) => ({
      nome: nomeDoVeiculo(v), tipo: v.tipo, km: v.km, situacao: v.situacao,
      uso: v.uso ? { condutor: v.uso.condutor ?? 'condutor', destino: v.uso.destino ?? '', desde: quandoEmSaoPaulo(v.uso.saidaEm) ?? '' } : null,
    })),
    urlBase: base, opera: nivel >= 2,
  })
}

// ------------------------------------------------------------------ saída e retorno (em etapas)

/** "saída ABC1D23" / "retorno ABC1D23" (o veículo é opcional: o bot pergunta). null para quem não opera a frota (o bot segue como sempre). */
export async function comecarViagem(admin: Admin, workspaceId: string, pessoa: Pessoa, acao: 'saida' | 'retorno', busca: string, base: string): Promise<Resposta | null> {
  if (await nivelNoPatrimonio(admin, workspaceId, pessoa) < 2) return null
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${base}/patrimonio/frota` }
  const b = busca.replace(/\s+/g, ' ').trim()
  return acao === 'saida' ? proximaDaSaida(admin, workspaceId, pessoa, {}, base, undefined, b || undefined) : proximaDoRetorno(admin, workspaceId, {}, base, undefined, b || undefined)
}

/** A escolha do veículo, numerada e em lista. */
function escolherVeiculo(tipo: 'frota_saida' | 'frota_retorno', d: DadosDaViagem, opcoes: VeiculoDaFrota[], pergunta: string, pendenciaId?: number): Resposta {
  const linhas: Opcao[] = opcoes.map((v) => ({
    nome: nomeDoVeiculo(v),
    detalhe: tipo === 'frota_retorno' && v.uso ? [v.uso.condutor, v.uso.destino ? `para ${v.uso.destino}` : null].filter(Boolean).join(', ') || null : null,
  }))
  return {
    texto: textoDaEscolha({ pergunta, opcoes: linhas }),
    pergunta: {
      tipo, id: pendenciaId,
      dados: { ...d, etapa: 'veiculo', opcoes: opcoes.map(naConversa), usos: tipo === 'frota_retorno' ? opcoes.map((v) => usoNaConversa(v) as UsoNaConversa) : undefined } satisfies DadosDaViagem,
    },
    interativo: interativoDaEscolha(linhas, { cancelar: tipo === 'frota_saida' ? 'Não registrar a saída' : 'Não registrar o retorno' }),
  }
}

/** A próxima pergunta da saída, até a conferência. `busca`: o que a pessoa escreveu para achar o veículo ou quem dirige. */
async function proximaDaSaida(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaViagem, base: string, pendenciaId?: number, busca?: string): Promise<Resposta> {
  const perguntar = (dados: DadosDaViagem, texto: string, interativo: Interativo | null = null): Resposta =>
    ({ texto, pergunta: { tipo: 'frota_saida', dados, id: pendenciaId }, interativo })
  const frotaNaTela = `${base}/patrimonio/frota`

  if (!d.veiculo) {
    const frota = await veiculosDoEspaco(admin, workspaceId)
    if (!frota) return { texto: `Não consegui ler a frota agora. Registre pela tela: ${frotaNaTela}` }
    const disponiveis = frota.filter(disponivel)
    if (busca) {
      const achados = acharVeiculo(frota, busca)
      const livres = achados.filter(disponivel)
      if (achados.length === 1 && !livres.length) {
        const v = achados[0]
        return {
          texto: v.uso
            ? `*${nomeDoVeiculo(v)}* já está em viagem${v.uso.condutor ? ` com ${v.uso.condutor}` : ''}: registre o retorno antes (escreva *retorno ${placaLegivel(v.placa)}*).`
            : `*${nomeDoVeiculo(v)}* está ${v.situacao === 'manutencao' ? 'em manutenção' : 'fora de uso'}: não pode sair. ${frotaNaTela}/${v.id}`,
        }
      }
      if (livres.length === 1) return proximaDaSaida(admin, workspaceId, pessoa, { ...d, veiculo: naConversa(livres[0]), opcoes: undefined }, base, pendenciaId)
      if (livres.length > 1 && livres.length <= NA_ESCOLHA) return escolherVeiculo('frota_saida', d, livres, `Achei mais de um veículo disponível com “${busca}”. Qual vai sair?`, pendenciaId)
      if (achados.length && !livres.length) return { texto: `Nenhum veículo com “${busca}” está disponível agora (em viagem, em manutenção ou fora de uso). A frota: ${frotaNaTela}` }
      if (livres.length > NA_ESCOLHA) return perguntar({ ...d, etapa: 'veiculo', opcoes: undefined }, `Achei ${livres.length} veículos com “${busca}”. Escreva a placa (ou o fim dela), ou *cancelar*.`)
      return perguntar({ ...d, etapa: 'veiculo', opcoes: undefined }, `Não achei “${busca}” na frota. Escreva a placa (ou o fim dela, como _1D23_) ou o apelido do veículo, ou *cancelar*.`)
    }
    if (!disponiveis.length) return { texto: `Nenhum veículo disponível agora (todos em viagem, em manutenção ou fora de uso). A frota: ${frotaNaTela}` }
    if (disponiveis.length <= NA_ESCOLHA) return escolherVeiculo('frota_saida', d, disponiveis, 'Qual veículo vai sair?', pendenciaId)
    return perguntar({ ...d, etapa: 'veiculo' }, 'Qual veículo vai sair? Escreva a placa (ou o fim dela) ou o apelido, ou *cancelar*.')
  }
  const veiculo = d.veiculo

  if (!d.condutor) {
    const { data, error } = await admin.from('frota_condutores').select('id, nome, user_id, cnh_categoria, cnh_validade, emergencia_validade, ativo')
      .eq('workspace_id', workspaceId).eq('ativo', true).order('nome').limit(300)
    if (error) return { texto: `Não consegui ler os condutores agora. Registre pela tela: ${frotaNaTela}/${veiculo.id}` }
    const hoje = agoraEmBrasilia().dia
    // Só quem pode levar este veículo hoje (o banco confere igual); quem escreveu, se for condutor, primeiro.
    const aptos = (data ?? []).filter((c) => impedimento({
      nome: c.nome as string, cnh_categoria: c.cnh_categoria as string, cnh_validade: c.cnh_validade as string,
      emergencia_validade: (c.emergencia_validade as string | null) ?? null, ativo: Boolean(c.ativo),
    }, veiculo.tipo, hoje) === null)
      .sort((a, b) => Number(b.user_id === pessoa.id) - Number(a.user_id === pessoa.id))
      .map((c): CondutorNaConversa => ({ id: c.id as string, nome: c.nome as string, detalhe: `CNH ${c.cnh_categoria as string}${c.user_id === pessoa.id ? ' · você' : ''}` }))
    if (!aptos.length) {
      return { texto: `Nenhum condutor ativo pode levar *${veiculo.nome}* hoje (CNH vencida, categoria ou curso de emergência). Os condutores: ${frotaNaTela}/condutores` }
    }
    if (busca) {
      const achados = acharPeloNome(aptos, busca)
      if (achados.length === 1) return proximaDaSaida(admin, workspaceId, pessoa, { ...d, condutor: { id: achados[0].id, nome: achados[0].nome }, condutores: undefined }, base, pendenciaId)
      if (achados.length > 1 && achados.length <= NA_ESCOLHA) {
        const opcoes: Opcao[] = achados.map((c) => ({ nome: c.nome, detalhe: c.detalhe }))
        return perguntar({ ...d, etapa: 'condutor', condutores: achados }, textoDaEscolha({ pergunta: `Achei mais de um condutor com “${busca}”. Quem vai dirigir *${veiculo.nome}*?`, opcoes }),
          interativoDaEscolha(opcoes, { cancelar: 'Não registrar a saída' }))
      }
      return perguntar({ ...d, etapa: 'condutor', condutores: aptos.length <= NA_ESCOLHA ? aptos : undefined }, achados.length
        ? `Achei ${achados.length} condutores com “${busca}”. Escreva mais do nome, ou *cancelar*.`
        : `Não achei “${busca}” entre os condutores que podem levar *${veiculo.nome}* hoje. Escreva o nome de outro jeito, ou *cancelar*. Os condutores: ${frotaNaTela}/condutores`)
    }
    if (aptos.length <= NA_ESCOLHA) {
      const opcoes: Opcao[] = aptos.map((c) => ({ nome: c.nome, detalhe: c.detalhe }))
      return perguntar({ ...d, etapa: 'condutor', condutores: aptos }, textoDaEscolha({ pergunta: `Quem vai dirigir *${veiculo.nome}*? (Só aparece quem pode levar este veículo hoje.)`, opcoes }),
        interativoDaEscolha(opcoes, { cancelar: 'Não registrar a saída' }))
    }
    return perguntar({ ...d, etapa: 'condutor' }, `Quem vai dirigir *${veiculo.nome}*? Escreva o nome do condutor, ou *cancelar*.`)
  }

  if (d.km === undefined) return perguntar({ ...d, etapa: 'km' }, textoPedeHodometro({ veiculo: veiculo.nome, acao: 'saida', km: veiculo.km }), botoesDoHodometro(veiculo.km))
  if (!d.finalidade) {
    const opcoes: Opcao[] = FINALIDADES_NA_CONVERSA.map((f) => ({ nome: FINALIDADES_DE_USO[f] }))
    return perguntar({ ...d, etapa: 'finalidade' }, textoDaEscolha({ pergunta: 'Qual é a finalidade da viagem?', opcoes }), interativoDaEscolha(opcoes, { cancelar: 'Não registrar a saída' }))
  }
  if (!d.destino) return perguntar({ ...d, etapa: 'destino' }, TEXTO_PEDE_DESTINO)
  return perguntar({ ...d, etapa: 'conferencia' },
    textoDaConferenciaDaSaida({ veiculo: veiculo.nome, condutor: d.condutor.nome, km: d.km, finalidade: d.finalidade, destino: d.destino }), BOTOES_DA_CONFERENCIA)
}

/** A próxima pergunta do retorno, até a conferência. `busca`: o que a pessoa escreveu para achar o veículo. */
async function proximaDoRetorno(admin: Admin, workspaceId: string, d: DadosDaViagem, base: string, pendenciaId?: number, busca?: string): Promise<Resposta> {
  const perguntar = (dados: DadosDaViagem, texto: string, interativo: Interativo | null = null): Resposta =>
    ({ texto, pergunta: { tipo: 'frota_retorno', dados, id: pendenciaId }, interativo })
  const frotaNaTela = `${base}/patrimonio/frota`

  if (!d.veiculo || !d.uso) {
    const frota = await veiculosDoEspaco(admin, workspaceId)
    if (!frota) return { texto: `Não consegui ler a frota agora. Registre pela tela: ${frotaNaTela}` }
    const emViagem = frota.filter((v) => v.uso)
    const escolhido = (v: VeiculoDaFrota) => proximaDoRetorno(admin, workspaceId, { ...d, veiculo: naConversa(v), uso: usoNaConversa(v), opcoes: undefined, usos: undefined }, base, pendenciaId)
    if (busca) {
      const achados = acharVeiculo(frota, busca)
      const viajando = achados.filter((v) => v.uso)
      if (viajando.length === 1) return escolhido(viajando[0])
      if (viajando.length > 1 && viajando.length <= NA_ESCOLHA) return escolherVeiculo('frota_retorno', d, viajando, `Achei mais de um veículo em viagem com “${busca}”. Qual voltou?`, pendenciaId)
      if (achados.length === 1) return { texto: `*${nomeDoVeiculo(achados[0])}* não está em viagem: não há retorno a registrar. ${frotaNaTela}/${achados[0].id}` }
      if (achados.length && !viajando.length) return { texto: `Nenhum veículo com “${busca}” está em viagem agora. A frota: ${frotaNaTela}` }
      if (viajando.length > NA_ESCOLHA) return perguntar({ ...d, etapa: 'veiculo' }, `Achei ${viajando.length} veículos em viagem com “${busca}”. Escreva a placa (ou o fim dela), ou *cancelar*.`)
      return perguntar({ ...d, etapa: 'veiculo' }, `Não achei “${busca}” na frota. Escreva a placa (ou o fim dela, como _1D23_) ou o apelido do veículo, ou *cancelar*.`)
    }
    if (!emViagem.length) return { texto: `Nenhum veículo está em viagem agora: não há retorno a registrar. A frota: ${frotaNaTela}` }
    // Um só em viagem: é ele (a próxima pergunta e a conferência dizem qual).
    if (emViagem.length === 1) return escolhido(emViagem[0])
    if (emViagem.length <= NA_ESCOLHA) return escolherVeiculo('frota_retorno', d, emViagem, 'Qual veículo voltou?', pendenciaId)
    return perguntar({ ...d, etapa: 'veiculo' }, 'Qual veículo voltou? Escreva a placa (ou o fim dela) ou o apelido, ou *cancelar*.')
  }

  if (d.km === undefined) return perguntar({ ...d, etapa: 'km' }, textoPedeHodometro({ veiculo: d.veiculo.nome, acao: 'retorno', km: d.uso.kmSaida }))
  if (d.observacao === undefined) return perguntar({ ...d, etapa: 'ocorrencias' }, TEXTO_PEDE_OCORRENCIAS, BOTOES_DOS_DETALHES)
  return perguntar({ ...d, etapa: 'conferencia' }, textoDaConferenciaDoRetorno({
    veiculo: d.veiculo.nome, kmSaida: d.uso.kmSaida, km: d.km, observacao: d.observacao, condutor: d.uso.condutor, destino: d.uso.destino,
  }), BOTOES_DA_CONFERENCIA)
}

/**
 * A resposta à pergunta aberta da saída ou do retorno. `estrita` = a pessoa citou a pergunta: o que não serve é
 * pedido de novo; sem citar, devolve null e segue como mensagem comum.
 */
export async function seguirViagem(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDaViagem
  const saida = p.tipo === 'frota_saida'
  const deNovo = (t: string) => (estrita ? { texto: t } : null)
  const avancar = async (dados: DadosDaViagem, busca?: string) => {
    const r = saida ? await proximaDaSaida(admin, workspaceId, pessoa, dados, base, p.id, busca) : await proximaDoRetorno(admin, workspaceId, dados, base, p.id, busca)
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }
  const numero = lerEscolha(texto, 99) !== null
  const livre = texto.replace(/\s+/g, ' ').trim()

  if (d.etapa === 'veiculo') {
    const n = d.opcoes ? lerEscolha(texto, d.opcoes.length) : null
    if (n && d.opcoes) return avancar({ ...d, veiculo: d.opcoes[n - 1], uso: d.usos?.[n - 1], opcoes: undefined, usos: undefined })
    // Na lista, também vale escrever a placa ou o apelido em vez do número.
    if (livre.length < 2 || numero) return deNovo(d.opcoes ? `Responda com o número do veículo (1 a ${d.opcoes.length}), ou *cancelar*.` : 'Escreva a placa (ou o fim dela) ou o apelido do veículo, ou *cancelar*.')
    return avancar({ ...d, opcoes: undefined, usos: undefined }, livre.slice(0, 80))
  }
  if (d.etapa === 'condutor' && d.veiculo) {
    const n = d.condutores ? lerEscolha(texto, d.condutores.length) : null
    if (n && d.condutores) return avancar({ ...d, condutor: { id: d.condutores[n - 1].id, nome: d.condutores[n - 1].nome }, condutores: undefined })
    if (livre.length < 2 || numero) return deNovo(d.condutores ? `Responda com o número de quem vai dirigir (1 a ${d.condutores.length}), ou *cancelar*.` : 'Escreva o nome de quem vai dirigir, ou *cancelar*.')
    return avancar({ ...d, condutores: undefined }, livre.slice(0, 80))
  }
  if (d.etapa === 'km' && d.veiculo) {
    const kmAtual = d.veiculo.km
    const minimo = saida ? kmAtual : d.uso?.kmSaida ?? kmAtual
    const lido = lerHodometroDaConversa(texto, saida ? kmAtual : null)
    if (lido === null) return deNovo(saida ? 'Responda o hodômetro só com números (ex.: _52100_), *mesmo* para manter, ou *cancelar*.' : 'Responda o hodômetro só com números (ex.: _52180_), ou *cancelar*.')
    if (lido < minimo) return deNovo(`O hodômetro não pode marcar menos que ${saida ? 'o último registro' : 'o da saída'} (${minimo.toLocaleString('pt-BR')} km). Confira e responda de novo, ou *cancelar*.`)
    if (lido > Math.max(kmAtual, minimo) + SALTO_MAXIMO_KM) return deNovo(`São ${(lido - Math.max(kmAtual, minimo)).toLocaleString('pt-BR')} km a mais que o último registro: confira o hodômetro e responda de novo, ou *cancelar*.`)
    return avancar({ ...d, km: lido })
  }
  if (d.etapa === 'finalidade' && saida) {
    const n = lerEscolha(texto, FINALIDADES_NA_CONVERSA.length)
    if (!n) return deNovo(`Responda com o número da finalidade (1 a ${FINALIDADES_NA_CONVERSA.length}), ou *cancelar*.`)
    return avancar({ ...d, finalidade: FINALIDADES_NA_CONVERSA[n - 1] })
  }
  if (d.etapa === 'destino' && saida) {
    if (livre.length < 2 || numero) return deNovo('Escreva para onde o veículo vai, ou *cancelar*.')
    return avancar({ ...d, destino: livre.slice(0, 200) })
  }
  if (d.etapa === 'ocorrencias' && !saida) {
    const pula = ehPular(texto)
    const observacao = pula ? '' : texto.trim().replace(/[ \t]+/g, ' ').slice(0, 1000)
    if (!pula && (observacao.length < 2 || numero)) return deNovo('Escreva a ocorrência em poucas palavras, ou responda *pular*.')
    return avancar({ ...d, observacao })
  }
  const completo = saida ? Boolean(d.veiculo && d.condutor && d.km !== undefined && d.finalidade && d.destino) : Boolean(d.veiculo && d.uso && d.km !== undefined && d.observacao !== undefined)
  if (d.etapa !== 'conferencia' || !completo) {
    await encerrarPendencia(admin, p.id)
    return { texto: `Não consegui continuar. Registre pela tela: ${base}/patrimonio/frota${d.veiculo ? `/${d.veiculo.id}` : ''}` }
  }

  if (!ehConfirmacao(texto)) return estrita ? { texto: `Para registrar ${saida ? 'a saída' : 'o retorno'}, responda a conferência com *confirmo*; para desistir, *cancelar*.` } : null
  if (!await encerrarPendencia(admin, p.id)) return { texto: `${saida ? 'Esta saída' : 'Este retorno'} já foi registrado.` }
  const tela = `${base}/patrimonio/frota/${d.veiculo?.id ?? ''}`
  if (await nivelNoPatrimonio(admin, workspaceId, pessoa) < 2 || !await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${tela}` }
  return saida ? registrarSaida(admin, workspaceId, pessoa, d, tela) : registrarRetorno(admin, workspaceId, pessoa, d, tela)
}

/** A mensagem do banco (P0001 é a recusa de regra, com o texto para a pessoa) ou a genérica. */
const doBanco = (error: { code?: string; message?: string }, padrao: string) => (error.code === 'P0001' && error.message ? error.message : padrao)

/** Grava pela mesma conferência e pela mesma função da tela (pedidoDeSaida e frota_sair, como quem escreveu). */
async function registrarSaida(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaViagem, tela: string): Promise<Resposta> {
  if (!d.veiculo || !d.condutor || d.km === undefined || !d.finalidade || !d.destino) return { texto: `Não consegui continuar. Registre pela tela: ${tela}` }
  let pedido: ReturnType<typeof pedidoDeSaida>
  try {
    pedido = pedidoDeSaida(d.veiculo.id, { condutor_id: d.condutor.id, km_saida: String(d.km), destino: d.destino, finalidade: d.finalidade, projeto_id: '' })
  } catch (causa) {
    return { texto: `${causa instanceof Error ? causa.message : 'Não foi possível registrar a saída.'} ${tela}` }
  }
  const { error } = await admin.rpc('whatsapp_frota_sair', { p_user_id: pessoa.id, p_workspace_id: workspaceId, p: pedido })
  if (semFuncao(error)) return { texto: `${INDISPONIVEL}: ${tela}` }
  if (error) return { texto: `${doBanco(error, 'Não foi possível registrar a saída.')} ${tela}` }
  return {
    texto: `Pronto: saída de *${d.veiculo.nome}* registrada às ${hora(new Date().toISOString())}, com ${d.condutor.nome}, para ${d.destino}. Na volta, escreva *retorno ${placaLegivel(d.veiculo.placa)}*. ${tela}`,
  }
}

/** Grava pela mesma conferência e pela mesma função da tela (pedidoDeRetorno e frota_retornar) e avisa a manutenção vencida como o botão. */
async function registrarRetorno(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDaViagem, tela: string): Promise<Resposta> {
  if (!d.veiculo || !d.uso || d.km === undefined) return { texto: `Não consegui continuar. Registre pela tela: ${tela}` }
  let pedido: ReturnType<typeof pedidoDeRetorno>
  try {
    pedido = pedidoDeRetorno(d.uso.id, { km_retorno: String(d.km), observacao: d.observacao ?? '' })
  } catch (causa) {
    return { texto: `${causa instanceof Error ? causa.message : 'Não foi possível registrar o retorno.'} ${tela}` }
  }
  const { data, error } = await admin.rpc('whatsapp_frota_retornar', { p_user_id: pessoa.id, p_workspace_id: workspaceId, p: pedido })
  if (semFuncao(error)) return { texto: `${INDISPONIVEL}: ${tela}` }
  if (error || !data) return { texto: `${error ? doBanco(error, 'Não foi possível registrar o retorno.') : 'Não foi possível registrar o retorno.'} ${tela}` }
  const r = data as RetornoDaViagem
  const planos = r.planos_vencidos ?? []
  if (planos.length) await avisarManutencaoVencida(admin, { workspaceId, veiculoId: d.veiculo.id, atorId: pessoa.id, planos })
  return { texto: textoDoRetornoRegistrado({ veiculo: d.veiculo.nome, kmRodado: Number(r.km_rodado ?? d.km - d.uso.kmSaida), planos, link: tela }) }
}
