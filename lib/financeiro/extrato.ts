/**
 * Leitura de extrato bancário (OFX e CSV) e sugestão de conciliação.
 * Puro: sem banco nem rede — dá para conferir com tsx.
 *
 * OFX é o formato que todo banco brasileiro exporta ("Money", "OFX",
 * "Quicken"); tem identificador único por movimento (FITID). O CSV varia de
 * banco para banco: aqui se acha o cabeçalho e as colunas pelo nome (data,
 * histórico/descrição, valor ou crédito/débito), como fazem Conta Azul e Nibo.
 */

export type LinhaDoExtrato = { identificador: string; data: string; valor: number; descricao: string; documento: string | null }
export type Extrato = { formato: 'ofx' | 'csv'; linhas: LinhaDoExtrato[]; saldo: number | null; saldoEm: string | null; conta: string | null; avisos: string[] }

/** Bytes do arquivo → texto. OFX e CSV de banco costumam vir em Windows-1252. */
export function decodificar(bytes: Uint8Array): string {
  const cabeca = new TextDecoder('latin1').decode(bytes.slice(0, 400))
  if (/CHARSET:\s*(1252|ISO-?8859)/i.test(cabeca) || /ENCODING:\s*USASCII/i.test(cabeca)) return new TextDecoder('windows-1252').decode(bytes)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8.replace(/^﻿/, '')
}

const centavos = (n: number) => Math.round(n * 100) / 100

