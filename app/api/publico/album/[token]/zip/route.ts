import { downloadZip } from 'client-zip'
import { createAdminClient } from '@/lib/supabase/admin'
import { albumPeloToken, chavesDoEvento, linkDoArquivo } from '@/lib/envios/eventos'
import { ARQUIVOS_NO_ZIP, LIMITE_DO_ZIP, nomeDoZip, nomesNoZip } from '@/lib/envios/album'

export const dynamic = 'force-dynamic'
// Um álbum grande leva minutos para passar; o .zip sai em fluxo, sem guardar nada na memória.
export const maxDuration = 300

/**
 * "Baixar tudo" do álbum do evento: um .zip com uma pasta por pessoa que
 * mandou, montado em fluxo a partir do R2 (nada é guardado aqui). `?so=fotos`
 * deixa os vídeos de fora. Acima de 4 GB, recusa e a tela sugere só as fotos.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const soFotos = new URL(request.url).searchParams.get('so') === 'fotos'
  const admin = createAdminClient()
  const album = await albumPeloToken(token, admin)
  if (!album) return new Response('Não encontrado', { status: 404 })
  // Em ordem de nome: o nome canônico começa pela data, então o .zip já sai em ordem, pessoa por pessoa.
  const fotos = album.fotos.filter((f) => !soFotos || f.categoria === 'foto').sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, ARQUIVOS_NO_ZIP)
  if (!fotos.length) return new Response('O álbum ainda não tem fotos.', { status: 404 })
  const total = fotos.reduce((s, f) => s + f.tamanho, 0)
  if (total > LIMITE_DO_ZIP) return new Response('O álbum passou de 4 GB. Baixe só as fotos ou uma a uma.', { status: 413 })

  const nomes = nomesNoZip(fotos)
  const chaves = await chavesDoEvento(admin, album.evento.id)
  async function* arquivos() {
    for (const f of fotos) {
      const a = chaves.get(f.id)
      // O link é gerado na hora de cada arquivo: num .zip longo, um link de 10 minutos feito no começo venceria.
      const url = a ? linkDoArquivo(a, 'ver') : null
      if (!url) continue
      const r = await fetch(url)
      if (!r.ok || !r.body) continue
      yield { name: nomes.get(f.id) ?? f.nome, input: r.body, lastModified: new Date(f.quando), size: f.tamanho }
    }
  }
  const zip = downloadZip(arquivos())
  return new Response(zip.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nomeDoZip(album.evento.nome, soFotos)}"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
