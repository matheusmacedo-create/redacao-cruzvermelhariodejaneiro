import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, MapPin, MessageCircle, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { MaterialEAcoes, Transcricao, type ArquivoNaTela } from '@/components/app/envios/avaliacao'
import { avisarPeloWhatsapp } from '@/app/actions/envios'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { armazenamento, avaliaEnvios } from '@/lib/envios/servidor'
import { AUTORIZACOES, ESTADOS_DO_ENVIO, linkDoWhatsapp, type Autorizacao, type EstadoDoEnvio } from '@/lib/envios/regras'

export const metadata = { title: 'Envio da equipe' }
// Copiar vídeos para a Biblioteca e transcrever áudio rodam como ações desta página.
export const maxDuration = 300

type Envio = {
  id: string; protocolo: string; estado: EstadoDoEnvio; criado_em: string; concluido_em: string | null
  nome: string; setor: string | null; whatsapp: string | null; email: string | null
  titulo: string; data_da_acao: string | null; local: string | null; latitude: number | null; longitude: number | null
  pessoas_atendidas: number | null; parceiros: string | null; relato: string | null; transcricao: string | null
  autorizacao_imagem: Autorizacao; avisar_quando_publicar: boolean; pauta_id: string | null; pacote_id: string | null; avisado_em: string | null
  envio_arquivos: { id: string; chave: string; nome: string; tamanho: number; categoria: ArquivoNaTela['categoria']; estado: string; gravado_na_hora: boolean; file_id: string | null; criado_em: string }[]
}

