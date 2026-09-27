import { AUTORIZACOES, type Autorizacao } from '@/lib/envios/regras'
import { primeiroNome, type CategoriaDaMidia } from './regras'

/**
 * Fotos e vídeos mandados ao WhatsApp do Palácio viram um envio da equipe
 * (docs/envio-de-acoes.md) — as regras, sem banco. O servidor fica em
 * lib/whatsapp/envio.ts.
 *
 * O arquivo passa pelo servidor da Evolution (o computador da filial, atrás
 * do túnel) e pelo servidor do Palácio: por isso o teto é bem menor que o do
 * link /enviar, que manda direto ao armazenamento. Arquivo maior vai pelo link.
 */

export const TAMANHO_MAXIMO_PELO_WHATSAPP = 64 * 1024 * 1024
/** Um envio aberto espera mais fotos por 30 minutos a cada foto nova. */
export const ENVIO_ABERTO_MIN = 30
export const ARQUIVOS_POR_ENVIO_PELO_WHATSAPP = 60

const FIM = ['pronto', 'pronta', 'terminei', 'acabei', 'acabou', 'fim', 'so isso', 'e so', 'enviar', 'mandar', 'concluir', 'finalizar', 'ok pronto']
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
export const ehFimDaColeta = (entrada: string) => FIM.includes(normal(entrada))

/** O título provisório, até a pessoa dar o dela (e o que fica, se ela não der). */
export const tituloProvisorio = (nome: string | null) => `Envio pelo WhatsApp de ${primeiroNome(nome) || 'alguém da equipe'}`.slice(0, 200)

const EXTENSAO_DO_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'application/pdf': 'pdf',
}

/** O nome que o arquivo tinha: o do documento, ou "whatsapp-<id>.<ext>" para foto, vídeo e áudio. */
export function nomeDoArquivoRecebido(p: { nome: string | null; mime: string; mensagemId: string; categoria: CategoriaDaMidia }): string {
  const limpo = p.nome?.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim()
  if (limpo && /\.[a-z0-9]{1,5}$/i.test(limpo)) return limpo.slice(-200)
  const ext = EXTENSAO_DO_MIME[p.mime] ?? (p.categoria === 'foto' ? 'jpg' : p.categoria === 'video' ? 'mp4' : p.categoria === 'audio' ? 'ogg' : 'bin')
  const id = p.mensagemId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'arquivo'
  return `whatsapp-${id}.${ext}`
}

export const ORDEM_DAS_AUTORIZACOES: Autorizacao[] = ['sim', 'sem_pessoas', 'nao_sei', 'menores']
export const opcoesDeAutorizacao = () => ORDEM_DAS_AUTORIZACOES.map((a) => ({ nome: AUTORIZACOES[a].rotulo, detalhe: AUTORIZACOES[a].detalhe }))

export const TEXTO_COLETA_COMECOU =
  'Recebi! Estas fotos e vídeos vão virar um *envio para a comunicação*. Pode mandar mais desta mesma ação; quando terminar, escreva *pronto*. Para desistir, *cancelar*.'
export const TEXTO_PEDE_TITULO = 'Qual foi a ação? Escreva um título curto (ex.: _Ação de prevenção na Central do Brasil_). Se quiser, conte também o que aconteceu, numa linha só.'
