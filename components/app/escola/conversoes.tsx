'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { desligarConversoes, ligarConversoes, testarEventoDaMeta } from '@/app/actions/escola-conversoes'
import { CATEGORIAS, type Categoria } from '@/lib/escola/conversoes'
import { reaisDeCentavos } from '@/lib/escola/painel'

/** `contas`: as contas da Únicopag cujas vendas vão à Meta (nenhuma por padrão; vazia também quando a migração 20261004170000 ainda não entrou). */
export type ConfiguracaoDasConversoes = { pixel_id: string; pagina_padrao: string | null; ativa: boolean; enviada_em: string | null; erro: string | null; contas: string[] }
/** Uma conta da Únicopag do espaço, para marcar quais mandam as vendas à Meta. */
export type ContaDaUnicopag = { id: string; nome: string }
export type ResumoDosEnvios = { categoria: Categoria; enviados: number; valor: number; falhas: number }

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null)

function Formulario({ c, contas, token, onFim }: { c: ConfiguracaoDasConversoes | null; contas: ContaDaUnicopag[]; token: { proprio: boolean; reserva: boolean }; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(ligarConversoes, {})
  useEffect(() => { if (estado.ok && !estado.erro) onFim() }, [estado.ok, estado.erro, onFim])
  const temToken = token.proprio || token.reserva
  return (
    <form action={enviar} className="flex flex-col gap-3" data-conversoes-form autoComplete="off">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">ID do pixel (conjunto de dados)
          <input name="pixel_id" required maxLength={30} inputMode="numeric" defaultValue={c?.pixel_id ?? ''} placeholder="1234567890123456" className={`${inputClass} font-mono`} spellCheck={false} />
          <span className="text-xs font-normal text-muted-foreground">No Gerenciador de Eventos, o número abaixo do nome do pixel. O mesmo que o site já usa.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Página padrão
          <input name="pagina_padrao" maxLength={500} defaultValue={c?.pagina_padrao ?? 'https://cruzvermelhariodejaneiro.org/'} placeholder="https://…" className={inputClass} spellCheck={false} />
          <span className="text-xs font-normal text-muted-foreground">Vai como origem do evento quando o curso não tem página cadastrada em Marketing → Cursos.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">{token.proprio ? 'Trocar o token' : 'Token da API de Conversões'}
          <input name="token" type="password" maxLength={1000} autoComplete="new-password" spellCheck={false} placeholder={token.proprio ? '•••• guardado no cofre (deixe em branco para manter)' : token.reserva ? 'Opcional: sem ele, usa o token do Meta Ads' : 'Cole o token aqui'} className={`${inputClass} font-mono`} />
          <span className="text-xs font-normal text-muted-foreground">
            No Gerenciador de Eventos: o pixel → Configurações → API de Conversões → <b>Gerar token de acesso</b>. O token é testado contra o pixel antes de guardar, vai direto para o cofre e nunca mais aparece.
          </span>
        </label>
        <fieldset className="flex flex-col gap-1.5 rounded-lg border border-border p-3 sm:col-span-2" data-conversoes-contas>
          <legend className="px-1 text-sm font-medium">Contas que mandam as vendas à Meta</legend>
          {contas.length ? contas.map((k) => (
            <label key={k.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="contas" value={k.id} defaultChecked={c?.contas.includes(k.id) ?? false} className="size-4 accent-primary" />
              {k.nome}
            </label>
          )) : <p className="text-xs text-muted-foreground">Nenhuma conta da Únicopag cadastrada. Ligue a conta em “Contas da Únicopag” antes.</p>}
          <span className="text-xs font-normal text-muted-foreground">Deixe desmarcada a conta do checkout do site (matrícula): o site já manda essa compra à Meta, e só com o consentimento da pessoa. Daqui, ela seria contada duas vezes.</span>
        </fieldset>
        {c && (
          <label className="flex flex-col gap-1 text-sm font-medium">Situação
            <select name="ativa" defaultValue={c.ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">Avisando a cada leitura</option><option value="nao">Pausado</option></select>
          </label>
        )}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando || !temToken && false}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{enviando ? 'Testando…' : c ? 'Salvar' : 'Ligar'}</Button>
      </div>
    </form>
  )
}

function Teste() {
  const [estado, enviar, enviando] = useActionState(testarEventoDaMeta, {})
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2" data-teste-form>
      <label className="flex flex-col gap-1 text-sm font-medium">Código de “Testar eventos”
        <input name="codigo" required maxLength={16} placeholder="TEST12345" className={`${inputClass} w-40 font-mono uppercase`} spellCheck={false} />
      </label>
      <Button type="submit" variant="outline" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{enviando ? 'Enviando…' : 'Enviar evento de teste'}</Button>
      {(estado.erro || estado.recado) && <p className={`basis-full text-xs ${estado.erro ? 'text-destructive' : 'text-muted-foreground'}`} role="status">{estado.erro ?? estado.recado}</p>}
    </form>
  )
}

/**
 * O pixel da Meta ligado aos pagamentos: cada venda paga na Únicopag vira um
 * Purchase na API de Conversões, com a categoria dizendo se foi a taxa de
 * inscrição ou o curso. Ligar e desligar é de admin; o teste, de quem
 * trabalha no marketing.
 */
export function ConversoesDaMeta({ configuracao, contas, resumo, token, ehAdmin }: { configuracao: ConfiguracaoDasConversoes | null; contas: ContaDaUnicopag[]; resumo: ResumoDosEnvios[]; token: { proprio: boolean; reserva: boolean }; ehAdmin: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [recado, setRecado] = useState<{ erro?: string }>({})
  const [pendente, iniciar] = useTransition()
  const fim = () => { setEditando(false); router.refresh() }
  const c = configuracao
  // As contas marcadas, pelo nome; quem não vê as contas da Únicopag (RLS) vê só quantas são.
  const marcadas = c ? contas.filter((k) => c.contas.includes(k.id)).map((k) => k.nome) : []
  const semNome = c ? c.contas.length - marcadas.length : 0
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" id="conversoes-meta">
      <div>
        <h2 className="text-sm font-medium">Pixel da Meta: pagamentos como conversões</h2>
        <p className="text-sm text-muted-foreground">
          {c ? `Cada venda paga das contas marcadas vira um evento Purchase no pixel ${c.pixel_id}, a cada leitura das transações${c.enviada_em ? ` · último aviso ${quando(c.enviada_em)}` : ''}.` : 'Ligue o pixel e cada venda paga nas contas da Únicopag que você marcar vira um evento Purchase na API de Conversões: a taxa de inscrição e o curso, em dois momentos, para as campanhas otimizarem por cada um.'}
        </p>
      </div>
      {c?.erro && <p className="text-xs text-destructive" role="alert">Último aviso falhou: {c.erro}</p>}
      {recado.erro && <p className="text-xs text-destructive" role="alert">{recado.erro}</p>}
      {c && !editando && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm" data-pixel={c.pixel_id}>
          <span className={`font-medium ${c.ativa ? '' : 'opacity-60'}`}>Pixel {c.pixel_id}</span>
          {!c.ativa && <span className="text-xs text-muted-foreground">(pausado)</span>}
          <span className="text-xs text-muted-foreground">{token.proprio ? 'token da API de Conversões no cofre' : token.reserva ? 'usando o token do Meta Ads' : 'sem token: nada é enviado'}</span>
          {ehAdmin && (
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => setEditando(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Editar o pixel"><Pencil className="size-3.5" /></button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={pendente} onClick={() => {
                if (!window.confirm('Desligar o pixel? O que já foi enviado continua no histórico.')) return
                iniciar(async () => { setRecado(await desligarConversoes()); router.refresh() })
              }}>Desligar</Button>
            </span>
          )}
          <span className={`basis-full text-xs ${c.contas.length ? 'text-muted-foreground' : 'text-destructive'}`} data-conversoes-marcadas>
            {c.contas.length
              ? `Mandam as vendas: ${[...marcadas, ...(semNome > 0 ? [`${semNome} ${semNome === 1 ? 'conta' : 'contas'} da Únicopag`] : [])].join(', ')}.`
              : `Nenhuma conta da Únicopag marcada: nada é enviado à Meta.${ehAdmin ? ' Toque no lápis e marque as contas.' : ''}`}
          </span>
        </div>
      )}
      {c && !editando && resumo.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-resumo-conversoes>
          {resumo.map((r) => (
            <div key={r.categoria} className="rounded-lg bg-muted/50 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{CATEGORIAS[r.categoria].rotulo} · 30 dias</dt>
              <dd className="font-medium tabular-nums">{r.enviados} {r.enviados === 1 ? 'evento' : 'eventos'} · {reaisDeCentavos(r.valor)}{r.falhas ? <span className="block text-xs font-normal text-destructive">{r.falhas} com falha</span> : null}</dd>
            </div>
          ))}
        </dl>
      )}
      {editando || (!c && ehAdmin) ? <Formulario c={c} contas={contas} token={token} onFim={fim} /> : null}
      {c && !editando && <Teste />}
      {!ehAdmin && !c && <p className="text-xs text-muted-foreground">Peça a um admin para ligar o pixel.</p>}
      <p className="text-xs text-muted-foreground">
        Vão para a Meta só o valor, a categoria, o curso e os dados da pessoa com hash SHA-256 (e-mail, telefone e nome), como a API exige; o CPF não vai, e nada disso fica guardado aqui. Só as vendas das contas marcadas vão; as de produto de teste, ignoradas ou pagas há mais de 7 dias, não. No Gerenciador de Eventos, crie duas conversões personalizadas sobre <code>content_category</code> (“taxa_de_inscricao” e “curso”).
        {' '}<a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">Gerenciador de Eventos<ExternalLink className="size-3" /></a>
      </p>
    </div>
  )
}
