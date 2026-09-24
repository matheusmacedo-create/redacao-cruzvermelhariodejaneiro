import { gerarSlug } from '@/lib/site/slug'

/**
 * Regras do acervo (docs/acervo.md). Módulo puro: a tela usa para conferir
 * antes de enviar, a action confere de novo, e o banco tem as mesmas listas em
 * CHECK (supabase/migrations/20260926003000_cvrj_acervo.sql).
 *
 * Os arquivos moram no bucket do acervo no Cloudflare R2 (privado). O que é
 * marcado como público vira página em cruzvermelhariodejaneiro.org/acervo/,
 * com as imagens em versões para a web.
 */

export const COLECOES = ['documentos', 'fotos', 'videos', 'imprensa', 'historia'] as const
export type Colecao = (typeof COLECOES)[number]

/** Nome, frase de abertura da página pública (vira meta description), resumo do cartão público e ajuda na tela. */
export const COLECAO: Record<Colecao, { nome: string; singular: string; descricao: string; resumo: string; ajuda: string }> = {
  documentos: {
    nome: 'Documentos',
    singular: 'Documento',
    descricao: 'Documentos da Cruz Vermelha Brasileira Rio de Janeiro: estatutos, atas, relatórios, ofícios, certificados e registros da atuação da filial.',
    resumo: 'Estatutos, atas, relatórios, ofícios e certificados.',
    ajuda: 'Estatuto, atas, relatórios, ofícios, certificados, contratos.',
  },
  fotos: {
    nome: 'Fotos',
    singular: 'Foto',
    descricao: 'Fotografias da Cruz Vermelha Brasileira Rio de Janeiro: ações humanitárias, cursos, campanhas, voluntariado e eventos da filial.',
    resumo: 'Ações humanitárias, cursos, campanhas e eventos.',
    ajuda: 'Ações, cursos, campanhas, eventos.',
  },
  videos: {
    nome: 'Vídeos',
    singular: 'Vídeo',
    descricao: 'Vídeos da Cruz Vermelha Brasileira Rio de Janeiro: registros de ações, cursos, campanhas e da história da filial.',
    resumo: 'Registros em vídeo de ações, cursos e campanhas.',
    ajuda: 'Na página pública, o vídeo aparece pelo link do YouTube ou do Vimeo.',
  },
  imprensa: {
    nome: 'Imprensa',
    singular: 'Recorte de imprensa',
    descricao: 'O que a imprensa publicou sobre a Cruz Vermelha Brasileira Rio de Janeiro: reportagens, entrevistas e notas, com data e veículo.',
    resumo: 'Reportagens, entrevistas e notas sobre a filial.',
    ajuda: 'Reportagens e notas sobre a filial, com o veículo e a data.',
  },
  historia: {
    nome: 'História',
    singular: 'Registro histórico',
    descricao: 'A história da Cruz Vermelha Brasileira Rio de Janeiro em fotos antigas, documentos de fundação e registros de época.',
    resumo: 'Fotos antigas, documentos de fundação e registros de época.',
    ajuda: 'Fotos antigas digitalizadas, documentos de fundação, registros de época.',
  },
}

