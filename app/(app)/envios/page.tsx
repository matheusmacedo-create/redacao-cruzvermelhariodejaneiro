import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { FileText, Image as ImageIcon, Images, Mic, Plus, Video } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { LinkDaEquipe } from '@/components/app/envios/link-da-equipe'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { tituloDaArea } from '@/lib/navegacao'
import { urlBase } from '@/lib/newsletter/contexto'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { armazenamento, avaliaEnvios } from '@/lib/envios/servidor'
import { AUTORIZACOES, ESTADOS_DO_ENVIO, type Autorizacao, type EstadoDoEnvio } from '@/lib/envios/regras'
import { cn } from '@/lib/utils'

export const metadata = { title: tituloDaArea('/envios') }

/**
 * A caixa dos envios da equipe (docs/envio-de-acoes.md §5). Só para quem está
 * em envios_avaliadores (hoje, só o Matheus); para os outros, 404.
 */

const ABAS = {
  avaliar: { rotulo: 'Para avaliar', estados: ['novo', 'em_avaliacao'] },
  pauta: { rotulo: 'Viraram pauta', estados: ['virou_pauta'] },
  arquivados: { rotulo: 'Arquivados', estados: ['arquivado'] },
  chegando: { rotulo: 'Ainda chegando', estados: ['recebendo'] },
} as const
type Aba = keyof typeof ABAS

type Linha = {
  id: string; protocolo: string; estado: EstadoDoEnvio; criado_em: string; nome: string; setor: string | null; titulo: string
  local: string | null; relato: string | null; autorizacao_imagem: Autorizacao
  envio_arquivos: { id: string; chave: string; categoria: string; estado: string }[]
}

const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const COR: Record<EstadoDoEnvio, string> = {
  recebendo: 'bg-muted text-muted-foreground', novo: 'bg-primary/10 text-primary', em_avaliacao: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  virou_pauta: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200', arquivado: 'bg-muted text-muted-foreground',
}

