'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, ExternalLink, FileText, Image as Imagem, Loader2, Plus, ScanSearch, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import {
  aprovarComRestricao, concluirVerificacao, consultarSancoes, excluirArquivoDoVoluntario, lerDocumentoDoCandidato, marcarItem, pedirDocumentosAoCandidato,
  prepararEnvioDeArquivoDoVoluntario, registrarArquivoDoVoluntario, registrarContato, removerReferencia, salvarReferencia,
} from '@/app/actions/verificacao-do-candidato'
import { TAMANHO_MAXIMO, ehTipoAceito, tamanhoLegivel } from '@/lib/rh/regras'
import type { Nivel } from '@/lib/participantes/regras'
import {
  BASES_DA_CGU, CATEGORIAS_DE_DOCUMENTO, ESCOPOS, ITENS, LADOS, LINKS, NOMES_DAS_BASES, NOMES_DOS_ITENS, PARECERES, PARECERES_DA_REFERENCIA, RESTRICAO_OBRIGATORIA, RESTRICOES,
  SITUACOES_DO_ITEM, atestadoMaisNovo, chipDaVerificacao, dataCurta, ehRestricao, pendencias, problemaDaDecisao, situacaoDaRenovacao, situacaoDoItem, somarDias, travaDaAprovacao,
  verificacaoCompleta, type ArquivoDoVoluntario, type CanalDoPedido, type CategoriaDeDocumento, type Comparacao, type Escopo, type NomeDoItem, type Parecer, type Referencia,
  type Restricao, type SituacaoDoItem, type TomDoChip, type Verificacao,
} from '@/lib/participantes/verificacao/regras'

type R = { erro?: string }

/**
 * O quadro "Verificação do candidato" na ficha: pedir os documentos pelo
 * link, o checklist item a item (identidade, antecedentes, sanções, registro,
 * referências, entrevista), as pendências e a decisão. Identidade e
 * antecedentes só abrem para quem tem acesso a dados sensíveis (nível 3); o
 * resto é de quem gerencia (2). Sem biometria facial: quem confere compara
 * a foto do crachá com a do documento a olho.
 */
export type DadosDaVerificacao = {
  participanteId: string
  nome: string
  situacao: string
  nivel: Nivel
  verificacao: Verificacao | null
  arquivos: ArquivoDoVoluntario[]
  referencias: Referencia[]
  hoje: string
  fotoDoCracha: string | null
  temEmail: boolean
  temTelefone: boolean
  cguConfigurada: boolean
  claudePronto: boolean
}

const QUANDO = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')
const TOM: Record<TomDoChip, string> = { neutro: 'bg-muted text-muted-foreground', atencao: 'bg-warning/20 text-warning-foreground', ok: 'bg-success/15 text-success', erro: 'bg-destructive/10 text-destructive' }
const TOM_DO_ITEM: Record<SituacaoDoItem, string> = { pendente: TOM.neutro, conferido: TOM.ok, divergente: TOM.erro, dispensado: TOM.atencao }

function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<R>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar, setErro }
}
const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)

