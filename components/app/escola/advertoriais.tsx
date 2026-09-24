'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, FilePenLine, Loader2, Plus, Settings2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { criarAdvertorial, salvarAdvertorial } from '@/app/actions/escola-marketing'
import { SITUACOES_DA_PECA, UTM_DO_CANAL, linkComUtm, milhar, pct, reais, type Canal } from '@/lib/escola/marketing'
import type { LinhaDoAdvertorial } from '@/lib/escola/advertoriais'

type Opcao = { id: string; nome: string; utm?: string | null }

function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

export function NovoAdvertorial({ campanhas, destinoSugerido }: { campanhas: Opcao[]; destinoSugerido: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [estado, enviar, enviando] = useActionState(criarAdvertorial, {})
  useEffect(() => { if (estado.ok && !estado.erro && estado.contentId) router.push(`/conteudos/${estado.contentId}`) }, [estado.ok, estado.erro, estado.contentId, router])
  if (!aberto) return <Button onClick={() => setAberto(true)} id="novo-advertorial"><Plus className="size-4" />Novo advertorial</Button>
  return (
    <form action={enviar} className="flex w-full flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-advertorial-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Manchete" className="sm:col-span-2" ajuda="O título da matéria. Dá para mudar depois, no editor."><input name="titulo" required minLength={5} maxLength={160} placeholder="Técnica de enfermagem conta como aprendeu punção venosa em um sábado" className={inputClass} /></Campo>
        <Campo rotulo="Campanha"><select name="campanha_id" defaultValue={campanhas[0]?.id ?? ''} className={inputClass}><option value="">— sem campanha</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo rotulo="Ângulo" ajuda="A ideia que vende: história, prova, preço, carreira…"><input name="angulo" maxLength={60} list="angulos-adv" className={inputClass} /></Campo>
        <Campo rotulo="Botão de matrícula leva para" className="sm:col-span-2" ajuda="A página de inscrição do curso. As UTMs do anúncio seguem junto, sozinhas.">
          <input name="destino_url" type="url" required maxLength={800} defaultValue={destinoSugerido} placeholder="https://…/inscricao" className={inputClass} />
        </Campo>
      </div>
      <datalist id="angulos-adv">{['História de aluno', 'Prova social', 'Carreira e emprego', 'Preço e parcelas', 'Urgência / últimas vagas', 'Autoridade da Cruz Vermelha', 'Mito x verdade'].map((a) => <option key={a} value={a} />)}</datalist>
      <p className="text-xs text-muted-foreground">A matéria nasce em rascunho com a estrutura de um advertorial e o botão de matrícula já no lugar. Você escreve no editor e publica como qualquer notícia.</p>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Criar e abrir no editor</Button>
      </div>
    </form>
  )
}

function Dados({ l, campanhas, onFim }: { l: LinhaDoAdvertorial; campanhas: Opcao[]; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarAdvertorial.bind(null, l.peca.id), {})
  useEffect(() => { if (estado.ok && !estado.erro) onFim() }, [estado.ok, estado.erro, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 border-t border-border p-3" data-adv-dados>
      <Campo rotulo="Campanha"><select name="campanha_id" defaultValue={l.peca.campanha_id ?? ''} className={inputClass}><option value="">— sem campanha</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
      <Campo rotulo="Ângulo"><input name="angulo" maxLength={60} defaultValue={l.peca.angulo ?? ''} list="angulos-adv" className={inputClass} /></Campo>
      <Campo rotulo="Botão leva para"><input name="destino_url" type="url" required maxLength={800} defaultValue={l.peca.destino_url ?? ''} className={inputClass} /></Campo>
      <Campo rotulo="Situação"><select name="status" defaultValue={l.site_url && l.peca.status === 'rascunho' ? 'no_ar' : l.peca.status} className={inputClass}>{Object.entries(SITUACOES_DA_PECA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></Campo>
      <Campo rotulo="Nota"><textarea name="nota" rows={2} maxLength={2000} defaultValue={l.peca.nota ?? ''} placeholder="O que aprendemos com esta página" className={inputClass} /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vencedora" value="sim" defaultChecked={l.peca.vencedora} className="size-4" />Vencedora</label>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-copiar={rotulo}
      onClick={async () => { await navigator.clipboard?.writeText(texto).catch(() => undefined); setOk(true); setTimeout(() => setOk(false), 1500) }}>
      {ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{ok ? 'Copiado' : rotulo}
    </button>
  )
}

/** O cartão do advertorial no banco: capa, manchete, onde está, e o funil da página (visita → clique → matrícula) com o custo. */
export function CartaoDoAdvertorial({ l, campanhas, canal = 'meta_ads', podeEscrever = true }: { l: LinhaDoAdvertorial; campanhas: Opcao[]; canal?: Canal; podeEscrever?: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const noAr = Boolean(l.site_url)
  const situacao = noAr && l.peca.status === 'rascunho' ? 'no_ar' : l.peca.status
  const campanha = campanhas.find((c) => c.id === l.peca.campanha_id)
  const linkDoAnuncio = l.site_url && campanha?.utm ? linkComUtm(l.site_url, { ...UTM_DO_CANAL[canal], campaign: campanha.utm, content: l.chave }) : l.site_url
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card" data-advertorial={l.titulo}>
      <div className="aspect-[16/9] w-full bg-muted">
        {l.capa ? <img src={l.capa} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center text-xs text-muted-foreground">{noAr ? 'Sem imagem na matéria' : 'Rascunho — ainda não publicado'}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{l.peca.vencedora && <Star className="mr-1 inline size-3.5 fill-current align-[-2px] text-warning-foreground" aria-label="Vencedora" />}{l.titulo}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${SITUACOES_DA_PECA[situacao].classe}`}>{SITUACOES_DA_PECA[situacao].rotulo}</span>
        </div>
        <p className="text-xs text-muted-foreground">{[campanha?.nome, l.peca.angulo, l.publicada_em ? `publicado ${new Date(l.publicada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null].filter(Boolean).join(' · ') || 'Sem campanha'}</p>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs" data-funil>
          <div><dt className="text-muted-foreground">Visitas</dt><dd className="tabular-nums">{milhar(l.visitas)}</dd></div>
          <div><dt className="text-muted-foreground">Cliques no botão</dt><dd className="tabular-nums">{milhar(l.cliques)} <span className="text-muted-foreground">({pct(l.taxaDeClique, 1)})</span></dd></div>
          <div><dt className="text-muted-foreground">Matrículas</dt><dd className="tabular-nums">{milhar(l.matriculas)}</dd></div>
          <div><dt className="text-muted-foreground">Investido</dt><dd className="tabular-nums">{l.anuncios ? reais(l.investimento) : '—'}</dd></div>
          <div><dt className="text-muted-foreground">Receita</dt><dd className="tabular-nums">{reais(l.receita)}</dd></div>
          <div><dt className="text-muted-foreground">Por matrícula</dt><dd className="tabular-nums">{reais(l.custoPorMatricula)}</dd></div>
        </dl>
        {l.anuncios > 0 && <p className="text-xs text-muted-foreground">{l.anuncios} {l.anuncios === 1 ? 'anúncio aponta' : 'anúncios apontam'} para esta página{l.retorno !== null ? ` · retorno ${l.retorno.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : ''}</p>}
        {l.peca.nota && <p className="line-clamp-2 text-xs text-muted-foreground">{l.peca.nota}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          {l.peca.content_id && podeEscrever && <Button variant="outline" size="sm" onClick={() => router.push(`/conteudos/${l.peca.content_id}`)}><FilePenLine className="size-3.5" />{noAr ? 'Editar texto' : 'Escrever'}</Button>}
          {l.site_url && <a href={l.site_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" />Ver no site</a>}
          {linkDoAnuncio && <Copiar texto={linkDoAnuncio} rotulo="Link para o anúncio" />}
          <button type="button" onClick={() => setEditando((v) => !v)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Dados de ${l.titulo}`}><Settings2 className="size-3.5" /></button>
        </div>
      </div>
      {editando && <Dados l={l} campanhas={campanhas} onFim={() => { setEditando(false); router.refresh() }} />}
    </article>
  )
}
