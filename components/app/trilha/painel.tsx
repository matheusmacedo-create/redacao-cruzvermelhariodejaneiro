'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink, EyeOff, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { codigoEmGrupos, linkDeVerificacao, TIPOS } from '@/lib/auditoria/catalogo'
import {
  conferenciaAtrasada, diaLegivel, duracao, linkDaOrigem, linkDoBloco, loteAtrasado, numero, origemDaFalha, plural, quando,
  rotuloDoEstado, rotuloDoFluxo, rotuloDoTipo, tomDoEstado,
  type Conferencia, type DadosDoPainel, type FalhaNoPainel, type ItemRecente, type LoteNoPainel, type SituacaoDaChave,
} from './dados'
import { classeDoCabecalho, classeDoLink, Copiar, Rolagem, Secao, Selo } from './pecas'
import { ConsultaPorCodigo, useConsulta } from './consulta'
import { RodarAgora } from './rodar-agora'

/**
 * O painel da trilha pública (/trilha-publica): primeiro a saúde (a cadeia, os
 * números), depois o que dá para fazer (rodar agora, consultar um código) e,
 * por fim, o detalhe (lotes, registros recentes, falhas). Tudo aqui é leitura,
 * menos as três rodadas manuais — e elas também só acrescentam.
 */
export function PainelDaTrilha({ painel, chave, aberta, geradoEm }: {
  painel: DadosDoPainel
  chave: SituacaoDaChave
  /** AUDITORIA_ABERTA=1: a abertura ao público começou (docs/auditoria-publica.md §9). */
  aberta: boolean
  /** A hora do servidor ao montar a página: as contas de "atrasado" não dependem do relógio de quem abre. */
  geradoEm: string
}) {
  const consulta = useConsulta()
  return (
    <div className="flex flex-col gap-8">
      <Avisos chave={chave} aberta={aberta} />
      <Cadeia verificacao={painel.verificacao} geradoEm={geradoEm} />
      <Numeros totais={painel.totais} pendentes={painel.pendentes_de_lote} />
      <RodarAgora />
      <ConsultaPorCodigo {...consulta} />
      <Lotes lotes={painel.lotes} verificacao={painel.verificacao} chave={chave} geradoEm={geradoEm} />
      <Recentes recentes={painel.recentes} verHistorico={(codigo) => consulta.consultar(codigo, true)} />
      <Falhas falhas={painel.falhas} />
    </div>
  )
}

// ------------------------------------------------------------------ avisos

