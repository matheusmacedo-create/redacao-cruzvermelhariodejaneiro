import 'server-only'
import sharp from 'sharp'
import { pedirJsonAoClaude, type AnexoParaVer } from '@/lib/ia/anthropic'
import { IaError } from '@/lib/ia/openai'
import type { DocumentoExtraido } from './regras'

/**
 * A leitura do documento de identidade pelo Claude: só o que está impresso,
 * num JSON fixo. Nada de descrever o rosto, julgar autenticidade ou
 * "adivinhar" o que não estiver legível. A decisão continua humana: o que
 * sai daqui vira a comparação com o cadastro (regras.ts, compararComCadastro)
 * e o CPF extraído alimenta só o cpf_confere do banco, depois é descartado.
 *
 * O candidato foi avisado no termo (VERIFICACAO_TERMO_VERSAO) de que a
 * leitura é automatizada e que o arquivo passa pela Anthropic (EUA) só para
 * isso — LGPD, arts. 20 e 33.
 */

/** Imagem até 2000 px no maior lado e JPEG, sem EXIF; PDF até 10 MB. */
const LADO_MAXIMO = 2_000
const PDF_MAXIMO = 10 * 1024 * 1024
const LIMITE_DE_PIXELS = 80_000_000

export const ESQUEMA_DO_DOCUMENTO = {
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'tipo', 'nome', 'data_nascimento', 'cpf', 'numero', 'orgao_emissor', 'uf', 'validade'],
  properties: {
    legivel: { type: 'boolean', description: 'true se é um documento de identificação brasileiro legível (RG, CNH, RNE/CRNM, passaporte, carteira de conselho).' },
    tipo: { type: ['string', 'null'], description: 'RG, CNH, RNE, CRNM, passaporte, carteira profissional ou outro; null se ilegível.' },
    nome: { type: ['string', 'null'], description: 'Nome completo exatamente como impresso.' },
    data_nascimento: { type: ['string', 'null'], description: 'AAAA-MM-DD, ou null.' },
    cpf: { type: ['string', 'null'], description: 'Só os 11 dígitos, ou null se não estiver impresso ou legível.' },
    numero: { type: ['string', 'null'], description: 'Número do documento (registro geral, número da CNH, RNE…), como impresso.' },
    orgao_emissor: { type: ['string', 'null'], description: 'Órgão emissor (DETRAN, SSP, IFP, DGPC…).' },
    uf: { type: ['string', 'null'], description: 'UF do órgão emissor, duas letras.' },
    validade: { type: ['string', 'null'], description: 'AAAA-MM-DD da validade, se impressa.' },
  },
} as const

export const SISTEMA_DA_LEITURA = `Você lê documentos de identificação brasileiros (RG, CNH, RNE/CRNM, passaporte, carteira de conselho profissional) para uma conferência cadastral da Cruz Vermelha. Transcreva SOMENTE o que está impresso, no JSON pedido. Regras:
- Campo que não estiver legível ou impresso: null. Nunca complete, nunca deduza.
- Datas em AAAA-MM-DD. CPF só com os 11 dígitos.
- Se a imagem não for um documento de identificação (foto de pessoa, selfie, tela, papel em branco): legivel=false e todos os campos null.
- Não descreva a pessoa, o rosto, a foto nem a aparência do documento. Não opine sobre autenticidade.
- Quando houver frente e verso, junte os dados dos dois.`

export class ErroDaLeitura extends Error {}

/** Deixa a imagem do tamanho e do formato que o modelo aceita, sem EXIF (o sharp não copia metadados). */
export async function prepararImagem(bytes: Uint8Array): Promise<AnexoParaVer> {
  try {
    const saida = await sharp(bytes, { limitInputPixels: LIMITE_DE_PIXELS, autoOrient: true })
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
    return { b64: saida.toString('base64'), mediaType: 'image/jpeg' }
  } catch {
    throw new ErroDaLeitura('Não foi possível abrir esta imagem. Peça ao candidato uma foto em JPG ou PNG.')
  }
}

/** Um arquivo da ficha vira anexo: imagem preparada, ou PDF como está (até 10 MB). */
export async function anexoDoArquivo(bytes: Uint8Array, tipo: string): Promise<AnexoParaVer> {
  if (tipo === 'application/pdf') {
    if (bytes.byteLength > PDF_MAXIMO) throw new ErroDaLeitura('O PDF passa de 10 MB. Peça a foto do documento em JPG.')
    return { pdfB64: Buffer.from(bytes).toString('base64') }
  }
  return prepararImagem(bytes)
}

const limpar = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const data = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) ? v : null)

/** Lê os anexos (frente e verso juntos) e devolve o JSON já saneado. Lança IaError (sem chave, recusa, cota) ou ErroDaLeitura. */
export async function lerDocumento(anexos: AnexoParaVer[]): Promise<{ extraido: DocumentoExtraido; modelo: string }> {
  if (!anexos.length) throw new ErroDaLeitura('Nenhum arquivo de documento para ler.')
  let dados: Record<string, unknown>
  let modelo = ''
  try {
    const r = await pedirJsonAoClaude<Record<string, unknown>>({
      system: SISTEMA_DA_LEITURA,
      texto: anexos.length > 1 ? 'Estes arquivos são o mesmo documento (frente e verso, ou páginas). Transcreva os campos.' : 'Transcreva os campos deste documento.',
      schema: ESQUEMA_DO_DOCUMENTO as unknown as Record<string, unknown>,
      anexos,
      maxTokens: 1_000,
      effort: 'low',
    })
    dados = r.dados
    modelo = r.medida.modelo
  } catch (causa) {
    if (causa instanceof IaError) throw causa
    throw new ErroDaLeitura('O Claude não leu este documento; confira manualmente.')
  }
  const cpf = typeof dados.cpf === 'string' ? dados.cpf.replace(/\D/g, '') : ''
  return {
    modelo,
    extraido: {
      legivel: dados.legivel === true,
      tipo: limpar(dados.tipo, 40),
      nome: limpar(dados.nome),
      data_nascimento: data(dados.data_nascimento),
      cpf: cpf.length === 11 ? cpf : null,
      numero: limpar(dados.numero, 40),
      orgao_emissor: limpar(dados.orgao_emissor, 40),
      uf: limpar(dados.uf, 2)?.toUpperCase() ?? null,
      validade: data(dados.validade),
    },
  }
}
