/**
 * Leitura de planilhas de contatos (CSV) para o banco de contatos.
 *
 * As listas chegam de lugares diferentes — exportação do Gmail, do Outlook,
 * do LinkedIn, planilha feita à mão —, cada uma com seu separador e seus
 * nomes de coluna. Aqui tudo vira a mesma forma. Roda no navegador (a
 * planilha não precisa subir inteira para o servidor) e é testável sem rede.
 */

export type ContatoImportado = {
  email: string
  nome: string
  veiculo: string
  cargo: string
  telefone: string
}

export type Campo = keyof ContatoImportado

/** Linhas de uma importação por chamada ao servidor. */
export const LOTE_DE_IMPORTACAO = 1000
/** Teto de uma planilha. Acima disso, divida o arquivo. */
export const TETO_DE_IMPORTACAO = 20000

/** Lê CSV com aspas, BOM e quebra de linha dentro de campo. Detecta ; , ou tab. */
export function lerCsv(bruto: string): string[][] {
  const texto = bruto.replace(/^﻿/, '')
  const primeira = texto.slice(0, texto.search(/\r?\n/) === -1 ? texto.length : texto.search(/\r?\n/))
  const contar = (c: string) => primeira.split(c).length - 1
  const sep = [';', ',', '\t'].reduce((a, b) => (contar(b) > contar(a) ? b : a), ',')

  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else aspas = false
      } else campo += c
    } else if (c === '"' && campo === '') {
      aspas = true
    } else if (c === sep) {
      linha.push(campo); campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((v) => v.trim())) linhas.push(linha)
      linha = []
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((v) => v.trim())) linhas.push(linha)
  return linhas
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const SINONIMOS: Record<Campo, string[]> = {
  email: ['email', 'e mail', 'mail', 'email address', 'endereco de email', 'e mail address', 'primary email', 'email 1 value', 'correio eletronico'],
  nome: ['nome', 'name', 'nome completo', 'full name', 'contato', 'contact', 'display name', 'first name', 'primeiro nome'],
  veiculo: ['veiculo', 'organizacao', 'organization', 'empresa', 'company', 'instituicao', 'orgao', 'midia', 'jornal', 'organization 1 name', 'company name'],
  cargo: ['cargo', 'funcao', 'title', 'job title', 'position', 'posicao', 'organization 1 title'],
  telefone: ['telefone', 'phone', 'celular', 'whatsapp', 'tel', 'mobile', 'phone 1 value', 'mobile phone', 'fone'],
}

/** Qual coluna é o quê, pelo nome do cabeçalho. -1 quando não achou. */
export function mapearColunas(cabecalho: string[]): Record<Campo, number> {
  const norm = cabecalho.map(normalizar)
  const campos: Campo[] = ['email', 'nome', 'veiculo', 'cargo', 'telefone']
  const mapa = { email: -1, nome: -1, veiculo: -1, cargo: -1, telefone: -1 }
  // Primeiro os nomes exatos; só depois o "contém", e só em coluna que
  // ninguém pegou — senão "Company Name" viraria o nome da pessoa.
  for (const campo of campos) mapa[campo] = norm.findIndex((h) => SINONIMOS[campo].includes(h))
  const tomadas = () => new Set(Object.values(mapa).filter((i) => i !== -1))
  for (const campo of campos) {
    if (mapa[campo] !== -1) continue
    const livres = tomadas()
    mapa[campo] = norm.findIndex((h, i) => !livres.has(i) && SINONIMOS[campo].some((s) => s.length > 3 && h.includes(s)))
  }
  return mapa
}

const RE_EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/** O e-mail de dentro de uma célula ("Ana <ana@x.org>", "mailto:…", espaços). */
export function extrairEmail(celula: string): string | null {
  const achado = celula.match(RE_EMAIL)?.[0]
  if (!achado) return null
  const email = achado.toLowerCase().replace(/^\.+|\.+$/g, '')
  const [local, dominio] = email.split('@')
  if (!local || !dominio || dominio.includes('..') || local.length > 64) return null
  return email
}