export function ChipDaVerificacao({ verificacao, hoje, className = '' }: { verificacao: Pick<Verificacao, 'estado' | 'parecer' | 'restricoes' | 'link_expira_em' | 'termo_aceito_em'> | null; hoje: string; className?: string }) {
  const c = chipDaVerificacao(verificacao, hoje)
  return <span data-chip-verificacao={c.rotulo} className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TOM[c.tom]} ${className}`}>{c.rotulo}</span>
}

/** O selo das restrições no cabeçalho da ficha. */
export function SeloDeRestricoes({ restricoes }: { restricoes: string[] }) {
  if (!restricoes.length) return null
  return (
    <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm" data-restricoes={restricoes.join(',')}>
      <ShieldCheck className="size-4" /><span className="font-medium">Atua com restrição:</span> {restricoes.map((r) => (ehRestricao(r) ? RESTRICOES[r].rotulo : r)).join('; ')}.
    </p>
  )
}

export function CardDaVerificacao(d: DadosDaVerificacao) {
  const v = d.verificacao
  const emAndamento = v?.estado === 'aberta' || v?.estado === 'enviada'
  const concluida = v?.estado === 'concluida'
  const podeGerenciar = d.nivel >= 2 && d.situacao !== 'desligado'
  const [anexando, setAnexando] = useState(false)
  const ativos = d.arquivos.filter((a) => !a.excluido_em)
  const faltas = emAndamento ? pendencias(v, d.arquivos, d.referencias, d.hoje) : []

  return (
    <div className="flex flex-col gap-4" data-verificacao={v?.estado ?? 'nenhuma'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChipDaVerificacao verificacao={v} hoje={d.hoje} />
          {v && <span className="text-xs text-muted-foreground">{ESCOPOS[v.escopo]}{v.enviado_em ? ` · documentos recebidos em ${QUANDO(v.enviado_em)}` : v.link_expira_em && v.estado === 'aberta' ? ` · link ${v.link_enviado_para ? `enviado para ${v.link_enviado_para}, ` : ''}vale até ${QUANDO(v.link_expira_em)}` : ''}</span>}
        </div>
        {podeGerenciar && (
          <div className="flex flex-wrap gap-2">
            {concluida && <Button size="sm" variant="outline" render={<a href={`/api/voluntariado/${d.participanteId}/verificacao/pdf`} target="_blank" rel="noopener" />}><Download className="size-3.5" />Parecer em PDF</Button>}
            <PedirDocumentos participanteId={d.participanteId} nome={d.nome} temEmail={d.temEmail} temTelefone={d.temTelefone} escopoPadrao={concluida || d.situacao !== 'candidato' ? 'renovacao' : 'completa'} situacao={d.situacao} />
            <Button size="sm" variant="outline" onClick={() => setAnexando((x) => !x)}><Plus className="size-3.5" />Anexar arquivo</Button>
          </div>
        )}
      </div>

      {!v && (
        <p className="text-sm text-muted-foreground">
          {d.situacao === 'candidato'
            ? 'Antes de aprovar, confira quem é a pessoa: peça os documentos pelo link (documento com foto, atestado de antecedentes e duas referências). Sem a verificação, a inscrição só é aprovada com a restrição “não atua com crianças e adolescentes”.'
            : 'Nenhuma verificação registrada. A lei pede atestado de antecedentes renovado a cada 6 meses de quem atua com crianças e adolescentes: peça pelo link quando precisar.'}
        </p>
      )}

      {anexando && <AnexarArquivo participanteId={d.participanteId} nivel={d.nivel} hoje={d.hoje} aoTerminar={() => setAnexando(false)} />}

      {v && (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {NOMES_DOS_ITENS.filter((i) => v.escopo === 'completa' || i === 'antecedentes').map((item) => (
            <ItemDoChecklist key={item} item={item} d={d} verificacao={v} emAndamento={emAndamento} arquivos={ativos} />
          ))}
        </ol>
      )}

      {emAndamento && faltas.length > 0 && (
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <p className="mb-1 font-medium">Pendências</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{faltas.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      {ativos.length > 0 && v && <ArquivosDaVerificacao participanteId={d.participanteId} arquivos={d.arquivos} nivel={d.nivel} podeExcluir={podeGerenciar} />}

      {emAndamento && podeGerenciar && <Decisao participanteId={d.participanteId} verificacao={v} situacao={d.situacao} />}

      {concluida && v && (
        <div className={`rounded-lg px-4 py-3 text-sm ${v.parecer === 'nao_apto' ? 'bg-destructive/10' : v.parecer === 'apto' ? 'bg-success/10' : 'bg-warning/10'}`}>
          <p className="font-semibold">{PARECERES[v.parecer ?? 'apto']}{v.decidido_em ? ` · decidido em ${QUANDO(v.decidido_em)}` : ''}</p>
          {v.restricoes.length > 0 && <p>Restrições: {v.restricoes.map((r) => (ehRestricao(r) ? RESTRICOES[r].rotulo : r)).join('; ')}.</p>}
          {v.motivo && <p className="text-muted-foreground">Motivo: {v.motivo}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- pedir documentos

function PedirDocumentos({ participanteId, nome, temEmail, temTelefone, escopoPadrao, situacao }: { participanteId: string; nome: string; temEmail: boolean; temTelefone: boolean; escopoPadrao: Escopo; situacao: string }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [aberto, setAberto] = useState(false)
  const [canal, setCanal] = useState<CanalDoPedido>(temEmail ? 'email' : temTelefone ? 'whatsapp' : 'link')
  const [escopo, setEscopo] = useState<Escopo>(escopoPadrao)
  const [resultado, setResultado] = useState<{ link: string | null; recado: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const fechar = () => { if (!ocupado) { setAberto(false); setResultado(null); setErro('') } }
  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)} data-pedir-documentos><Send className="size-3.5" />Pedir documentos</Button>
      {aberto && (
        <Dialog titulo="Pedir os documentos ao candidato" onFechar={fechar} podeFechar={!ocupado}
          descricao={`${nome} recebe um link pessoal (vale 14 dias) para aceitar o termo e enviar documento com foto, atestado de antecedentes e referências. Lembretes saem sozinhos a cada 5 dias, duas vezes.`}>
          {resultado ? (
            <div className="flex flex-col gap-3 px-6 py-5 text-sm">
              <p>{resultado.recado}</p>
              {resultado.link && (
                <div className="flex items-center gap-2">
                  <input readOnly value={resultado.link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} aria-label="Link do candidato" />
                  <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(resultado.link ?? '').then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => undefined)}>
                    {copiado ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}{copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              )}
              <div className="flex justify-end"><Button type="button" onClick={fechar}>Fechar</Button></div>
            </div>
          ) : (
            <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => {
              e.preventDefault()
              executar(async () => {
                const r = await pedirDocumentosAoCandidato(participanteId, escopo, canal)
                if (!r.erro) setResultado({ link: r.link ?? null, recado: r.recado ?? '' })
                return r
              })
            }}>
              {situacao !== 'candidato' && (
                <fieldset className="flex flex-col gap-1.5 text-sm">
                  <legend className="mb-1 font-medium">O que pedir</legend>
                  <label className="flex items-center gap-2"><input type="radio" name="escopo" checked={escopo === 'renovacao'} onChange={() => setEscopo('renovacao')} className="accent-primary" />Só o atestado de antecedentes novo (renovação de 6 meses)</label>
                  <label className="flex items-center gap-2"><input type="radio" name="escopo" checked={escopo === 'completa'} onChange={() => setEscopo('completa')} className="accent-primary" />Verificação completa (documento, atestado e referências)</label>
                </fieldset>
              )}
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 font-medium">Como mandar</legend>
                <label className={`flex items-center gap-2 ${temEmail ? '' : 'text-muted-foreground'}`}><input type="radio" name="canal" checked={canal === 'email'} disabled={!temEmail} onChange={() => setCanal('email')} className="accent-primary" />Por e-mail{temEmail ? '' : ' (o cadastro não tem e-mail)'}</label>
                <label className={`flex items-center gap-2 ${temTelefone ? '' : 'text-muted-foreground'}`}><input type="radio" name="canal" checked={canal === 'whatsapp'} disabled={!temTelefone} onChange={() => setCanal('whatsapp')} className="accent-primary" />Pelo WhatsApp{temTelefone ? '' : ' (o cadastro não tem telefone)'}</label>
                <label className="flex items-center gap-2"><input type="radio" name="canal" checked={canal === 'link'} onChange={() => setCanal('link')} className="accent-primary" />Só gerar o link (eu mando)</label>
              </fieldset>
              <Erro texto={erro} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
                <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}{canal === 'link' ? 'Gerar link' : 'Mandar o link'}</Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- checklist

function ItemDoChecklist({ item, d, verificacao: v, emAndamento, arquivos }: { item: NomeDoItem; d: DadosDaVerificacao; verificacao: Verificacao; emAndamento: boolean; arquivos: ArquivoDoVoluntario[] }) {
  const registro = v.itens?.[item]
  const situacao = situacaoDoItem(v, item)
  const podeMarcar = emAndamento && d.nivel >= ITENS[item].nivel && d.situacao !== 'desligado'
  const semNivel = emAndamento && d.nivel < ITENS[item].nivel
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-item={item} data-situacao={situacao}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{ITENS[item].rotulo}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TOM_DO_ITEM[situacao]}`}>{SITUACOES_DO_ITEM[situacao]}</span>
          {registro?.por_nome && <span className="text-xs text-muted-foreground">por {registro.por_nome}{registro.em ? ` em ${QUANDO(registro.em)}` : ''}</span>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{ITENS[item].descricao}</p>
      {registro?.nota && <p className="text-sm">{registro.nota}</p>}
      {item === 'identidade' && <Identidade d={d} verificacao={v} arquivos={arquivos} emAndamento={emAndamento} />}
      {item === 'antecedentes' && <Antecedentes d={d} verificacao={v} arquivos={arquivos} />}
      {item === 'sancoes' && <Sancoes d={d} verificacao={v} emAndamento={emAndamento} />}
      {item === 'registro_profissional' && <RegistroDeclarado verificacao={v} />}
      {item === 'referencias' && <Referencias d={d} emAndamento={emAndamento} />}
      {item === 'entrevista' && registro?.data && <p className="text-sm">Entrevista em {dataCurta(registro.data)}.</p>}
      {podeMarcar && <MarcarItem participanteId={d.participanteId} item={item} atual={situacao} />}
      {semNivel && <p className="text-xs text-muted-foreground">Só quem tem acesso a dados sensíveis confere este item.</p>}
    </li>
  )
}