export default async function EnviosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const context = await requireWorkspace()
  const ws = context.workspace.id
  if (!(await avaliaEnvios(context.user.id, ws))) notFound()
  const { aba: pedida } = await searchParams
  const aba: Aba = pedida && pedida in ABAS ? pedida as Aba : 'avaliar'

  const supabase = await createClient()
  const [{ data, error }, contagens] = await Promise.all([
    supabase.from('envios')
      .select('id,protocolo,estado,criado_em,nome,setor,titulo,local,relato,autorizacao_imagem,envio_arquivos(id,chave,categoria,estado)')
      .eq('workspace_id', ws).in('estado', [...ABAS[aba].estados]).order('criado_em', { ascending: false }).limit(100),
    Promise.all((Object.keys(ABAS) as Aba[]).map((a) =>
      supabase.from('envios').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).in('estado', [...ABAS[a].estados]))),
  ])
  // Os eventos mais recentes, para a faixa do alto (sem a migração dos álbuns, a faixa só não aparece).
  const { data: eventos } = await supabase.from('envio_eventos').select('id, nome, data_do_evento, envio_aberto')
    .eq('workspace_id', ws).order('criado_em', { ascending: false }).limit(4)
  const link = `${urlBase()}/enviar`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#1a1a1a', light: '#ffffff' } })

  if (error) {
    const semMigracao = error.code === '42P01' || error.code === 'PGRST205'
    return (
      <div>
        <PageHeader title="Envios da equipe" />
        <Card className="p-6 text-sm">{semMigracao ? 'O banco ainda não tem as tabelas dos envios (migração 20260928010000_cvrj_envios).' : 'Não foi possível ler os envios agora.'}</Card>
      </div>
    )
  }

  const r2 = armazenamento()
  const linhas = (data ?? []) as unknown as Linha[]
  const capa = (l: Linha) => {
    const foto = l.envio_arquivos.find((a) => a.categoria === 'foto' && a.estado === 'recebido')
    return foto && r2 ? urlAssinada(r2.config, r2.bucket, foto.chave, 'GET', 3600) : null
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Envios da equipe" description="O que a equipe mandou pelo link: relatos, áudios, fotos e vídeos das ações. Avalie, escolha o material e transforme em pauta, matéria e posts." />
      <LinkDaEquipe url={link} qr={qr} />

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" data-ajuda="envios.eventos">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Images className="size-4 text-primary" aria-hidden="true" />Eventos e álbuns</h2>
          <Link href="/envios/eventos" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="size-3.5" aria-hidden="true" />Novo evento</Link>
        </div>
        <p className="text-sm text-muted-foreground">Vai ter evento com várias pessoas fotografando? Crie o evento: ele ganha um link de envio próprio e um álbum que todo mundo vê e baixa.</p>
        {eventos && eventos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {eventos.map((ev) => (
              <li key={ev.id}>
                <Link href={`/envios/eventos/${ev.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted">
                  {ev.nome}{ev.data_do_evento ? <span className="text-xs text-muted-foreground">{ev.data_do_evento.split('-').reverse().slice(0, 2).join('/')}</span> : null}
                </Link>
              </li>
            ))}
            <li><Link href="/envios/eventos" className="inline-flex h-8 items-center px-2 text-sm text-primary hover:underline">Ver todos</Link></li>
          </ul>
        )}
      </section>

      <nav aria-label="Filtro dos envios" className="flex flex-wrap gap-1.5" data-ajuda="envios.abas">
        {(Object.keys(ABAS) as Aba[]).map((a, i) => (
          <Link key={a} href={a === 'avaliar' ? '/envios' : `/envios?aba=${a}`} aria-current={a === aba ? 'page' : undefined}
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm', a === aba ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-border hover:bg-muted')}>
            {ABAS[a].rotulo}<span className="tabular-nums text-xs text-muted-foreground">{contagens[i].count ?? 0}</span>
          </Link>
        ))}
      </nav>

      {linhas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground" data-ajuda="envios.lista">
          {aba === 'avaliar' ? 'Nada para avaliar. Quando alguém da equipe mandar uma ação pelo link, ela aparece aqui e você recebe um aviso.' : 'Nada por aqui.'}
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-ajuda="envios.lista">
          {linhas.map((l) => {
            const recebidos = l.envio_arquivos.filter((a) => a.estado === 'recebido')
            const conta = (c: string) => recebidos.filter((a) => a.categoria === c).length
            const url = capa(l)
            return (
              <li key={l.id}>
                <Link href={`/envios/${l.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
                  {url
                    ? <img src={url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    : <div className="flex aspect-video w-full items-center justify-center bg-muted text-sm text-muted-foreground">{recebidos.length ? 'sem foto' : 'só texto'}</div>}
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', COR[l.estado])}>{ESTADOS_DO_ENVIO[l.estado]}</span>
                      <span className="text-muted-foreground">{l.protocolo} · {quando(l.criado_em)}</span>
                    </div>
                    <p className="line-clamp-2 font-semibold group-hover:underline">{l.titulo}</p>
                    <p className="text-sm text-muted-foreground">{l.nome}{l.setor ? ` · ${l.setor}` : ''}{l.local ? ` · ${l.local}` : ''}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                      {conta('foto') > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="size-3.5" aria-hidden="true" />{conta('foto')}</span>}
                      {conta('video') > 0 && <span className="inline-flex items-center gap-1"><Video className="size-3.5" aria-hidden="true" />{conta('video')}</span>}
                      {conta('audio') > 0 && <span className="inline-flex items-center gap-1"><Mic className="size-3.5" aria-hidden="true" />{conta('audio')}</span>}
                      {conta('documento') > 0 && <span className="inline-flex items-center gap-1"><FileText className="size-3.5" aria-hidden="true" />{conta('documento')}</span>}
                      {!AUTORIZACOES[l.autorizacao_imagem].podePublicar && <span className="text-amber-700 dark:text-amber-400">imagem: conferir</span>}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