export type ResultadoDaLeitura = {
  contatos: ContatoImportado[]
  mapa: Record<Campo, number>
  cabecalho: string[]
  semEmail: number
  repetidosNoArquivo: number
}

/**
 * Da tabela lida aos contatos. Sem cabeçalho reconhecível de e-mail, procura a
 * coluna em que a maioria das células parece e-mail — e, nesse caso, a
 * primeira linha também é dado, não cabeçalho.
 */
export function linhasParaContatos(tabela: string[][]): ResultadoDaLeitura {
  const vazio = { email: -1, nome: -1, veiculo: -1, cargo: -1, telefone: -1 }
  if (!tabela.length) return { contatos: [], mapa: vazio, cabecalho: [], semEmail: 0, repetidosNoArquivo: 0 }

  let cabecalho = tabela[0]
  let dados = tabela.slice(1)
  let mapa = mapearColunas(cabecalho)

  if (mapa.email === -1) {
    const amostra = tabela.slice(0, 50)
    const largura = Math.max(...amostra.map((l) => l.length))
    let melhor = -1
    let melhorTaxa = 0
    for (let c = 0; c < largura; c++) {
      const taxa = amostra.filter((l) => extrairEmail(l[c] ?? '')).length / amostra.length
      if (taxa > melhorTaxa) { melhor = c; melhorTaxa = taxa }
    }
    if (melhor !== -1 && melhorTaxa >= 0.5) {
      const primeiraEhDado = Boolean(extrairEmail(tabela[0][melhor] ?? ''))
      if (primeiraEhDado) {
        cabecalho = tabela[0].map((_, i) => (i === melhor ? 'e-mail' : `coluna ${i + 1}`))
        dados = tabela
        mapa = { ...vazio, email: melhor }
      } else {
        mapa = { ...mapa, email: melhor }
        // A coluna que o cabeçalho chamou de outra coisa ("Contato") é a do
        // e-mail: ela deixa de valer para o outro campo.
        for (const campo of ['nome', 'veiculo', 'cargo', 'telefone'] as const) {
          if (mapa[campo] === melhor) mapa[campo] = -1
        }
      }
    }
  }

  const sobrenome = cabecalho.map(normalizar).findIndex((h) => ['last name', 'sobrenome', 'ultimo nome'].includes(h))
  const pegar = (linha: string[], i: number) => (i === -1 ? '' : (linha[i] ?? '').trim())

  const vistos = new Set<string>()
  const contatos: ContatoImportado[] = []
  let semEmail = 0
  let repetidosNoArquivo = 0
  for (const linha of dados) {
    const email = mapa.email === -1 ? null : extrairEmail(linha[mapa.email] ?? '')
    if (!email) { semEmail++; continue }
    if (vistos.has(email)) { repetidosNoArquivo++; continue }
    vistos.add(email)
    let nome = pegar(linha, mapa.nome)
    if (sobrenome !== -1 && sobrenome !== mapa.nome) nome = `${nome} ${pegar(linha, sobrenome)}`.trim()
    // Célula "Ana Lima <ana@x.org>" sem coluna de nome: o nome está ali.
    if (!nome) nome = (linha[mapa.email] ?? '').replace(/<[^>]*>/, '').replace(RE_EMAIL, '').replace(/["']/g, '').trim()
    contatos.push({
      email,
      nome,
      veiculo: pegar(linha, mapa.veiculo),
      cargo: pegar(linha, mapa.cargo),
      telefone: pegar(linha, mapa.telefone),
    })
  }
  return { contatos, mapa, cabecalho, semEmail, repetidosNoArquivo }
}

/** Etiqueta de lista: minúscula, sem acento, hífens — como as tags do banco. */
export function comoEtiqueta(texto: string): string {
  return normalizar(texto).replace(/\s+/g, '-').slice(0, 40)
}
