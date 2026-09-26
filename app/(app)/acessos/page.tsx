import { notFound } from 'next/navigation'
import { Ban, CircleCheck, Fingerprint, LogIn, LogOut, Mail, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tituloDaArea } from '@/lib/navegacao'
import { lugar } from '@/lib/acessos/agente'
import { podeVerAcessos } from '@/lib/acessos/servidor'
import {
  EVENTOS, FILTROS_DE_EVENTO, PERIODOS, ROTULO_DO_EVENTO, ROTULO_DO_SINAL,
  type EventoDeAcesso, type SinalDeRisco,
} from '@/lib/acessos/regras'

export const metadata = { title: tituloDaArea('/acessos') }

/**
 * O registro de acessos (docs/registro-de-acessos.md). Só para quem está em
 * acessos_leitores — decisão do Matheus: só ele. Para os outros a página não
 * existe (404), nem o item no menu.
 */

type Linha = {
  id: number; ocorrido_em: string; evento: EventoDeAcesso; tipo_de_conta: 'equipe' | 'voluntario'; conta_id: string | null
  ip: string | null; pais: string | null; estado: string | null; cidade: string | null; latitude: number | null; longitude: number | null
  fuso: string | null; user_agent: string | null; navegador: string | null; sistema: string | null; dispositivo: string | null
  aparelho_id: string | null; sinais: Record<string, unknown>; impressao: string | null; sinais_de_risco: SinalDeRisco[]; motivo: string | null
}
type Aparelho = {
  id: string; tipo_de_conta: string; conta_id: string; rotulo: string; primeiro_em: string; ultimo_em: string
  ultimo_ip: string | null; ultima_cidade: string | null; impressao: string | null; assinatura: string | null
}

const data = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso))
const curto = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '—')
const ICONE: Record<EventoDeAcesso, typeof LogIn> = {
  entrada: LogIn, entrada_falhou: ShieldX, entrada_bloqueada: Ban, mfa_ok: ShieldCheck, mfa_falhou: ShieldX, codigo_pedido: Mail, saida: LogOut,
}
const TOM = { ok: 'text-emerald-700 dark:text-emerald-400', falha: 'text-red-700 dark:text-red-400', neutro: 'text-muted-foreground' }
/** Um instante no passado, em ISO. Fora do componente: a página é de servidor e roda uma vez por pedido. */
const haDias = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60_000).toISOString()
const selectClass = 'h-9 rounded-md border border-border bg-background px-2 text-sm'

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm">{children ?? '—'}</dd>
    </div>
  )
}