function MarcarItem({ participanteId, item, atual }: { participanteId: string; item: NomeDoItem; atual: SituacaoDoItem }) {
  const { erro, ocupado, executar } = useAcao()
  const [modo, setModo] = useState<SituacaoDoItem | null>(null)
  const precisaDeFormulario = (s: SituacaoDoItem) => s === 'divergente' || s === 'dispensado' || (s === 'conferido' && (item === 'antecedentes' || item === 'entrevista'))
  const enviar = (f: FormData) => executar(() => marcarItem(participanteId, item, f), () => setModo(null))
  const marcar = (s: SituacaoDoItem) => {
    if (precisaDeFormulario(s)) { setModo(s); return }
    const f = new FormData(); f.set('situacao', s); enviar(f)
  }
  return (
    <div className="flex flex-col gap-2">
      {!modo && (
        <div className="flex flex-wrap gap-1.5">
          {atual !== 'conferido' && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => marcar('conferido')} data-marcar={`${item}-conferido`}><Check className="size-3.5" />Conferido</Button>}
          {atual !== 'divergente' && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => marcar('divergente')}><X className="size-3.5" />Divergente…</Button>}
          {atual !== 'dispensado' && item !== 'identidade' && item !== 'antecedentes' && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => marcar('dispensado')}>Dispensar…</Button>}
          {atual !== 'pendente' && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => marcar('pendente')}>Voltar a pendente</Button>}
        </div>
      )}
      {modo && (
        <form className="flex flex-col gap-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)) }}>
          <input type="hidden" name="situacao" value={modo} />
          {item === 'antecedentes' && modo === 'conferido' && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Código de autenticação validado no site (opcional)<input name="codigo" maxLength={80} className={inputClass} /></label>
          )}
          {item === 'entrevista' && modo === 'conferido' && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Data da entrevista<input name="data" type="date" required className={inputClass} /></label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">{modo === 'conferido' ? 'Nota (opcional)' : modo === 'divergente' ? 'O que diverge' : 'Por que dispensar'}
            <textarea name="nota" rows={2} maxLength={600} required={modo !== 'conferido'} minLength={modo !== 'conferido' ? 3 : undefined} className={inputClass} />
          </label>
          <Erro texto={erro} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setModo(null)} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
          </div>
        </form>
      )}
      {!modo && <Erro texto={erro} />}
    </div>
  )
}

