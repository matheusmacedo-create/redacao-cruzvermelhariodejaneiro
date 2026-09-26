'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, Mail, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { alternarDataComemorativa, definirResumoSemanal, gerarLinkDaAgenda, revogarLinkDaAgenda, salvarDataComemorativa } from '@/app/actions/agenda'
import { CAMADAS, CAMADAS_DO_ICS, type Camada } from '@/lib/agenda/camadas'
import { CATEGORIAS_DE_DATA, DIAS_DA_SEMANA, MESES, descreverRegra, type DataComemorativa } from '@/lib/agenda/datas'
import { cn } from '@/lib/utils'

const campo = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
const secao = 'rounded-xl border border-border p-4'

type Recado = { tom: 'ok' | 'erro'; texto: string } | null

function Aviso({ recado }: { recado: Recado }) {
  if (!recado) return null
  return <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={cn('mt-3 rounded-lg px-3 py-2 text-sm', recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400')}>{recado.texto}</p>
}

export function Configuracoes({ instalada, resumoSemanal, link, visiveis, disponiveis, datas, podeEditarDatas }: {
  instalada: boolean
  resumoSemanal: boolean
  link: { camadas: Camada[]; criadoEm: string | null } | null
  visiveis: Camada[]
  disponiveis: Camada[]
  datas: DataComemorativa[]
  podeEditarDatas: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {!instalada && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          A Agenda ainda não foi instalada no banco (migração pendente). As camadas funcionam, mas as escolhas daqui não ficam guardadas.
        </p>
      )}
      <Resumo inicial={resumoSemanal} />
      <Assinatura link={link} visiveis={visiveis} disponiveis={disponiveis} />
      <Datas datas={datas} podeEditar={podeEditarDatas && instalada} />
    </div>
  )
}

function Resumo({ inicial }: { inicial: boolean }) {
  const [ligado, setLigado] = useState(inicial)
  const [pendente, iniciar] = useTransition()
  const [recado, setRecado] = useState<Recado>(null)
  return (
    <section className={secao} aria-labelledby="resumo-titulo">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="resumo-titulo" className="flex items-center gap-2 font-medium"><Mail className="size-4" aria-hidden="true" />Resumo semanal por e-mail</h3>
          <p className="mt-1 text-sm text-muted-foreground">Toda segunda de manhã: a semana que começa, dia a dia, e o que pede atenção. Vai para o seu e-mail de recuperação e respeita as camadas que você desligou.</p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox" role="switch" className="peer sr-only" checked={ligado} disabled={pendente}
            aria-label="Receber o resumo semanal"
            onChange={(e) => {
              const novo = e.target.checked
              setLigado(novo)
              iniciar(async () => {
                const r = await definirResumoSemanal(novo)
                if (r.erro) { setLigado(!novo); setRecado({ tom: 'erro', texto: r.erro }) } else setRecado({ tom: 'ok', texto: novo ? 'Pronto: o resumo chega toda segunda.' : 'Resumo desligado.' })
              })
            }}
          />
          <span className="h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring" />
          <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>
      <Aviso recado={recado} />
    </section>
  )
}

function Assinatura({ link, visiveis, disponiveis }: { link: { camadas: Camada[]; criadoEm: string | null } | null; visiveis: Camada[]; disponiveis: Camada[] }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [novo, setNovo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [recado, setRecado] = useState<Recado>(null)
  const irao = CAMADAS_DO_ICS.filter((c) => visiveis.includes(c) && disponiveis.includes(c))
  const url = novo ? `${window.location.origin}/api/agenda/ics/${novo}` : null
  const webcal = url?.replace(/^https?:/, 'webcal:')

  const gerar = () => iniciar(async () => {
    setRecado(null)
    const r = await gerarLinkDaAgenda(visiveis)
    if (r.erro || !r.token) { setRecado({ tom: 'erro', texto: r.erro ?? 'Não foi possível gerar o link.' }); return }
    setNovo(r.token)
    router.refresh()
  })
  const revogar = () => iniciar(async () => {
    const r = await revogarLinkDaAgenda()
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
    setNovo(null)
    setRecado({ tom: 'ok', texto: 'Link desligado. Quem assinou deixa de receber atualizações.' })
    router.refresh()
  })

  return (
    <section className={secao} aria-labelledby="link-titulo">
      <h3 id="link-titulo" className="flex items-center gap-2 font-medium"><Link2 className="size-4" aria-hidden="true" />Ver no Google Agenda ou no celular</h3>
      <p className="mt-1 text-sm text-muted-foreground">Um link secreto, só seu, que o Google Agenda, o Outlook e o calendário do celular assinam e atualizam sozinhos (a cada poucas horas). Só leitura: o que muda aqui aparece lá.</p>

      {url ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">O seu link (aparece só agora — copie antes de fechar):</p>
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de assinatura" className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => { navigator.clipboard?.writeText(url).then(() => setCopiado(true), () => setCopiado(false)) }}>
              {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted" target="_blank" rel="noreferrer"
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`}>Adicionar ao Google Agenda</a>
            <a className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted" href={webcal}>Abrir no calendário do aparelho</a>
          </div>
          <p className="text-xs text-muted-foreground">No Outlook: Adicionar calendário → Assinar da web → cole o link. Quem tiver o link vê estas datas: não mande para ninguém.</p>
        </div>
      ) : link ? (
        <p className="mt-3 text-sm">
          Link ativo{link.criadoEm ? ` desde ${new Date(link.criadoEm).toLocaleDateString('pt-BR')}` : ''}, com: {link.camadas.map((c) => CAMADAS[c].nome).join(', ') || 'nenhuma camada'}.
          <span className="block text-xs text-muted-foreground">O link em si não fica guardado. Perdeu? Gere um novo — o antigo para de funcionar.</span>
        </p>
      ) : (
        <p className="mt-3 text-sm">
          Vão no link as camadas ligadas agora que podem sair do sistema: {irao.map((c) => CAMADAS[c].nome).join(', ') || 'nenhuma'}.
          <span className="block text-xs text-muted-foreground">Financeiro, Frota, Chamados e Aniversários nunca vão para o link: ficam só aqui dentro.</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={gerar} disabled={pendente || !irao.length}>{link || novo ? 'Gerar novo link' : 'Gerar link'}</Button>
        {(link || novo) && <Button type="button" size="sm" variant="outline" onClick={revogar} disabled={pendente}>Desligar link</Button>}
      </div>
      <Aviso recado={recado} />
    </section>
  )
}

const VAZIA: Omit<DataComemorativa, 'id'> = { nome: '', descricao: null, categoria: 'institucional', regra: 'fixa', mes: 1, dia: 1, semana: 1, dia_da_semana: 6, antecedencia_dias: 21, ativa: true }

function Datas({ datas, podeEditar }: { datas: DataComemorativa[]; podeEditar: boolean }) {
  const [editando, setEditando] = useState<DataComemorativa | 'nova' | null>(null)
  const [recado, setRecado] = useState<Recado>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  return (
    <section className={secao} aria-labelledby="datas-titulo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="datas-titulo" className="font-medium">Datas comemorativas</h3>
          <p className="mt-1 text-sm text-muted-foreground">Cada data aparece na agenda e, dentro da antecedência, vira alerta até ganhar uma pauta. A lista começou com as datas gerais; as da filial entram aqui.</p>
        </div>
        {podeEditar && editando === null && <Button type="button" size="sm" variant="outline" onClick={() => setEditando('nova')}><Plus aria-hidden="true" />Nova</Button>}
      </div>

      {editando !== null && (
        <FormularioDeData
          data={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(texto) => { setEditando(null); setRecado({ tom: 'ok', texto }); router.refresh() }}
        />
      )}
      <Aviso recado={recado} />

      <ul className="mt-3 divide-y divide-border">
        {datas.map((d) => (
          <li key={d.id} className={cn('flex items-center gap-3 py-2 text-sm', !d.ativa && 'opacity-60')}>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{d.nome}</span>
              <span className="block text-xs text-muted-foreground">{descreverRegra(d)} · {CATEGORIAS_DE_DATA[d.categoria] ?? d.categoria} · alerta {d.antecedencia_dias} dias antes{d.ativa ? '' : ' · desativada'}</span>
            </span>
            {podeEditar && (
              <>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${d.nome}`} onClick={() => setEditando(d)}><Pencil aria-hidden="true" /></Button>
                <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => {
                  const r = await alternarDataComemorativa(d.id, !d.ativa)
                  setRecado(r.erro ? { tom: 'erro', texto: r.erro } : null)
                  router.refresh()
                })}>{d.ativa ? 'Desativar' : 'Reativar'}</Button>
              </>
            )}
          </li>
        ))}
        {!datas.length && <li className="py-2 text-sm text-muted-foreground">Nenhuma data cadastrada.</li>}
      </ul>
    </section>
  )
}