export default async function AcessosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireWorkspace()
  const ws = context.workspace.id
  if (context.role !== 'admin' || !(await podeVerAcessos(context.user.id, ws))) notFound()

  const sp = await searchParams
  const um = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? ''
  const filtro = FILTROS_DE_EVENTO[um('o')] ? um('o') : 'todos'
  const periodo = PERIODOS[um('p')] ? um('p') : '7'
  const pessoa = /^[0-9a-f-]{36}$/.test(um('pessoa')) ? um('pessoa') : um('pessoa') === 'voluntarios' ? 'voluntarios' : ''
  const soAlertas = um('alertas') === '1'
  const aparelho = /^[0-9a-f-]{36}$/.test(um('aparelho')) ? um('aparelho') : ''
  const ip = um('ip').slice(0, 45)

  // A leitura é pelo cliente da própria pessoa: o RLS confere de novo que ela é leitora.
  const supabase = await createClient()
  let consulta = supabase.from('acessos_eventos')
    .select('id,ocorrido_em,evento,tipo_de_conta,conta_id,ip,pais,estado,cidade,latitude,longitude,fuso,user_agent,navegador,sistema,dispositivo,aparelho_id,sinais,impressao,sinais_de_risco,motivo')
    .eq('workspace_id', ws)
    .in('evento', FILTROS_DE_EVENTO[filtro].eventos)
    .order('ocorrido_em', { ascending: false })
    .limit(300)
  const dias = PERIODOS[periodo].dias
  if (dias) consulta = consulta.gte('ocorrido_em', haDias(dias))
  if (pessoa === 'voluntarios') consulta = consulta.eq('tipo_de_conta', 'voluntario')
  else if (pessoa) consulta = consulta.eq('conta_id', pessoa)
  if (soAlertas) consulta = consulta.neq('sinais_de_risco', '{}')
  if (aparelho) consulta = consulta.eq('aparelho_id', aparelho)
  if (ip) consulta = consulta.eq('ip', ip)

  const umDia = haDias(1)
  const [{ data: eventos, error }, { data: aparelhos }, resumo] = await Promise.all([
    consulta,
    supabase.from('acessos_aparelhos').select('id,tipo_de_conta,conta_id,rotulo,primeiro_em,ultimo_em,ultimo_ip,ultima_cidade,impressao,assinatura')
      .eq('workspace_id', ws).order('ultimo_em', { ascending: false }).limit(200),
    Promise.all((['entrada', 'entrada_falhou', 'entrada_bloqueada'] as const).map((e) =>
      supabase.from('acessos_eventos').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('evento', e).gte('ocorrido_em', umDia))),
  ])

  if (error) {
    const semMigracao = error.code === '42P01' || error.code === 'PGRST205'
    return (
      <div>
        <PageHeader title="Acessos" />
        <Card className="flex items-start gap-3 p-6">
          <TriangleAlert className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">{semMigracao ? 'O banco ainda não tem as tabelas do registro de acessos (migração 20260928000000_cvrj_acessos).' : 'Não foi possível ler o registro de acessos agora.'}</p>
        </Card>
      </div>
    )
  }

  const linhas = (eventos ?? []) as Linha[]
  const listaDeAparelhos = (aparelhos ?? []) as Aparelho[]
  const aparelhoPorId = new Map(listaDeAparelhos.map((a) => [a.id, a]))

  // Nomes: equipe em profiles, voluntários em participantes (só os que aparecem aqui).
  const admin = createAdminClient()
  const idsEquipe = [...new Set([...linhas.filter((l) => l.tipo_de_conta === 'equipe'), ...listaDeAparelhos].map((l) => l.conta_id).filter((x): x is string => Boolean(x)))]
  const idsVoluntarios = [...new Set(linhas.filter((l) => l.tipo_de_conta === 'voluntario').map((l) => l.conta_id).filter((x): x is string => Boolean(x)))]
  const [{ data: equipe }, { data: voluntarios }, { data: membros }] = await Promise.all([
    idsEquipe.length ? admin.from('profiles').select('id,full_name,username').in('id', idsEquipe) : Promise.resolve({ data: [] }),
    idsVoluntarios.length ? admin.from('participantes').select('id,nome').in('id', idsVoluntarios).eq('workspace_id', ws) : Promise.resolve({ data: [] }),
    admin.from('workspace_members').select('user_id, role, profiles(full_name)').eq('workspace_id', ws),
  ])
  const nomes = new Map<string, string>([
    ...((equipe ?? []) as { id: string; full_name: string | null; username: string }[]).map((p) => [p.id, p.full_name || p.username] as [string, string]),
    ...((voluntarios ?? []) as { id: string; nome: string }[]).map((v) => [v.id, v.nome] as [string, string]),
  ])
  const pessoasDoFiltro = ((membros ?? []) as unknown as { user_id: string; role: string; profiles: { full_name: string | null } | null }[])
    .map((m) => ({ id: m.user_id, nome: m.profiles?.full_name || m.user_id.slice(0, 8), papel: m.role }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Olhar o registro também fica registrado: quem vigia fica visível.
  await admin.from('activity_log').insert({
    workspace_id: ws, actor_id: context.user.id, action: 'acessos.consultados', entity_type: 'acessos',
    metadata: { filtro, periodo, pessoa: pessoa || null, alertas: soAlertas, aparelho: aparelho || null, ip: ip || null },
  })

  const seteDias = haDias(7)
  const [entradas, falhas, bloqueios] = resumo.map((r) => r.count ?? 0)
  const novos7d = listaDeAparelhos.filter((a) => a.primeiro_em > seteDias).length
  const quem = (l: { tipo_de_conta: string; conta_id: string | null }) =>
    l.conta_id ? nomes.get(l.conta_id) ?? (l.tipo_de_conta === 'voluntario' ? 'Voluntário' : 'Conta removida') : 'Usuário inexistente'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Acessos"
        description="Quem entrou na Redação e na Área do Voluntário, quando, de onde e com qual aparelho — inclusive as tentativas erradas e os bloqueios. Só você vê esta página; cada consulta fica registrada."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Entradas nas últimas 24 h', valor: entradas },
          { rotulo: 'Tentativas erradas (24 h)', valor: falhas },
          { rotulo: 'Bloqueios (24 h)', valor: bloqueios },
          { rotulo: 'Aparelhos novos (7 dias)', valor: novos7d },
        ].map((c) => (
          <Card key={c.rotulo} className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{c.valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.rotulo}</p>
          </Card>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Pessoa
          <select name="pessoa" defaultValue={pessoa} className={selectClass}>
            <option value="">Todas</option>
            {pessoasDoFiltro.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.papel === 'escola' ? ' (escola)' : ''}</option>)}
            <option value="voluntarios">Voluntários</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">O que aconteceu
          <select name="o" defaultValue={filtro} className={selectClass}>
            {Object.entries(FILTROS_DE_EVENTO).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Período
          <select name="p" defaultValue={periodo} className={selectClass}>
            {Object.entries(PERIODOS).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="alertas" value="1" defaultChecked={soAlertas} className="size-4" />
          Só com alerta
        </label>
        {aparelho && <input type="hidden" name="aparelho" value={aparelho} />}
        {ip && <input type="hidden" name="ip" value={ip} />}
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
        {(aparelho || ip) && (
          <a href="/acessos" className="h-9 content-center text-sm text-primary underline-offset-4 hover:underline">
            Limpar {aparelho ? 'aparelho' : 'IP'} ✕
          </a>
        )}
      </form>

      <section aria-labelledby="titulo-eventos" className="flex flex-col gap-2">
        <h2 id="titulo-eventos" className="text-sm font-semibold">
          {linhas.length === 300 ? 'Os 300 acessos mais recentes do filtro' : `${linhas.length} acesso${linhas.length === 1 ? '' : 's'}`}
        </h2>
        {linhas.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">Nada neste filtro. O registro começa a contar a partir da primeira entrada depois que esta ferramenta foi ao ar.</Card>
        )}
        <div className="flex flex-col gap-1.5">
          {linhas.map((l) => {
            const e = ROTULO_DO_EVENTO[l.evento] ?? { nome: l.evento, tom: 'neutro' as const }
            const Icone = ICONE[l.evento] ?? CircleCheck
            const ap = l.aparelho_id ? aparelhoPorId.get(l.aparelho_id) : undefined
            const s = l.sinais ?? {}
            const componentes = (s.componentes ?? {}) as Record<string, string>
            return (
              <details key={l.id} className="group rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                  <Icone className={`size-4 shrink-0 ${TOM[e.tom]}`} aria-hidden="true" />
                  <span className="min-w-0 font-medium">{quem(l)}</span>
                  {l.tipo_de_conta === 'voluntario' && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">voluntário</span>}
                  <span className={TOM[e.tom]}>{e.nome}</span>
                  <span className="text-muted-foreground tabular-nums">{data(l.ocorrido_em)}</span>
                  <span className="text-muted-foreground">{lugar(l)}</span>
                  <span className="hidden text-muted-foreground md:inline">{[l.navegador, l.sistema, l.dispositivo].filter(Boolean).join(' · ')}</span>
                  {l.sinais_de_risco.filter((x) => x !== 'primeiro_registro').map((x) => (
                    <span key={x} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{ROTULO_DO_SINAL[x] ?? x}</span>
                  ))}
                </summary>
                <dl className="grid gap-x-6 gap-y-3 border-t border-border px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Campo rotulo="IP">{l.ip ? <a href={`/acessos?p=tudo&ip=${encodeURIComponent(l.ip)}`} className="text-primary underline-offset-4 hover:underline">{l.ip}</a> : null}</Campo>
                  <Campo rotulo="Local aproximado (pelo IP)">
                    {lugar(l)}
                    {l.latitude !== null && l.longitude !== null && (
                      <> · <a href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=11/${l.latitude}/${l.longitude}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">mapa</a></>
                    )}
                  </Campo>
                  <Campo rotulo="Fuso: IP / navegador">{[l.fuso, s.fuso as string | undefined].filter(Boolean).join(' / ') || null}</Campo>
                  <Campo rotulo="Aparelho">
                    {ap ? (
                      <a href={`/acessos?p=tudo&aparelho=${ap.id}`} className="text-primary underline-offset-4 hover:underline">{ap.rotulo}</a>
                    ) : [l.navegador, l.sistema, l.dispositivo].filter(Boolean).join(' · ') || null}
                    {ap && <span className="block text-xs text-muted-foreground">visto pela 1ª vez em {data(ap.primeiro_em)}</span>}
                  </Campo>
                  <Campo rotulo="Tela · densidade · toque">{s.tela ? `${s.tela} · ${s.densidade ?? '—'}x · ${s.toque ?? 0} pontos` : null}</Campo>
                  <Campo rotulo="Processador · memória">{s.nucleos ? `${s.nucleos} núcleos · ${s.memoria ? `${s.memoria} GB` : 'memória não informada'}` : null}</Campo>
                  <Campo rotulo="Placa de vídeo (WebGL)">{(s.gpu as string) ?? null}</Campo>
                  <Campo rotulo="Idiomas">{[...((s.idiomas as string[] | undefined) ?? [])].join(', ') || (s.idiomasDaRequisicao as string) || null}</Campo>
                  <Campo rotulo="Plataforma · fontes detectadas">{s.plataforma ? `${s.plataforma} · ${s.fontes ?? 0} fontes` : null}</Campo>
                  <Campo rotulo="Impressão digital">
                    {l.impressao ? <span className="font-mono text-xs" title={l.impressao}>{curto(l.impressao)}</span> : null}
                    {Object.keys(componentes).length > 0 && (
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        {Object.entries(componentes).map(([k, v]) => `${k} ${v.slice(0, 6)}`).join(' · ')}
                      </span>
                    )}
                  </Campo>
                  <Campo rotulo="Motivo">{l.motivo}</Campo>
                  <Campo rotulo="Navegador (user agent)"><span className="font-mono text-[11px]">{l.user_agent}</span></Campo>
                </dl>
              </details>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="titulo-aparelhos" className="flex flex-col gap-2">
        <h2 id="titulo-aparelhos" className="flex items-center gap-2 text-sm font-semibold"><Fingerprint className="size-4" aria-hidden="true" />Aparelhos da equipe</h2>
        {listaDeAparelhos.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">Nenhum aparelho reconhecido ainda.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Pessoa</th>
                  <th className="px-3 py-2 font-medium">Aparelho</th>
                  <th className="px-3 py-2 font-medium">Primeira vez</th>
                  <th className="px-3 py-2 font-medium">Última vez</th>
                  <th className="px-3 py-2 font-medium">Último local</th>
                  <th className="px-3 py-2 font-medium">Impressão</th>
                </tr>
              </thead>
              <tbody>
                {listaDeAparelhos.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{nomes.get(a.conta_id) ?? '—'}</td>
                    <td className="px-3 py-2"><a href={`/acessos?p=tudo&aparelho=${a.id}`} className="text-primary underline-offset-4 hover:underline">{a.rotulo}</a></td>
                    <td className="px-3 py-2 tabular-nums">{data(a.primeiro_em)}</td>
                    <td className="px-3 py-2 tabular-nums">{data(a.ultimo_em)}</td>
                    <td className="px-3 py-2">{a.ultima_cidade ?? '—'}{a.ultimo_ip ? <span className="block text-xs text-muted-foreground">{a.ultimo_ip}</span> : null}</td>
                    <td className="px-3 py-2 font-mono text-xs" title={a.impressao ?? ''}>{curto(a.impressao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Eventos registrados: {EVENTOS.map((e) => ROTULO_DO_EVENTO[e].nome.toLowerCase()).join(', ')}. O local vem do IP e é aproximado —
        em rede de celular a cidade pode sair errada. Voluntários: só IP, local e navegador, sem impressão digital.
      </p>
    </div>
  )
}
