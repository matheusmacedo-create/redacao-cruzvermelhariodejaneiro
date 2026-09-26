import { head, del, get, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT, fileKind } from '@/lib/storage'
import { TIPOS_OTIMIZAVEIS, nomeFinal, otimizarImagem } from '@/lib/midia/otimizar-imagem'
import { LIMIAR_DO_SERVIDOR, TETO_PARA_OTIMIZAR, farejarTipo, type PerfilDeFoto, type TipoFarejado } from '@/lib/midia/regras'

export const runtime = 'nodejs'
// Otimizar uma foto grande leva uns 2 s, mas baixar e regravar no Blob somam.
export const maxDuration = 60

const AUTORIZACOES = new Set(['pending', 'authorized', 'internal'])

// Foto acima de TETO_PARA_OTIMIZAR (lib/midia/regras.ts) fica como veio:
// baixar e decodificar uma imagem desse porte arrisca a memória da função.

/** O tipo pelo conteúdo: o do Blob é só o que o navegador declarou no envio. */
const PELO_CONTEUDO: Partial<Record<TipoFarejado, string>> = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif',
}

/**
 * "…/library/<uuid>.png" → "…/library/<uuid>-<marca>.jpg". Sempre um caminho
 * novo, mesmo quando a extensão não muda (JPEG que volta JPEG): regravar no
 * mesmo caminho deixaria o cache do Blob servir a versão velha por um tempo,
 * e dois registros simultâneos gravariam um por cima do outro.
 */
function caminhoOtimizado(pathname: string, extensao: string) {
  const corte = pathname.lastIndexOf('/') + 1
  const base = pathname.slice(corte).replace(/\.[^./]{1,8}$/, '') || 'arquivo'
  return `${pathname.slice(0, corte)}${base}-${crypto.randomUUID().slice(0, 8)}${extensao}`
}

/**
 * Registra na Biblioteca um arquivo que o navegador acabou de enviar direto ao
 * Blob.
 *
 * Tudo que importa é conferido contra o armazenamento, não contra o que o
 * navegador diz: o caminho tem que pertencer a este espaço, o arquivo tem que
 * existir de verdade, e o tamanho e o tipo vêm do próprio Blob. Um cliente
 * mentindo sobre qualquer um desses campos não consegue nada além de um erro.
 *
 * Foto pesada que chegou sem passar pelo preparo do navegador
 * (lib/midia/preparar.ts) é recomprimida aqui, com a mesma regra
 * (lib/midia/otimizar-imagem.ts): a versão leve vai para um caminho novo e o
 * original é apagado. A cota e a linha no banco usam o arquivo final.
 */
