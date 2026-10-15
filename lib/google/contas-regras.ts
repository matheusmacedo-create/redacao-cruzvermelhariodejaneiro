/**
 * O que é puro na criação de contas do Google pelo link: o e-mail sugerido
 * a partir do nome, as validações do formulário e o celular em E.164.
 * Conferido por script avulso (sem suíte de testes); nada daqui toca em
 * banco ou rede, e o navegador usa a sugestão enquanto a pessoa digita.
 */

export const DOMINIO_DAS_CONTAS = 'cruzvermelhariodejaneiro.org'

/** O que o Google aceita na parte local, e o que a filial usa: letras, números e ponto. */
export const USUARIO_GOOGLE_VALIDO = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/

/** Dias que o link vale por padrão, e o teto. */
export const VALIDADE_PADRAO_DIAS = 7
export const VALIDADE_MAXIMA_DIAS = 30

/** Contas que um mesmo IP cria por hora: cobre uma sala com várias pessoas no mesmo wi-fi, barra um robô. */
export const CONTAS_POR_IP_POR_HORA = 6

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "Maria da Silva" → "maria.silva"; "Ana" → "ana". Partículas (da, de, do, dos, das, e) saem. */
export function usuarioSugeridoDoGoogle(nome: string): string {
  const partes = semAcento(nome).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter((p) => !['da', 'de', 'do', 'dos', 'das', 'e'].includes(p))
  if (!partes.length) return ''
  const base = partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`
  return base.slice(0, 40)
}

/** Nome e sobrenome como o Google pede (givenName e familyName, os dois obrigatórios). */
export function separarNome(nome: string): { primeiro: string; resto: string } | { erro: string } {
  const limpo = nome.replace(/\s+/g, ' ').trim()
  if (limpo.length < 3 || limpo.length > 120) return { erro: 'Escreva o nome completo (3 a 120 caracteres).' }
  const partes = limpo.split(' ')
  if (partes.length < 2) return { erro: 'Escreva nome e sobrenome: o Google exige os dois.' }
  return { primeiro: partes[0], resto: partes.slice(1).join(' ') }
}

export function problemaDoUsuario(usuario: string): string | null {
  const u = usuario.trim().toLowerCase()
  if (u.length < 3 || u.length > 40) return 'O e-mail precisa ter de 3 a 40 caracteres antes do @.'
  if (!USUARIO_GOOGLE_VALIDO.test(u)) return 'Antes do @, só letras minúsculas, números e ponto (sem acento, espaço ou ponto no início ou no fim).'
  return null
}

/** Celular brasileiro em E.164 (+55DDDnúmero), ou vazio; qualquer outra coisa é erro. */
export function celularEmE164(bruto: string): string | { erro: string } {
  const d = bruto.replace(/\D/g, '')
  if (!d) return ''
  const semPais = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (!/^[1-9][0-9]9?[0-9]{8}$/.test(semPais) || semPais.length < 10 || semPais.length > 11) return { erro: 'Celular: DDD e número, como (21) 99999-9999.' }
  return `+55${semPais}`
}

/** O e-mail pessoal é obrigatório: é para onde vão o endereço novo, a senha provisória e o passo a passo. */
export function problemaDoEmailPessoal(email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!e) return 'Informe um e-mail pessoal: é nele que chegam o endereço novo, a senha provisória e o passo a passo.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'E-mail pessoal inválido.'
  if (e.endsWith(`@${DOMINIO_DAS_CONTAS}`)) return 'O e-mail de recuperação precisa ser de fora da Cruz Vermelha (Gmail, Outlook…), para valer quando a conta nova estiver trancada.'
  return null
}

/** O convite ainda serve? Devolve o motivo quando não. */
export function problemaDoConvite(c: { expiraEm: string; usos: number; maxUsos: number; revogadoEm: string | null }, agora = Date.now()): string | null {
  if (c.revogadoEm) return 'Este link foi cancelado. Peça um novo a quem o mandou.'
  if (new Date(c.expiraEm).getTime() <= agora) return 'Este link venceu. Peça um novo a quem o mandou.'
  if (c.usos >= c.maxUsos) return 'Este link já foi usado o máximo de vezes. Peça um novo a quem o mandou.'
  return null
}

/** Dias de validade pedidos na tela → data de vencimento. */
export function vencimentoDoConvite(dias: number, agora = Date.now()): Date | { erro: string } {
  if (!Number.isInteger(dias) || dias < 1 || dias > VALIDADE_MAXIMA_DIAS) return { erro: `Validade: de 1 a ${VALIDADE_MAXIMA_DIAS} dias.` }
  return new Date(agora + dias * 24 * 60 * 60 * 1000)
}
