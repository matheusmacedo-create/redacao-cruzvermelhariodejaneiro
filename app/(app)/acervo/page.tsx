import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { PainelDoAcervo, type Aba } from '@/components/app/acervo/painel'
import type { ItemNaTela } from '@/components/app/acervo/comum'
import { nomesDasPessoas } from '@/components/app/transparencia/servidor'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { tituloDaArea } from '@/lib/navegacao'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { bucketDoAcervo, COLUNAS_DO_ITEM, type LinhaDoItem } from '@/lib/acervo/dados'
import { caminhoDoItem, ORIGEM_DO_ACERVO, urlDoArquivo } from '@/lib/acervo/paginas'
import { ehColecao, ehDireitos, ehPrecisao, tipoDoArquivo } from '@/lib/acervo/regras'

export const metadata = { title: tituloDaArea('/acervo') }

export const dynamic = 'force-dynamic'

/** O Supabase devolve no máximo mil linhas por pedido: o catálogo vem em páginas. */
const POR_LEITURA = 1000
const LIMITE_DA_TELA = 10_000
/**
 * Prévia do original privado: só formato que todo navegador mostra (HEIC e
 * TIFF não abrem no Chrome) e sem baixar arquivo enorme para um cartão.
 */
const PREVIA_DO_ORIGINAL_ATE = 25 * 1024 ** 2
const MOSTRAVEL = /^image\/(jpeg|png|webp|gif|avif)$/i

type Bucket = NonNullable<ReturnType<typeof bucketDoAcervo>>

/**
 * A imagem do cartão e a da ficha completa. Item no site: as versões WebP que
 * já estão lá (480 e 960 px). Privado: um link assinado de 1 hora do original,
 * gerado aqui — a chave do R2 nunca vai para o navegador.
 */
function previas(l: LinhaDoItem, r2: Bucket | null): { pequena: string | null; grande: string | null; reserva: string | null } {
  const publico = l.visibilidade === 'publico'
  if (tipoDoArquivo(l.tipo_mime) !== 'imagem') {
    // Vídeo no site: a miniatura do YouTube ou do Vimeo.
    const miniatura = publico ? l.arquivos_no_site?.video?.miniatura : null
    return typeof miniatura === 'string' ? { pequena: miniatura, grande: miniatura, reserva: null } : { pequena: null, grande: null, reserva: null }
  }
  // O original no R2 (link de 1 hora): a prévia do item privado, e a reserva do público
  // quando a versão do site não abre (publicação que o FTP não terminou, por exemplo).
  let original: string | null = null
  if (r2 && l.chave_r2 && MOSTRAVEL.test(l.tipo_mime ?? '') && Number(l.tamanho ?? 0) <= PREVIA_DO_ORIGINAL_ATE) {
    try {
      original = urlAssinada(r2.config, r2.bucket, l.chave_r2, 'GET', 3600)
    } catch (causa) {
      console.error('[acervo] prévia:', causa instanceof Error ? causa.message : causa)
    }
  }
  const guardadas = publico ? l.arquivos_no_site?.imagens : undefined
  const versoes = Array.isArray(guardadas) ? guardadas : []
  if (versoes.length) {
    const pequena = versoes.find((v) => v.largura >= 480) ?? versoes[0]
    const grande = versoes.find((v) => v.largura >= 960) ?? versoes[versoes.length - 1]
    return { pequena: urlDoArquivo(pequena.arquivo), grande: urlDoArquivo(grande.arquivo), reserva: original }
  }
  return { pequena: original, grande: original, reserva: null }
}

/**
 * O acervo por dentro: o catálogo (acervo_itens) e as pastas do bucket no R2.
 * Toda a equipe vê e baixa; enviar, catalogar e publicar é de quem tem
 * acervo.gerenciar — as actions conferem de novo.
 */
