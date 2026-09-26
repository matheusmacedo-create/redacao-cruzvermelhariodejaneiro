import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { Download } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { urlBase } from '@/lib/newsletter/contexto'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { armazenamento, avaliaEnvios } from '@/lib/envios/servidor'
import { linkAberto } from '@/lib/imagem/regras'
import { buscarAutorizacoes } from '@/lib/imagem/consulta'
import { TabelaDeAutorizacoes } from '../tabela'
import { AcoesDaColeta, CompartilharLink, DetalheDaAssinatura } from './acoes'

export const metadata = { title: 'Autorização de imagem' }

const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

/** Um link: compartilhar (link, QR, WhatsApp), as fotos e quem já assinou. */
export default async function ColetaPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const { data: c } = await supabase.from('imagem_coletas')
    .select('id, titulo, descricao, token, file_ids, envio_id, criado_por, created_at, expira_em, encerrada_em, profiles!imagem_coletas_criado_por_fkey(full_name), envios(protocolo, nome)')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!c) notFound()
  const envioId = (c.envio_id as string | null) ?? null
  const envio = (Array.isArray(c.envios) ? c.envios[0] : c.envios) as { protocolo?: string; nome?: string } | null
  // Link de um envio: as fotos estão no envio (R2); as que já viraram pauta têm cópia na Biblioteca.
  const { data: doEnvio } = envioId
    ? await supabase.from('envio_arquivos').select('id, nome, categoria, chave, file_id').eq('envio_id', envioId).eq('estado', 'recebido').in('categoria', ['foto', 'video']).order('criado_em')
    : { data: null }
  const idsNaBiblioteca = envioId ? (doEnvio ?? []).flatMap((a) => (a.file_id ? [a.file_id as string] : [])) : (c.file_ids as string[])
  const [linhas, { data: arquivos }] = await Promise.all([
    buscarAutorizacoes(supabase, context.workspace.id, { coleta: id }, 500),
    idsNaBiblioteca.length
      ? supabase.from('files').select('id, name, file_type, storage_path, authorization_status').eq('workspace_id', context.workspace.id).in('id', idsNaBiblioteca)
      : Promise.resolve({ data: [] as { id: string; name: string; file_type: string; storage_path: string | null; authorization_status: string }[] }),
  ])
  const r2 = envioId ? armazenamento() : null
  const miniaturas: { id: string; nome: string; foto: boolean; src: string | null }[] = envioId
    ? (doEnvio ?? []).map((a) => ({ id: a.id as string, nome: a.nome as string, foto: a.categoria === 'foto', src: r2 ? urlAssinada(r2.config, r2.bucket, a.chave as string, 'GET', 3600) : null }))
    : (arquivos ?? []).map((a) => ({ id: a.id as string, nome: a.name as string, foto: a.file_type === 'foto', src: a.storage_path ? `/api/private-blob?pathname=${encodeURIComponent(a.storage_path as string)}` : null }))
  const link = `${urlBase()}/autorizacao/${c.token}`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#1a1a1a', light: '#ffffff' } })
  const { aberto, motivo } = linkAberto({ expira_em: c.expira_em as string | null, encerrada_em: c.encerrada_em as string | null })
  const podeMexer = c.criado_por === context.user.id || pode(context.role, 'biblioteca.apagar_de_outros') || (Boolean(envioId) && await avaliaEnvios(context.user.id, context.workspace.id))
  const validas = linhas.filter((l) => !l.revogada_em).length
  const pendentes = (arquivos ?? []).filter((a) => a.authorization_status === 'pending').length
  const autor = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { full_name?: string } | null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={c.titulo as string}
        description={`${envioId ? `Das fotos do envio ${envio?.protocolo ?? ''}${envio?.nome ? `, de ${envio.nome}` : ''}` : `Criado ${autor?.full_name ? `por ${autor.full_name} ` : ''}`} em ${quando(c.created_at as string)} · ${c.expira_em ? `vale até ${quando(c.expira_em as string)}` : 'sem prazo'}`}
        breadcrumbs={[{ label: 'Biblioteca de mídia', href: '/biblioteca' }, { label: 'Autorizações de imagem', href: '/biblioteca/autorizacoes' }, ...(envioId ? [{ label: envio?.protocolo ?? 'Envio', href: `/envios/${envioId}` }] : []), { label: c.titulo as string }]}
        actions={<Button variant="outline" render={<a href={`/api/biblioteca/autorizacoes/csv?coleta=${id}`} />}><Download className="size-4" />Baixar planilha</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <Card data-ajuda="autorizacao.compartilhar" className="flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">Mande este link a quem aparece nas fotos</h2>
          {aberto ? (
            <CompartilharLink link={link} titulo={c.titulo as string} />
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{motivo} As assinaturas já feitas continuam valendo.</p>
          )}
          <p className="text-xs text-muted-foreground">Cada pessoa assina no próprio celular — uma assinatura por pessoa. Para menor de 18 anos, quem assina é o responsável.</p>
        </Card>
        {aberto && (
          <Card className="flex flex-col items-center gap-2 p-4">
            <img src={qr} alt="QR code do link de autorização" className="w-48" />
            <a href={qr} download={`autorizacao-${id.slice(0, 8)}.png`} className="text-xs text-primary hover:underline">Baixar o QR code</a>
            <p className="text-center text-xs text-muted-foreground">Mostre na tela ou imprima para as pessoas lerem com a câmera.</p>
          </Card>
        )}
      </div>

      <section aria-labelledby="fotos" className="flex flex-col gap-3">
        <h2 id="fotos" className="text-base font-semibold">Fotos ({miniaturas.length}){pendentes > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{pendentes} ainda como “Falta autorizar” na Biblioteca</span>}</h2>
        {envioId && <p className="text-sm text-muted-foreground">As fotos são as do <Link href={`/envios/${envioId}`} className="text-primary hover:underline">envio {envio?.protocolo}</Link>. “Marcar fotos como autorizadas” vale para as que já foram copiadas para a Biblioteca (ao virar pauta).</p>}
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {miniaturas.map((a) => (
            <li key={a.id} className="aspect-square overflow-hidden rounded-lg bg-muted" title={a.nome}>
              {a.foto && a.src
                ? <img src={a.src} alt={a.nome} loading="lazy" className="size-full object-cover" />
                : <span className="flex size-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">{a.nome}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="assinaturas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="assinaturas" className="text-base font-semibold">Assinaturas ({validas} válida{validas === 1 ? '' : 's'}{linhas.length > validas ? `, ${linhas.length - validas} revogada(s)` : ''})</h2>
          {podeMexer && <AcoesDaColeta id={id} aberto={aberto} podeMarcar={validas > 0 && pendentes > 0} pendentes={pendentes} />}
        </div>
        <TabelaDeAutorizacoes linhas={linhas} acoes={(l) => <DetalheDaAssinatura id={l.id} codigo={l.codigo} documentoHash={l.documento_hash} termoVersao={l.termo_versao} revogada={Boolean(l.revogada_em)} podeRevogar={podeMexer} />} />
      </section>
    </div>
  )
}
