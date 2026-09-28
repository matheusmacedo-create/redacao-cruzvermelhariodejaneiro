import Link from 'next/link'
import QRCode from 'qrcode'
import { AlertTriangle, BadgeAlert, Clock, DoorOpen, Printer, Search, Smartphone, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { Retrato } from '@/components/membro/foto'
import { Logo } from '@/components/membro/marca'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { urlBase } from '@/lib/newsletter/contexto'
import { tituloDaArea } from '@/lib/navegacao'
import {
  COLUNAS_DA_VISITA, crachaPendente, diaEHora, diaEmSaoPaulo, entrouEmOutroDia, haQuanto, hora, linkDaEntrada, quemVisita, situacaoDaVisita,
  urlDaFotoDoVisitante, type Visita,
} from '@/lib/portaria/regras'
import { pessoasParaVisitar } from '@/lib/portaria/servidor'
import { CrachasDeVisitante } from '@/components/app/portaria/crachas-de-visitante'
import { AtualizarSozinho, ConfirmarCadastro, DevolverCracha, NovaEntrada, RegistrarSaida, TirarFoto, TrocarLink } from '@/components/app/portaria/acoes'
import { ResponderVisita, SeloDaResposta } from '@/components/app/portaria/resposta'

export const metadata = { title: tituloDaArea('/portaria') }
export const dynamic = 'force-dynamic'

const inputClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
/** Meia-noite de hoje em Brasília, em UTC (o fuso é fixo, UTC−3). */
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString()

/**
 * Portaria virtual — o livro de visitantes (lib/portaria/regras.ts). Abas:
 * "Agora" (registrar, confirmar o autocadastro do QR, quem está dentro,
 * crachás não devolvidos), "Histórico" (por dia, com busca) e "QR da entrada"
 * (o cartaz para imprimir).
 */
export default async function PortariaPage({ searchParams }: { searchParams: Promise<{ aba?: string; dia?: string; q?: string }> }) {
  const sp = await searchParams
  const context = await requireWorkspace()
  const ws = context.workspace.id
  const supabase = await createClient()
  const aba = sp.aba === 'historico' ? 'historico' : sp.aba === 'qr' ? 'qr' : sp.aba === 'crachas' ? 'crachas' : 'agora'
  const hoje = diaEmSaoPaulo(new Date())
  // Quem pode ser visitado sai junto com as visitas da aba, numa ida só ao banco.
  const pessoas = aba === 'agora' || aba === 'historico' ? pessoasParaVisitar(ws) : Promise.resolve([])

  const abas = [
    { id: 'agora', rotulo: 'Agora' },
    { id: 'historico', rotulo: 'Histórico' },
    { id: 'qr', rotulo: 'QR da entrada' },
    { id: 'crachas', rotulo: 'Crachás de visitante' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Portaria" description="O livro de visitantes da filial: quem chegou, quem está aqui agora e os crachás de visitante. Sem documento; a foto é opcional." />
      <nav className="flex flex-wrap gap-1 border-b border-border print:hidden" aria-label="Abas" data-ajuda="portaria.abas">
        {abas.map((a) => (
          <Link key={a.id} href={`/portaria${a.id === 'agora' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>
      {aba === 'agora' && <Agora ws={ws} hoje={hoje} supabase={supabase} pessoas={pessoas} />}
      {aba === 'historico' && <Historico ws={ws} hoje={hoje} dia={sp.dia} q={sp.q} supabase={supabase} pessoas={pessoas} />}
      {aba === 'qr' && <CartazDoQr ws={ws} supabase={supabase} admin={context.role === 'admin'} />}
      {aba === 'crachas' && <CrachasDeVisitante />}
    </div>
  )
}

type Supabase = Awaited<ReturnType<typeof createClient>>
type Pessoas = ReturnType<typeof pessoasParaVisitar>
const nomesDe = (pessoas: Awaited<Pessoas>) => new Map(pessoas.map((p) => [p.id, p.nome]))

function Linha({ v, nomeDe, children, destaque }: { v: Visita; nomeDe: Map<string, string>; children?: React.ReactNode; destaque?: React.ReactNode }) {
  const visita = quemVisita(v, v.visitado_id ? nomeDe.get(v.visitado_id) : null)
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-visita={situacaoDaVisita(v)}>
      <Retrato url={urlDaFotoDoVisitante(v.id, v.foto_path)} nome={v.nome} className="size-11 text-sm" alt={v.foto_path ? `Foto de ${v.nome}` : ''} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{v.nome}{v.cracha_numero && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">crachá {v.cracha_numero}</span>}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[v.empresa, visita ? `visita ${visita}` : null, v.motivo, v.telefone].filter(Boolean).join(' · ') || '—'}
        </p>
        {destaque}
      </div>
      {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
    </li>
  )
}

async function Agora({ ws, hoje, supabase, pessoas: pessoasP }: { ws: string; hoje: string; supabase: Supabase; pessoas: Pessoas }) {
  const [pessoas, { data: aguardando, error }, { data: dentro }, { data: crachas }, { count: hojeTotal }] = await Promise.all([
    pessoasP,
    supabase.from('portaria_visitas').select(COLUNAS_DA_VISITA).eq('workspace_id', ws).is('entrada_em', null).is('descartada_em', null).order('created_at').limit(50),
    supabase.from('portaria_visitas').select(COLUNAS_DA_VISITA).eq('workspace_id', ws).not('entrada_em', 'is', null).is('saida_em', null).order('entrada_em', { ascending: false }).limit(300),
    supabase.from('portaria_visitas').select(COLUNAS_DA_VISITA).eq('workspace_id', ws).not('cracha_numero', 'is', null).is('cracha_devolvido_em', null).not('saida_em', 'is', null).order('saida_em', { ascending: false }).limit(100),
    supabase.from('portaria_visitas').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).gte('entrada_em', inicioDoDia(hoje)),
  ])
  if (error) {
    return <Card className="p-6 text-sm">A Portaria ainda não está ligada no banco (migração 20260929060000). Avise a administração.</Card>
  }
  const nomeDe = nomesDe(pessoas)
  const esperando = (aguardando ?? []) as Visita[]
  const agora = (dentro ?? []) as Visita[]
  const pendentes = ((crachas ?? []) as Visita[]).filter(crachaPendente)
  const esquecidos = agora.filter((v) => entrouEmOutroDia(v, hoje))

  return (
    <>
      <AtualizarSozinho />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-ajuda="portaria.numeros">
        {[
          [agora.length, 'na filial agora', Users, false],
          [hojeTotal ?? 0, 'entradas hoje', DoorOpen, false],
          [esperando.length, 'cadastros pelo QR esperando', Smartphone, esperando.length > 0],
          [pendentes.length, 'crachás não devolvidos', BadgeAlert, pendentes.length > 0],
        ].map(([n, r, Icone, alerta], i) => {
          const I = Icone as typeof Users
          return <Card key={i} className={`flex items-center gap-3 p-4 ${alerta ? 'border-warning/60' : ''}`}><I className="size-5 text-muted-foreground" /><span><span className="block text-2xl font-bold tabular-nums">{String(n)}</span><span className="text-xs text-muted-foreground">{String(r)}</span></span></Card>
        })}
      </div>

      {esperando.length > 0 && (
        <Card className="overflow-hidden border-warning/60 p-0" data-ajuda="portaria.aguardando">
          <h2 className="border-b border-border bg-warning/10 px-4 py-2.5 text-sm font-semibold">Chegaram pelo QR — confirme a entrada</h2>
          <ul className="divide-y divide-border">
            {esperando.map((v) => (
              <Linha key={v.id} v={v} nomeDe={nomeDe} destaque={<p className="text-xs text-muted-foreground">Cadastrou-se {haQuanto(v.created_at)}</p>}>
                <ConfirmarCadastro id={v.id} pessoas={pessoas} inicial={v} />
              </Linha>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="p-5" data-ajuda="portaria.nova">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Registrar entrada</h2>
          <NovaEntrada pessoas={pessoas} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0" data-ajuda="portaria.dentro">
            <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Na filial agora ({agora.length})</h2>
            {agora.some((v) => v.visitado_id && (!v.resposta || v.resposta === 'aguardar')) && (
              <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Quem é visitado responde pelo Palácio ou pelo WhatsApp; a resposta aparece aqui sozinha.</p>
            )}
            {!agora.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum visitante dentro da filial.</p>}
            <ul className="divide-y divide-border">
              {agora.map((v) => (
                <Linha key={v.id} v={v} nomeDe={nomeDe} destaque={
                  <>
                    <p className={`flex items-center gap-1 text-xs ${entrouEmOutroDia(v, hoje) ? 'font-medium text-warning-foreground' : 'text-muted-foreground'}`}>
                      {entrouEmOutroDia(v, hoje) ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
                      Entrou {entrouEmOutroDia(v, hoje) ? `em ${diaEHora(v.entrada_em!)} — esqueceram a saída?` : `às ${hora(v.entrada_em!)} (${haQuanto(v.entrada_em!)})`}
                    </p>
                    {/* A resposta de quem é visitado (pelo Palácio ou pelo WhatsApp): o que dizer ao visitante. */}
                    {v.visitado_id && (
                      <SeloDaResposta resposta={v.resposta} quem={nomeDe.get(v.visitado_id) ?? null} recado={v.resposta_recado}
                        quando={v.resposta_em ? hora(v.resposta_em) : null} pelo={v.resposta_canal} />
                    )}
                  </>
                }>
                  {v.visitado_id && <ResponderVisita id={v.id} atual={v.resposta} compacto nomeDoVisitante={v.nome} />}
                  <TirarFoto id={v.id} nome={v.nome} tem={Boolean(v.foto_path)} />
                  <RegistrarSaida id={v.id} nome={v.nome} cracha={v.cracha_numero} />
                </Linha>
              ))}
            </ul>
          </Card>

          {pendentes.length > 0 && (
            <Card className="overflow-hidden border-destructive/40 p-0" data-ajuda="portaria.crachas">
              <h2 className="border-b border-border bg-destructive/5 px-4 py-2.5 text-sm font-semibold">Crachás não devolvidos ({pendentes.length})</h2>
              <ul className="divide-y divide-border">
                {pendentes.map((v) => (
                  <Linha key={v.id} v={v} nomeDe={nomeDe} destaque={<p className="text-xs text-muted-foreground">Saiu em {diaEHora(v.saida_em!)}</p>}>
                    <DevolverCracha id={v.id} cracha={v.cracha_numero!} />
                  </Linha>
                ))}
              </ul>
            </Card>
          )}
          {esquecidos.length > 0 && <p className="text-xs text-muted-foreground">{esquecidos.length === 1 ? 'Uma pessoa entrou' : `${esquecidos.length} pessoas entraram`} em outro dia e ainda aparece{esquecidos.length === 1 ? '' : 'm'} dentro: registre a saída.</p>}
        </div>
      </div>
    </>
  )
}

async function Historico({ ws, hoje, dia, q, supabase, pessoas: pessoasP }: { ws: string; hoje: string; dia?: string; q?: string; supabase: Supabase; pessoas: Pessoas }) {
  const escolhido = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= hoje ? dia : hoje
  const termo = (q ?? '').trim().slice(0, 60)
  let consulta = supabase.from('portaria_visitas').select(COLUNAS_DA_VISITA).eq('workspace_id', ws).not('entrada_em', 'is', null)
  // Com busca, olha todos os dias; sem busca, o dia escolhido.
  if (termo) consulta = consulta.or(`nome.ilike.%${termo.replace(/[%,()"\\]/g, ' ')}%,empresa.ilike.%${termo.replace(/[%,()"\\]/g, ' ')}%`)
  else {
    const fim = new Date(new Date(`${escolhido}T00:00:00-03:00`).getTime() + 86_400_000).toISOString()
    consulta = consulta.gte('entrada_em', inicioDoDia(escolhido)).lt('entrada_em', fim)
  }
  const [pessoas, { data }] = await Promise.all([pessoasP, consulta.order('entrada_em', { ascending: false }).limit(500)])
  const nomeDe = nomesDe(pessoas)
  const visitas = (data ?? []) as Visita[]
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2" role="search" data-ajuda="portaria.busca">
        <input type="hidden" name="aba" value="historico" />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Dia
          <input type="date" name="dia" max={hoje} defaultValue={escolhido} className={inputClass} />
        </label>
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted-foreground">Buscar em todos os dias
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input name="q" defaultValue={termo} placeholder="Nome ou de onde vem" className={`${inputClass} w-full pl-9`} />
          </span>
        </label>
        <Button type="submit" variant="outline">Ver</Button>
      </form>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Visitante</th><th className="px-3 py-2.5">Visitou</th><th className="px-3 py-2.5">Entrada</th><th className="px-3 py-2.5">Saída</th><th className="px-3 py-2.5">Crachá</th>
            </tr></thead>
            <tbody>
              {visitas.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Retrato url={urlDaFotoDoVisitante(v.id, v.foto_path)} nome={v.nome} className="size-8 text-xs" /><span><span className="block font-medium">{v.nome}</span><span className="text-xs text-muted-foreground">{[v.empresa, v.motivo].filter(Boolean).join(' · ')}</span></span></span></td>
                  <td className="px-3 py-2.5 text-xs">{quemVisita(v, v.visitado_id ? nomeDe.get(v.visitado_id) : null) || '—'}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{termo ? diaEHora(v.entrada_em!) : hora(v.entrada_em!)}{v.origem === 'autocadastro' && <span className="ml-1 text-muted-foreground">(QR)</span>}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{v.saida_em ? (termo ? diaEHora(v.saida_em) : hora(v.saida_em)) : <span className="font-medium text-warning-foreground">dentro</span>}</td>
                  <td className="px-3 py-2.5 text-xs">{v.cracha_numero ? `${v.cracha_numero}${v.cracha_devolvido_em ? ' · devolvido' : v.saida_em ? ' · não devolvido' : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visitas.length && <p className="p-8 text-center text-sm text-muted-foreground">{termo ? 'Ninguém encontrado.' : 'Nenhuma visita neste dia.'}</p>}
      </Card>
    </div>
  )
}

async function CartazDoQr({ ws, supabase, admin }: { ws: string; supabase: Supabase; admin: boolean }) {
  const { data } = await supabase.from('portaria_config').select('token,atualizado_em').eq('workspace_id', ws).maybeSingle()
  if (!data?.token) return <Card className="p-6 text-sm">O QR da entrada ainda não foi criado (migração 20260929060000). Avise a administração.</Card>
  const link = linkDaEntrada(urlBase(), data.token as string)
  const qr = await QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1f1f1f', light: '#ffffff' } })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button render={<Link href="/portaria/cartaz" />} data-portaria-cartaz><Printer className="size-4" />Cartaz para imprimir</Button>
        {admin && <TrocarLink />}
        <p className="w-full text-sm text-muted-foreground">Imprima e deixe na entrada. Quem ler o QR se cadastra no celular e aparece em “Agora” para a portaria confirmar. Se o cartaz for copiado ou fotografado por quem não devia, um administrador gera um link novo e o antigo para de valer.</p>
      </div>
      <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-5 p-8 text-center print:border-0 print:shadow-none" data-ajuda="portaria.cartaz">
        <Logo className="w-40" />
        <div>
          <p className="text-2xl font-bold">Visitante?</p>
          <p className="text-muted-foreground">Registre a sua entrada pelo celular.</p>
        </div>
        <div className="w-60 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="QR do registro de visitante" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="text-sm">Aponte a câmera, preencha e mostre a tela na portaria.<br />Não pedimos documento.</p>
        <p className="break-all text-[10px] text-muted-foreground">{link}</p>
      </Card>
    </div>
  )
}

