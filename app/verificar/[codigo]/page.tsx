import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, Bitcoin, CheckCircle2, Clock, Download, ShieldCheck } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashLegivel, lerCanonico, momento, tituloDoOficio } from '@/lib/oficios/documento'
import { FolhaDoOficio } from '@/components/app/oficios/documento'
import { BotaoImprimir, ConferirNoNavegador } from '@/components/oficios/conferir'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Conferência de ofício — Cruz Vermelha RJ', robots: { index: false, follow: false } }

/**
 * A página pública de um ofício, aberta pelo código de 32 caracteres do
 * rodapé. Mostra o texto como foi assinado, quem assinou e quando, e a prova
 * no Bitcoin com os arquivos para conferir sem depender do Redação. É também
 * a versão para imprimir.
 */
export default async function VerificarOficio({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!/^[0-9a-f]{32}$/.test(codigo)) notFound()
  const admin = createAdminClient()
  const { data: o } = await admin.from('oficios')
    .select('id,estado,modo_assinatura,pdf_versao,conteudo_canonico,hash_documento,manifesto,hash_manifesto,assinado_em,motivo_cancelamento,cancelado_em')
    .eq('codigo_verificacao', codigo).neq('estado', 'rascunho').maybeSingle()
  if (!o) notFound()
  const doc = lerCanonico(o.conteudo_canonico)
  if (!doc) notFound()
  const [{ data: assinantes }, { data: carimbos }] = await Promise.all([
    admin.from('oficio_assinantes').select('nome,cargo,ordem,estado,assinado_em,metodo,certificado').eq('oficio_id', o.id).order('ordem'),
    admin.from('oficio_carimbos').select('estado,bloco,confirmado_em,enviado_em').eq('oficio_id', o.id).order('created_at', { ascending: false }).limit(1),
  ])
  const carimbo = carimbos?.[0]

  const situacao = o.estado === 'cancelado'
    ? { Icone: AlertTriangle, cor: 'border-red-300 bg-red-50 text-red-900', titulo: 'Ofício cancelado', texto: `${o.motivo_cancelamento ?? ''}${o.cancelado_em ? ` (em ${momento(o.cancelado_em)})` : ''}` }
    : o.estado === 'assinado'
      ? { Icone: CheckCircle2, cor: 'border-emerald-300 bg-emerald-50 text-emerald-900', titulo: 'Ofício autêntico e assinado', texto: o.assinado_em ? `Todas as assinaturas registradas; a última em ${momento(o.assinado_em)}.` : 'Todas as assinaturas registradas.' }
      : { Icone: Clock, cor: 'border-amber-300 bg-amber-50 text-amber-900', titulo: 'Ofício emitido, aguardando assinaturas', texto: 'Este documento ainda não tem todas as assinaturas.' }

  const conferir = [{ rotulo: 'Código do documento', texto: o.conteudo_canonico as string, hash: o.hash_documento as string }]
  if (o.manifesto && o.hash_manifesto) conferir.push({ rotulo: 'Código do manifesto de assinaturas', texto: o.manifesto, hash: o.hash_manifesto })

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[52rem] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Conferência de documento</p>
          <BotaoImprimir />
        </div>

        <section className={`flex items-start gap-3 rounded-lg border px-4 py-3 print:hidden ${situacao.cor}`}>
          <situacao.Icone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div><p className="font-semibold">{situacao.titulo}: {tituloDoOficio(doc.numero, doc.setor)}</p><p className="text-sm">{situacao.texto}</p></div>
        </section>

        <FolhaDoOficio
          doc={doc}
          marcaDagua={o.estado === 'cancelado' ? 'Cancelado' : undefined}
          assinaturas={(assinantes ?? []).map((a) => ({ ordem: a.ordem, nome: a.nome, cargo: a.cargo, estado: a.estado, assinadoEm: a.assinado_em, metodo: a.metodo, titularDoCertificado: (a.certificado as { titular?: string } | null)?.titular ?? null }))}
          rodape={
            <div className="flex flex-col gap-1">
              <p>Documento assinado eletronicamente {o.modo_assinatura === 'govbr' ? 'por meio da plataforma gov.br' : 'no sistema Redação'} da {doc.emitente}. Confira a autenticidade em redacao.cruzvermelhariodejaneiro.org/verificar/{codigo}</p>
              <p>Código do documento (SHA-256): <span className="break-all font-mono">{o.hash_documento}</span></p>
              {o.hash_manifesto && <p>Manifesto de assinaturas (SHA-256): <span className="break-all font-mono">{o.hash_manifesto}</span>{carimbo?.estado === 'confirmado' && carimbo.bloco ? ` — registrado no bloco ${carimbo.bloco.toLocaleString('pt-BR')} do Bitcoin` : ''}</p>}
            </div>
          }
        />

        {o.modo_assinatura === 'govbr' && (
          <section className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-5 text-sm print:hidden">
            <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-5" />Assinaturas gov.br</h2>
            <ul className="flex flex-col gap-2">
              {(assinantes ?? []).map((a) => {
                const c = (a.certificado ?? null) as { titular?: string; cpf?: string; emissor?: string; infraestrutura?: string } | null
                return (
                  <li key={a.ordem} className="flex flex-col">
                    <span className="font-medium">{a.nome}{a.estado === 'assinado' && a.assinado_em ? ` — assinou em ${momento(a.assinado_em)}` : a.estado === 'recusado' ? ' — recusou' : ' — aguardando'}</span>
                    {c?.titular && <span className="text-xs text-neutral-600">Certificado de {c.titular}{c.cpf ? ` (CPF ${c.cpf})` : ''}, emitido por {c.emissor ?? '—'}{c.infraestrutura ? ` · ${c.infraestrutura}` : ''}</span>}
                  </li>
                )
              })}
            </ul>
            {(o.pdf_versao ?? 0) > 0 && (
              <>
                <a href={`/api/verificar/${codigo}/pdf`} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50"><Download className="size-4" />PDF assinado</a>
                <p className="text-neutral-700">Para a conferência oficial do governo, baixe o PDF assinado e envie em <a className="underline" href="https://validar.iti.gov.br" target="_blank" rel="noreferrer">validar.iti.gov.br</a>. O validador do ITI mostra quem assinou e se o certificado continua válido.</p>
              </>
            )}
          </section>
        )}

        <section className="flex flex-col gap-4 rounded-lg border border-neutral-300 bg-white p-5 text-sm print:hidden">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Bitcoin className="size-5" />Registro no Bitcoin</h2>
          {!carimbo ? (
            <p className="text-neutral-600">O registro é feito quando todas as pessoas assinam.</p>
          ) : carimbo.estado === 'confirmado' ? (
            <p>O código do manifesto de assinaturas foi gravado no <a className="font-semibold underline" href={`https://mempool.space/block/${carimbo.bloco}`} target="_blank" rel="noreferrer">bloco {carimbo.bloco?.toLocaleString('pt-BR')}</a> do Bitcoin, pelo protocolo aberto OpenTimestamps. Isso prova que este ofício, com estas assinaturas, já existia naquele momento e não foi alterado depois.</p>
          ) : (
            <p className="text-neutral-700">O código foi enviado aos calendários do OpenTimestamps{carimbo.enviado_em ? ` em ${momento(carimbo.enviado_em)}` : ''} e entra num bloco do Bitcoin em algumas horas.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {o.manifesto && <a href={`/api/verificar/${codigo}/manifesto`} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50"><Download className="size-4" />Manifesto (.json)</a>}
            {carimbo && carimbo.estado !== 'pendente' && <a href={`/api/verificar/${codigo}/prova`} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50"><Download className="size-4" />Prova (.ots)</a>}
          </div>
          <details className="text-neutral-700">
            <summary className="cursor-pointer font-medium">Como conferir por conta própria</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Baixe o manifesto e a prova acima.</li>
              <li>Abra <a className="underline" href="https://opentimestamps.org" target="_blank" rel="noreferrer">opentimestamps.org</a>, solte a prova (.ots) e depois o manifesto (.json).</li>
              <li>O site mostra o bloco do Bitcoin e a data. O manifesto traz o código do documento e quem assinou.</li>
            </ol>
          </details>
          <details className="text-neutral-700">
            <summary className="cursor-pointer font-medium">Conferir os códigos neste navegador</summary>
            <div className="mt-3"><ConferirNoNavegador itens={conferir} /></div>
            <p className="mt-3 text-xs text-neutral-500">Códigos: documento {hashLegivel(o.hash_documento as string)}</p>
          </details>
        </section>
      </div>
    </main>
  )
}
