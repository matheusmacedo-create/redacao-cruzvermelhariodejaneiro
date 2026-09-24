/**
 * Política de senha — a mesma regra para a instalação, para a senha que o
 * administrador define e para a que a própria pessoa troca.
 *
 * Módulo puro: a tela usa para avisar enquanto se digita, a action usa para
 * recusar de verdade. O login continua aceitando senha antiga de 8 caracteres
 * (quem já tem conta não fica trancado); a regra vale para toda senha NOVA.
 */

export const SENHA_MINIMO = 10
// O bcrypt do Supabase Auth só olha os primeiros 72 bytes: o que passar disso
// é ignorado em silêncio, e a pessoa acharia que tem uma senha que não tem.
export const SENHA_MAXIMO = 72

// As que aparecem primeiro em qualquer lista de vazamento, e as óbvias daqui.
const PROIBIDAS = new Set([
  '1234567890', '12345678910', '0123456789', 'qwertyuiop', 'senha12345', 'senha123456',
  'password123', 'abcdefghij', 'abc1234567', '1q2w3e4r5t', 'cruzvermelha', 'cruzvermelha1',
  'cruzvermelha123', 'cvrj123456', 'redacao123', 'redacao2026', 'mudar12345', 'trocar12345',
])

/** Devolve o motivo da recusa, ou null se a senha serve. */
export function problemaDaSenha(senha: string, contexto: { usuario?: string; nome?: string } = {}): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa de pelo menos ${SENHA_MINIMO} caracteres.`
  if (new TextEncoder().encode(senha).length > SENHA_MAXIMO) return `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`
  if (!/[a-zA-ZÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) return 'Use letras e números na senha.'
  if (/^(.)\1+$/.test(senha)) return 'A senha não pode ser um caractere repetido.'
  const minuscula = senha.toLowerCase()
  if (PROIBIDAS.has(minuscula)) return 'Essa senha é comum demais. Escolha outra.'
  const usuario = contexto.usuario?.toLowerCase().trim()
  if (usuario && usuario.length >= 3 && minuscula.includes(usuario)) return 'A senha não pode conter o nome de usuário.'
  for (const parte of (contexto.nome ?? '').toLowerCase().split(/\s+/)) {
    if (parte.length >= 4 && minuscula.includes(parte)) return 'A senha não pode conter o seu nome.'
  }
  return null
}

// Sem 0/O, 1/l/I: a senha temporária vai ser ditada ou copiada à mão.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Senha temporária forte, gerada no servidor com o gerador criptográfico.
 * Três blocos de quatro ("Xk7p-2mQa-9dRt"): fácil de ler em voz alta e com
 * ~70 bits de entropia. Sempre tem letra e número, então passa na política.
 */
export function gerarSenhaTemporaria(): string {
  for (;;) {
    const bytes = new Uint32Array(12)
    crypto.getRandomValues(bytes)
    const chars = [...bytes].map((b) => ALFABETO[b % ALFABETO.length])
    const senha = [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((c) => c.join('')).join('-')
    if (/[a-zA-Z]/.test(senha) && /[0-9]/.test(senha)) return senha
  }
}