const SINAL: Record<Comparacao, { texto: string; classe: string }> = {
  confere: { texto: '✓ confere', classe: 'text-success' }, parecido: { texto: '≈ parecido', classe: 'text-warning-foreground' }, diverge: { texto: '✗ diverge', classe: 'text-destructive' }, nao_lido: { texto: '— não lido', classe: 'text-muted-foreground' },
}

function Identidade({ d, verificacao: v, arquivos, emAndamento }: { d: DadosDaVerificacao; verificacao: Verificacao; arquivos: ArquivoDoVoluntario[]; emAndamento: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  const docs = arquivos.filter((a) => a.categoria === 'documento_identidade')
  const l = v.documento_lido
  if (!docs.length && d.nivel >= 3) return <p className="text-sm text-muted-foreground">Nenhum documento com foto guardado ainda.</p>
  return (
    <div className="flex flex-col gap-3">
      {d.nivel < 3 && <p className="text-sm text-muted-foreground">{docs.length ? `${docs.length} arquivo(s) guardado(s). ` : ''}Só quem tem acesso a dados sensíveis abre o documento e o compara.</p>}
      {d.nivel >= 3 && emAndamento && d.claudePronto && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => lerDocumentoDoCandidato(d.participanteId))} data-ler-documento>
            {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}{l ? 'Ler o documento de novo' : 'Ler o documento com o Claude'}
          </Button>
          <span className="text-xs text-muted-foreground">Transcreve o que está impresso e compara com o cadastro. A decisão é sua.</span>
        </div>
      )}
      {d.nivel >= 3 && emAndamento && !d.claudePronto && <p className="text-xs text-muted-foreground">A leitura automática está desligada (falta a chave da Anthropic). Abra o arquivo e compare à mão.</p>}
      <Erro texto={erro} />
      {l && (
        <div className="flex flex-wrap items-start gap-4">
          <table className="min-w-64 text-sm" data-leitura>
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="pr-3 font-medium">Documento</th><th className="pr-3 font-medium">Lido</th><th className="font-medium">Cadastro</th></tr></thead>
            <tbody>
              <tr><td className="pr-3 py-0.5 text-muted-foreground">Tipo</td><td className="pr-3" colSpan={2}>{l.tipo ?? '—'}{l.numero ? ` · nº ${l.numero}` : ''}{l.orgao_emissor ? ` · ${l.orgao_emissor}${l.uf ? `/${l.uf}` : ''}` : ''}{l.validade ? ` · válido até ${dataCurta(l.validade)}` : ''}</td></tr>
              <tr><td className="pr-3 py-0.5 text-muted-foreground">Nome</td><td className="pr-3">{l.nome ?? '—'}</td><td className={SINAL[l.comparacao.nome].classe}>{SINAL[l.comparacao.nome].texto}</td></tr>
              <tr><td className="pr-3 py-0.5 text-muted-foreground">Nascimento</td><td className="pr-3">{dataCurta(l.data_nascimento)}</td><td className={SINAL[l.comparacao.nascimento].classe}>{SINAL[l.comparacao.nascimento].texto}</td></tr>
              <tr><td className="pr-3 py-0.5 text-muted-foreground">CPF</td><td className="pr-3">{l.comparacao.cpf === 'nao_lido' ? '—' : 'conferido por HMAC'}</td><td className={SINAL[l.comparacao.cpf].classe}>{SINAL[l.comparacao.cpf].texto}</td></tr>
            </tbody>
          </table>
          {d.fotoDoCracha && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <img src={d.fotoDoCracha} alt={`Foto do crachá de ${d.nome}`} className="h-28 w-24 rounded-lg border border-border object-cover" />
              <span className="max-w-40">Compare o rosto a olho com a foto do documento: o sistema não faz biometria facial.</span>
            </div>
          )}
          {l.divergencias.length > 0 && <ul className="w-full list-disc pl-5 text-sm text-destructive">{l.divergencias.map((x) => <li key={x}>{x}</li>)}</ul>}
          <p className="w-full text-xs text-muted-foreground">Lido {l.por_nome ? `por ${l.por_nome} ` : ''}{l.em ? `em ${QUANDO(l.em)}` : ''}. O CPF do documento não fica guardado.</p>
        </div>
      )}
    </div>
  )
}

