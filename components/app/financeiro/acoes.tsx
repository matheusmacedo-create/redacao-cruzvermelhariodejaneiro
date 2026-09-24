'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleCheck, ExternalLink, FileText, Loader2, Paperclip, ShieldCheck, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import {
  decidirAprovacao, desfazerPagamento, excluirAnexo, excluirLancamento, pagarLancamento, prepararAnexo, registrarAnexo,
} from '@/app/actions/financeiro'
import { FORMAS, TAMANHO_MAXIMO, TIPOS_DE_ANEXO, ehArquivoAceito, valorNoCampo, type TipoDeAnexo } from '@/lib/financeiro/regras'

type R = { erro?: string }

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
  return { erro, ocupado, executar }
}

const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)

export function Pagar({ id, tipo, valor, contaId, forma, contas, hoje }: {
  id: string; tipo: string; valor: number; contaId: string; forma: string | null; contas: { id: string; nome: string }[]; hoje: string
}) {
  const [aberto, setAberto] = useState(false)
  const { erro, ocupado, executar } = useAcao()
  const [p, setP] = useState({ pago_em: hoje, valor_pago: valorNoCampo(valor), conta_id: contaId, forma: forma ?? '' })
  const verbo = tipo === 'receita' ? 'recebido' : 'pago'
  return (
    <>
      <Button onClick={() => setAberto(true)} id="botao-pagar"><CircleCheck className="size-4" />{tipo === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}</Button>
      {aberto && (
        <Dialog titulo={tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'} onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Data em que foi {verbo}<input type="date" max={hoje} value={p.pago_em} onChange={(e) => setP({ ...p, pago_em: e.target.value })} className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Valor {verbo}<input inputMode="decimal" value={p.valor_pago} onChange={(e) => setP({ ...p, valor_pago: e.target.value })} className={inputClass} />
              <span className="text-xs font-normal text-muted-foreground">Mude se teve juros, multa ou desconto.</span></label>
            {tipo !== 'transferencia' && (
              <label className="flex flex-col gap-1 text-sm font-medium">Conta
                <select value={p.conta_id} onChange={(e) => setP({ ...p, conta_id: e.target.value })} className={inputClass}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">Forma
              <select value={p.forma} onChange={(e) => setP({ ...p, forma: e.target.value })} className={inputClass}><option value="">—</option>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado} onClick={() => executar(() => pagarLancamento(id, p), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function DesfazerPagamento({ id }: { id: string }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-start gap-1">
      <Button variant="outline" disabled={ocupado} onClick={() => { if (confirm('Desfazer o pagamento? O lançamento volta para "em aberto".')) executar(() => desfazerPagamento(id)) }}>
        <Undo2 className="size-4" />Desfazer pagamento
      </Button>
      <Erro texto={erro} />
    </span>
  )
}

export function Excluir({ id, emGrupo }: { id: string; emGrupo: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [escopo, setEscopo] = useState<'este' | 'futuros'>('este')
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAberto(true)}><Trash2 className="size-4" />Excluir</Button>
      {aberto && (
        <Dialog titulo="Excluir lançamento" descricao="Some da lista, junto com os arquivos. Fica registrado quem excluiu." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3 text-sm">
            {emGrupo && (
              <>
                <label className="flex items-center gap-2"><input type="radio" checked={escopo === 'este'} onChange={() => setEscopo('este')} />Só este</label>
                <label className="flex items-center gap-2"><input type="radio" checked={escopo === 'futuros'} onChange={() => setEscopo('futuros')} />Este e os próximos em aberto</label>
              </>
            )}
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button variant="destructive" disabled={ocupado} onClick={() => executar(() => excluirLancamento(id, escopo), () => router.push('/financeiro'))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Excluir</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function Decisao({ id }: { id: string }) {
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const { erro, ocupado, executar } = useAcao()
  return (
    <div className="flex flex-col gap-2" id="decisao">
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={() => executar(() => decidirAprovacao(id, true, ''))}><Check className="size-4" />Aprovar</Button>
        <Button variant="outline" disabled={ocupado} onClick={() => setRecusando((v) => !v)}><X className="size-4" />Recusar</Button>
      </div>
      {recusando && (
        <div className="flex flex-col gap-2">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={600} placeholder="Por que está recusando? Quem lançou recebe o motivo." className={inputClass} />
          <div><Button variant="destructive" size="sm" disabled={ocupado} onClick={() => executar(() => decidirAprovacao(id, false, motivo))}>Confirmar recusa</Button></div>
        </div>
      )}
      <Erro texto={erro} />
    </div>
  )
}

export type Anexo = { id: string; nome_original: string; tipo_doc: TipoDeAnexo; mime: string; tamanho: number; sha256: string | null; created_at: string; enviado_por: string | null }

const tamanhoLegivel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`)

/**
 * Nota, comprovante, boleto. O envio vai do navegador direto ao Storage com
 * um link de uso único; o servidor confere o conteúdo e grava a impressão
 * digital (SHA-256), que prova depois que o arquivo não foi trocado.
 */
export function Anexos({ lancamentoId, anexos, podeEnviar, pago, nomes }: {
  lancamentoId: string; anexos: Anexo[]; podeEnviar: boolean; pago: boolean; nomes: Record<string, string>
}) {
  const router = useRouter()
  const [tipoDoc, setTipoDoc] = useState<TipoDeAnexo>(pago ? 'comprovante' : 'nota')
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const faltaComprovante = pago && !anexos.some((a) => a.tipo_doc === 'comprovante' || a.tipo_doc === 'recibo')

  const enviar = (arquivo: File) => iniciar(async () => {
    setErro('')
    if (!ehArquivoAceito(arquivo.type)) { setErro('Envie PDF, JPG, PNG ou WEBP.'); return }
    if (arquivo.size > TAMANHO_MAXIMO) { setErro('O arquivo pode ter até 20 MB.'); return }
    setEtapa('Preparando…')
    const p = await prepararAnexo(lancamentoId, arquivo.type, arquivo.size)
    if (p.erro || !p.caminho || !p.token) { setErro(p.erro ?? 'Não foi possível preparar o envio.'); setEtapa(''); return }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('financeiro-anexos').uploadToSignedUrl(p.caminho, p.token, arquivo, { contentType: arquivo.type })
    if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); setEtapa(''); return }
    setEtapa('Conferindo…')
    const r = await registrarAnexo(lancamentoId, p.caminho, { nome: arquivo.name, tipo_doc: tipoDoc, mime: arquivo.type, tamanho: arquivo.size })
    setEtapa('')
    if (r.erro) { setErro(r.erro); return }
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-3" id="anexos">
      {faltaComprovante && <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">Falta o comprovante. Ele entra na conferência do fechamento do mês.</p>}
      {anexos.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <a href={`/api/financeiro/anexos/${a.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate font-medium hover:text-primary hover:underline">{a.nome_original}<ExternalLink className="size-3 shrink-0" /></a>
                <span className="block text-xs text-muted-foreground">
                  {TIPOS_DE_ANEXO[a.tipo_doc]} · {tamanhoLegivel(a.tamanho)} · {new Date(a.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{a.enviado_por && nomes[a.enviado_por] ? ` · ${nomes[a.enviado_por]}` : ''}
                </span>
              </span>
              {a.sha256 && <span title={`Impressão digital (SHA-256): ${a.sha256}`}><ShieldCheck className="size-4 text-success" aria-label="Conferido" /></span>}
              {podeEnviar && (
                <button type="button" title="Excluir arquivo" aria-label="Excluir arquivo" disabled={ocupado}
                  onClick={() => { if (confirm('Excluir este arquivo?')) iniciar(async () => { const r = await excluirAnexo(lancamentoId, a.id); if (r.erro) setErro(r.erro); else router.refresh() }) }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nenhum arquivo ainda.</p>}
      {podeEnviar && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDeAnexo)} aria-label="O que é o arquivo" className={`${inputClass} !w-auto`}>
            {Object.entries(TIPOS_DE_ANEXO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted ${ocupado ? 'pointer-events-none opacity-60' : ''}`}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}{etapa || 'Juntar arquivo'}
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviar(f) }} />
          </label>
          <span className="text-xs text-muted-foreground">PDF ou foto, até 20 MB.</span>
        </div>
      )}
      <Erro texto={erro} />
    </div>
  )
}