/** "1.234,56", "-1234.56", "1234,5", "(12,00)", "R$ -3,00" → número; inválido → null. */
export function lerNumero(texto: string): number | null {
  let s = String(texto ?? '').trim().replace(/[R$\s ]/g, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? centavos(negativo ? -n : n) : null
}

/** "25/09/2026", "25/09/26", "2026-09-25", "20260925" → "2026-09-25". */
export function lerData(texto: string): string | null {
  const s = String(texto ?? '').trim()
  let m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    return valida(`${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  }
  return null
}
function valida(d: string): string | null {
  const t = Date.parse(`${d}T12:00:00Z`)
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d ? null : d
}

/** Para comparar descrições: sem acento, sem números, sem pontuação. */
export function normalizarDescricao(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[0-9]+/g, ' ').replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- OFX

/** No OFX o ponto é o separador decimal (padrão); alguns bancos daqui usam vírgula. */
function numeroDoOfx(texto: string): number | null {
  const s = String(texto ?? '').trim().replace(/\s/g, '')
  const normal = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '')
  if (!/^[-+]?\d+(\.\d+)?$/.test(normal)) return null
  return centavos(Number(normal))
}

function campo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : null
}

export function lerOfx(texto: string): Extrato {
  const avisos: string[] = []
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  const linhas: LinhaDoExtrato[] = []
  for (const b of blocos) {
    const data = lerData(campo(b, 'DTPOSTED') ?? '')
    const valor = numeroDoOfx(campo(b, 'TRNAMT') ?? '')
    if (!data || valor === null || valor === 0) continue
    const fitid = campo(b, 'FITID')
    const descricao = [campo(b, 'NAME'), campo(b, 'MEMO')].filter((x, i, a) => x && a.indexOf(x) === i).join(' — ').slice(0, 300) || (campo(b, 'TRNTYPE') ?? 'Movimento')
    const documento = campo(b, 'CHECKNUM') ?? campo(b, 'REFNUM')
    linhas.push({ identificador: fitid ? `ofx:${fitid}:${data}:${valor.toFixed(2)}` : '', data, valor, descricao, documento: documento || null })
  }
  if (linhas.some((l) => !l.identificador)) avisos.push('Alguns movimentos vieram sem identificador (FITID); a repetição deles é conferida por data, valor e descrição.')
  numerarSemIdentificador(linhas, 'ofx')
  const saldoBloco = texto.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)?.[0] ?? ''
  const saldo = saldoBloco ? numeroDoOfx(campo(saldoBloco, 'BALAMT') ?? '') : null
  const saldoEm = saldoBloco ? lerData(campo(saldoBloco, 'DTASOF') ?? '') : null
  return { formato: 'ofx', linhas, saldo, saldoEm, conta: campo(texto, 'ACCTID'), avisos }
}

/** Sem identificador do banco: data+valor+descrição e a ordem entre iguais no arquivo. */
function numerarSemIdentificador(linhas: LinhaDoExtrato[], prefixo: string) {
  const vistos = new Map<string, number>()
  for (const l of linhas) {
    if (l.identificador) continue
    const chave = `${l.data}:${l.valor.toFixed(2)}:${normalizarDescricao(l.descricao)}`
    const n = (vistos.get(chave) ?? 0) + 1
    vistos.set(chave, n)
    l.identificador = `${prefixo}:${chave}:${n}`.slice(0, 300)
  }
}

// ---------------------------------------------------------------- CSV

function separarCsv(linha: string, sep: string): string[] {
  const r: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas
    } else if (c === sep && !aspas) { r.push(atual.trim()); atual = '' } else atual += c
  }
  r.push(atual.trim())
  return r
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function lerCsv(texto: string): Extrato {
  const avisos: string[] = []
  const brutas = texto.split(/\r?\n/).filter((l) => l.trim())
  const sep = [';', ',', '\t'].map((s) => ({ s, n: brutas.slice(0, 15).reduce((t, l) => t + separarCsv(l, s).length, 0) })).sort((a, b) => b.n - a.n)[0].s
  const tabela = brutas.map((l) => separarCsv(l, sep))
  const iCab = tabela.findIndex((cols) => {
    const c = cols.map(semAcento)
    return c.some((x) => x.startsWith('data')) && c.some((x) => /^(valor|credito|debito|entrada|saida|montante|quantia)/.test(x))
  })
  if (iCab < 0) return { formato: 'csv', linhas: [], saldo: null, saldoEm: null, conta: null, avisos: ['Não achei o cabeçalho com as colunas de data e valor. Exporte o extrato em OFX, se o banco oferecer.'] }
  const cab = tabela[iCab].map(semAcento)
  const achar = (re: RegExp, exceto?: RegExp) => cab.findIndex((c) => re.test(c) && !(exceto && exceto.test(c)))
  const iData = achar(/^data/)
  const iDesc = achar(/(descri|histori|lancamento|detalhe|memo|titulo|estabelecimento)/, /tipo/)
  const iValor = achar(/^(valor|montante|quantia)/, /saldo/)
  const iCredito = achar(/^(credito|entrada)/)
  const iDebito = achar(/^(debito|saida)/)
  const iTipo = achar(/(tipo|natureza|d\/c|c\/d)/)
  const iDoc = achar(/(documento|identificador|n.? ?doc|^doc)/)
  const linhas: LinhaDoExtrato[] = []
  let ignoradas = 0
  for (const cols of tabela.slice(iCab + 1)) {
    const data = lerData(cols[iData] ?? '')
    if (!data) { ignoradas++; continue }
    const descricao = (iDesc >= 0 ? cols[iDesc] : '').replace(/\s+/g, ' ').trim()
    if (/^saldo( |$)|saldo anterior|saldo do dia|s a l d o/i.test(semAcento(descricao))) continue
    let valor: number | null = null
    if (iValor >= 0) {
      valor = lerNumero(cols[iValor] ?? '')
      const tipo = iTipo >= 0 ? semAcento(cols[iTipo] ?? '') : ''
      if (valor !== null && valor > 0 && /^(d|debito|saida|s)$/.test(tipo)) valor = -valor
    } else {
      const c = iCredito >= 0 ? lerNumero(cols[iCredito] ?? '') : null
      const d = iDebito >= 0 ? lerNumero(cols[iDebito] ?? '') : null
      valor = c ? Math.abs(c) : d ? -Math.abs(d) : null
    }
    if (valor === null || valor === 0) { ignoradas++; continue }
    const documento = iDoc >= 0 ? (cols[iDoc] ?? '').trim().slice(0, 80) || null : null
    linhas.push({ identificador: '', data, valor, descricao: descricao.slice(0, 300) || '(sem descrição)', documento })
  }
  numerarSemIdentificador(linhas, 'csv')
  if (ignoradas) avisos.push(`${ignoradas} ${ignoradas === 1 ? 'linha ficou de fora' : 'linhas ficaram de fora'} por não ter data ou valor legíveis.`)
  return { formato: 'csv', linhas, saldo: null, saldoEm: null, conta: null, avisos }
}

export function lerExtrato(nome: string, texto: string): Extrato {
  const ehOfx = /\.(ofx|qfx)$/i.test(nome) || /<OFX>|OFXHEADER/i.test(texto.slice(0, 2000))
  return ehOfx ? lerOfx(texto) : lerCsv(texto)
}

// ---------------------------------------------------------------- conciliação

export type Candidato = {
  id: string; tipo: 'despesa' | 'receita' | 'transferencia'; descricao: string; valor: number; valor_pago: number | null
  conta_id: string; conta_destino_id: string | null; vencimento: string; pago_em: string | null; aprovacao: string
}

const dias = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000))

/** O lançamento combina com a linha? Mesma conta e mesmo sentido. */
export function combina(l: Candidato, linha: { valor: number }, contaId: string): boolean {
  if (l.aprovacao === 'pendente' || l.aprovacao === 'recusada') return false
  if (l.tipo === 'despesa') return linha.valor < 0 && l.conta_id === contaId
  if (l.tipo === 'receita') return linha.valor > 0 && l.conta_id === contaId
  return (linha.valor < 0 && l.conta_id === contaId) || (linha.valor > 0 && l.conta_destino_id === contaId)
}

/**
 * Os lançamentos que podem ser esta linha, do mais provável ao menos: valor
 * igual primeiro, depois a data mais próxima (a do pagamento, se já foi pago;
 * senão, o vencimento). Até `janela` dias de distância.
 */
export function candidatos<T extends Candidato>(linha: { data: string; valor: number }, contaId: string, lancamentos: T[], janela = 45): (T & { distancia: number; mesmoValor: boolean })[] {
  const alvo = Math.abs(linha.valor)
  return lancamentos
    .filter((l) => combina(l, linha, contaId))
    .map((l) => {
      const valor = l.pago_em ? (l.valor_pago ?? l.valor) : l.valor
      return { ...l, distancia: dias(l.pago_em ?? l.vencimento, linha.data), mesmoValor: Math.abs(valor - alvo) < 0.005 }
    })
    .filter((l) => l.distancia <= janela)
    .sort((a, b) => Number(b.mesmoValor) - Number(a.mesmoValor) || a.distancia - b.distancia)
}

/**
 * A sugestão automática: um único lançamento com o mesmo valor a até 5 dias
 * (pagamento ou vencimento) e que nenhuma outra linha pendente também
 * reivindica. Na dúvida, não sugere — quem concilia escolhe.
 */
export function sugestoes(linhas: { id: string; data: string; valor: number }[], contaId: string, lancamentos: Candidato[]): Map<string, string> {
  const porLinha = new Map<string, string>()
  const disputados = new Map<string, number>()
  for (const linha of linhas) {
    const bons = candidatos(linha, contaId, lancamentos, 5).filter((c) => c.mesmoValor)
    if (bons.length === 1) {
      porLinha.set(linha.id, bons[0].id)
      disputados.set(bons[0].id, (disputados.get(bons[0].id) ?? 0) + 1)
    }
  }
  for (const [linha, lanc] of porLinha) if ((disputados.get(lanc) ?? 0) > 1) porLinha.delete(linha)
  return porLinha
}