function FormularioDeData({ data, aoFechar, aoSalvar }: { data: DataComemorativa | null; aoFechar: () => void; aoSalvar: (texto: string) => void }) {
  const inicial = data ?? { ...VAZIA, id: '' }
  const [regra, setRegra] = useState(inicial.regra)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2"
      action={(fd) => iniciar(async () => {
        setErro(null)
        const r = await salvarDataComemorativa(fd)
        if (r.erro) setErro(r.erro)
        else aoSalvar(data ? 'Data atualizada.' : 'Data cadastrada.')
      })}
    >
      {data && <input type="hidden" name="id" value={data.id} />}
      <label className="text-sm font-medium sm:col-span-2">Nome<input name="nome" required minLength={3} maxLength={140} defaultValue={inicial.nome} className={campo} /></label>
      <label className="text-sm font-medium">Categoria
        <select name="categoria" defaultValue={inicial.categoria} className={campo}>
          {Object.entries(CATEGORIAS_DE_DATA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Quando cai
        <select name="regra" value={regra} onChange={(e) => setRegra(e.target.value as DataComemorativa['regra'])} className={campo}>
          <option value="fixa">Dia fixo (ex.: 8 de maio)</option>
          <option value="nesimo_dia_semana">Dia da semana (ex.: 2º sábado)</option>
          <option value="mes">O mês inteiro (ex.: Setembro Amarelo)</option>
        </select>
      </label>
      {regra === 'nesimo_dia_semana' && (
        <>
          <label className="text-sm font-medium">Qual
            <select name="semana" defaultValue={String(inicial.semana ?? 1)} className={campo}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}º</option>)}
              <option value={-1}>Último</option>
            </select>
          </label>
          <label className="text-sm font-medium">Dia da semana
            <select name="dia_da_semana" defaultValue={String(inicial.dia_da_semana ?? 6)} className={campo}>
              {DIAS_DA_SEMANA.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </label>
        </>
      )}
      {regra === 'fixa' && (
        <label className="text-sm font-medium">Dia<input name="dia" type="number" min={1} max={31} required defaultValue={inicial.dia ?? 1} className={campo} /></label>
      )}
      <label className="text-sm font-medium">Mês
        <select name="mes" defaultValue={String(inicial.mes)} className={campo}>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Alertar quantos dias antes<input name="antecedencia_dias" type="number" min={0} max={120} required defaultValue={inicial.antecedencia_dias} className={campo} /></label>
      <label className="text-sm font-medium sm:col-span-2">Descrição (opcional)<textarea name="descricao" maxLength={600} rows={2} defaultValue={inicial.descricao ?? ''} className={campo} /></label>
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{erro}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={aoFechar}>Cancelar</Button>
        <Button type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </form>
  )
}
