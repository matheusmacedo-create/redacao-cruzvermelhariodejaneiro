'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { atualizarMetaAgora, desligarMeta, ligarMeta } from '@/app/actions/escola-marketing'

export type ContaMeta = { id: string; act_id: string; nome: string | null; filtro: string | null; ativa: boolean; sincronizada_em: string | null; sincronizacao_erro: string | null }

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null)

function Formulario({ c, temToken, onFim }: { c: ContaMeta | null; temToken: boolean; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(ligarMeta.bind(null, c?.id ?? null), {})
  useEffect(() => { if (estado.ok && !estado.erro) onFim() }, [estado.ok, estado.erro, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3" data-meta-form autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">ID da conta de anúncios
          <input name="act_id" required maxLength={40} defaultValue={c?.act_id ?? ''} placeholder="act_1234567890" className={`${inputClass} font-mono`} spellCheck={false} />
          <span className="text-xs font-normal text-muted-foreground">No Gerenciador de Anúncios, o número ao lado do nome da conta.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Só campanhas com este nome
          <input name="filtro" maxLength={80} defaultValue={c?.filtro ?? ''} placeholder="Escola" className={inputClass} />
          <span className="text-xs font-normal text-muted-foreground">Opcional. Use se a conta também tem anúncios de outras áreas da filial.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">{temToken ? 'Trocar o token' : 'Token do usuário do sistema'}
          <input name="token" type="password" maxLength={1000} autoComplete="new-password" spellCheck={false} placeholder={temToken ? '•••• guardado no cofre (deixe em branco para manter)' : 'Cole o token aqui'} className={`${inputClass} font-mono`} />
          <span className="text-xs font-normal text-muted-foreground">
            No Business Manager: Configurações do negócio → Usuários do sistema → gerar token com a permissão <b>ads_read</b> e acesso a esta conta de anúncios. O token é testado antes de guardar, vai direto para o cofre e nunca mais aparece.
          </span>
        </label>
        {c && (
          <label className="flex flex-col gap-1 text-sm font-medium">Situação
            <select name="ativa" defaultValue={c.ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">Lendo todo dia</option><option value="nao">Pausada</option></select>
          </label>
        )}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{enviando ? 'Testando…' : 'Ligar'}</Button>
      </div>
    </form>
  )
}

/**
 * Os anúncios do Meta entram sozinhos: campanhas, anúncios com imagem e
 * texto, e os números de cada um (investimento, impressões, cliques,
 * contatos e matrículas), uma vez por dia e pelo botão.
 */
export function MetaAds({ contas, ehAdmin, temToken }: { contas: ContaMeta[]; ehAdmin: boolean; temToken: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [recado, setRecado] = useState<{ erro?: string; recado?: string }>({})
  const [pendente, iniciar] = useTransition()
  const fim = () => { setEditando(null); router.refresh() }
  const ultima = contas.map((c) => c.sincronizada_em).filter(Boolean).sort().pop() ?? null
  return (
    <Card className="flex flex-col gap-3 p-4" id="meta-ads">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Anúncios do Meta (Facebook e Instagram)</h2>
          <p className="text-sm text-muted-foreground">{contas.length ? `Lidos automaticamente todo dia${ultima ? ` · última leitura ${quando(ultima)}` : ''}.` : 'Ligue a conta de anúncios e as campanhas, os anúncios e os números entram sozinhos — sem digitar nada.'}</p>
        </div>
        {contas.length > 0 && (
          <Button variant="outline" size="sm" disabled={pendente} id="atualizar-meta" onClick={() => iniciar(async () => { setRecado(await atualizarMetaAgora()); router.refresh() })}>
            {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{pendente ? 'Lendo o Meta…' : 'Atualizar do Meta'}
          </Button>
        )}
      </div>
      {(recado.erro || recado.recado) && <p className={`text-sm ${recado.erro ? 'text-destructive' : 'text-muted-foreground'}`} role="status">{recado.erro ?? recado.recado}</p>}
      {contas.map((c) => editando === c.id ? <Formulario key={c.id} c={c} temToken={temToken} onFim={fim} /> : (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm" data-meta-conta={c.act_id}>
          <span className={`font-medium ${c.ativa ? '' : 'opacity-60'}`}>{c.nome ?? c.act_id}</span>
          <span className="font-mono text-xs text-muted-foreground">{c.act_id}</span>
          {c.filtro && <span className="text-xs text-muted-foreground">só “{c.filtro}”</span>}
          {!c.ativa && <span className="text-xs text-muted-foreground">(pausada)</span>}
          {c.sincronizacao_erro && <span className="basis-full text-xs text-destructive" role="alert">Última leitura falhou: {c.sincronizacao_erro}</span>}
          {ehAdmin && (
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => setEditando(c.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Editar ${c.nome ?? c.act_id}`}><Pencil className="size-3.5" /></button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={pendente} onClick={() => {
                if (!window.confirm('Desligar esta conta de anúncios? O que já foi lido continua no histórico.')) return
                iniciar(async () => { setRecado(await desligarMeta(c.id)); router.refresh() })
              }}>Desligar</Button>
            </span>
          )}
        </div>
      ))}
      {ehAdmin && (editando === 'nova' ? <Formulario c={null} temToken={temToken} onFim={fim} /> : (
        <div><Button size="sm" variant={contas.length ? 'ghost' : 'default'} onClick={() => setEditando('nova')} id="ligar-meta" data-ajuda="escola-contas.ligar-meta">{contas.length ? 'Ligar outra conta' : 'Ligar a conta de anúncios'}</Button></div>
      ))}
      {!ehAdmin && !contas.length && <p className="text-xs text-muted-foreground">Peça a um admin para ligar a conta de anúncios.</p>}
    </Card>
  )
}

/**
 * O Meta no alto do marketing: uma linha com a última leitura (ou o erro) e
 * o botão de atualizar. Ligar e desligar a conta fica em Contas e integrações.
 */
export function StatusDoMeta({ contas, temToken }: { contas: ContaMeta[]; temToken: boolean }) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ erro?: string; recado?: string }>({})
  const [pendente, iniciar] = useTransition()
  const ativas = contas.filter((c) => c.ativa)
  const erro = ativas.find((c) => c.sincronizacao_erro)?.sincronizacao_erro
  const ultima = ativas.map((c) => c.sincronizada_em).filter(Boolean).sort().pop() ?? null
  return (
    <Card className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm ${erro ? 'border-destructive/40' : ''}`} id="status-meta" data-ajuda="escola-marketing.meta">
      <span className="font-medium">Anúncios do Meta</span>
      <span className={`min-w-0 flex-1 ${erro ? 'text-destructive' : 'text-muted-foreground'}`}>
        {!ativas.length ? (temToken ? 'Nenhuma conta de anúncios ligada.' : 'Não ligados: os números dos anúncios não entram sozinhos.') : erro ? `Última leitura falhou: ${erro}` : `Lidos automaticamente${ultima ? ` · última leitura ${quando(ultima)}` : ''}.`}
      </span>
      {recado.recado && <span className="text-xs text-muted-foreground" role="status">{recado.recado}</span>}
      {recado.erro && <span className="text-xs text-destructive" role="alert">{recado.erro}</span>}
      {ativas.length > 0
        ? <Button variant="outline" size="sm" disabled={pendente} id="atualizar-meta" onClick={() => iniciar(async () => { setRecado(await atualizarMetaAgora()); router.refresh() })}>{pendente ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{pendente ? 'Lendo o Meta…' : 'Atualizar do Meta'}</Button>
        : <Button variant="outline" size="sm" onClick={() => router.push('/escola/configuracoes#meta')}>Ligar em Contas e integrações</Button>}
    </Card>
  )
}
