/**
 * Contas da área do membro. Puro, para dar para testar.
 */

import { situacaoDaFormacao } from '@/lib/participantes/regras'

export type ResumoDeHoras = { total: number; noAno: number; noMes: number; acoesNoAno: number }

export function resumoDeHoras(atividades: { data: string; horas: number }[], hoje: string): ResumoDeHoras {
  const ano = hoje.slice(0, 4)
  const mes = hoje.slice(0, 7)
  const soma = (l: { horas: number }[]) => Math.round(l.reduce((s, a) => s + a.horas, 0) * 100) / 100
  const doAno = atividades.filter((a) => a.data.startsWith(ano))
  return { total: soma(atividades), noAno: soma(doAno), noMes: soma(atividades.filter((a) => a.data.startsWith(mes))), acoesNoAno: doAno.length }
}

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois (hora de São Paulo). */
export function saudacao(hora: number): string {
  return hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

export const horasLegiveis = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`

/** Mês e ano por extenso: "setembro de 2026". */
export const mesEAno = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })

/**
 * Iniciais para o avatar: a primeira letra do primeiro e do último nome
 * ("Maria da Silva" → "MS"). O último, e não o segundo, para não sair "MD".
 */
export function iniciais(nome: string | null | undefined): string {
  const letras = (nome ?? '').trim().split(/\s+/).map((p) => p.match(/[\p{L}\p{N}]/u)?.[0]).filter((l): l is string => !!l)
  if (!letras.length) return '?'
  return (letras.length === 1 ? letras[0] : letras[0] + letras[letras.length - 1]).toLocaleUpperCase('pt-BR')
}

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * "29/10/2026" (ou "29/10" com `{ ano: false }`). Data pura (AAAA-MM-DD) é
 * lida ao meio-dia UTC, para não virar o dia anterior no fuso de São Paulo;
 * instante (timestamptz) é lido no fuso de São Paulo. Inválida → ''.
 */
export function dataCurta(d: string | null | undefined, { ano = true }: { ano?: boolean } = {}): string {
  if (!d) return ''
  const soData = SO_DATA.test(d)
  const instante = new Date(soData ? `${d}T12:00:00Z` : d)
  if (Number.isNaN(instante.getTime())) return ''
  return instante.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(ano ? { year: 'numeric' as const } : {}), timeZone: soData ? 'UTC' : 'America/Sao_Paulo' })
}

/** Dias corridos de uma data pura até outra (negativo se `ate` já passou). */
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000)

export type TomDaValidade = 'sucesso' | 'aviso' | 'perigo'

/**
 * O texto do selo de validade de um certificado ou formação. Usa a mesma
 * regra do cadastro (`situacaoDaFormacao`, 60 dias para "vence logo"), para o
 * Início e Certificados nunca mais discordarem. Sem validade → null.
 */
export function validadeLegivel(validoAte: string | null | undefined, hoje: string): { tom: TomDaValidade; texto: string } | null {
  if (!validoAte || !SO_DATA.test(validoAte.slice(0, 10)) || !SO_DATA.test(hoje)) return null
  const ate = validoAte.slice(0, 10)
  const s = situacaoDaFormacao(ate, hoje)
  if (s === 'vencida') return { tom: 'perigo', texto: `Venceu em ${dataCurta(ate)}` }
  if (s === 'vence_logo') {
    const dias = diasEntre(hoje, ate)
    return { tom: 'aviso', texto: dias <= 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias` }
  }
  if (s === 'valida') return { tom: 'sucesso', texto: `Vale até ${dataCurta(ate)}` }
  return null
}

/**
 * `caminho` é `prefixo` ou fica abaixo dele. Compara por segmento: "/membro/cursos"
 * não acende em "/membro/cursos-antigos".
 */
export const dentroDe = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(`${prefixo}/`)

const ORIGEM_FICTICIA = 'https://membro.invalid'

