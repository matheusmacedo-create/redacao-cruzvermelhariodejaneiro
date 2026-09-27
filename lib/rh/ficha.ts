/**
 * A ficha que a própria pessoa completa pelo link (equipe_convites) — as
 * regras, sem banco. O servidor fica em lib/rh/convites.ts; a página pública,
 * em app/ficha/[token].
 *
 * O link cobre os dados pessoais e, se o RH liberar, os documentos. Nunca
 * cargo, vínculo, salário ou banco: conta bancária por link abriria a porta
 * para desviar o pagamento de alguém.
 */

export const CAMPOS_DA_FICHA = [
  { campo: 'telefone_pessoal', rotulo: 'Telefone pessoal', tipo: 'tel', max: 40 },
  { campo: 'email_pessoal', rotulo: 'E-mail pessoal', tipo: 'email', max: 254 },
  { campo: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date', max: 10 },
  { campo: 'cep', rotulo: 'CEP', tipo: 'text', max: 9 },
  { campo: 'logradouro', rotulo: 'Rua / avenida', tipo: 'text', max: 200 },
  { campo: 'numero', rotulo: 'Número', tipo: 'text', max: 20 },
  { campo: 'complemento', rotulo: 'Complemento', tipo: 'text', max: 100 },
  { campo: 'bairro', rotulo: 'Bairro', tipo: 'text', max: 100 },
  { campo: 'cidade', rotulo: 'Cidade', tipo: 'text', max: 100 },
  { campo: 'uf', rotulo: 'UF', tipo: 'text', max: 2 },
  { campo: 'emergencia_nome', rotulo: 'Contato de emergência: nome', tipo: 'text', max: 120 },
  { campo: 'emergencia_parentesco', rotulo: 'Contato de emergência: parentesco', tipo: 'text', max: 60 },
  { campo: 'emergencia_telefone', rotulo: 'Contato de emergência: telefone', tipo: 'tel', max: 40 },
] as const

export type CampoDaFicha = (typeof CAMPOS_DA_FICHA)[number]['campo']

/** O que conta como "ficha completa" (complemento é opcional). */
const ESSENCIAIS: CampoDaFicha[] = ['telefone_pessoal', 'email_pessoal', 'data_nascimento', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'emergencia_nome', 'emergencia_telefone']

/** Os rótulos do que falta na ficha. */
export function faltasDaFicha(pessoais: Partial<Record<CampoDaFicha, string | null>> | null, p: { temDocumentos: boolean; pedeDocumentos: boolean }): string[] {
  const faltam: string[] = ESSENCIAIS.filter((c) => !String(pessoais?.[c] ?? '').trim()).map((c) => CAMPOS_DA_FICHA.find((x) => x.campo === c)!.rotulo)
  if (p.pedeDocumentos && !p.temDocumentos) faltam.push('Documentos')
  return faltam
}

/**
 * O que a página manda ao banco: só campos conhecidos, aparados e com o
 * tamanho de cada um; vazio fica de fora (o banco não apaga o que já existe).
 */
export function lerFicha(entrada: Record<string, unknown>, documentos: readonly string[]): Record<string, unknown> {
  const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
  const saida: Record<string, unknown> = {}
  for (const c of CAMPOS_DA_FICHA) {
    const v = texto(entrada[c.campo], c.max)
    if (v) saida[c.campo] = c.campo === 'uf' ? v.toUpperCase() : v
  }
  const docs: Record<string, string> = {}
  for (const d of documentos) {
    const v = texto(entrada[`doc_${d}`], 60)
    if (v) docs[d] = v
  }
  if (Object.keys(docs).length) saida.documentos = docs
  return saida
}

export const DIAS_DO_CONVITE = 7
/** Lembrete a cada tantos dias, no máximo tantos (cada um troca o link). */
export const DIAS_ENTRE_LEMBRETES = 2
export const LEMBRETES_NO_MAXIMO = 2

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

export function textoDoConviteDaFicha(p: { nome: string; url: string; documentos: boolean; lembrete?: boolean }): string {
  return [
    p.lembrete ? `${primeiro(p.nome) ? `${primeiro(p.nome)}, f` : 'F'}alta completar a sua ficha na Cruz Vermelha RJ.` : `Olá${primeiro(p.nome) ? `, ${primeiro(p.nome)}` : ''}! O RH da Cruz Vermelha RJ pede que você complete a sua ficha.`,
    `Leva poucos minutos: dados pessoais, endereço e contato de emergência${p.documentos ? ', e os números dos seus documentos' : ''}.`,
    `Seu link (pessoal, vale uma vez e por ${DIAS_DO_CONVITE} dias): ${p.url}`,
    '_Não repasse este link. A Cruz Vermelha nunca pede senha nem dados de banco por link._',
  ].join('\n\n')
}