export default async function AcervoPage({ searchParams }: { searchParams: Promise<{ aba?: string | string[] }> }) {
  const context = await requireWorkspace()
  const cabecalho = <PageHeader title="Acervo" description="A memória da filial: documentos, fotos, vídeos, recortes de imprensa e registros da história, guardados no Cloudflare R2. Tudo aqui é privado até alguém publicar em cruzvermelhariodejaneiro.org/acervo." />

  if (!pode(context.role, 'acervo.ver')) {
    return <div><PageHeader title="Acervo" /><Card className="flex items-start gap-3 p-6"><ShieldAlert className="mt-0.5 size-5 text-muted-foreground" aria-hidden /><div><p className="font-medium">Área restrita</p><p className="mt-1 text-sm text-muted-foreground">O seu papel neste espaço não dá acesso ao acervo. Se precisa de um arquivo, fale com um administrador.</p></div></Card></div>
  }

  const podeGerenciar = pode(context.role, 'acervo.gerenciar')
  const { aba } = await searchParams
  const supabase = await createClient()
  const workspaceId = context.workspace.id

  // Pelo cliente da pessoa: o RLS deixa ler quem é do espaço.
  const linhas: LinhaDoItem[] = []
  for (let de = 0; de < LIMITE_DA_TELA; de += POR_LEITURA) {
    const { data, error } = await supabase.from('acervo_itens').select(COLUNAS_DO_ITEM)
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).order('id')
      .range(de, de + POR_LEITURA - 1)
    if (error) {
      console.error('[acervo] leitura:', error.message)
      return <div>{cabecalho}<Card className="flex items-start gap-3 p-6"><TriangleAlert className="mt-0.5 size-5 text-warning-foreground" aria-hidden /><div><p className="font-medium">Não foi possível ler o acervo agora</p><p className="mt-1 text-sm text-muted-foreground">Tente de novo em instantes. Se persistir, confira se a migração do acervo (cvrj_acervo, em supabase/migrations) já foi aplicada neste banco.</p></div></Card></div>
    }
    const pagina = (data ?? []) as unknown as LinhaDoItem[]
    linhas.push(...pagina)
    if (pagina.length < POR_LEITURA) break
  }

  let r2: Bucket | null = null
  try {
    r2 = bucketDoAcervo()
  } catch (causa) {
    console.error('[acervo] configuração do R2:', causa instanceof Error ? causa.message : causa)
  }

  const validas = linhas.filter((l) => ehColecao(l.colecao))
  const nomes = await nomesDasPessoas(supabase, validas.flatMap((l) => [l.criado_por, l.atualizado_por]))
  const nome = (id: string | null) => (id ? nomes.get(id) ?? null : null)

  const itens: ItemNaTela[] = validas.map((l) => {
    const { pequena, grande, reserva } = previas(l, r2)
    return {
      id: l.id, colecao: l.colecao, titulo: l.titulo, descricao: l.descricao,
      dataItem: l.data_item, dataPrecisao: ehPrecisao(l.data_precisao) ? l.data_precisao : 'dia',
      autoria: l.autoria, local: l.local, direitos: ehDireitos(l.direitos) ? l.direitos : 'todos_reservados', credito: l.credito,
      textoAlternativo: l.texto_alternativo, palavrasChave: Array.isArray(l.palavras_chave) ? l.palavras_chave : [], urlVideo: l.url_video,
      chave: l.chave_r2, nomeOriginal: l.nome_original, tipoMime: l.tipo_mime, tamanho: l.tamanho === null ? null : Number(l.tamanho),
      sha256: l.sha256, largura: l.largura, altura: l.altura,
      publico: l.visibilidade === 'publico', slug: l.slug, publicadoEm: l.publicado_em, atualizadoNoSiteEm: l.atualizado_no_site_em,
      endereco: l.slug ? ORIGEM_DO_ACERVO + caminhoDoItem({ colecao: l.colecao, slug: l.slug }) : null,
      previa: pequena, previaGrande: grande, previaReserva: reserva,
      criadoEm: l.created_at, criadoPor: nome(l.criado_por), atualizadoEm: l.updated_at, atualizadoPor: nome(l.atualizado_por),
    }
  })

  const abaInicial: Aba = aba === 'pastas' && r2 ? 'pastas' : 'catalogo'

  return (
    <div>
      {cabecalho}
      {!r2 && (
        <Card className="mb-5 flex items-start gap-3 border-warning/50 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">O acervo no R2 não está configurado</p>
            <p className="mt-0.5 text-pretty text-muted-foreground">
              Faltam na Vercel a variável <span className="font-mono text-xs">R2_BUCKET_ACERVO</span> e as chaves do R2
              (<span className="font-mono text-xs">R2_ACCOUNT_ID</span>, <span className="font-mono text-xs">R2_ACCESS_KEY_ID</span> e <span className="font-mono text-xs">R2_SECRET_ACCESS_KEY</span>).
              Até lá, o catálogo fica só para consulta: sem envio, sem download e sem as pastas do bucket.
            </p>
          </div>
        </Card>
      )}
      <PainelDoAcervo itens={itens} podeGerenciar={podeGerenciar} configurado={Boolean(r2)} abaInicial={abaInicial} truncado={linhas.length >= LIMITE_DA_TELA} />
    </div>
  )
}
