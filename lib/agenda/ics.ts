/**
 * O arquivo iCalendar (RFC 5545) do link de assinatura da Agenda: o Google
 * Agenda, o Outlook e o calendário do celular assinam e atualizam sozinhos.
 * Módulo puro.
 *
 * Dia inteiro vai como VALUE=DATE (DTEND exclusivo); com hora, em UTC —
 * Brasília é UTC-3 o ano todo desde 2019 (sem horário de verão).
 */

import { CAMADAS, type ItemDaAgenda } from './camadas'
import { somarDias } from './datas'

const DURACAO_PADRAO_MIN = 60

/** Escapa texto de propriedade (RFC 5545 §3.3.11). */
export function escaparTexto(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Dobra linhas em 75 octetos, sem partir caractere UTF-8 (RFC 5545 §3.1). */
export function dobrarLinha(linha: string): string {
  const cod = new TextEncoder()
  if (cod.encode(linha).length <= 75) return linha
  const partes: string[] = []
  let atual = ''
  let bytes = 0
  let limite = 75
  for (const ch of linha) {
    const b = cod.encode(ch).length
    if (bytes + b > limite) {
      partes.push(atual)
      atual = ''
      bytes = 0
      limite = 74 // a continuação começa com um espaço
    }
    atual += ch
    bytes += b
  }
  partes.push(atual)
  return partes.join('\r\n ')
}

const soDigitos = (dia: string) => dia.replaceAll('-', '')

/** 'AAAA-MM-DD' + 'HH:MM' de Brasília → 'AAAAMMDDTHHMMSSZ'. */
export function brasiliaParaUtc(dia: string, hora: string, somarMin = 0): string {
  const [a, m, d] = dia.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d, h + 3, mi + somarMin))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00Z`
}

function carimbo(instante: Date): string {
  return instante.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export type OpcoesDoIcs = { nome: string; baseUrl: string; agora?: Date }

export function gerarIcs(itens: ItemDaAgenda[], { nome, baseUrl, agora = new Date() }: OpcoesDoIcs): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cruz Vermelha RJ//Palácio Virtual//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(nome)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]
  const stamp = carimbo(agora)
  for (const i of itens) {
    const categoria = CAMADAS[i.camada].nome
    linhas.push('BEGIN:VEVENT', `UID:${i.id.replace(/[^\w.-]/g, '-')}@palaciovirtual`, `DTSTAMP:${stamp}`)
    if (i.hora) {
      linhas.push(`DTSTART:${brasiliaParaUtc(i.dia, i.hora)}`, `DTEND:${brasiliaParaUtc(i.dia, i.hora, DURACAO_PADRAO_MIN)}`)
    } else {
      linhas.push(`DTSTART;VALUE=DATE:${soDigitos(i.dia)}`, `DTEND;VALUE=DATE:${soDigitos(somarDias(i.ate ?? i.dia, 1))}`, 'TRANSP:TRANSPARENT')
    }
    linhas.push(`SUMMARY:${escaparTexto(i.titulo)}`, `CATEGORIES:${escaparTexto(categoria)}`)
    const descricao = [i.detalhe, i.canal ? `Canal: ${i.canal}` : null].filter(Boolean).join('\n')
    if (descricao) linhas.push(`DESCRIPTION:${escaparTexto(descricao)}`)
    if (i.href) linhas.push(`URL:${baseUrl.replace(/\/$/, '')}${i.href}`)
    linhas.push('END:VEVENT')
  }
  linhas.push('END:VCALENDAR')
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n'
}
