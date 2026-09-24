'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, ImagePlus, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import { excluirDoMarketing, prepararImagem, registrarImagem, removerImagem, salvarCampanha, salvarPeca } from '@/app/actions/escola-marketing'
import {
  CANAIS, OBJETIVOS, SITUACOES_DA_CAMPANHA, SITUACOES_DA_PECA, TIPOS_DE_PECA, UTM_DO_CANAL, linkComUtm, metricas, milhar, pct, reais, slugDeUtm,
  type Campanha, type Canal, type Peca,
} from '@/lib/escola/marketing'

type Opcao = { id: string; nome: string }

function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}
const valorNoCampo = (n: number | null) => (n === null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

// ---------------------------------------------------------------- campanha

export function FormularioDaCampanha({ c, contas, onFim }: { c: Campanha | null; contas: Opcao[]; onFim: (id?: string) => void }) {
  const [estado, enviar, enviando] = useActionState(salvarCampanha.bind(null, c?.id ?? null), {})
  const [nome, setNome] = useState(c?.nome ?? '')
  const [utm, setUtm] = useState(c?.utm_campaign ?? '')
  const [utmMexido, setUtmMexido] = useState(Boolean(c?.utm_campaign))
  useEffect(() => { if (estado.ok && !estado.erro) onFim(estado.id) }, [estado.ok, estado.erro, estado.id, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-campanha-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da campanha"><input name="nome" required maxLength={120} value={nome} placeholder="Punção Venosa — turma de outubro" className={inputClass}
          onChange={(e) => { setNome(e.target.value); if (!utmMexido) setUtm(slugDeUtm(e.target.value)) }} /></Campo>
        <Campo rotulo="Curso"><input name="curso" maxLength={120} defaultValue={c?.curso ?? ''} placeholder="Punção Venosa" className={inputClass} /></Campo>
        <Campo rotulo="Objetivo"><select name="objetivo" defaultValue={c?.objetivo ?? 'matriculas'} className={inputClass}>{Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo rotulo="Situação"><select name="status" defaultValue={c?.status ?? 'planejada'} className={inputClass}>{Object.entries(SITUACOES_DA_CAMPANHA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></Campo>
        <Campo rotulo="Início"><input name="inicio" type="date" defaultValue={c?.inicio ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Fim"><input name="fim" type="date" defaultValue={c?.fim ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Orçamento (R$)"><input name="orcamento" inputMode="decimal" maxLength={20} defaultValue={valorNoCampo(c?.orcamento ?? null)} placeholder="1.500,00" className={inputClass} /></Campo>
        {contas.length > 0 && <Campo rotulo="Conta Únicopag"><select name="conta_id" defaultValue={c?.conta_id ?? ''} className={inputClass}><option value="">—</option>{contas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
        <Campo rotulo="utm_campaign" className="sm:col-span-2" ajuda="O mesmo em todos os links da campanha. É por ele que a venda na Únicopag aparece aqui como receita da campanha.">
          <input name="utm_campaign" maxLength={100} value={utm} onChange={(e) => { setUtm(e.target.value.toLowerCase()); setUtmMexido(true) }} placeholder="puncao-out26" className={`${inputClass} font-mono`} spellCheck={false} />
        </Campo>
        <Campo rotulo="Resumo" className="sm:col-span-2"><textarea name="resumo" maxLength={1000} rows={2} defaultValue={c?.resumo ?? ''} placeholder="Público, oferta e a ideia central" className={inputClass} /></Campo>
        {c && <Campo rotulo="Aprendizados" className="sm:col-span-2" ajuda="O que funcionou, o que não funcionou e o que repetir na próxima. É o que fica para quem vier depois."><textarea name="aprendizados" maxLength={4000} rows={4} defaultValue={c.aprendizados ?? ''} className={inputClass} /></Campo>}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onFim()}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function NovaCampanha({ contas }: { contas: Opcao[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  if (!aberto) return <Button onClick={() => setAberto(true)} id="nova-campanha"><Plus className="size-4" />Nova campanha</Button>
  return <div className="w-full"><FormularioDaCampanha c={null} contas={contas} onFim={(id) => { setAberto(false); if (id) router.push(`/escola/marketing/${id}`) }} /></div>
}

export function EditarCampanha({ c, contas, podeExcluir }: { c: Campanha; contas: Opcao[]; podeExcluir: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState('')
  if (aberto) return <FormularioDaCampanha c={c} contas={contas} onFim={() => { setAberto(false); router.refresh() }} />
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} id="editar-campanha"><Pencil className="size-3.5" />Editar e aprendizados</Button>
      {podeExcluir && <Button variant="ghost" size="sm" className="text-destructive" disabled={pendente} onClick={() => {
        if (!window.confirm(`Excluir a campanha "${c.nome}"? As peças continuam na biblioteca, soltas.`)) return
        iniciar(async () => { const r = await excluirDoMarketing('campanha', c.id); if (r.erro) setErro(r.erro); else router.push('/escola/marketing') })
      }}><Trash2 className="size-3.5" />Excluir</Button>}
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </div>
  )
}

// ---------------------------------------------------------------- peça

export function FormularioDaPeca({ p, campanhas, campanhaId, referencia, onFim }: { p: Peca | null; campanhas: Opcao[]; campanhaId?: string | null; referencia?: boolean; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarPeca.bind(null, p?.id ?? null), {})
  const ehRef = p ? p.referencia : Boolean(referencia)
  const meta = p?.origem === 'meta'
  useEffect(() => { if (estado.ok && !estado.erro) onFim() }, [estado.ok, estado.erro, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-peca-form>
      {ehRef && <input type="hidden" name="referencia" value="sim" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Título" className="sm:col-span-2"><input name="titulo" required maxLength={160} defaultValue={p?.titulo} placeholder={ehRef ? 'Anúncio do curso X (concorrente)' : 'Anúncio: vaga garantida por R$ 99'} className={inputClass} /></Campo>
        {meta ? <><input type="hidden" name="tipo" value={p!.tipo} /><input type="hidden" name="canal" value={p!.canal} /></> : <>
        <Campo rotulo="Tipo"><select name="tipo" defaultValue={p?.tipo ?? 'anuncio'} className={inputClass}>{Object.entries(TIPOS_DE_PECA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo rotulo="Canal"><select name="canal" defaultValue={p?.canal ?? 'meta_ads'} className={inputClass}>{Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        </>}
        {ehRef ? <Campo rotulo="De onde veio" ajuda="Concorrente, outra filial, inspiração…"><input name="fonte" maxLength={120} defaultValue={p?.fonte ?? ''} className={inputClass} /></Campo>
          : <Campo rotulo="Campanha"><select name="campanha_id" defaultValue={p?.campanha_id ?? campanhaId ?? ''} className={inputClass}><option value="">— sem campanha</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>}
        {!meta && <Campo rotulo="Situação"><select name="status" defaultValue={p?.status ?? (ehRef ? 'no_ar' : 'rascunho')} className={inputClass}>{Object.entries(SITUACOES_DA_PECA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></Campo>}
        <Campo rotulo="Link" className="sm:col-span-2" ajuda={ehRef ? 'Onde ver a peça (Biblioteca de Anúncios do Meta, site…).' : 'A página no ar, o anúncio ou o post.'}><input name="url" type="url" maxLength={500} defaultValue={p?.url ?? ''} placeholder="https://" className={inputClass} /></Campo>
        <Campo rotulo="Ângulo" ajuda="A ideia que vende: preço, prova, urgência, carreira…"><input name="angulo" maxLength={60} defaultValue={p?.angulo ?? ''} list="angulos" className={inputClass} /></Campo>
        <Campo rotulo="Formato" ajuda="Imagem 1:1, carrossel, vídeo 9:16…"><input name="formato" maxLength={60} defaultValue={p?.formato ?? ''} list="formatos" className={inputClass} /></Campo>
        {!meta && <>
        <Campo rotulo="Publicada em"><input name="publicada_em" type="date" defaultValue={p?.publicada_em ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Saiu do ar em"><input name="encerrada_em" type="date" defaultValue={p?.encerrada_em ?? ''} className={inputClass} /></Campo>
        </>}
        <Campo rotulo="Texto da peça" className="sm:col-span-2"><textarea name="texto" maxLength={5000} rows={3} defaultValue={p?.texto ?? ''} placeholder="A copy: título, texto e chamada" className={inputClass} /></Campo>
      </div>
      {p?.origem === 'meta' && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Anúncio lido do Meta: investimento, impressões, cliques, contatos, matrículas, situação e datas vêm de lá todo dia. Aqui ficam o título, o ângulo, o formato, a nota e a marca de vencedora.</p>}
      {!ehRef && p?.origem !== 'meta' && (
        <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Resultados</legend>
          <Campo rotulo="Investimento (R$)"><input name="investimento" inputMode="decimal" maxLength={20} defaultValue={valorNoCampo(p?.investimento ?? null)} className={inputClass} /></Campo>
          <Campo rotulo="Impressões"><input name="impressoes" inputMode="numeric" maxLength={20} defaultValue={p?.impressoes ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Cliques"><input name="cliques" inputMode="numeric" maxLength={20} defaultValue={p?.cliques ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Contatos (leads)"><input name="leads" inputMode="numeric" maxLength={20} defaultValue={p?.leads ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Matrículas"><input name="matriculas" inputMode="numeric" maxLength={20} defaultValue={p?.matriculas ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Números lidos em"><input name="resultado_em" type="date" defaultValue={p?.resultado_em ?? ''} className={inputClass} /></Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="vencedora" value="sim" defaultChecked={p?.vencedora} className="size-4" />Peça vencedora (a que mais trouxe resultado; vale repetir o que ela fez)</label>
        </fieldset>
      )}
      {p?.origem === 'meta' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vencedora" value="sim" defaultChecked={p.vencedora} className="size-4" />Peça vencedora</label>}
      <Campo rotulo={ehRef ? 'Por que guardar' : 'Nota'}><textarea name="nota" maxLength={2000} rows={2} defaultValue={p?.nota ?? ''} placeholder={ehRef ? 'O que tem de bom aqui para copiar ou evitar' : 'O que aprendemos com esta peça'} className={inputClass} /></Campo>
      <datalist id="angulos">{['Preço', 'Prova social', 'Urgência / últimas vagas', 'Carreira e emprego', 'Certificado', 'Autoridade da Cruz Vermelha', 'Prática com instrutor'].map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="formatos">{['Imagem 1:1', 'Imagem 4:5', 'Carrossel', 'Vídeo 9:16', 'Vídeo 16:9', 'Stories', 'Página longa', 'Página curta'].map((a) => <option key={a} value={a} />)}</datalist>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function NovaPeca({ campanhas, campanhaId, referencia, rotulo }: { campanhas: Opcao[]; campanhaId?: string; referencia?: boolean; rotulo?: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  if (!aberto) return <Button variant={referencia ? 'outline' : 'default'} onClick={() => setAberto(true)} data-nova-peca={referencia ? 'referencia' : 'peca'}><Plus className="size-4" />{rotulo ?? (referencia ? 'Guardar referência' : 'Nova peça')}</Button>
  return <div className="w-full"><FormularioDaPeca p={null} campanhas={campanhas} campanhaId={campanhaId} referencia={referencia} onFim={() => { setAberto(false); router.refresh() }} /></div>
}

function Imagem({ p, url, podeEditar }: { p: Peca; url: string | null; podeEditar: boolean }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [, iniciar] = useTransition()
  const enviar = (arquivo: File) => iniciar(async () => {
    setErro('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) { setErro('Envie JPG, PNG ou WEBP.'); return }
    if (arquivo.size > 10 * 1024 * 1024) { setErro('A imagem pode ter até 10 MB.'); return }
    setEtapa('Preparando…')
    const r = await prepararImagem(p.id, arquivo.type, arquivo.size)
    if (r.erro || !r.caminho || !r.token) { setErro(r.erro ?? 'Não foi possível preparar o envio.'); setEtapa(''); return }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('escola-marketing').uploadToSignedUrl(r.caminho, r.token, arquivo, { contentType: arquivo.type })
    if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); setEtapa(''); return }
    setEtapa('Conferindo…')
    const g = await registrarImagem(p.id, r.caminho, arquivo.type)
    setEtapa('')
    if (g.erro) { setErro(g.erro); return }
    router.refresh()
  })
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted" data-imagem>
      {/* Link assinado do Storage, que expira: o otimizador do Next não guardaria. */}
      {url ? <img src={url} alt={`Imagem da peça ${p.titulo}`} className="size-full object-cover" loading="lazy" /> : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">{TIPOS_DE_PECA[p.tipo]} · {CANAIS[p.canal]}</div>
      )}
      {podeEditar && (
        <div className="absolute right-2 top-2 flex gap-1">
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) enviar(a) }} />
          <button type="button" onClick={() => entrada.current?.click()} disabled={Boolean(etapa)} className="flex items-center gap-1 rounded-md bg-card/90 px-2 py-1 text-xs shadow-sm hover:bg-card" aria-label={url ? 'Trocar a imagem' : 'Pôr uma imagem'}>
            {etapa ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}{etapa || (url ? 'Trocar' : 'Imagem')}
          </button>
          {url && !etapa && <button type="button" onClick={() => iniciar(async () => { const r = await removerImagem(p.id); if (r.erro) setErro(r.erro); else router.refresh() })} className="rounded-md bg-card/90 p-1 shadow-sm hover:bg-card" aria-label="Tirar a imagem"><X className="size-3.5" /></button>}
        </div>
      )}
      {erro && <p className="absolute inset-x-2 bottom-2 rounded-md bg-destructive px-2 py-1 text-xs text-white" role="alert">{erro}</p>}
    </div>
  )
}

/** O cartão da peça na biblioteca: imagem, o que é, situação, números e as contas (CTR, custo por contato e por matrícula). */
export function CartaoDaPeca({ p, imagem, campanhas, nomeDaCampanha, podeEditar, podeExcluir }: { p: Peca; imagem: string | null; campanhas: Opcao[]; nomeDaCampanha?: string | null; podeEditar: boolean; podeExcluir: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const m = metricas(p)
  if (editando) return <div className="sm:col-span-2 xl:col-span-3"><FormularioDaPeca p={p} campanhas={campanhas} onFim={() => { setEditando(false); router.refresh() }} /></div>
  const numeros = !p.referencia && [p.investimento, p.impressoes, p.cliques, p.leads, p.matriculas].some((v) => v !== null)
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card" data-peca={p.titulo}>
      <Imagem p={p} url={imagem} podeEditar={podeEditar} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-medium leading-snug">{p.vencedora && <Star className="size-3.5 shrink-0 fill-current text-warning-foreground" aria-label="Vencedora" />}{p.titulo}</p>
            <p className="text-xs text-muted-foreground">{p.origem === 'meta' && <span className="mr-1 rounded bg-[var(--chart-4)]/15 px-1 py-0.5 font-medium text-foreground" title="Lido do Meta Ads">Meta</span>}{[TIPOS_DE_PECA[p.tipo], CANAIS[p.canal], p.formato, p.referencia ? p.fonte : nomeDaCampanha].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${SITUACOES_DA_PECA[p.status].classe}`}>{SITUACOES_DA_PECA[p.status].rotulo}</span>
        </div>
        {p.angulo && <span className="w-fit rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{p.angulo}</span>}
        {numeros && (
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs" data-numeros>
            <div><dt className="text-muted-foreground">Investido</dt><dd className="tabular-nums">{reais(p.investimento)}</dd></div>
            <div><dt className="text-muted-foreground">Contatos</dt><dd className="tabular-nums">{milhar(p.leads)}</dd></div>
            <div><dt className="text-muted-foreground">Matrículas</dt><dd className="tabular-nums">{milhar(p.matriculas)}</dd></div>
            <div><dt className="text-muted-foreground">CTR</dt><dd className="tabular-nums">{pct(m.ctr, 2)}</dd></div>
            <div><dt className="text-muted-foreground">Por contato</dt><dd className="tabular-nums">{reais(m.cpl)}</dd></div>
            <div><dt className="text-muted-foreground">Por matrícula</dt><dd className="tabular-nums">{reais(m.cpa)}</dd></div>
          </dl>
        )}
        {p.nota && <p className="line-clamp-3 text-xs text-muted-foreground">{p.nota}</p>}
        <div className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground">
          <span className="flex-1 tabular-nums">{p.publicada_em ? new Date(`${p.publicada_em}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}</span>
          {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label={`Abrir ${p.titulo}`}><ExternalLink className="size-3.5" /></a>}
          {podeEditar && <button type="button" onClick={() => setEditando(true)} className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label={`Editar ${p.titulo}`}><Pencil className="size-3.5" /></button>}
          {podeExcluir && <button type="button" disabled={pendente} onClick={() => { if (window.confirm(`Excluir "${p.titulo}"?`)) iniciar(async () => { await excluirDoMarketing('peca', p.id); router.refresh() }) }} className="rounded p-1 hover:bg-muted hover:text-destructive" aria-label={`Excluir ${p.titulo}`}><Trash2 className="size-3.5" /></button>}
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- UTM

/** Monta o link com as UTMs da campanha para cada canal — o que liga a venda na Únicopag à campanha. */
export function ConstrutorDeUtm({ utm, base }: { utm: string; base: string }) {
  const [url, setUrl] = useState(base)
  const [canal, setCanal] = useState<Canal>('meta_ads')
  const [conteudo, setConteudo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const link = useMemo(() => (url ? linkComUtm(url, { ...UTM_DO_CANAL[canal], campaign: utm, content: conteudo }) : null), [url, canal, utm, conteudo])
  return (
    <div className="flex flex-col gap-3" id="construtor-utm">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Página de destino" className="sm:col-span-3"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (a página de venda)" className={inputClass} /></Campo>
        <Campo rotulo="Canal"><select value={canal} onChange={(e) => setCanal(e.target.value as Canal)} className={inputClass}>{Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo rotulo="Qual peça (utm_content)" ajuda="Opcional: separa os anúncios da mesma campanha." className="sm:col-span-2"><input value={conteudo} onChange={(e) => setConteudo(e.target.value)} maxLength={60} placeholder="video-depoimento" className={inputClass} /></Campo>
      </div>
      {url && !link && <p className="text-xs text-destructive">Link inválido: comece com https://.</p>}
      {link && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <code className="min-w-0 flex-1 break-all text-xs" data-link-utm>{link}</code>
          <Button type="button" size="sm" variant="outline" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}>
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      )}
    </div>
  )
}