export const DIREITOS = ['todos_reservados', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_nd', 'dominio_publico'] as const
export type Direitos = (typeof DIREITOS)[number]
export const DIREITO: Record<Direitos, { nome: string; licenca: string | null }> = {
  todos_reservados: { nome: 'Todos os direitos reservados', licenca: null },
  cc_by: { nome: 'Creative Commons Atribuição 4.0 (CC BY 4.0)', licenca: 'https://creativecommons.org/licenses/by/4.0/deed.pt-br' },
  cc_by_sa: { nome: 'Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0)', licenca: 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br' },
  cc_by_nc: { nome: 'Creative Commons Atribuição-NãoComercial 4.0 (CC BY-NC 4.0)', licenca: 'https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br' },
  cc_by_nc_nd: { nome: 'Creative Commons Atribuição-NãoComercial-SemDerivações 4.0 (CC BY-NC-ND 4.0)', licenca: 'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.pt-br' },
  dominio_publico: { nome: 'Domínio público', licenca: 'https://creativecommons.org/publicdomain/mark/1.0/deed.pt-br' },
}

export const PRECISOES = ['dia', 'mes', 'ano'] as const
export type Precisao = (typeof PRECISOES)[number]

export const VISIBILIDADES = ['privado', 'publico'] as const
export type Visibilidade = (typeof VISIBILIDADES)[number]

/** Tipo do arquivo, pelo Content-Type. Decide como ele aparece na página pública. */
export type TipoDeArquivo = 'imagem' | 'pdf' | 'video' | 'audio' | 'outro'
export function tipoDoArquivo(mime: string | null | undefined): TipoDeArquivo {
  const m = (mime ?? '').toLowerCase()
  if (/^image\/(jpeg|png|webp|gif|tiff|avif|heic|heif)$/.test(m)) return 'imagem'
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'outro'
}

/** Um envio pelo navegador: até 2 GB (o limite de um envio simples no R2 é 5 GB). */
export const TAMANHO_MAXIMO = 2 * 1024 ** 3
/** Arquivos até este tamanho têm o SHA-256 calculado ao entrar no catálogo. */
export const TAMANHO_PARA_SHA256 = 200 * 1024 ** 2
/** Imagem e PDF públicos sobem para o site; acima disto, o PDF fica só no acervo. */
export const TAMANHO_MAXIMO_NO_SITE = 60 * 1024 ** 2

/** Larguras das versões para a web (nunca maiores que o original). */
export const LARGURAS = [480, 960, 1600] as const

const ehDe = <T extends string>(lista: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v)
export const ehColecao = ehDe(COLECOES)
export const ehDireitos = ehDe(DIREITOS)
export const ehPrecisao = ehDe(PRECISOES)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "24 de setembro de 2026", "setembro de 2026" ou "2026". */
export function dataLegivel(data: string | null | undefined, precisao: Precisao = 'dia'): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '')
  if (!m) return null
  const [, ano, mes, dia] = m
  if (precisao === 'ano') return ano
  if (precisao === 'mes') return `${MESES[Number(mes) - 1]} de ${ano}`
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`
}

/** A data em ISO 8601 com a precisão conhecida: "2026-09-24", "2026-09" ou "2026". */
export function dataIso(data: string | null | undefined, precisao: Precisao = 'dia'): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '')
  if (!m) return null
  return precisao === 'ano' ? m[1] : precisao === 'mes' ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`
}

/** O endereço do item dentro da coleção: [a-z0-9-], até 80, nunca "pagina" (é a paginação). */
export function slugDoItem(titulo: string): string {
  const s = gerarSlug(titulo).replace(/-materia$/, '-item') || 'item'
  return s === 'pagina' ? 'pagina-item' : s
}

export const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** O endereço tem até 80 caracteres (CHECK da tabela). */
export const TAMANHO_DO_SLUG = 80

export const slugDoAcervoValido = (s: string) => SLUG_VALIDO.test(s) && s.length <= TAMANHO_DO_SLUG && s !== 'pagina'

/**
 * Endereço livre na coleção. Repetido ganha -2, -3…, e a base encurta para o sufixo caber nos 80
 * caracteres: "relatorio-anual-…-rio-de-janeiro" (79) vira "relatorio-anual-…-rio-de-janeir-2" (80), não 81.
 */
export function slugLivre(desejado: string, jaUsados: Iterable<string>): string {
  const usados = new Set(jaUsados)
  if (!usados.has(desejado)) return desejado
  for (let n = 2; n < 10_000; n++) {
    const sufixo = `-${n}`
    const tentativa = `${desejado.slice(0, TAMANHO_DO_SLUG - sufixo.length).replace(/-+$/, '')}${sufixo}`
    if (!usados.has(tentativa)) return tentativa
  }
  throw new Error('Não foi possível achar um endereço livre para este item: mude o título.')
}

/** Tamanho como o Postgres conta (char_length): um emoji é um caractere, não dois. */
export const caracteres = (s: string) => [...s].length

/** Corta em caracteres, sem partir um emoji ao meio (o pedaço solto não é UTF-16 válido). */
export function cortar(s: string, max: number): string {
  const c = [...s]
  return c.length > max ? c.slice(0, max).join('') : s
}

/** Nome de arquivo seguro para a chave no R2: sem barra, sem controle, até 120 caracteres. */
export function nomeSeguro(nome: string): string {
  const limpo = nome.normalize('NFC').replace(/[\\/\u0000-\u001f\u007f]+/g, '-').replace(/\s+/g, ' ').trim()
  const ponto = limpo.lastIndexOf('.')
  const ext = ponto > 0 ? limpo.slice(ponto).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10) : ''
  const base = cortar(ponto > 0 ? limpo.slice(0, ponto) : limpo, 120 - ext.length).trim()
  return `${base || 'arquivo'}${ext}`
}

export type DadosDoItem = {
  colecao: Colecao
  titulo: string
  descricao: string | null
  data_item: string | null
  data_precisao: Precisao
  autoria: string | null
  local: string | null
  direitos: Direitos
  credito: string | null
  texto_alternativo: string | null
  palavras_chave: string[]
  url_video: string | null
}

const texto = (v: unknown) => String(v ?? '').trim()
const opcional = (v: unknown, max: number) => {
  const t = texto(v).replace(/\s+/g, ' ')
  return t ? cortar(t, max) : null
}
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{6,20}|youtu\.be\/[\w-]{6,20}|vimeo\.com\/\d{5,12})(\S*)?$/

