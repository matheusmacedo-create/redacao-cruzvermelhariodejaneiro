import type { Interativo } from '../regras'
import {
  LIMITES, TEXTOS_FIXOS, hashDoPlano, interativoDoPlano, redigirPassos, textoDaRevalidacao, textoDoPlano, textoDoPlanoQueNaoVale, textoDoRecibo,
  type Passo, type PlanoAberto, type ResultadoDaAcao, type ResultadoDoPasso, type TipoDeAcao,
} from './regras'

/**
 * O ciclo de vida do plano do assistente (e da pergunta), sem banco: as transições, a confirmação e a execução,
 * sobre um repositório injetado. No servidor, o repositório é o do Supabase (plano.ts); nos testes,
 * repoEmMemoria(). Conferido por `npx tsx scripts/conferir-assistente.ts` (inclusive a corrida "tira a segunda" ×
 * "confirmo") e, o caso do dono de ponta a ponta, por `npx tsx scripts/conferir-assistente-escrita.ts`.
 *
 *   guardar (hash, 15 min) → entregar (sem fila) ─┬─ não saiu → cancelado + redigido
 *                                                  └─ saiu → aberto (mensagens, entregueEm)
 *   aberto ── mensagem ao assistente → em_revisao ─┬─ plano ou pergunta nova → substituido + redigido
 *                                                  ├─ erro, prazo ou texto fixo → rearmar → aberto (com o lembrete)
 *                                                  └─ texto do modelo → o plano de novo, pelo código → rearmar → aberto
 *   aberto ── confirmo válido → (sensível ? no_palacio : executando) → revalidar → executar → executado | parcial | falhou → redigido
 *   no_palacio (o link, mais 15 min) ── "Confirmar" na página → executando (pela sessão) → o mesmo caminho; vencido (faxina)
 *   pergunta / aberto / em_revisao ── cancelar → cancelado; plano ou pergunta nova → substituido; vencido (faxina)
 *   no_palacio ── "cancelar" (escrito, citando o plano, ou o botão Cancelar dele) → cancelado; o "confirmo" manda ao link
 *
 * Toda transição é um update condicional pela situação (o repositório devolve a linha só se mudou): dois
 * "confirmo" seguidos, ou "confirmo" junto de uma correção, não executam nada duas vezes nem um plano em revisão.
 * Os textos de ação são redigidos na hora, em toda saída de "aberto".
 */

export type SituacaoDoPlano =
  | 'pergunta' | 'aberto' | 'em_revisao' | 'no_palacio' | 'executando' | 'executado' | 'parcial' | 'falhou'
  | 'cancelado' | 'substituido' | 'vencido'

/** Abertas: no máximo uma por pessoa (índice único no banco). */
export const SITUACOES_ABERTAS: readonly SituacaoDoPlano[] = ['pergunta', 'aberto', 'em_revisao']
/** Encerradas: os textos de ação já foram (ou vão ser, pela faxina) redigidos. */
export const SITUACOES_ENCERRADAS: readonly SituacaoDoPlano[] = ['executado', 'parcial', 'falhou', 'cancelado', 'substituido', 'vencido']

/** Uma linha de whatsapp_ia_planos (datas em ISO). */
export type PlanoGuardado = {
  id: string; workspaceId: string; userId: string; numero: string; papel: string
  situacao: SituacaoDoPlano
  passos: Passo[]; opcoes: string[]; permitidas: TipoDeAcao[]; pedidoEmAberto: string | null
  hash: string | null; sensivel: boolean
  /** As mensagens do WhatsApp que mostraram o plano (o plano e os lembretes), até LIMITES.mensagensDoPlano. */
  mensagens: string[]
  entregueEm: string | null
  resultado: ResultadoDoPasso[]
  redigidoEm: string | null; criadoEm: string; expiraEm: string; atualizadoEm: string
}

export type NovoPlano = {
  workspaceId: string; userId: string; numero: string; papel: string
  tipo: 'plano' | 'pergunta'
  passos: Passo[]; opcoes: string[]; permitidas: TipoDeAcao[]; pedidoEmAberto: string | null; sensivel: boolean
}

