import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { bucketDoAcervo } from '@/lib/acervo/dados'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { notificar } from '@/lib/notificacoes/servidor'
import { BYTES_POR_DIA, ENVIOS_POR_HORA, chaveDoArquivo, nomeCanonico, tamanhoLegivel, type ArquivoPedido, type Categoria } from './regras'
import { miniaturaDaChave } from './album'

/**
 * O lado do servidor do envio de ações (docs/envio-de-acoes.md). As rotas
 * públicas (/api/enviar) e a caixa (/envios) passam por aqui.
 */

type Admin = ReturnType<typeof createAdminClient>

export const hashDoToken = (token: string) => createHash('sha256').update(`envio:${token}`).digest('hex')
export const novoToken = () => randomBytes(24).toString('hex')
export const hashDaOrigem = (ip: string | null) => createHash('sha256').update(`envio-origem:${ip ?? 'desconhecido'}`).digest('hex')

/** O bucket do acervo no R2; sem ele o envio de arquivos não funciona (o de texto, sim). */
export function armazenamento() {
  return bucketDoAcervo()
}

export async function espacoPrincipal(admin: Admin): Promise<string | null> {
  const { data } = await admin.from('workspaces').select('id, kind').order('created_at').limit(5)
  const lista = (data ?? []) as { id: string; kind: string }[]
  return (lista.find((w) => w.kind === 'production') ?? lista[0])?.id ?? null
}

/** Limites por origem: envios na última hora e bytes nas últimas 24 horas. */
export async function conferirLimites(admin: Admin, ipHash: string, bytesNovos: number, contarEnvio: boolean): Promise<string | null> {
  const hora = new Date(Date.now() - 60 * 60_000).toISOString()
  const dia = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const [{ count: naHora }, { data: doDia }] = await Promise.all([
    contarEnvio
      ? admin.from('envios').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', hora)
      : Promise.resolve({ count: 0 }),
    admin.from('envios').select('envio_arquivos(tamanho)').eq('ip_hash', ipHash).gte('criado_em', dia).limit(200),
  ])
  if (contarEnvio && (naHora ?? 0) >= ENVIOS_POR_HORA) return 'Muitos envios seguidos deste aparelho. Espere um pouco e tente de novo.'
  const usados = ((doDia ?? []) as { envio_arquivos: { tamanho: number }[] }[])
    .flatMap((e) => e.envio_arquivos ?? []).reduce((soma, a) => soma + Number(a.tamanho ?? 0), 0)
  if (usados + bytesNovos > BYTES_POR_DIA) return `O limite diário de ${tamanhoLegivel(BYTES_POR_DIA)} por aparelho foi atingido. Mande o resto amanhã ou fale com a comunicação.`
  return null
}

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * Cria as linhas dos arquivos e devolve um link de envio (PUT, 2 horas) para
 * cada um. A chave já nasce com o nome canônico (data, assunto, autor e
 * número — regras.ts, nomeCanonico); o nome do celular fica em `nome`.
 * `jaTem` continua a numeração quando a pessoa manda mais arquivos depois.
 */
export async function prepararArquivos(
  admin: Admin,
  envio: { id: string; workspace_id: string; titulo: string; data_da_acao: string | null; nome: string },
  arquivos: ArquivoPedido[],
  jaTem = 0,
) {
  if (!arquivos.length) return []
  const r2 = armazenamento()
  if (!r2) throw new Error('O envio de arquivos está fora do ar agora. Mande o texto e avise a comunicação.')
  const mes = new Date().toISOString().slice(0, 7)
  const hoje = hojeEmSaoPaulo()
  const linhas = arquivos.map((a, i) => ({
    envio_id: envio.id, workspace_id: envio.workspace_id,
    chave: chaveDoArquivo(envio.id, mes, randomUUID().slice(0, 8), nomeCanonico({
      titulo: envio.titulo, data: envio.data_da_acao, hoje, autor: envio.nome, indice: jaTem + i + 1, nomeOriginal: a.nome,
    })),
    nome: a.nome, tipo_mime: a.tipo || null, tamanho: a.tamanho, categoria: a.categoria, gravado_na_hora: a.gravadoNaHora,
  }))
  const { data, error } = await admin.from('envio_arquivos').insert(linhas).select('id, chave, nome, categoria')
  if (error || !data) throw new Error('Não foi possível preparar o envio dos arquivos.')
  return (data as { id: string; chave: string; nome: string; categoria: Categoria }[]).map((l) => {
    // Foto ganha também o link da miniatura, que o celular gera e manda (o álbum do evento carrega leve).
    const mini = l.categoria === 'foto' ? miniaturaDaChave(l.chave) : null
    return {
      id: l.id, nome: l.nome, url: urlAssinada(r2.config, r2.bucket, l.chave, 'PUT', 2 * 60 * 60),
      ...(mini ? { miniatura: urlAssinada(r2.config, r2.bucket, mini, 'PUT', 2 * 60 * 60) } : {}),
    }
  })
}

/** O resumo "12 fotos, 2 vídeos e 1 áudio" do que chegou. */
export function resumoDosArquivos(arquivos: { categoria: Categoria }[]): string {
  const conta = (c: Categoria) => arquivos.filter((a) => a.categoria === c).length
  const partes = ([['foto', 'foto', 'fotos'], ['video', 'vídeo', 'vídeos'], ['audio', 'áudio', 'áudios'], ['documento', 'documento', 'documentos']] as const)
    .map(([c, um, varios]) => [conta(c), um, varios] as const)
    .filter(([n]) => n > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`)
  if (!partes.length) return 'só texto'
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

/** Sino (e e-mail, conforme a preferência) para quem avalia os envios. */
export async function avisarAvaliadores(admin: Admin, workspaceId: string, aviso: { titulo: string; mensagem: string; envioId: string; citacao?: string | null }) {
  try {
    const { data } = await admin.from('envios_avaliadores').select('user_id').eq('workspace_id', workspaceId)
    await notificar(admin, {
      workspaceId, para: (data ?? []).map((l) => l.user_id as string), atorId: null, categoria: 'pautas',
      titulo: aviso.titulo, mensagem: aviso.mensagem, link: `/envios/${aviso.envioId}`, botao: 'Abrir o envio', citacao: aviso.citacao ?? null,
    })
  } catch (causa) {
    console.error('[envios] aviso não enviado:', causa instanceof Error ? causa.message : causa)
  }
}

/** Esta pessoa avalia os envios deste espaço? (Decisão de 25/09/2026: só o Matheus.) */
export async function avaliaEnvios(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from('envios_avaliadores').select('user_id')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
    return !error && Boolean(data)
  } catch { return false }
}
