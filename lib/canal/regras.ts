/**
 * Canal direto e mural da Área do Voluntário. Puro.
 */

export const CATEGORIAS_DA_CONVERSA = {
  duvida: 'Dúvida',
  disponibilidade: 'Disponibilidade',
  documentos: 'Documentos e certificados',
  sugestao: 'Sugestão',
  outro: 'Outro assunto',
} as const
export type CategoriaDaConversa = keyof typeof CATEGORIAS_DA_CONVERSA

export const SITUACOES_DA_CONVERSA = { aberta: 'Aguardando resposta', respondida: 'Respondida', encerrada: 'Encerrada' } as const

type Conversa = { situacao: string; lida_pelo_membro_em: string | null; lida_pela_equipe_em: string | null }

/** Resposta da equipe que o voluntário ainda não abriu. */
export const novaParaOMembro = (c: Conversa) => c.situacao === 'respondida' && !c.lida_pelo_membro_em
/** Mensagem do voluntário que ninguém da equipe abriu. */
export const novaParaAEquipe = (c: Conversa) => c.situacao === 'aberta' && !c.lida_pela_equipe_em

export const avisoAtivo = (a: { expira_em: string | null }, hoje: string) => !a.expira_em || a.expira_em >= hoje

/** Fixados primeiro, depois os mais novos. */
export function ordenarAvisos<A extends { fixado: boolean; created_at: string }>(lista: A[]): A[] {
  return [...lista].sort((a, b) => Number(b.fixado) - Number(a.fixado) || b.created_at.localeCompare(a.created_at))
}

/** "agora", "há 5 min", "há 3 h", "ontem", "12/09". */
export function haQuanto(iso: string, agora: Date): string {
  const s = (agora.getTime() - Date.parse(iso)) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  if (s < 2 * 86400) return 'ontem'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function lerMensagem(f: FormData, comAssunto: boolean): { assunto: string; categoria: CategoriaDaConversa; texto: string; erros: string[] } {
  const assunto = String(f.get('assunto') ?? '').trim().slice(0, 160)
  const categoria = String(f.get('categoria') ?? 'duvida')
  const texto = String(f.get('texto') ?? '').trim().slice(0, 4000)
  const erros: string[] = []
  if (comAssunto && assunto.length < 3) erros.push('Escreva o assunto.')
  if (!texto) erros.push('Escreva a mensagem.')
  return { assunto, categoria: (Object.hasOwn(CATEGORIAS_DA_CONVERSA, categoria) ? categoria : 'outro') as CategoriaDaConversa, texto, erros }
}