function Avisos({ chave, aberta }: { chave: SituacaoDaChave; aberta: boolean }) {
  const problema = chave.estado !== 'configurada'
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="flex items-start gap-3 p-4">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <h2 className="font-medium">{aberta ? 'Abertura em andamento' : 'Lançamento oculto'}</h2>
          <p className="mt-0.5 text-muted-foreground">
            {aberta
              ? 'AUDITORIA_ABERTA está ligada: as páginas de transparência e de canais oficiais já saem sem noindex. Os outros passos da abertura (a página /verificar/ do site, o menu, o selo nas matérias) estão no checklist de docs/auditoria-publica.md §9.'
              : 'A página pública de conferência (cruzvermelhariodejaneiro.org/verificar/) fica sem link no site, fora dos buscadores e fora do mapa do site até a abertura. Os links “Conferir” desta tela servem para testar; não divulgue antes da abertura (docs/auditoria-publica.md §9).'}
          </p>
        </div>
      </Card>
      <Card className={cn('flex items-start gap-3 p-4', problema && 'border-warning/50 bg-warning/10')}>
        <KeyRound className={cn('mt-0.5 size-4 shrink-0', problema ? 'text-warning-foreground' : 'text-muted-foreground')} aria-hidden="true" />
        <div className="min-w-0 text-sm">
          {chave.estado === 'configurada' ? (
            <>
              <h2 className="font-medium">Chave de assinatura configurada</h2>
              <p className="mt-0.5 text-muted-foreground">
                Impressão digital <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{chave.id}</code>. É ela que assina o
                manifesto de cada lote; a chave pública vai ao site em /verificar/chave-publica.pem.
              </p>
            </>
          ) : chave.estado === 'ausente' ? (
            <>
              <h2 className="font-medium">Chave de assinatura não configurada</h2>
              <p className="mt-0.5">
                Os lotes ficam sem assinatura até a variável <code className="font-mono text-xs">AUDITORIA_CHAVE_PRIVADA</code> ser definida na Vercel.
                Quando ela chegar, a rotina assina os lotes que ficaram para trás.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-medium">Chave de assinatura inválida</h2>
              <p className="mt-0.5">
                A variável <code className="font-mono text-xs">AUDITORIA_CHAVE_PRIVADA</code> existe, mas {chave.motivo === 'tipo' ? 'a chave não é Ed25519' : 'não é uma chave privada em PEM (PKCS#8) legível'}.
                Os lotes ficam sem assinatura até ela ser corrigida.
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------ cadeia

function Cadeia({ verificacao: v, geradoEm }: { verificacao: Conferencia | null; geradoEm: string }) {
  const atrasada = v ? conferenciaAtrasada(v.executado_em, geradoEm) : false
  const tempo = v ? duracao(v.duracao_ms) : null
  return (
    <Secao
      id="trilha-cadeia"
      titulo="Conferência da cadeia"
      descricao="Cada evento guarda o hash do anterior, fluxo por fluxo, e cada lote guarda o compromisso do lote de antes. A conferência refaz essas contas desde o primeiro registro: qualquer linha alterada direto no banco aparece aqui."
    >
      {!v ? (
        <Card className="flex items-start gap-3 p-5 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">A cadeia ainda não foi conferida. A rotina diária confere de madrugada; para não esperar, use “Conferir a cadeia agora”, em Rodar agora, mais abaixo.</p>
        </Card>
      ) : (
        <Card className={cn('overflow-hidden p-0', !v.ok && 'border-destructive/60 ring-1 ring-destructive/30')}>
          <div className={cn('flex items-start gap-3 p-5', v.ok ? 'bg-success/5' : 'bg-destructive/10')}>
            {v.ok
              ? <ShieldCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
              : <ShieldAlert className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {v.ok ? 'Cadeia íntegra' : 'Divergência na cadeia'}
                <Selo tom={v.ok ? 'ok' : 'erro'}>{v.ok ? 'Tudo confere' : 'Atenção'}</Selo>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Última conferência em {quando(v.executado_em)} · {numero(v.eventos)} {plural(v.eventos, 'evento', 'eventos')} em {numero(v.fluxos.length)} {plural(v.fluxos.length, 'fluxo', 'fluxos')}
                {' · '}
                {!v.lotes_ok ? <span className="font-medium text-destructive">lotes com divergência a partir de {diaLegivel(v.primeiro_lote_com_falha)}</span>
                  : v.lotes ? `${numero(v.lotes)} ${plural(v.lotes, 'lote conferido', 'lotes conferidos')}` : 'nenhum lote fechado ainda'}
                {tempo && ` · levou ${tempo}`}
              </p>
              {!v.ok && (
                <p className="mt-3 text-sm">
                  Algum registro não bate com o hash esperado: alguém alterou a trilha direto no banco, ou uma restauração de backup ficou incompleta.
                  Não apague nem corrija nada nas tabelas da trilha. Anote onde está a quebra (o fluxo e a posição na tabela abaixo, ou o primeiro lote
                  com divergência em Lotes diários) e compare com o backup mais recente (docs/auditoria-publica.md §8).
                </p>
              )}
              {atrasada && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  A última conferência tem mais de um dia e meio. A rotina deveria conferir toda madrugada: veja se o cron /api/auditoria/diaria está rodando na Vercel.
                </p>
              )}
            </div>
          </div>
          {v.fluxos.length > 0 && (
            <div className="border-t border-border">
              <Rolagem rotulo="Resultado por fluxo">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <caption className="sr-only">Resultado da última conferência, fluxo por fluxo</caption>
                  <thead>
                    <tr className={classeDoCabecalho}>
                      <th scope="col" className="px-5 py-2.5">Fluxo</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Eventos</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Última posição</th>
                      <th scope="col" className="px-5 py-2.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.fluxos.map((f) => (
                      <tr key={f.fluxo} className={cn('border-b border-border last:border-0', !f.ok && 'bg-destructive/5')}>
                        <th scope="row" className="px-5 py-2.5 text-left font-medium">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{f.fluxo}</span>{rotuloDoFluxo(f.fluxo)}
                        </th>
                        <td className="px-3 py-2.5 text-right tabular-nums">{numero(f.eventos)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{numero(f.ordem_final)}</td>
                        <td className="px-5 py-2.5">
                          {f.ok ? <Selo tom="ok">Íntegro</Selo>
                            : <Selo tom="erro">{f.primeira_quebra_ordem ? `Quebra na posição ${numero(f.primeira_quebra_ordem)}` : 'Divergência'}</Selo>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Rolagem>
            </div>
          )}
        </Card>
      )}
    </Secao>
  )
}

// ------------------------------------------------------------------ números

function Numeros({ totais, pendentes }: { totais: Record<string, number>; pendentes: number }) {
  // Os tipos do catálogo sempre aparecem (zero também informa); tipo novo do banco entra no fim, com o nome cru.
  const tipos = [...TIPOS, ...Object.keys(totais).filter((t) => !(TIPOS as readonly string[]).includes(t))]
  return (
    <Secao id="trilha-registros" titulo="Registros na trilha" descricao="Itens deste espaço registrados desde o início da trilha, por tipo.">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tipos.map((t) => (
          <Card key={t} className="flex flex-col-reverse justify-end gap-0.5 p-4">
            <dt className="text-sm text-muted-foreground">{rotuloDoTipo(t)}</dt>
            <dd className={cn('text-2xl font-bold tabular-nums', !totais[t] && 'text-muted-foreground')}>{numero(totais[t] ?? 0)}</dd>
          </Card>
        ))}
        <Card className={cn('flex flex-col-reverse justify-end gap-0.5 p-4', pendentes > 0 && 'border-info/40 bg-info/5')}>
          <dt className="text-sm text-muted-foreground">Aguardando o lote da próxima madrugada</dt>
          <dd className="text-2xl font-bold tabular-nums">{numero(pendentes)}</dd>
        </Card>
      </dl>
    </Secao>
  )
}

// ------------------------------------------------------------------ lotes

function Assinatura({ lote, chave }: { lote: LoteNoPainel; chave: SituacaoDaChave }) {
  if (!lote.assinado) return <Selo tom="aviso">Sem assinatura</Selo>
  const outra = lote.chave_id && chave.estado === 'configurada' && lote.chave_id !== chave.id
  return (
    <>
      <Selo tom="ok">Assinado</Selo>
      {outra && <span className="mt-1 block text-[11px] text-muted-foreground">com outra chave: <code className="font-mono">{lote.chave_id}</code></span>}
    </>
  )
}

function SeloDoBitcoin({ lote }: { lote: LoteNoPainel }) {
  if (lote.ots_estado === 'confirmado') {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Selo tom="ok">Confirmado</Selo>
        {lote.bloco !== null && (
          <a href={linkDoBloco(lote.bloco)} target="_blank" rel="noreferrer" className={cn(classeDoLink, 'text-xs')}>
            no bloco {numero(lote.bloco)}<span className="sr-only"> (mempool.space, abre em nova aba)</span><ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </span>
    )
  }
  return lote.ots_estado === 'enviado' ? <Selo tom="aviso">Enviado, aguardando bloco</Selo> : <Selo tom="neutro">Pendente, na fila</Selo>
}

function Lotes({ lotes, verificacao, chave, geradoEm }: { lotes: LoteNoPainel[]; verificacao: Conferencia | null; chave: SituacaoDaChave; geradoEm: string }) {
  const atrasado = loteAtrasado(lotes[0]?.dia ?? null, geradoEm)
  const comDivergencia = verificacao && !verificacao.lotes_ok ? verificacao.primeiro_lote_com_falha : null
  return (
    <Secao
      id="trilha-lotes"
      titulo="Lotes diários"
      descricao="Um por dia, fechado de madrugada e encadeado ao anterior (fecha mesmo sem registros, para ancorar as pontas das cadeias). Depois de fechado, o lote é assinado, carimbado por uma autoridade RFC 3161, ancorado no Bitcoin pelo OpenTimestamps e publicado em /verificar/lotes/ no site. Os 30 mais recentes."
    >
      {atrasado && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          O lote mais recente é de {diaLegivel(lotes[0].dia)}. A rotina fecha o lote de ontem toda madrugada: veja se o cron /api/auditoria/diaria está rodando na Vercel, ou use “Fechar e carimbar o lote de ontem agora”.
        </p>
      )}
      <Card className="overflow-hidden p-0">
        {!lotes.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lote fechado ainda. O primeiro sai na madrugada seguinte à primeira rodada da rotina.</p>
        ) : (
          <Rolagem rotulo="Lotes diários">
            <table className="w-full min-w-[60rem] border-collapse text-sm">
              <caption className="sr-only">Os 30 lotes mais recentes, do mais novo ao mais antigo</caption>
              <thead>
                <tr className={classeDoCabecalho}>
                  <th scope="col" className="px-4 py-2.5">Dia</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Itens</th>
                  <th scope="col" className="px-3 py-2.5">Assinatura</th>
                  <th scope="col" className="px-3 py-2.5">Carimbo RFC 3161</th>
                  <th scope="col" className="px-3 py-2.5">OpenTimestamps (Bitcoin)</th>
                  <th scope="col" className="px-3 py-2.5">Publicado no site</th>
                  <th scope="col" className="px-4 py-2.5">Último erro</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => {
                  const divergente = comDivergencia === l.dia
                  return (
                    <tr key={l.dia} className={cn('border-b border-border align-top last:border-0', divergente && 'bg-destructive/5')}>
                      <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold tabular-nums">
                        {diaLegivel(l.dia)}
                        {divergente && <span className="mt-1 block text-[11px] font-semibold text-destructive">primeiro lote com divergência</span>}
                        {l.compromisso && <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground" title={`Compromisso ${l.compromisso}`}>{l.compromisso.slice(0, 12)}…</span>}
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">{numero(l.itens)}</td>
                      <td className="px-3 py-3"><Assinatura lote={l} chave={chave} /></td>
                      <td className="px-3 py-3">{l.tsa ? <Selo tom="ok">Carimbado</Selo> : <Selo tom="neutro">Pendente</Selo>}</td>
                      <td className="px-3 py-3"><SeloDoBitcoin lote={l} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums">{l.publicado_em ? quando(l.publicado_em) : <Selo tom="aviso">Não publicado</Selo>}</td>
                      <td className="max-w-xs px-4 py-3 text-xs">
                        {l.ultimo_erro ? (
                          <>
                            <span className="line-clamp-3 break-words text-destructive" title={l.ultimo_erro}>{l.ultimo_erro}</span>
                            {l.tentativas > 0 && <span className="mt-0.5 block text-muted-foreground">{numero(l.tentativas)} {plural(l.tentativas, 'tentativa', 'tentativas')}</span>}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Card>
    </Secao>
  )
}

// ------------------------------------------------------------------ registros recentes

function Recentes({ recentes, verHistorico }: { recentes: ItemRecente[]; verHistorico: (codigo: string) => void }) {
  return (
    <Secao
      id="trilha-recentes"
      titulo="Registros recentes"
      descricao="Os 40 registros mais novos deste espaço. “Conferir” abre a página pública de conferência numa aba nova; “Histórico” mostra, na consulta acima, todos os eventos do registro."
    >
      <Card className="overflow-hidden p-0">
        {!recentes.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nada registrado ainda. Os registros entram sozinhos quando um ofício é assinado, um certificado é emitido, uma matéria vai ao site ou um comunicado é enviado.
          </p>
        ) : (
          <Rolagem rotulo="Registros recentes">
            <table className="w-full min-w-[62rem] border-collapse text-sm">
              <caption className="sr-only">Os 40 registros mais recentes deste espaço, do mais novo ao mais antigo</caption>
              <thead>
                <tr className={classeDoCabecalho}>
                  <th scope="col" className="px-4 py-2.5">Código</th>
                  <th scope="col" className="px-3 py-2.5">Tipo e título</th>
                  <th scope="col" className="px-3 py-2.5">Estado</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Versão</th>
                  <th scope="col" className="px-3 py-2.5">Registrado em</th>
                  <th scope="col" className="px-3 py-2.5">Lote</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Links</span></th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((r) => {
                  const origem = linkDaOrigem(r.tipo, r.referencia_id)
                  const emGrupos = codigoEmGrupos(r.codigo)
                  return (
                    <tr key={r.codigo} className="border-b border-border align-top last:border-0 hover:bg-muted/30">
                      <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-normal">
                        <span className="inline-flex items-center gap-0.5">
                          <code className="font-mono text-xs font-medium">{emGrupos}</code>
                          <Copiar valor={r.codigo} rotulo={`Copiar o código ${emGrupos}`} />
                        </span>
                      </th>
                      <td className="max-w-sm px-3 py-3">
                        <span className="block text-xs text-muted-foreground">{rotuloDoTipo(r.tipo)}</span>
                        {r.titulo_publico
                          ? <span className="block truncate font-medium" title={r.titulo_publico}>{r.titulo_publico}</span>
                          : <span className="block text-xs italic text-muted-foreground">sem título público</span>}
                      </td>
                      <td className="px-3 py-3"><Selo tom={tomDoEstado(r.estado)}>{rotuloDoEstado(r.estado)}</Selo></td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.versao}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground">{quando(r.registrado_em)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums">{r.lote ? diaLegivel(r.lote) : <Selo tom="neutro">Aguardando lote</Selo>}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <a href={linkDeVerificacao(r.codigo)} target="_blank" rel="noreferrer" className={classeDoLink}>
                            Conferir<span className="sr-only"> o registro {emGrupos} na página pública (abre em nova aba)</span><ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                          {origem && <Link href={origem.href} className={classeDoLink}>{origem.rotulo}</Link>}
                          <button type="button" onClick={() => verHistorico(r.codigo)} className={classeDoLink}>
                            Histórico<span className="sr-only"> do registro {emGrupos}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Card>
    </Secao>
  )
}

// ------------------------------------------------------------------ falhas

function Falhas({ falhas }: { falhas: FalhaNoPainel[] }) {
  return (
    <Secao
      id="trilha-falhas"
      titulo="Falhas de registro nos últimos 30 dias"
      descricao="Quando o registro na trilha falha, a operação principal (assinar, emitir, publicar, enviar) segue normalmente e a falha fica anotada aqui. A rotina diária tenta de novo, e “Registrar pendências agora” também. A lista guarda o histórico: uma falha já resolvida continua aparecendo."
    >
      <Card className="overflow-hidden p-0">
        {!falhas.length ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />Nenhuma falha nos últimos 30 dias.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {falhas.map((f) => {
              const origem = origemDaFalha(f.origem)
              const link = origem.tipo ? linkDaOrigem(origem.tipo, f.referencia_id) : null
              return (
                <li key={f.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="size-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />{origem.rotulo}
                    </p>
                    {f.ocorrido_em && <time dateTime={f.ocorrido_em} className="text-xs tabular-nums text-muted-foreground">{quando(f.ocorrido_em)}</time>}
                  </div>
                  <p className="break-words text-foreground/80">{f.erro || 'Sem mensagem de erro.'}</p>
                  {link && <Link href={link.href} className={cn(classeDoLink, 'self-start text-xs')}>{link.rotulo}</Link>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </Secao>
  )
}
