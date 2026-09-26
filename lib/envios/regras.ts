/**
 * As regras do envio de ações pela equipe (docs/envio-de-acoes.md): o que o
 * formulário público aceita, os limites contra abuso, a chave dos arquivos no
 * R2 e os textos que saem daqui. Módulo puro, conferido com `npx tsx`.
 */

import { nomeSeguro } from '@/lib/acervo/regras'

/** 2 GB por arquivo: o mesmo teto do acervo, que é para onde os arquivos vão. */
export const TAMANHO_MAXIMO = 2 * 1024 * 1024 * 1024
/** Arquivos por envio, somando os que chegarem depois ("mandar mais"). */
export const ARQUIVOS_POR_ENVIO = 60
/** Por origem (IP): quantos envios numa hora e quantos bytes num dia. */
export const ENVIOS_POR_HORA = 10
export const BYTES_POR_DIA = 5 * 1024 * 1024 * 1024
/** Por quanto tempo o mesmo link de "recebemos" aceita mais arquivos. */
export const HORAS_PARA_MANDAR_MAIS = 24
/** Tempo mínimo de preenchimento: robô envia em milissegundos. */
export const TEMPO_MINIMO_MS = 4000
/** Gravação de áudio na hora. */
export const MINUTOS_DE_AUDIO = 5

export type Categoria = 'foto' | 'video' | 'audio' | 'documento'
export type Autorizacao = 'sim' | 'nao_sei' | 'menores' | 'sem_pessoas'

export const AUTORIZACOES: Record<Autorizacao, { rotulo: string; detalhe: string; podePublicar: boolean }> = {
  sim: { rotulo: 'Sim, todas autorizaram', detalhe: 'As pessoas que aparecem nas fotos e vídeos autorizaram o uso da imagem.', podePublicar: true },
  sem_pessoas: { rotulo: 'Não aparece ninguém de frente', detalhe: 'Só o local, objetos, pessoas de costas ou de longe.', podePublicar: true },
  nao_sei: { rotulo: 'Não sei / não perguntei', detalhe: 'A comunicação confere antes de publicar.', podePublicar: false },
  menores: { rotulo: 'Tem criança ou adolescente', detalhe: 'Precisa da autorização dos responsáveis antes de publicar.', podePublicar: false },
}

const EXTENSOES: Record<Categoria, string[]> = {
  foto: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'],
  video: ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv', 'avi'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'webm', 'amr', 'flac'],
  documento: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv', 'rtf'],
}

/** O que o navegador pode escolher (o `accept` do campo de arquivo). */
export const ACEITOS = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.rtf'

const extensao = (nome: string) => /\.([a-z0-9]{1,5})$/i.exec(nome)?.[1]?.toLowerCase() ?? ''

/**
 * A categoria de um arquivo, pelo tipo e pela extensão. Null = não aceito
 * (executável, compactado, qualquer outra coisa): o envio é de mídia e
 * documento, e um .zip ou .exe num link aberto é convite a abuso.
 */
export function categoriaDoArquivo(nome: string, tipo: string): Categoria | null {
  const t = tipo.toLowerCase()
  const ext = extensao(nome)
  if (/^(application\/(x-)?(zip|rar|7z|msdownload|x-msdownload|x-sh|javascript|java-archive))|^text\/html/.test(t)) return null
  if (t.startsWith('image/') && t !== 'image/svg+xml') return 'foto'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  // Sem tipo (acontece no Android com alguns arquivos): decide pela extensão.
  for (const categoria of ['foto', 'video', 'audio', 'documento'] as Categoria[]) {
    if (EXTENSOES[categoria].includes(ext)) {
      if (categoria === 'documento' && t && !/^(application\/|text\/(plain|csv|rtf))/.test(t)) return null
      return categoria
    }
  }
  return null
}

export type ArquivoPedido = { nome: string; tipo: string; tamanho: number; gravadoNaHora: boolean; categoria: Categoria }

/** Lê a lista de arquivos que o navegador quer mandar. Erro em texto para a pessoa. */
export function lerArquivos(bruto: unknown, jaTem = 0): { arquivos: ArquivoPedido[]; erro?: string } {
  if (bruto === undefined || bruto === null) return { arquivos: [] }
  if (!Array.isArray(bruto)) return { arquivos: [], erro: 'Lista de arquivos inválida.' }
  if (jaTem + bruto.length > ARQUIVOS_POR_ENVIO) return { arquivos: [], erro: `Cada envio aceita até ${ARQUIVOS_POR_ENVIO} arquivos. Mande o resto num envio novo.` }
  const arquivos: ArquivoPedido[] = []
  for (const a of bruto as Record<string, unknown>[]) {
    const nome = nomeSeguro(String(a?.nome ?? 'arquivo')).slice(0, 255)
    const tipo = String(a?.tipo ?? '').slice(0, 120)
    const tamanho = Number(a?.tamanho)
    if (!Number.isFinite(tamanho) || tamanho <= 0) return { arquivos: [], erro: `"${nome}" está vazio.` }
    if (tamanho > TAMANHO_MAXIMO) return { arquivos: [], erro: `"${nome}" passa de 2 GB. Mande um vídeo mais curto ou em qualidade menor.` }
    const categoria = categoriaDoArquivo(nome, tipo)
    if (!categoria) return { arquivos: [], erro: `"${nome}" não é um tipo aceito. Mande fotos, vídeos, áudios, PDF ou documentos do Office.` }
    arquivos.push({ nome, tipo, tamanho: Math.round(tamanho), gravadoNaHora: a?.gravadoNaHora === true && categoria === 'audio', categoria })
  }
  return { arquivos }
}