/**
 * Para onde voltar depois de entrar (`?voltar=`). Só aceita caminhos da área
 * do membro (`/membro` e abaixo), já normalizados — `..`, `%2e%2e`, barra
 * invertida e `//outro-site` são resolvidos pelo próprio parser de URL e
 * recusados se saírem de `/membro`. Nunca devolve a própria entrada (daria
 * volta infinita). Recusou → null; quem chama usa `/membro`. Aceita direto o
 * que vier de `searchParams` (string ou lista) ou de `formData.get()`.
 */
export function voltarSeguro(v: unknown): string | null {
  const bruto = Array.isArray(v) ? v[0] : v
  if (typeof bruto !== 'string' || !bruto.startsWith('/') || bruto.length > 512) return null
  // Caractere de controle ou espaço num caminho interno é tentativa de truque.
  if (/[\u0000-\u001f\u007f\s\\]/.test(bruto)) return null
  let url: URL
  try {
    url = new URL(bruto, ORIGEM_FICTICIA)
  } catch {
    return null
  }
  if (url.origin !== ORIGEM_FICTICIA) return null
  if (!dentroDe(url.pathname, '/membro') || dentroDe(url.pathname, '/membro/entrar')) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * O endereço da entrada, levando junto para onde voltar. O início (`/membro`)
 * não vai no `?voltar=`: é o destino padrão, e a entrada mostra "sua sessão
 * terminou" só quando há `?voltar=` — quem chega pelo e-mail de boas-vindas
 * não deve ver esse recado.
 */
export function urlDaEntrada(voltar?: string | null): string {
  const destino = voltarSeguro(voltar)
  return destino && destino !== '/membro' ? `/membro/entrar?voltar=${encodeURIComponent(destino)}` : '/membro/entrar'
}

/** Os campos do cadastro que o próprio voluntário preenche e que contam como "completo". */
export type CamposDoCadastro = {
  telefone: string | null; cep: string | null; logradouro: string | null; cidade: string | null; uf: string | null
  emergencia_nome: string | null; emergencia_telefone: string | null; disponibilidade: string[]
}

export type PendenciaDoPerfil = { chave: 'telefone' | 'endereco' | 'emergencia' | 'disponibilidade'; rotulo: string; href: string }

const preenchido = (s: string | null | undefined) => !!s && s.trim().length > 0

/**
 * O que falta no cadastro, na ordem em que aparece no Perfil, e o percentual
 * completo (4 blocos, 25% cada). Cada pendência leva a um campo de verdade
 * (`#m-telefone`, `#m-cep`, `#m-emerg-nome` e `#m-disponibilidade`, o primeiro
 * chip), para o navegador rolar e pôr o foco nele. Só o hash: a lista só
 * aparece no próprio Perfil, e um link só de hash é navegação de fragmento
 * mesmo com `?` no endereço.
 */
export function pendenciasDoPerfil(p: CamposDoCadastro): { pct: number; faltam: PendenciaDoPerfil[] } {
  const blocos: (PendenciaDoPerfil & { ok: boolean })[] = [
    { chave: 'telefone', rotulo: 'Telefone ou WhatsApp', href: '#m-telefone', ok: preenchido(p.telefone) },
    { chave: 'endereco', rotulo: 'Endereço', href: '#m-cep', ok: [p.cep, p.logradouro, p.cidade, p.uf].every(preenchido) },
    { chave: 'emergencia', rotulo: 'Contato de emergência', href: '#m-emerg-nome', ok: preenchido(p.emergencia_nome) && preenchido(p.emergencia_telefone) },
    { chave: 'disponibilidade', rotulo: 'Quando você pode atuar', href: '#m-disponibilidade', ok: (p.disponibilidade ?? []).some(preenchido) },
  ]
  const faltam = blocos.filter((b) => !b.ok).map(({ chave, rotulo, href }) => ({ chave, rotulo, href }))
  return { pct: Math.round((100 * (blocos.length - faltam.length)) / blocos.length), faltam }
}
