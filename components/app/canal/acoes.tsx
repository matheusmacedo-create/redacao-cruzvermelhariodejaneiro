'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Pin, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { excluirAviso, marcarConversa, responderMembro, salvarAviso } from '@/app/actions/canal'

export function ResponderMembro({ conversaId }: { conversaId: string }) {
  const [estado, enviar, enviando] = useActionState(responderMembro.bind(null, conversaId), {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (estado.ok) form.current?.reset() }, [estado.ok])
  return (
    <form ref={form} action={enviar} className="flex flex-col gap-2" id="responder-membro">
      <textarea name="texto" required rows={4} maxLength={4000} placeholder="Resposta ao voluntário (ele recebe também por e-mail)" aria-label="Resposta" className={inputClass} />
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={enviando}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Responder</Button></div>
    </form>
  )
}

export function SituacaoDaConversa({ conversaId, situacao }: { conversaId: string; situacao: string }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const rodar = (acao: 'encerrar' | 'reabrir') => iniciar(async () => { const r = await marcarConversa(conversaId, acao); if (r.erro) setErro(r.erro); else router.refresh() })
  return (
    <span className="flex items-center gap-2">
      {situacao === 'encerrada'
        ? <Button size="sm" variant="outline" disabled={ocupado} onClick={() => rodar('reabrir')}>Reabrir</Button>
        : <Button size="sm" variant="outline" disabled={ocupado} onClick={() => rodar('encerrar')}>Encerrar conversa</Button>}
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}

export type AvisoNaEquipe = { id: string; titulo: string; texto: string; fixado: boolean; expira_em: string | null; created_at: string; vistos: number; enviado_por_email_em?: string | null; enviados?: number | null }

function FormularioDeAviso({ a, onFim }: { a: AvisoNaEquipe | null; onFim?: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarAviso.bind(null, a?.id ?? null), {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (estado.ok) { if (a && !estado.erro) onFim?.(); else if (!a) form.current?.reset() } }, [estado.ok, estado.erro, a, onFim])
  return (
    <form ref={form} action={enviar} className="flex flex-col gap-2 rounded-lg border border-border p-4" data-form-aviso>
      <input name="titulo" required minLength={3} maxLength={160} defaultValue={a?.titulo ?? ''} placeholder="Título do aviso" aria-label="Título" className={inputClass} />
      <textarea name="texto" required rows={4} maxLength={6000} defaultValue={a?.texto ?? ''} placeholder="Recado para todos os voluntários" aria-label="Texto" className={inputClass} />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="fixado" value="sim" defaultChecked={a?.fixado} />Fixar no alto</label>
        <label className="flex items-center gap-2">Sai do mural em<input type="date" name="expira_em" defaultValue={a?.expira_em ?? ''} className={`${inputClass} !w-40 py-1`} /></label>
        {!a?.enviado_por_email_em && (
          <label className="flex items-center gap-2" title="Vai uma vez para todos os voluntários ativos com e-mail que não saíram da lista">
            <input type="checkbox" name="enviar_email" value="sim" />Enviar também por e-mail
          </label>
        )}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      {!a && !estado.erro && estado.enviados !== undefined && <p className="text-xs text-success" role="status">Aviso publicado e enviado por e-mail para {estado.enviados} {estado.enviados === 1 ? 'voluntário' : 'voluntários'}.</p>}
      <div className="flex justify-end gap-2">
        {a && <Button type="button" size="sm" variant="ghost" onClick={onFim}>Cancelar</Button>}
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{a ? 'Salvar' : 'Publicar aviso'}</Button>
      </div>
    </form>
  )
}

export function Mural({ avisos, total, hoje }: { avisos: AvisoNaEquipe[]; total: number; hoje: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <div className="flex flex-col gap-4" id="mural-equipe">
      <FormularioDeAviso a={null} />
      <ul className="flex flex-col gap-3">
        {avisos.map((a) => (
          <li key={a.id} className="rounded-lg border border-border p-4">
            {editando === a.id ? <FormularioDeAviso a={a} onFim={() => setEditando(null)} /> : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">{a.fixado && <Pin className="size-3.5 text-primary" aria-label="Fixado" />}{a.titulo}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.texto}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · visto por {a.vistos} de {total} voluntários ativos
                    {a.expira_em ? (a.expira_em < hoje ? ' · fora do mural' : ` · sai em ${new Date(`${a.expira_em}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`) : ''}
                    {a.enviado_por_email_em ? ` · enviado por e-mail a ${a.enviados ?? 0}` : ''}
                  </p>
                </div>
                <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(a.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                <button type="button" title="Excluir" aria-label="Excluir" disabled={ocupado} onClick={() => { if (confirm('Excluir este aviso?')) iniciar(async () => { await excluirAviso(a.id); router.refresh() }) }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
              </div>
            )}
          </li>
        ))}
        {!avisos.length && <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum aviso publicado.</li>}
      </ul>
    </div>
  )
}