export type DadosDoEnvio = {
  nome: string
  setor: string | null
  whatsapp: string | null
  email: string | null
  titulo: string
  data_da_acao: string | null
  local: string | null
  latitude: number | null
  longitude: number | null
  pessoas_atendidas: number | null
  parceiros: string | null
  relato: string | null
  autorizacao_imagem: Autorizacao
  avisar_quando_publicar: boolean
}

const texto = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+$/g, '').trim() : ''
  return s ? [...s].slice(0, max).join('') : null
}
const numero = (v: unknown, min: number, max: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/** "(21) 99999-0000", "+55 21 9..." → só dígitos, com 55 na frente quando falta. Null se não parece telefone. */
export function whatsappNormalizado(v: string | null): string | null {
  if (!v) return null
  const d = v.replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return d.length >= 8 && d.length <= 15 ? d : null
}

/**
 * Lê os campos do formulário. `hoje` (AAAA-MM-DD, em São Paulo) limita a data:
 * ação do futuro é engano de digitação.
 */
export function lerEnvio(j: Record<string, unknown>, hoje: string): { dados?: DadosDoEnvio; erros: string[] } {
  const erros: string[] = []
  const nome = texto(j.nome, 120)
  if (!nome || nome.length < 2) erros.push('Diga seu nome.')
  const titulo = texto(j.titulo, 200)
  if (!titulo || titulo.length < 3) erros.push('Dê um título curto para a ação (ex.: "Ação de prevenção na Central do Brasil").')
  const email = texto(j.email, 254)?.toLowerCase() ?? null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.push('O e-mail não parece certo.')
  const whatsappBruto = texto(j.whatsapp, 40)
  const whatsapp = whatsappNormalizado(whatsappBruto)
  if (whatsappBruto && !whatsapp) erros.push('O WhatsApp não parece certo. Use DDD + número.')
  let data = texto(j.data_da_acao, 10)
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje || data < '2000-01-01')) {
    erros.push('A data da ação não pode ser no futuro.')
    data = null
  }
  const autorizacao = typeof j.autorizacao_imagem === 'string' && j.autorizacao_imagem in AUTORIZACOES ? j.autorizacao_imagem as Autorizacao : null
  if (!autorizacao) erros.push('Responda se as pessoas nas fotos autorizaram o uso da imagem.')
  const latitude = numero(j.latitude, -90, 90)
  const longitude = numero(j.longitude, -180, 180)
  const pessoas = numero(j.pessoas_atendidas, 0, 1_000_000)
  if (erros.length) return { erros }
  return {
    erros,
    dados: {
      nome: nome!,
      setor: texto(j.setor, 120),
      whatsapp,
      email,
      titulo: titulo!,
      data_da_acao: data,
      local: texto(j.local, 300),
      latitude: latitude !== null && longitude !== null ? latitude : null,
      longitude: latitude !== null && longitude !== null ? longitude : null,
      pessoas_atendidas: pessoas === null ? null : Math.round(pessoas),
      parceiros: texto(j.parceiros, 500),
      relato: texto(j.relato, 20000),
      autorizacao_imagem: autorizacao!,
      avisar_quando_publicar: j.avisar_quando_publicar !== false,
    },
  }
}

/** A chave do arquivo no bucket do acervo: entrada/envios/AAAA-MM/<id do envio>/<8 letras>-<nome>. */
export function chaveDoArquivo(envioId: string, mes: string, sufixo: string, nome: string): string {
  return `entrada/envios/${mes}/${envioId}/${sufixo}-${nomeSeguro(nome)}`
}

export const ehChaveDeEnvio = (chave: string, envioId: string) =>
  new RegExp(`^entrada/envios/\\d{4}-\\d{2}/${envioId}/[0-9a-f]{8}-[^/]{1,130}$`).test(chave)

/** O texto que vira descrição da pauta: o relato, a transcrição e os dados da ação. */
export function descricaoDaPauta(e: {
  relato: string | null; transcricao: string | null; nome: string; setor: string | null; data_da_acao: string | null
  local: string | null; pessoas_atendidas: number | null; parceiros: string | null; protocolo: string
}): string {
  const partes: string[] = []
  if (e.relato) partes.push(e.relato)
  if (e.transcricao) partes.push(`Relato em áudio (transcrição):\n${e.transcricao}`)
  const ficha = [
    `Enviado por: ${e.nome}${e.setor ? ` (${e.setor})` : ''} — ${e.protocolo}`,
    e.data_da_acao ? `Data: ${e.data_da_acao.split('-').reverse().join('/')}` : '',
    e.local ? `Local: ${e.local}` : '',
    e.pessoas_atendidas !== null ? `Pessoas atendidas: ${e.pessoas_atendidas}` : '',
    e.parceiros ? `Parceiros: ${e.parceiros}` : '',
  ].filter(Boolean)
  partes.push(ficha.join('\n'))
  return partes.join('\n\n')
}

/** Link do WhatsApp com a mensagem pronta (wa.me). */
export function linkDoWhatsapp(numero: string, mensagem: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`
}

export const mensagemDePublicacao = (nome: string, titulo: string, url: string) =>
  `Olá, ${nome.split(' ')[0]}! A ação que você mandou ("${titulo}") virou matéria no site da Cruz Vermelha RJ: ${url} — obrigado por compartilhar!`

export const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
    : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`

export const ESTADOS_DO_ENVIO = {
  recebendo: 'Chegando',
  novo: 'Novo',
  em_avaliacao: 'Em avaliação',
  virou_pauta: 'Virou pauta',
  arquivado: 'Arquivado',
} as const
export type EstadoDoEnvio = keyof typeof ESTADOS_DO_ENVIO