const data = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children}</dd></div>
}

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace()
  const ws = context.workspace.id
  if (!(await avaliaEnvios(context.user.id, ws))) notFound()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const supabase = await createClient()
  const { data: bruto } = await supabase.from('envios')
    .select('id,protocolo,estado,criado_em,concluido_em,nome,setor,whatsapp,email,titulo,data_da_acao,local,latitude,longitude,pessoas_atendidas,parceiros,relato,transcricao,autorizacao_imagem,avisar_quando_publicar,pauta_id,pacote_id,avisado_em,envio_arquivos(id,chave,nome,tamanho,categoria,estado,gravado_na_hora,file_id,criado_em)')
    .eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!bruto) notFound()
  const envio = bruto as unknown as Envio

  const r2 = armazenamento()
  const arquivos: ArquivoNaTela[] = r2
    ? envio.envio_arquivos.filter((a) => a.estado === 'recebido').sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map((a) => ({
      id: a.id, nome: a.nome, categoria: a.categoria, tamanho: Number(a.tamanho), naBiblioteca: Boolean(a.file_id), gravadoNaHora: a.gravado_na_hora,
      url: urlAssinada(r2.config, r2.bucket, a.chave, 'GET', 3600),
      baixar: urlAssinada(r2.config, r2.bucket, a.chave, 'GET', 3600, { nomeParaBaixar: a.nome }),
    }))
    : []
  const faltando = envio.envio_arquivos.filter((a) => a.estado !== 'recebido').length

  // Virou matéria publicada? Então dá para avisar quem mandou.
  const { data: publicada } = envio.pauta_id
    ? await supabase.from('content_pieces').select('site_url').eq('workspace_id', ws).eq('pauta_id', envio.pauta_id).not('site_url', 'is', null).limit(1).maybeSingle()
    : { data: null }
  const autorizacao = AUTORIZACOES[envio.autorizacao_imagem]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={envio.titulo}
        description={`${envio.protocolo} · ${ESTADOS_DO_ENVIO[envio.estado]} · enviado em ${data(envio.criado_em)}`}
        breadcrumbs={[{ label: 'Envios da equipe', href: '/envios' }, { label: envio.protocolo }]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!r2 && <Card className="p-4 text-sm">O armazenamento do acervo (R2) não está configurado: os arquivos não podem ser mostrados.</Card>}
          {faltando > 0 && <p className="text-sm text-muted-foreground">{faltando} arquivo{faltando > 1 ? 's' : ''} ainda não chegou{faltando > 1 ? 'aram' : ''} (a pessoa pode estar enviando agora).</p>}
          {envio.relato && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Relato</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">{envio.relato}</p>
            </section>
          )}
          <Transcricao envioId={envio.id} temAudio={arquivos.some((a) => a.categoria === 'audio')} inicial={envio.transcricao} />
          <MaterialEAcoes envioId={envio.id} estado={envio.estado} arquivos={arquivos} jaVirou={Boolean(envio.pauta_id)} />
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-4" data-ajuda="envios.ficha">
            <dl className="flex flex-col gap-3">
              <Linha rotulo="Enviado por">{envio.nome}{envio.setor ? ` · ${envio.setor}` : ''}</Linha>
              {envio.whatsapp && (
                <Linha rotulo="WhatsApp">
                  <a href={linkDoWhatsapp(envio.whatsapp, `Olá, ${envio.nome.split(' ')[0]}! Aqui é da comunicação da Cruz Vermelha RJ, sobre a ação "${envio.titulo}" (${envio.protocolo}).`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    <MessageCircle className="size-3.5" aria-hidden="true" />+{envio.whatsapp}
                  </a>
                </Linha>
              )}
              {envio.email && <Linha rotulo="E-mail"><a href={`mailto:${envio.email}`} className="text-primary underline-offset-4 hover:underline">{envio.email}</a></Linha>}
              {envio.data_da_acao && <Linha rotulo="Data da ação">{envio.data_da_acao.split('-').reverse().join('/')}</Linha>}
              {(envio.local || envio.latitude !== null) && (
                <Linha rotulo="Local">
                  {envio.local}
                  {envio.latitude !== null && envio.longitude !== null && (
                    <a href={`https://www.openstreetmap.org/?mlat=${envio.latitude}&mlon=${envio.longitude}#map=16/${envio.latitude}/${envio.longitude}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                      <MapPin className="size-3.5" aria-hidden="true" />ver no mapa
                    </a>
                  )}
                </Linha>
              )}
              {envio.pessoas_atendidas !== null && <Linha rotulo="Pessoas atendidas">{envio.pessoas_atendidas.toLocaleString('pt-BR')}</Linha>}
              {envio.parceiros && <Linha rotulo="Parceiros">{envio.parceiros}</Linha>}
              <Linha rotulo="Imagem das pessoas">
                <span className={autorizacao.podePublicar ? '' : 'inline-flex items-start gap-1 text-amber-700 dark:text-amber-400'}>
                  {!autorizacao.podePublicar && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}{autorizacao.rotulo}
                </span>
                {!autorizacao.podePublicar && <span className="mt-0.5 block text-xs text-muted-foreground">As fotos entram na Biblioteca como “pendente”: confira a autorização antes de publicar.</span>}
              </Linha>
            </dl>
          </Card>

          {(envio.pauta_id || envio.pacote_id) && (
            <Card className="flex flex-col gap-2 p-4 text-sm" data-ajuda="envios.virou-trabalho">
              <p className="font-semibold">Virou trabalho</p>
              {envio.pacote_id && <Link href={`/redes/${envio.pacote_id}`} className="text-primary underline-offset-4 hover:underline">Abrir o pacote (matéria e posts)</Link>}
              {envio.pauta_id && <Link href={`/pautas/${envio.pauta_id}`} className="text-primary underline-offset-4 hover:underline">Abrir a pauta</Link>}
              {publicada?.site_url && (
                <a href={publicada.site_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                  <ExternalLink className="size-3.5" aria-hidden="true" />Ver a matéria no site
                </a>
              )}
              {publicada?.site_url && envio.whatsapp && envio.avisar_quando_publicar && (
                <form action={avisarPeloWhatsapp} className="mt-1">
                  <input type="hidden" name="envioId" value={envio.id} />
                  <input type="hidden" name="url" value={publicada.site_url} />
                  <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700">
                    <MessageCircle className="size-4" aria-hidden="true" />{envio.avisado_em ? 'Avisar de novo pelo WhatsApp' : 'Avisar pelo WhatsApp'}
                  </button>
                </form>
              )}
              {envio.avisado_em && <p className="text-xs text-muted-foreground">Avisado em {data(envio.avisado_em)}.</p>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