/** A ficha do item, vinda do formulário. Devolve os dados ou a lista do que falta. */
export function lerItem(f: FormData | Record<string, unknown>): { dados?: DadosDoItem; erros: string[] } {
  const get = (nome: string) => (f instanceof FormData ? f.get(nome) : f[nome])
  const erros: string[] = []
  const colecao = texto(get('colecao'))
  if (!ehColecao(colecao)) erros.push('Escolha a coleção.')
  const titulo = texto(get('titulo')).replace(/\s+/g, ' ')
  if (caracteres(titulo) < 3 || caracteres(titulo) > 160) erros.push('O título precisa ter de 3 a 160 caracteres.')
  const descricao = cortar(texto(get('descricao')), 5000) || null
  const precisao = texto(get('data_precisao')) || 'dia'
  if (!ehPrecisao(precisao)) erros.push('Precisão da data inválida.')
  let data = texto(get('data_item')) || null
  if (data) {
    // Aceita AAAA, AAAA-MM ou AAAA-MM-DD; guarda sempre como data completa.
    const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(data)
    const ano = m ? Number(m[1]) : NaN
    if (!m || ano < 1800 || ano > new Date().getFullYear() + 1) erros.push('Data inválida (use AAAA, AAAA-MM ou AAAA-MM-DD).')
    else {
      data = `${m[1]}-${m[2] ?? '01'}-${m[3] ?? '01'}`
      // O Date aceita 31/02 e passa para março: a data só vale se voltar igual.
      const d = new Date(`${data}T12:00:00Z`)
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) erros.push('Data inválida (confira o dia e o mês).')
    }
  }
  const direitos = texto(get('direitos')) || 'todos_reservados'
  if (!ehDireitos(direitos)) erros.push('Escolha os direitos de uso.')
  const urlVideo = texto(get('url_video')) || null
  if (urlVideo && !VIDEO.test(urlVideo)) erros.push('O link do vídeo precisa ser do YouTube ou do Vimeo.')
  const bruto = get('palavras_chave')
  const palavras = (Array.isArray(bruto) ? bruto.map(String) : texto(bruto).split(','))
    .map((p) => p.trim().replace(/\s+/g, ' ').toLowerCase()).filter((p) => p.length >= 2 && p.length <= 40)
  if (erros.length) return { erros }
  return {
    erros,
    dados: {
      colecao: colecao as Colecao,
      titulo,
      descricao,
      data_item: data,
      data_precisao: precisao as Precisao,
      autoria: opcional(get('autoria'), 200),
      local: opcional(get('local'), 200),
      direitos: direitos as Direitos,
      credito: opcional(get('credito'), 200),
      texto_alternativo: opcional(get('texto_alternativo'), 300),
      palavras_chave: [...new Set(palavras)].slice(0, 20),
      url_video: urlVideo,
    },
  }
}

/** O que falta para o item poder ir a público (a página precisa ser útil e acessível). */
export function faltaParaPublicar(i: DadosDoItem & { tipo_mime: string | null; chave_r2: string | null; tamanho: number | null }): string[] {
  const falta: string[] = []
  const tipo = tipoDoArquivo(i.tipo_mime)
  if (!i.descricao || i.descricao.length < 40) falta.push('uma descrição de pelo menos 40 caracteres (é o que o Google mostra)')
  if (tipo === 'imagem' && (!i.texto_alternativo || i.texto_alternativo.length < 10)) falta.push('o texto alternativo da imagem (para quem usa leitor de tela, e para a busca de imagens)')
  if (tipo === 'video' || i.colecao === 'videos') {
    if (!i.url_video) falta.push('o link do vídeo no YouTube ou no Vimeo (o arquivo de vídeo fica só no acervo)')
  } else if (!i.chave_r2) {
    falta.push('o arquivo')
  } else if (tipo !== 'imagem' && tipo !== 'pdf') {
    falta.push('um arquivo de imagem ou PDF (outros formatos ficam só no acervo interno)')
  } else if (/^image\/hei[cf]$/i.test(i.tipo_mime ?? '')) {
    // O sharp da Vercel não lê o HEIC do iPhone (só o AVIF, do mesmo formato HEIF).
    falta.push('a foto em JPEG ou PNG: o HEIC do iPhone não abre no servidor (exporte como JPEG e envie de novo)')
  } else if (tipo === 'pdf' && (i.tamanho ?? 0) > TAMANHO_MAXIMO_NO_SITE) {
    falta.push('um PDF de até 60 MB para o site')
  }
  if (i.direitos !== 'dominio_publico' && !i.credito && !i.autoria) falta.push('a autoria ou o crédito')
  return falta
}