export type MudancaDoPlano = Partial<Pick<PlanoGuardado, 'situacao' | 'passos' | 'pedidoEmAberto' | 'mensagens' | 'entregueEm' | 'resultado' | 'redigidoEm' | 'atualizadoEm' | 'expiraEm'>>

/** O que o fluxo precisa do banco. Cada `mudar` é um update condicional: devolve a linha só se ela estava numa das situações `de`. */
export interface RepositorioDePlanos {
  /** null se o banco recusou (o índice único: já há um plano ou pergunta aberta da pessoa). */
  inserir(p: Omit<PlanoGuardado, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<PlanoGuardado | null>
  buscar(id: string): Promise<PlanoGuardado | null>
  /** O plano ou a pergunta aberta (pergunta, aberto ou em_revisao) da pessoa. */
  abertoDaPessoa(userId: string): Promise<PlanoGuardado | null>
  /** O plano da pessoa que saiu nesta mensagem do WhatsApp, em qualquer situação. */
  daMensagem(userId: string, mensagemId: string): Promise<PlanoGuardado | null>
  /** O último plano ou pergunta encerrado da pessoa (para a janela de LIMITES.recenteMin). */
  ultimoEncerrado(userId: string): Promise<PlanoGuardado | null>
  /** O plano da pessoa que espera a confirmação no Palácio e ainda vale (expiraEm > vigenteEm): o "cancelar" o alcança. */
  noPalacioDaPessoa(userId: string, vigenteEm: string): Promise<PlanoGuardado | null>
  /** `vigenteEm`: só se expiraEm > vigenteEm (o plano vencido não confirma, mesmo antes da faxina). */
  mudar(id: string, de: readonly SituacaoDoPlano[], mudanca: MudancaDoPlano, condicao?: { vigenteEm?: string }): Promise<PlanoGuardado | null>
  /** Todas as da pessoa numa das situações `de`; devolve as que mudaram. */
  mudarDaPessoa(userId: string, de: readonly SituacaoDoPlano[], mudanca: MudancaDoPlano): Promise<PlanoGuardado[]>
  /** Há entrada desta pessoa ao assistente (comando ia ou ia_escolha) enviada depois de `depoisDe` e até `ateMs`, fora esta mensagem? */
  mensagemNoMeio(userId: string, depoisDe: string, ateMs: number, excetoMensagemId: string | null): Promise<boolean>
}

export type EntradaDaConfirmacao = {
  /** O plano aberto como foi lido na rota (a confirmação relê e confere tudo). */
  plano: PlanoGuardado
  pessoaId: string
  /** `toque`: veio do botão Confirmar (com o id e o hash do plano): sem a espera de assentamento, que é do "confirmo" por texto. */
  mensagem: { id: string | null; enviadaEm: number | null; toque?: boolean }
  /** Pessoa ativa, papel, número, confiança do número e cotas de hoje (o servidor confere); o motivo se não vale, null se vale. */
  conferirIdentidade: (p: PlanoGuardado) => Promise<string | null>
  /** Cada passo de novo, com leituras novas (rodada aberta e sem voto, hash do conteúdo, destinatário ativo…). */
  revalidar: (passo: Passo, n: number) => Promise<ResultadoDaAcao>
  executar: (passo: Passo, n: number) => Promise<ResultadoDaAcao>
  urlBase: string
}

/** A confirmação na página do Palácio (app/confirmar/[token]): o plano que esperava o Palácio, pela sessão de quem pediu. */
export type EntradaNoPalacio = {
  planoId: string
  pessoaId: string
  workspaceId: string
  /** Pessoa ativa, papel, a escrita do assistente e as cotas de hoje (o servidor confere); o motivo se não vale, null se vale. */
  conferirIdentidade: (p: PlanoGuardado) => Promise<string | null>
  revalidar: (passo: Passo, n: number) => Promise<ResultadoDaAcao>
  executar: (passo: Passo, n: number) => Promise<ResultadoDaAcao>
  urlBase: string
}

/** Uma mensagem do fim de um turno de revisão: o texto, os botões, se leva o lembrete e se rearma o plano. */
export type MensagemDaRevisao = { texto: string; interativo: Interativo | null; lembrete: boolean; rearma: boolean }

/**
 * O que sai quando um turno de revisão acaba em resposta e nada substituiu o plano. O texto fixo (do código: o erro,
 * o "Não fiz nada ainda") sai com o lembrete e rearma o plano. O texto do modelo sai sozinho — sem o lembrete e sem
 * rearmar: "Tirei a segunda" não tirou nada — e o código manda o plano em revisão de novo, com os botões, numa
 * mensagem própria; só ela rearma (citá-la é citar o plano, e a hora dela vale para o "confirmo"). O que leva à
 * confirmação é sempre o texto do código.
 */
export function mensagensDaRevisao(resposta: { texto: string; fixo: boolean }, plano: Pick<PlanoGuardado, 'id' | 'hash' | 'passos' | 'sensivel'>): MensagemDaRevisao[] {
  if (resposta.fixo) return [{ texto: resposta.texto, interativo: null, lembrete: true, rearma: true }]
  return [
    { texto: resposta.texto, interativo: null, lembrete: false, rearma: false },
    { texto: textoDoPlano({ passos: plano.passos, sensivel: plano.sensivel }).texto, interativo: plano.hash ? interativoDoPlano(plano.id, plano.hash) : null, lembrete: false, rearma: true },
  ]
}

export type DesfechoDaConfirmacao =
  | { tipo: 'nada'; texto: string }
  | { tipo: 'no_palacio'; plano: PlanoGuardado }
  | { tipo: 'executado' | 'parcial' | 'falhou'; texto: string; plano: PlanoGuardado }

const dormirDeVerdade = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

export function criarFluxoDoPlano(repo: RepositorioDePlanos, relogio: () => number = Date.now, dormir: (ms: number) => Promise<void> = dormirDeVerdade) {
  const iso = (ms: number = relogio()) => new Date(ms).toISOString()
  const redigido = (passos: Passo[]): MudancaDoPlano => ({ ...redigirPassos(passos), redigidoEm: iso() })

  /** Muda a situação e, se mudou, redige na hora (a segunda gravação só acha a linha na situação nova). */
  async function encerrarUm(id: string, de: readonly SituacaoDoPlano[], para: SituacaoDoPlano, extra: MudancaDoPlano = {}): Promise<PlanoGuardado | null> {
    const linha = await repo.mudar(id, de, { ...extra, situacao: para, atualizadoEm: iso() })
    if (!linha) return null
    return (await repo.mudar(id, [para], redigido(linha.passos))) ?? linha
  }

  async function encerrarDaPessoa(userId: string, para: SituacaoDoPlano, de: readonly SituacaoDoPlano[] = SITUACOES_ABERTAS): Promise<PlanoGuardado[]> {
    const linhas = await repo.mudarDaPessoa(userId, de, { situacao: para, atualizadoEm: iso() })
    return Promise.all(linhas.map(async (l) => (await repo.mudar(l.id, [para], redigido(l.passos))) ?? l))
  }

  /**
   * O plano já consumido (em "executando"): revalida TODOS os passos com leituras novas antes de executar o primeiro,
   * executa em ordem e para no primeiro `ok: false` (os seguintes ficam "nao_feito"), e redige na hora. É o mesmo
   * caminho do "confirmo" pelo WhatsApp e do "Confirmar" na página do Palácio.
   */
  async function executarConsumido(linha: PlanoGuardado, e: Pick<EntradaDaConfirmacao, 'revalidar' | 'executar' | 'urlBase'>, falhar: (texto: string) => Promise<DesfechoDaConfirmacao>, naoFuiEu: boolean): Promise<DesfechoDaConfirmacao> {
    const total = linha.passos.length
    for (const [i, passo] of linha.passos.entries()) {
      let r: ResultadoDaAcao
      try { r = await e.revalidar(passo, i + 1) } catch { r = { ok: false, codigo: 'erro', texto: 'não deu para conferir agora' } }
      if (!r.ok) return falhar(textoDaRevalidacao(i + 1, r.texto, total))
    }

    const resultados: (ResultadoDoPasso & { texto?: string; link?: string })[] = []
    for (const [i, passo] of linha.passos.entries()) {
      let r: ResultadoDaAcao
      try { r = await e.executar(passo, i + 1) } catch { r = { ok: false, codigo: 'erro', texto: 'Erro inesperado.' } }
      resultados.push(r.ok ? { n: i + 1, ok: true, codigo: r.codigo, ...(r.link ? { link: r.link } : {}) } : { n: i + 1, ok: false, codigo: r.codigo, texto: r.texto })
      await repo.mudar(linha.id, ['executando'], { resultado: resultados.map(({ n, ok, codigo }) => ({ n, ok, codigo })), atualizadoEm: iso() })
      if (!r.ok) {
        for (let n = i + 2; n <= total; n++) resultados.push({ n, ok: false, codigo: 'nao_feito' })
        break
      }
    }
    const feitos = resultados.filter((r) => r.ok).length
    const situacao: 'executado' | 'parcial' | 'falhou' = feitos === total ? 'executado' : feitos ? 'parcial' : 'falhou'
    const final = await encerrarUm(linha.id, ['executando'], situacao, { resultado: resultados.map(({ n, ok, codigo }) => ({ n, ok, codigo })) })
    return { tipo: situacao, texto: textoDoRecibo({ passos: linha.passos, resultados, urlBase: e.urlBase, naoFuiEu }), plano: final ?? linha }
  }

  /** O plano não confere com quem confirma (outra pessoa, outro espaço, ou os passos mexidos depois do hash). */
  const naoConfere = (linha: PlanoGuardado, pessoaId: string, workspaceId?: string) =>
    linha.userId !== pessoaId || (workspaceId !== undefined && linha.workspaceId !== workspaceId) || !linha.hash
    || hashDoPlano({ userId: linha.userId, workspaceId: linha.workspaceId, passos: linha.passos }) !== linha.hash

  return {
    /**
     * O plano ou a pergunta da pessoa e o que a mensagem citou (lerRespostaAoPlano decide o resto). Plano vencido
     * pela hora conta como fechado, mesmo antes da faxina. Sem plano aberto, o que espera o Palácio (`noPalacio`):
     * citar as mensagens dele é citar o plano, e o "cancelar" chega a ele. `citacaoResolvida`: o bot reconheceu a
     * citada (um aviso, uma pendência, uma pergunta vencida).
     */
    async abertoPara(userId: string, citada: string | null, opcoes: { citacaoResolvida?: boolean } = {}): Promise<{ aberto: PlanoAberto; plano: PlanoGuardado | null }> {
      const agora = relogio()
      const lido = await repo.abertoDaPessoa(userId)
      const plano = lido && Date.parse(lido.expiraEm) > agora ? lido : null
      const noPalacio = plano ? null : await repo.noPalacioDaPessoa(userId, iso(agora))
      let citacao: PlanoAberto['citacao'] = 'nenhuma'
      if (citada) {
        if (plano?.mensagens.includes(citada) || noPalacio?.mensagens.includes(citada)) citacao = 'plano'
        else if (await repo.daMensagem(userId, citada)) citacao = 'plano_velho'
        else citacao = opcoes.citacaoResolvida ? 'outra' : 'desconhecida'
      }
      // Vencido pela hora e ainda não marcado pela faxina: conta como encerrado na hora em que venceu.
      const ultimo = plano ? null : lido ? { ...lido, situacao: 'vencido' as const, atualizadoEm: lido.expiraEm } : await repo.ultimoEncerrado(userId)
      const quando = ultimo ? Date.parse(ultimo.atualizadoEm) : NaN
      const recente = ultimo && agora - quando < LIMITES.recenteMin * 60_000 ? { situacao: ultimo.situacao, atualizadoEm: quando } : null
      return {
        plano,
        aberto: {
          plano: plano ? {
            id: plano.id, situacao: plano.situacao as 'pergunta' | 'aberto' | 'em_revisao', hash: plano.hash, opcoes: plano.opcoes,
            entregueEm: plano.entregueEm ? Date.parse(plano.entregueEm) : null,
          } : null,
          citacao,
          recente,
          noPalacio: noPalacio ? { id: noPalacio.id } : null,
        },
      }
    },

    /** Guarda o plano (ou a pergunta) novo: o que estava aberto vira "substituido" e é redigido antes. null se o banco recusou. */
    async guardar(novo: NovoPlano): Promise<PlanoGuardado | null> {
      await encerrarDaPessoa(novo.userId, 'substituido')
      return repo.inserir({
        workspaceId: novo.workspaceId, userId: novo.userId, numero: novo.numero, papel: novo.papel,
        situacao: novo.tipo === 'pergunta' ? 'pergunta' : 'aberto',
        passos: novo.passos, opcoes: novo.opcoes, permitidas: novo.permitidas, pedidoEmAberto: novo.pedidoEmAberto,
        hash: novo.tipo === 'plano' ? hashDoPlano({ userId: novo.userId, workspaceId: novo.workspaceId, passos: novo.passos }) : null,
        sensivel: novo.sensivel, mensagens: [], entregueEm: null, resultado: [], redigidoEm: null,
        expiraEm: iso(relogio() + LIMITES.planoValeMin * 60_000),
      })
    },

    /**
     * Saiu: as mensagens que mostraram o plano (o texto e, acima de 1.024 caracteres, a dos botões) e a hora da
     * entrega (o "confirmo" só vale escrito depois dela). Citar qualquer uma é citar o plano.
     */
    marcarEntrega(id: string, mensagens: string | null | (string | null)[]): Promise<PlanoGuardado | null> {
      const ids = (Array.isArray(mensagens) ? mensagens : [mensagens]).filter((m): m is string => Boolean(m)).slice(0, LIMITES.mensagensDoPlano)
      return repo.mudar(id, ['aberto', 'pergunta'], { mensagens: [...new Set(ids)], entregueEm: iso(), atualizadoEm: iso() })
    },

    /** Não saiu na hora: cancelado e redigido (o plano nunca espera na fila). */
    entregaFalhou(id: string): Promise<PlanoGuardado | null> {
      return encerrarUm(id, SITUACOES_ABERTAS, 'cancelado')
    },

    /** Uma mensagem foi ao assistente com o plano aberto: em revisão ANTES de qualquer espera (o "confirmo" em paralelo não executa). */
    marcarEmRevisao(id: string): Promise<PlanoGuardado | null> {
      return repo.mudar(id, ['aberto'], { situacao: 'em_revisao', atualizadoEm: iso() })
    },

    /**
     * O turno acabou sem plano novo: volta a "aberto", com as mensagens do código que saíram agora (o lembrete, ou o
     * plano de novo e os botões: mensagensDaRevisao) na lista e a entrega nova. A expiração fica.
     */
    async rearmar(id: string, mensagens: string | null | (string | null)[]): Promise<PlanoGuardado | null> {
      const atual = await repo.buscar(id)
      if (!atual || atual.situacao !== 'em_revisao') return null
      const ids = [...new Set((Array.isArray(mensagens) ? mensagens : [mensagens]).filter((m): m is string => Boolean(m)))]
      return repo.mudar(id, ['em_revisao'], {
        situacao: 'aberto',
        mensagens: ids.length ? [...atual.mensagens.filter((m) => !ids.includes(m)), ...ids].slice(-LIMITES.mensagensDoPlano) : atual.mensagens,
        entregueEm: ids.length ? iso() : atual.entregueEm,
        atualizadoEm: iso(),
      })
    },

    /** "cancelar" (e "esquece"): o que estiver aberto (pergunta, plano ou em revisão) ou esperando o Palácio vira "cancelado", redigido. */
    cancelar(userId: string): Promise<PlanoGuardado[]> {
      return encerrarDaPessoa(userId, 'cancelado', [...SITUACOES_ABERTAS, 'no_palacio'])
    },

    /** Uma pergunta do bot (ou um plano novo) toma o lugar: "substituido", redigido. */
    substituir(userId: string): Promise<PlanoGuardado[]> {
      return encerrarDaPessoa(userId, 'substituido')
    },

    /**
     * O plano sensível que seguiu para o Palácio e não ganhou o link (a confirmação no Palácio indisponível, ou links
     * demais na última hora): falhou, redigido na hora.
     */
    falharNoPalacio(id: string): Promise<PlanoGuardado | null> {
      return encerrarUm(id, ['no_palacio'], 'falhou')
    },

    /** Um turno que acabou sem plano e sem pergunta nova fecha a pergunta aberta (o plano aberto, não: ele rearma). */
    fecharPergunta(userId: string): Promise<PlanoGuardado[]> {
      return encerrarDaPessoa(userId, 'substituido', ['pergunta'])
    },

    /**
     * O "confirmo" (já com a vez da pessoa): assenta, confere se não chegou outra mensagem ao assistente no meio,
     * consome o plano de forma atômica, confere o hash e a pessoa, e — fora o sensível, que segue para o Palácio —
     * revalida TODOS os passos antes de executar o primeiro. Executa em ordem e para no primeiro `ok: false` (os
     * seguintes ficam "nao_feito"). Redige na hora, em todo desfecho.
     */
    async confirmar(e: EntradaDaConfirmacao): Promise<DesfechoDaConfirmacao> {
      const { plano } = e
      if (e.mensagem.enviadaEm !== null && !e.mensagem.toque) {
        const espera = Math.min(LIMITES.assentarMs, e.mensagem.enviadaEm + LIMITES.assentarMs - relogio())
        if (espera > 0) await dormir(espera)
      }
      if (plano.entregueEm && await repo.mensagemNoMeio(e.pessoaId, plano.entregueEm, e.mensagem.enviadaEm ?? relogio(), e.mensagem.id)) {
        return { tipo: 'nada', texto: TEXTOS_FIXOS.mensagem_no_meio }
      }

      // O sensível espera o Palácio pelo tempo do link (CONFIRMACAO_VALE_MIN), contado do "confirmo".
      const linha = await repo.mudar(plano.id, ['aberto'], plano.sensivel
        ? { situacao: 'no_palacio', atualizadoEm: iso(), expiraEm: iso(relogio() + LIMITES.noPalacioMin * 60_000) }
        : { situacao: 'executando', atualizadoEm: iso() }, { vigenteEm: iso() })
      if (!linha) {
        const atual = await repo.buscar(plano.id)
        return { tipo: 'nada', texto: atual?.situacao === 'em_revisao' ? TEXTOS_FIXOS.revisao : TEXTOS_FIXOS.velho }
      }
      const falhar = async (texto: string): Promise<DesfechoDaConfirmacao> => {
        const final = await encerrarUm(linha.id, ['executando', 'no_palacio'], 'falhou')
        return { tipo: 'falhou', texto, plano: final ?? linha }
      }

      if (naoConfere(linha, e.pessoaId)) return falhar('Nada foi feito: o plano não confere. Peça de novo se quiser.')
      const motivo = await e.conferirIdentidade(linha)
      if (motivo) return falhar(`Nada foi feito: ${motivo.replace(/[.\s]+$/, '')}. Peça de novo se quiser.`)
      if (linha.sensivel) return { tipo: 'no_palacio', plano: linha }
      // Confirmado pelo WhatsApp: o recibo oferece o "Não fui eu" (quem pegou o celular não age em silêncio).
      return executarConsumido(linha, e, falhar, true)
    },

    /**
     * O "Confirmar" na página do Palácio (já com a sessão de quem pediu, no nível das telas): COMEÇA pela transição
     * atômica no_palacio → executando (dois cliques ou duas abas não executam duas vezes; o link só marca o uso),
     * confere o hash, a pessoa e o espaço, e segue o mesmo caminho do "confirmo": revalida tudo, executa, redige.
     */
    async executarNoPalacio(e: EntradaNoPalacio): Promise<DesfechoDaConfirmacao> {
      const linha = await repo.mudar(e.planoId, ['no_palacio'], { situacao: 'executando', atualizadoEm: iso() }, { vigenteEm: iso() })
      if (!linha) return { tipo: 'nada', texto: textoDoPlanoQueNaoVale((await repo.buscar(e.planoId))?.situacao) }
      const falhar = async (texto: string): Promise<DesfechoDaConfirmacao> => {
        const final = await encerrarUm(linha.id, ['executando'], 'falhou')
        return { tipo: 'falhou', texto, plano: final ?? linha }
      }
      if (naoConfere(linha, e.pessoaId, e.workspaceId)) return falhar('Nada foi feito: o plano não confere. Peça de novo se quiser.')
      const motivo = await e.conferirIdentidade(linha)
      if (motivo) return falhar(`Nada foi feito: ${motivo.replace(/[.\s]+$/, '')}. Peça de novo se quiser.`)
      return executarConsumido(linha, e, falhar, false)
    },
  }
}

export type FluxoDoPlano = ReturnType<typeof criarFluxoDoPlano>

// ------------------------------------------------------------------ o repositório em memória (testes)

export type EntradaRegistrada = { userId: string; mensagemId: string | null; enviadaEm: number | null; comando: string }

/** O repositório dos testes: o mesmo contrato do banco (update condicional, índice único das abertas), em memória. */
export function repoEmMemoria(relogio: () => number = Date.now): RepositorioDePlanos & {
  linhas: PlanoGuardado[]; entradas: EntradaRegistrada[]; registrarEntrada(e: EntradaRegistrada): void
} {
  const linhas: PlanoGuardado[] = []
  const entradas: EntradaRegistrada[] = []
  let contador = 0
  const copia = (p: PlanoGuardado): PlanoGuardado => JSON.parse(JSON.stringify(p)) as PlanoGuardado
  const aplicar = (p: PlanoGuardado, m: MudancaDoPlano) => Object.assign(p, JSON.parse(JSON.stringify(m)) as MudancaDoPlano)
  const iso = () => new Date(relogio()).toISOString()
  return {
    linhas,
    entradas,
    registrarEntrada: (e) => { entradas.push(e) },
    async inserir(p) {
      if (SITUACOES_ABERTAS.includes(p.situacao) && linhas.some((l) => l.userId === p.userId && SITUACOES_ABERTAS.includes(l.situacao))) return null
      contador++
      const linha: PlanoGuardado = { ...(JSON.parse(JSON.stringify(p)) as typeof p), id: `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`, criadoEm: iso(), atualizadoEm: iso() }
      linhas.push(linha)
      return copia(linha)
    },
    async buscar(id) {
      const l = linhas.find((x) => x.id === id)
      return l ? copia(l) : null
    },
    async abertoDaPessoa(userId) {
      const l = linhas.find((x) => x.userId === userId && SITUACOES_ABERTAS.includes(x.situacao))
      return l ? copia(l) : null
    },
    async daMensagem(userId, mensagemId) {
      const l = linhas.find((x) => x.userId === userId && x.mensagens.includes(mensagemId))
      return l ? copia(l) : null
    },
    async ultimoEncerrado(userId) {
      const l = linhas.filter((x) => x.userId === userId && SITUACOES_ENCERRADAS.includes(x.situacao)).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))[0]
      return l ? copia(l) : null
    },
    async noPalacioDaPessoa(userId, vigenteEm) {
      const l = linhas.filter((x) => x.userId === userId && x.situacao === 'no_palacio' && x.expiraEm > vigenteEm).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0]
      return l ? copia(l) : null
    },
    async mudar(id, de, mudanca, condicao = {}) {
      const l = linhas.find((x) => x.id === id && de.includes(x.situacao) && (!condicao.vigenteEm || x.expiraEm > condicao.vigenteEm))
      if (!l) return null
      aplicar(l, mudanca)
      return copia(l)
    },
    async mudarDaPessoa(userId, de, mudanca) {
      return linhas.filter((x) => x.userId === userId && de.includes(x.situacao)).map((l) => copia(aplicar(l, mudanca)))
    },
    async mensagemNoMeio(userId, depoisDe, ateMs, excetoMensagemId) {
      const desde = Date.parse(depoisDe)
      return entradas.some((e) => e.userId === userId && e.mensagemId !== excetoMensagemId && e.enviadaEm !== null
        && e.enviadaEm > desde && e.enviadaEm <= ateMs && (e.comando === 'ia' || e.comando === 'ia_escolha'))
    },
  }
}