function Antecedentes({ d, verificacao: v, arquivos }: { d: DadosDaVerificacao; verificacao: Verificacao; arquivos: ArquivoDoVoluntario[] }) {
  const a = atestadoMaisNovo(arquivos)
  const registro = v.itens?.antecedentes
  if (!a) return <p className="text-sm text-muted-foreground">{d.nivel >= 3 ? 'Nenhum atestado guardado ainda.' : 'Só quem tem acesso a dados sensíveis vê o atestado.'}</p>
  const renov = situacaoDaRenovacao(a.vence_em, d.hoje)
  const vencido = a.validade ? a.validade < d.hoje : false
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>{CATEGORIAS_DE_DOCUMENTO[a.categoria].rotulo}: emitido em {dataCurta(a.data_documento)}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${vencido ? TOM.erro : TOM.ok}`}>{vencido ? 'Vencido' : 'Vale'} até {dataCurta(a.validade)}</span>
      {renov && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${renov === 'vencido' ? TOM.erro : renov === 'vence_logo' ? TOM.atencao : TOM.neutro}`}>Renovar até {dataCurta(a.vence_em)}</span>}
      {(registro?.codigo || a.codigo_autenticacao) && <span className="font-mono text-xs">código {registro?.codigo ?? a.codigo_autenticacao}</span>}
      <a href={a.categoria === 'antecedentes_pf' ? LINKS.certidaoPf : LINKS.validarPcerj} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Validar no site da {a.categoria === 'antecedentes_pf' ? 'PF' : 'Polícia Civil'}<ExternalLink className="size-3" /></a>
    </div>
  )
}

function Sancoes({ d, verificacao: v, emAndamento }: { d: DadosDaVerificacao; verificacao: Verificacao; emAndamento: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  const s = v.sancoes
  return (
    <div className="flex flex-col gap-2">
      {emAndamento && d.nivel >= 2 && (
        d.cguConfigurada
          ? <Button size="sm" variant="outline" className="self-start" disabled={ocupado} onClick={() => executar(() => consultarSancoes(d.participanteId))} data-consultar-cgu>
            {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}{s ? 'Consultar de novo' : 'Consultar CEIS, CNEP, CEAF e PEP'}
          </Button>
          : <p className="text-xs text-muted-foreground">Falta a chave do Portal da Transparência em Configurações → Integrações (é gratuita, com a conta gov.br da filial). Até lá, dispense o item com o motivo.</p>
      )}
      <Erro texto={erro} />
      {s && (
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2" data-sancoes={s.resultado}>
          {NOMES_DAS_BASES.map((b) => {
            const r = s.bases[b]
            return (
              <li key={b} className="rounded-lg border border-border px-3 py-1.5">
                <span className="font-medium">{BASES_DA_CGU[b].sigla}</span> <span className="text-xs text-muted-foreground">{BASES_DA_CGU[b].rotulo}</span>
                <p className={r?.situacao === 'falha' ? 'text-warning-foreground' : r?.ocorrencias ? 'text-destructive' : 'text-success'}>
                  {r?.situacao === 'falha' ? `Não respondeu: ${r.erro ?? ''}` : r?.ocorrencias ? `${r.ocorrencias} ocorrência(s)` : 'Nada consta'}
                </p>
                {r?.detalhes?.map((x, i) => <p key={i} className="text-xs text-muted-foreground">{x}</p>)}
              </li>
            )
          })}
          <li className="text-xs text-muted-foreground sm:col-span-2">Consultado {s.por_nome ? `por ${s.por_nome} ` : ''}{s.em ? `em ${QUANDO(s.em)}` : ''}. Pessoa exposta politicamente não é impedimento: é só atenção redobrada.</li>
        </ul>
      )}
    </div>
  )
}

const LINK_DO_CONSELHO: Record<string, string> = { COREN: LINKS.coren, CRP: LINKS.cfp, CREFITO: LINKS.crefito, CRM: LINKS.cremerj }

function RegistroDeclarado({ verificacao: v }: { verificacao: Verificacao }) {
  const r = v.registro_profissional
  if (!r) return <p className="text-sm text-muted-foreground">O candidato ainda não respondeu.</p>
  if (!r.tem) return <p className="text-sm text-muted-foreground">O candidato declarou não ter registro em conselho profissional.</p>
  const link = LINK_DO_CONSELHO[r.conselho ?? '']
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span>{r.conselho} {r.numero}{r.uf ? `/${r.uf}` : ''}</span>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Conferir no site do conselho<ExternalLink className="size-3" /></a>}
    </p>
  )
}

