'use client'

import { upload as enviarAoBlob } from '@vercel/blob/client'
import { caminhoDaBiblioteca } from '@/lib/storage'
import { prepararParaBiblioteca, tipoPeloConteudo } from '@/lib/midia/preparar'
import type { PerfilDeFoto } from '@/lib/midia/regras'

/**
 * Envia um arquivo do navegador para a Biblioteca — o único caminho do
 * navegador até ela (a tela da Biblioteca, o hub e o editor de conteúdo).
 *
 * Antes de subir, o arquivo é preparado (lib/midia/preparar.ts): foto vira
 * JPEG leve sem GPS, vídeo vira MP4 H.264. Depois vai direto do navegador ao
 * armazenamento, porque a função serverless da Vercel corta o corpo em
 * 4,5 MB. A função continua sendo o guarda (sessão, tipo, tamanho e espaço
 * em /api/files/upload-token) e o registro acontece contra o arquivo gravado
 * (/api/files/register, que ainda recomprime foto grande que escapou daqui).
 */
export type ArquivoEnviado = {
  id: string
  storagePath: string
  previa: string
  /** Nome, tipo e tamanho FINAIS (depois do preparo e do servidor): "IMG_2043.HEIC" vira "IMG_2043.jpg". */
  nome: string
  tipo: string
  tamanho: number
  tamanhoOriginal: number
  otimizado: boolean
  motivo: string
}

export type EtapaDoEnvio = 'otimizando' | 'enviando'

export async function enviarParaBiblioteca(
  escolhido: File,
  opcoes: {
    workspaceId: string
    tags?: string[]
    /** Quem envia declara o uso de imagem. O padrão nega, não permite. */
    autorizacao?: 'pending' | 'authorized' | 'internal'
    /** 'alta': foto até 4096 px e vídeo original, para impressão ou edição. */
    perfil?: PerfilDeFoto
    /** Porcentagem do envio ao armazenamento (0–100). */
    onProgresso?: (porcentagem: number) => void
    /** Em que etapa está e quanto dela (0–100): otimizar vídeo demora. */
    onEtapa?: (etapa: EtapaDoEnvio, porcentagem: number) => void
    sinal?: AbortSignal
  },
): Promise<ArquivoEnviado> {
  opcoes.onEtapa?.('otimizando', 0)
  const preparo = await prepararParaBiblioteca(escolhido, {
    perfil: opcoes.perfil,
    sinal: opcoes.sinal,
    aoProgredir: (fracao) => opcoes.onEtapa?.('otimizando', Math.round(fracao * 100)),
  })
  const arquivo = preparo.arquivo
  const contentType = arquivo.type || (await tipoPeloConteudo(arquivo)) || undefined

  opcoes.onEtapa?.('enviando', 0)
  const blob = await enviarAoBlob(caminhoDaBiblioteca(opcoes.workspaceId, arquivo.name), arquivo, {
    access: 'private',
    handleUploadUrl: '/api/files/upload-token',
    // O tamanho que vai de fato (a cota é conferida com ele).
    clientPayload: String(arquivo.size),
    contentType,
    abortSignal: opcoes.sinal,
    onUploadProgress: ({ percentage }) => {
      opcoes.onProgresso?.(Math.round(percentage))
      opcoes.onEtapa?.('enviando', Math.round(percentage))
    },
  })

  const resposta = await fetch('/api/files/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pathname: blob.pathname,
      name: arquivo.name,
      originalName: escolhido.name,
      originalSize: escolhido.size,
      optimized: preparo.otimizado,
      profile: opcoes.perfil ?? 'padrao',
      tags: opcoes.tags ?? [],
      authorization: opcoes.autorizacao ?? 'pending',
    }),
  })
  const resultado = await resposta.json()
  if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível registrar o arquivo.')

  return {
    id: resultado.id,
    storagePath: resultado.storagePath,
    previa: `/api/private-blob?pathname=${encodeURIComponent(resultado.storagePath)}`,
    nome: resultado.name ?? arquivo.name,
    tipo: resultado.contentType ?? arquivo.type,
    tamanho: Number(resultado.size ?? arquivo.size),
    tamanhoOriginal: escolhido.size,
    otimizado: preparo.otimizado || Boolean(resultado.optimizedByServer),
    motivo: resultado.optimizedByServer ? 'Otimizado no servidor.' : preparo.motivo,
  }
}