export async function POST(request: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const corpo = await request.json().catch(() => null)
  const pathname = typeof corpo?.pathname === 'string' ? corpo.pathname : ''
  const nome = typeof corpo?.name === 'string' ? corpo.name.slice(0, 200) : ''
  const bruto = String(corpo?.authorization ?? 'pending')
  const authorization = AUTORIZACOES.has(bruto) ? bruto : 'pending'
  // O que o navegador conta sobre o preparo é só informativo (nome e tamanho
  // de antes, para mostrar a economia); nunca decide tipo, tamanho nem cota.
  const nomeOriginal = typeof corpo?.originalName === 'string' ? corpo.originalName.slice(0, 200) : ''
  const tamanhoDeclarado = typeof corpo?.originalSize === 'number' && Number.isFinite(corpo.originalSize) && corpo.originalSize >= 0
    ? Math.min(Math.trunc(corpo.originalSize), Number.MAX_SAFE_INTEGER)
    : null
  const otimizadoNoNavegador = corpo?.optimized === true
  // O preparo do navegador olhou o arquivo (mudando ou não). Sem isso (cliente
  // antigo, preparo que falhou, envio fora da tela), a foto é conferida aqui
  // qualquer que seja o tamanho — é o que garante que o GPS não entra.
  const conferidoNoNavegador = otimizadoNoNavegador || corpo?.prepared === true
  const perfil: PerfilDeFoto = corpo?.profile === 'alta' ? 'alta' : 'padrao'

  const prefixo = `workspaces/${context.workspace.id}/library/`
  // '..' também codificado (%2e%2e) ou com barra invertida: o get() do Blob
  // monta uma URL, e a URL resolve esses segmentos.
  if (!pathname.startsWith(prefixo) || pathname.includes('..') || /%2e|%2f|%5c|\\/i.test(pathname)) {
    return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 })
  }

  const blob = await head(pathname).catch(() => null)
  if (!blob) return NextResponse.json({ error: 'Arquivo não encontrado no armazenamento.' }, { status: 404 })

  if (!LIBRARY_MIME_TYPES.has(blob.contentType)) {
    await del(pathname)
    return NextResponse.json({ error: 'Este tipo de arquivo não é permitido.' }, { status: 400 })
  }
  if (blob.size > LIBRARY_FILE_LIMIT) {
    await del(pathname)
    return NextResponse.json({ error: 'O arquivo excede o tamanho máximo.' }, { status: 413 })
  }

  const supabase = await createClient()

  // O mesmo caminho já registrado significa reenvio da mesma chamada — devolver
  // o que existe é melhor que criar linha duplicada apontando para um blob só.
  const { data: jaExiste } = await supabase
    .from('files').select('id, name, content_type, size_bytes').eq('workspace_id', context.workspace.id)
    .eq('storage_path', pathname).maybeSingle()
  if (jaExiste) {
    return NextResponse.json({
      id: jaExiste.id, storagePath: pathname, name: jaExiste.name, contentType: jaExiste.content_type,
      size: Number(jaExiste.size_bytes ?? 0), optimizedByServer: false,
    })
  }

  // Rede de segurança: foto acima do limiar do perfil é baixada, otimizada e
  // regravada. Qualquer falha aqui só registra o original — nunca o envio.
  //
  // Corrida (dois registros do mesmo caminho): quem chega depois que o
  // primeiro apagou o original para no head() acima, com 404 — aceitável, o
  // arquivo já ficou registrado pelo primeiro. Se os dois passam juntos por
  // aqui, cada um grava a sua versão (marca aleatória no caminho, nunca um
  // sobre o outro) e ficam duas linhas válidas, como já aconteceria sem isto.
  let caminho = pathname
  let tipo = blob.contentType
  let tamanho = blob.size
  let nomeDoArquivo = nome || pathname.split('/').pop() || 'arquivo'
  /** Passou pelo otimizador daqui, mudando ou não (sem nada a tirar, também conta). */
  let passouNoServidor = false
  let otimizadoNoServidor = false
  const conferir = TIPOS_OTIMIZAVEIS.has(blob.contentType) && blob.size <= TETO_PARA_OTIMIZAR
    && (!conferidoNoNavegador || blob.size > LIMIAR_DO_SERVIDOR[perfil])
  if (conferir) {
    let novo: string | null = null
    try {
      const lido = await get(pathname, { access: 'private' })
      if (!lido || lido.statusCode !== 200) throw new Error('o arquivo não pôde ser lido do armazenamento')
      const bytes = Buffer.from(await new Response(lido.stream).arrayBuffer())

      // O sharp só abre o que o conteúdo confirma ser foto: um "PNG" que por
      // dentro é outra coisa (SVG, HEIC…) fica como está.
      const real = PELO_CONTEUDO[farejarTipo(bytes)]
      if (real) {
        const resultado = await otimizarImagem(bytes, real, perfil)
        if (resultado.mudou) {
          novo = caminhoOtimizado(pathname, resultado.extensao)
          if (!novo.startsWith(prefixo) || novo.includes('..')) throw new Error(`caminho otimizado inválido: ${novo}`)
          await put(novo, resultado.bytes, { access: 'private', contentType: resultado.tipo, addRandomSuffix: false })
          await del(pathname)
          caminho = novo
          tipo = resultado.tipo
          tamanho = resultado.bytes.length
          nomeDoArquivo = nomeFinal(nomeDoArquivo, resultado)
          otimizadoNoServidor = true
        }
        passouNoServidor = true
      }
    } catch (causa) {
      console.error('[biblioteca] otimização no servidor falhou, fica o original:', pathname, causa instanceof Error ? causa.message : causa)
      passouNoServidor = false
      // A versão nova gravada sem conseguir apagar o original sairia órfã.
      if (novo && caminho !== novo) await del(novo).catch(() => {})
    }
  }

  const { data: linhas, error: erroUso } = await supabase
    .from('files').select('size_bytes')
    .eq('workspace_id', context.workspace.id).neq('status', 'deleted')
  if (erroUso) return NextResponse.json({ error: 'Não foi possível verificar o espaço.' }, { status: 500 })

  const usado = (linhas ?? []).reduce((t, r) => t + Number(r.size_bytes ?? 0), 0)
  if (usado + tamanho > WORKSPACE_STORAGE_LIMIT) {
    await del(caminho)
    return NextResponse.json({ error: 'O espaço de armazenamento foi atingido.' }, { status: 413 })
  }

  const tags = Array.isArray(corpo?.tags)
    ? corpo.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
    : []

  // otimizado_em marca o que já passou por um otimizador (no navegador ou
  // aqui, mesmo sem nada a tirar), para não voltar a ser candidato do
  // "Otimizar fotos antigas". "Alta qualidade" também marca sempre: aquele
  // botão reduz a 2048 px e não pode rebaixar o que foi pedido para impressão.
  // tamanho_original é o maior tamanho de antes (ou o atual, se nada mudou).
  const marcado = conferidoNoNavegador || passouNoServidor || perfil === 'alta'
  const antes = [
    ...(otimizadoNoNavegador && tamanhoDeclarado !== null ? [tamanhoDeclarado] : []),
    ...(passouNoServidor ? [blob.size] : []),
  ]

  const { data, error } = await supabase.from('files').insert({
    workspace_id: context.workspace.id,
    name: nomeDoArquivo,
    original_name: nomeOriginal || nome || null,
    file_type: fileKind(tipo),
    content_type: tipo,
    storage_path: caminho,
    size_bytes: tamanho,
    status: 'available',
    authorization_status: authorization,
    tags,
    uploaded_by: context.user.id,
    otimizado_em: marcado ? new Date().toISOString() : null,
    tamanho_original: antes.length ? Math.max(...antes) : marcado ? tamanho : null,
  }).select('id').single()

  if (error || !data) {
    // Blob sem linha no banco é arquivo invisível ocupando espaço para sempre.
    // Se a foto foi otimizada, é a versão nova (o original já foi apagado).
    await del(caminho)
    return NextResponse.json({ error: error?.message || 'Não foi possível registrar o arquivo.' }, { status: 500 })
  }

  return NextResponse.json({
    id: data.id, storagePath: caminho, name: nomeDoArquivo, contentType: tipo, size: tamanho,
    optimizedByServer: otimizadoNoServidor,
  })
}