function Referencias({ d, emAndamento }: { d: DadosDaVerificacao; emAndamento: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  const [nova, setNova] = useState(false)
  const [contatando, setContatando] = useState<string | null>(null)
  const pode = emAndamento && d.nivel >= 2
  return (
    <div className="flex flex-col gap-2">
      {!d.referencias.length && <p className="text-sm text-muted-foreground">Nenhuma referência ainda.</p>}
      <ul className="flex flex-col gap-1.5">
        {d.referencias.map((r) => (
          <li key={r.id} className="rounded-lg border border-border px-3 py-2 text-sm" data-referencia={r.nome}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-medium">{r.nome}</span> <span className="text-muted-foreground">· {r.relacao} · {[r.telefone, r.email].filter(Boolean).join(' · ')}{r.informado_pelo_candidato ? '' : ' · pela coordenação'}</span></span>
              <span className="flex items-center gap-1.5">
                {r.parecer && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.parecer === 'favoravel' ? TOM.ok : r.parecer === 'desfavoravel' ? TOM.erro : TOM.atencao}`}>{PARECERES_DA_REFERENCIA[r.parecer]}</span>}
                {pode && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setContatando(contatando === r.id ? null : r.id)}>{r.parecer ? 'Alterar' : 'Registrar contato'}</Button>}
                {pode && <button type="button" aria-label="Remover referência" disabled={ocupado} onClick={() => executar(() => removerReferencia(d.participanteId, r.id))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>}
              </span>
            </div>
            {(r.contatado_em || r.nota) && <p className="text-xs text-muted-foreground">{[r.contatado_em ? `Contato em ${dataCurta(r.contatado_em)}${r.contatado_por_nome ? ` por ${r.contatado_por_nome}` : ''}` : null, r.nota].filter(Boolean).join(' · ')}</p>}
            {contatando === r.id && (
              <form className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[9rem_10rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); executar(() => registrarContato(d.participanteId, r.id, new FormData(e.currentTarget)), () => setContatando(null)) }}>
                <input aria-label="Data do contato" name="contatado_em" type="date" defaultValue={d.hoje} max={d.hoje} className={inputClass} />
                <select aria-label="Parecer" name="parecer" required defaultValue={r.parecer ?? 'favoravel'} className={inputClass}>{Object.entries(PARECERES_DA_REFERENCIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input aria-label="Nota" name="nota" maxLength={600} defaultValue={r.nota ?? ''} placeholder="O que a pessoa disse" className={inputClass} />
                <Button type="submit" size="sm" disabled={ocupado}>Salvar</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {pode && !nova && <Button size="sm" variant="ghost" className="self-start" onClick={() => setNova(true)}><Plus className="size-3.5" />Adicionar referência</Button>}
      {nova && (
        <form className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); executar(() => salvarReferencia(d.participanteId, new FormData(e.currentTarget)), () => setNova(false)) }}>
          <input aria-label="Nome" name="nome" required minLength={2} maxLength={120} placeholder="Nome" className={inputClass} />
          <input aria-label="Relação" name="relacao" required minLength={2} maxLength={120} placeholder="Relação (ex.: chefe)" className={inputClass} />
          <input aria-label="Telefone" name="telefone" maxLength={30} placeholder="Telefone" className={inputClass} />
          <input aria-label="E-mail" name="email" type="email" maxLength={254} placeholder="E-mail" className={inputClass} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setNova(false)} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={ocupado}>Salvar</Button>
          </div>
        </form>
      )}
      <Erro texto={erro} />
    </div>
  )
}

// ---------------------------------------------------------------- decisão

function Decisao({ participanteId, verificacao: v, situacao }: { participanteId: string; verificacao: Verificacao; situacao: string }) {
  const { erro, ocupado, executar } = useAcao()
  const [parecer, setParecer] = useState<Parecer>('apto')
  const [restricoes, setRestricoes] = useState<Restricao[]>([])
  const [motivo, setMotivo] = useState('')
  const completa = verificacaoCompleta(v)
  const problema = problemaDaDecisao(parecer, restricoes, motivo, completa)
  const alternar = (r: Restricao) => setRestricoes((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border p-4" data-decisao onSubmit={(e) => { e.preventDefault(); executar(() => concluirVerificacao(participanteId, new FormData(e.currentTarget))) }}>
      <p className="text-sm font-semibold">Decisão</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {(Object.keys(PARECERES) as Parecer[]).map((p) => (
          <label key={p} className="flex items-center gap-2"><input type="radio" name="parecer" value={p} checked={parecer === p} onChange={() => setParecer(p)} className="accent-primary" />{PARECERES[p]}</label>
        ))}
      </div>
      {parecer === 'apto_com_restricao' && (
        <div className="flex flex-col gap-1.5 text-sm">
          {(Object.keys(RESTRICOES) as Restricao[]).map((r) => (
            <label key={r} className="flex items-center gap-2"><input type="checkbox" name="restricoes" value={r} checked={restricoes.includes(r)} onChange={() => alternar(r)} className="accent-primary" />{RESTRICOES[r].rotulo}{r === RESTRICAO_OBRIGATORIA && !completa && <span className="text-xs text-muted-foreground">(obrigatória sem identidade e antecedentes conferidos)</span>}</label>
          ))}
        </div>
      )}
      {parecer !== 'apto' && (
        <label className="flex flex-col gap-1 text-sm font-medium">Motivo
          <textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={1200} className={inputClass} />
        </label>
      )}
      {situacao === 'candidato' && parecer !== 'nao_apto' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="depois" value="aprovar" defaultChecked className="accent-primary" />Aprovar a inscrição agora (a pessoa recebe as boas-vindas)</label>}
      {situacao === 'candidato' && parecer === 'nao_apto' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="depois" value="recusar" className="accent-primary" />Recusar a inscrição agora (apaga o cadastro e os documentos)</label>}
      {problema && <p className="text-xs text-muted-foreground">{problema}</p>}
      <Erro texto={erro} />
      <div className="flex justify-end"><Button type="submit" disabled={ocupado || Boolean(problema)} data-concluir>{ocupado && <Loader2 className="size-4 animate-spin" />}Concluir verificação</Button></div>
    </form>
  )
}

/** "Aprovar com restrição" da lista e do quadro Situação, quando a verificação não foi concluída. */
export function AprovarComRestricao({ id, nome, verificacao, aberto, onFechar }: { id: string; nome: string; verificacao: Pick<Verificacao, 'estado' | 'parecer'> | null; aberto: boolean; onFechar: () => void }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [restricoes, setRestricoes] = useState<Restricao[]>([RESTRICAO_OBRIGATORIA])
  const [motivo, setMotivo] = useState('')
  const trava = travaDaAprovacao(verificacao)
  const problema = problemaDaDecisao('apto_com_restricao', restricoes, motivo, false)
  const fechar = () => { if (!ocupado) { setErro(''); onFechar() } }
  if (!aberto) return null
  return (
    <Dialog titulo="Aprovar com restrição" onFechar={fechar} podeFechar={!ocupado} descricao={trava.motivo}>
      <form className="flex flex-col gap-3 px-6 py-5" data-aprovar-com-restricao onSubmit={(e) => { e.preventDefault(); executar(() => aprovarComRestricao(id, new FormData(e.currentTarget)), fechar) }}>
        <p className="text-sm">{nome} passa a “Ativo” já, com as restrições abaixo até a verificação ser concluída. Elas aparecem na ficha e no parecer.</p>
        <div className="flex flex-col gap-1.5 text-sm">
          {(Object.keys(RESTRICOES) as Restricao[]).map((r) => (
            <label key={r} className="flex items-center gap-2"><input type="checkbox" name="restricoes" value={r} checked={restricoes.includes(r)} onChange={() => setRestricoes((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))} className="accent-primary" />{RESTRICOES[r].rotulo}{r === RESTRICAO_OBRIGATORIA && <span className="text-xs text-muted-foreground">(obrigatória)</span>}</label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">Motivo
          <textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1200} placeholder="Ex.: precisamos dela na campanha de sábado; os documentos chegam na semana que vem." className={inputClass} />
        </label>
        {problema && <p className="text-xs text-muted-foreground">{problema}</p>}
        <Erro texto={erro} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
          <Button type="submit" disabled={ocupado || Boolean(problema)}>{ocupado && <Loader2 className="size-4 animate-spin" />}Aprovar com restrição</Button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- arquivos

function ArquivosDaVerificacao({ participanteId, arquivos, nivel, podeExcluir }: { participanteId: string; arquivos: ArquivoDoVoluntario[]; nivel: Nivel; podeExcluir: boolean }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [excluindo, setExcluindo] = useState<ArquivoDoVoluntario | null>(null)
  const [motivo, setMotivo] = useState('')
  const ativos = arquivos.filter((a) => !a.excluido_em)
  const excluidos = arquivos.filter((a) => a.excluido_em)
  if (!ativos.length && !excluidos.length) return null
  return (
    <details className="text-sm" open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arquivos ({ativos.length})</summary>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {ativos.map((a) => {
          const abre = nivel >= CATEGORIAS_DE_DOCUMENTO[a.categoria].nivel
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="flex min-w-0 items-start gap-2">
                {a.tipo === 'application/pdf' ? <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <Imagem className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  {abre ? <a href={`/api/voluntariado/${participanteId}/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary hover:underline">{CATEGORIAS_DE_DOCUMENTO[a.categoria].rotulo}{a.lado && a.lado !== 'unico' ? ` (${LADOS[a.lado].toLowerCase()})` : ''}</a> : <span className="font-medium">{CATEGORIAS_DE_DOCUMENTO[a.categoria].rotulo}</span>}
                  <span className="block text-xs text-muted-foreground">{[a.data_documento ? `emitido em ${dataCurta(a.data_documento)}` : null, tamanhoLegivel(a.tamanho), `${a.pelo_candidato ? 'enviado pelo candidato' : 'anexado pela coordenação'} em ${QUANDO(a.created_at)}`, a.observacao].filter(Boolean).join(' · ')}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {a.sha256 && <span title={`SHA-256 ${a.sha256}`} className="text-muted-foreground"><ShieldCheck className="size-4" aria-label="Impressão digital registrada" /></span>}
                {abre && <a href={`/api/voluntariado/${participanteId}/arquivos/${a.id}?baixar=1`} aria-label="Baixar" title="Baixar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="size-3.5" /></a>}
                {podeExcluir && abre && <button type="button" aria-label="Excluir" title="Excluir" onClick={() => { setExcluindo(a); setMotivo(''); setErro('') }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>}
              </span>
            </li>
          )
        })}
      </ul>
      {excluidos.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{excluidos.length} arquivo(s) excluído(s): {excluidos.map((a) => a.motivo_exclusao).filter(Boolean).join('; ')}</p>}
      {excluindo && (
        <Dialog titulo="Excluir arquivo" onFechar={() => !ocupado && setExcluindo(null)} podeFechar={!ocupado} descricao="O arquivo sai do armazenamento. Fica registrado quem excluiu, quando e por quê.">
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => { e.preventDefault(); executar(() => excluirArquivoDoVoluntario(participanteId, excluindo.id, motivo), () => setExcluindo(null)) }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} className={inputClass} /></label>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExcluindo(null)} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}Excluir</Button>
            </div>
          </form>
        </Dialog>
      )}
    </details>
  )
}

function AnexarArquivo({ participanteId, nivel, hoje, aoTerminar }: { participanteId: string; nivel: Nivel; hoje: string; aoTerminar: () => void }) {
  const router = useRouter()
  const categorias = (Object.keys(CATEGORIAS_DE_DOCUMENTO) as CategoriaDeDocumento[]).filter((c) => nivel >= CATEGORIAS_DE_DOCUMENTO[c].nivel)
  const [categoria, setCategoria] = useState<CategoriaDeDocumento>(categorias[0] ?? 'outro')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const antecedentes = categoria === 'antecedentes_pcerj' || categoria === 'antecedentes_pf'
  const enviar = (f: FormData) => iniciar(async () => {
    setErro('')
    if (!arquivo) { setErro('Escolha o arquivo.'); return }
    if (!ehTipoAceito(arquivo.type)) { setErro('Envie PDF, JPG, PNG ou WEBP.'); return }
    if (arquivo.size > TAMANHO_MAXIMO) { setErro(`O arquivo tem ${tamanhoLegivel(arquivo.size)}; o limite é 20 MB.`); return }
    setEtapa('Preparando…')
    const p = await prepararEnvioDeArquivoDoVoluntario(participanteId, categoria, arquivo.type, arquivo.size)
    if (p.erro || !p.caminho || !p.token) { setErro(p.erro ?? 'Não foi possível preparar o envio.'); setEtapa(''); return }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('voluntarios-arquivos').uploadToSignedUrl(p.caminho, p.token, arquivo, { contentType: arquivo.type })
    if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); setEtapa(''); return }
    setEtapa('Conferindo…')
    const r = await registrarArquivoDoVoluntario(participanteId, p.caminho, arquivo.name, f)
    setEtapa('')
    if (r.erro) { setErro(r.erro); return }
    aoTerminar(); router.refresh()
  })
  if (!categorias.length) return <p className="text-xs text-muted-foreground">Você não tem acesso para guardar documentos aqui.</p>
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border p-4" data-anexar onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)) }}>
      <p className="text-xs text-muted-foreground">Para quando a pessoa trouxe o documento em mãos ou mandou por outro caminho. O ideal é o próprio candidato enviar pelo link.</p>
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm hover:border-primary/60">
        <Upload className="size-5 text-muted-foreground" />
        {arquivo ? <span className="font-medium">{arquivo.name} <span className="font-normal text-muted-foreground">({tamanhoLegivel(arquivo.size)})</span></span> : <span>Escolher arquivo</span>}
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG ou WEBP, até 20 MB</span>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
          <select name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDeDocumento)} className={inputClass}>{categorias.map((c) => <option key={c} value={c}>{CATEGORIAS_DE_DOCUMENTO[c].rotulo}</option>)}</select>
        </label>
        {categoria === 'documento_identidade' && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Lado<select name="lado" defaultValue="frente" className={inputClass}>{Object.entries(LADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        )}
        {antecedentes && <label className="flex flex-col gap-1 text-xs text-muted-foreground">Emitido em<input name="data_documento" type="date" required min={somarDias(hoje, -90)} max={hoje} className={inputClass} /></label>}
        {antecedentes && <label className="flex flex-col gap-1 text-xs text-muted-foreground">Código de autenticação<input name="codigo" maxLength={80} className={inputClass} /></label>}
        {!antecedentes && categoria !== 'documento_identidade' && <label className="flex flex-col gap-1 text-xs text-muted-foreground">Data do documento<input name="data_documento" type="date" max={hoje} className={inputClass} /></label>}
      </div>
      <input name="observacao" maxLength={600} placeholder="Observação (opcional)" aria-label="Observação" className={inputClass} />
      <Erro texto={erro} />
      <div className="flex items-center justify-end gap-2">
        {etapa && <span className="text-xs text-muted-foreground">{etapa}</span>}
        <Button type="button" size="sm" variant="ghost" onClick={aoTerminar} disabled={ocupado}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={ocupado || !arquivo}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Guardar</Button>
      </div>
    </form>
  )
}
