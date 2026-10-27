import { DISPONIBILIDADES, UFS } from '@/lib/participantes/regras'

/**
 * Regras puras da importação das fichas de voluntariado do site (27/10/2026). A ficha chega da API do site
 * (/matricula-cursos-presenciais/api/redacao-voluntarios.php, mcp_redacao_ficha) e vira os campos que
 * private.aplicar_campos_participante entende. Conferido com `npx tsx scripts/conferir-fichas-do-site.ts`.
 */

/** Uma ficha como a API do site devolve. */
export type FichaDoSite = {
  id: number
  protocolo: string
  situacao: 'nova' | 'em_analise' | 'entrevista' | 'aceita' | 'recusada' | 'arquivada' | string
  criado_em: string | null
  nome: string
  data_nascimento: string
  email: string
  telefone: string
  cpf: string | null
  cidade: string
  bairro: string
  estado: string
  escolaridade: string
  profissao: string
  formacao_saude: string
  experiencia: string
  habilidades: string
  frentes: string[]
  dias: string[]
  periodos: string[]
  motivacao: string
  como_conheceu: string
  aceita_contato: boolean
  consentimento_em: string | null
  politica_versao: string
  selfie: string | null
  codigo_aprovacao: string | null
}

/** Só as fichas ainda em aberto no site viram inscrição pendente; aceitas, recusadas e arquivadas já foram decididas lá. */
export const SITUACOES_IMPORTADAS = ['nova', 'em_analise', 'entrevista'] as const
export const deveImportar = (f: Pick<FichaDoSite, 'situacao'>) => (SITUACOES_IMPORTADAS as readonly string[]).includes(f.situacao)

/** A versão do termo que a pessoa aceitou no site, no campo consentimento_versao (até 40 caracteres). */
export const versaoDoTermo = (f: Pick<FichaDoSite, 'politica_versao'>) => `site:privacidade ${f.politica_versao || 'sem-versao'}`.slice(0, 40)

/** (21) 99999-8888 a partir dos dígitos; outro tamanho volta como veio. */
export function telefoneFormatado(bruto: string): string {
  const d = (bruto ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return bruto ?? ''
}

const DIAS_UTEIS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

/**
 * Dias e períodos do site ("Segunda", "Sábado" · "Manhã", "Noite") nas opções fixas da Redação: período em dia
 * útil vira "Manhãs/Tardes/Noites em dias úteis"; sábado e domingo, as opções próprias.
 */
export function disponibilidadeDaFicha(dias: string[], periodos: string[]): string[] {
  const saida = new Set<string>()
  if (dias.some((d) => DIAS_UTEIS.includes(d))) {
    if (periodos.includes('Manhã')) saida.add('Manhãs em dias úteis')
    if (periodos.includes('Tarde')) saida.add('Tardes em dias úteis')
    if (periodos.includes('Noite')) saida.add('Noites em dias úteis')
  }
  if (dias.includes('Sábado')) saida.add('Sábados')
  if (dias.includes('Domingo')) saida.add('Domingos e feriados')
  return DISPONIBILIDADES.filter((d) => saida.has(d))
}

/** O texto que não tem campo próprio na Redação vai para as observações, com o protocolo na frente. */
export function observacoesDaFicha(f: FichaDoSite): string {
  const linhas = [
    `Ficha do site ${f.protocolo}${f.criado_em ? `, enviada em ${new Date(f.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}.`,
    f.frentes.length ? `Frentes de interesse: ${f.frentes.join(', ')}.` : '',
    f.dias.length || f.periodos.length ? `Disponibilidade informada: ${[f.dias.join(', '), f.periodos.join(', ')].filter(Boolean).join(' · ')}.` : '',
    f.escolaridade ? `Escolaridade: ${f.escolaridade}.` : '',
    f.profissao ? `Profissão: ${f.profissao}.` : '',
    f.formacao_saude ? `Formação na área da saúde: ${f.formacao_saude === 'sim' ? 'sim' : f.formacao_saude}.` : '',
    f.como_conheceu ? `Como conheceu: ${f.como_conheceu}.` : '',
    `Aceita contato por e-mail e telefone: ${f.aceita_contato ? 'sim' : 'não'}.`,
    f.motivacao ? `\nMotivação:\n${f.motivacao}` : '',
    f.experiencia ? `\nExperiência com voluntariado:\n${f.experiencia}` : '',
    f.habilidades ? `\nHabilidades:\n${f.habilidades}` : '',
  ].filter(Boolean)
  return linhas.join('\n').slice(0, 4000)
}

const cpfValido = (cpf: string) => {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/**
 * Os campos para importar_ficha_do_site (o mesmo jsonb que aplicar_campos_participante lê). Fica de fora o que a
 * Redação não tem como guardar igual (saúde no site é formação profissional, não condição de saúde): vai nas
 * observações. CPF só entra se for válido; UF só se for uma das 27.
 */
export function camposDaFicha(f: FichaDoSite): Record<string, unknown> {
  const campos: Record<string, unknown> = {
    nome: f.nome.trim().slice(0, 200),
    email: f.email.trim().toLowerCase(),
    telefone: telefoneFormatado(f.telefone),
    cidade: f.cidade,
    bairro: f.bairro,
    habilidades: f.frentes.map((x) => x.slice(0, 80)),
    disponibilidade: disponibilidadeDaFicha(f.dias, f.periodos),
    observacoes: observacoesDaFicha(f),
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.data_nascimento)) campos.data_nascimento = f.data_nascimento
  if ((UFS as readonly string[]).includes(f.estado)) campos.uf = f.estado
  if (f.cpf && cpfValido(f.cpf)) campos.cpf = f.cpf.replace(/\D/g, '')
  return campos
}

/** Link do WhatsApp com a mensagem do código de aprovação para o telefone da pessoa (Brasil, só dígitos). */
export function linkDoWhatsapp(telefone: string | null, mensagem: string): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(mensagem)}`
}

/** A mensagem que a coordenação manda com o código (mesmo texto do portal do site). */
export function mensagemDoCodigo(nome: string, codigo: string, url: string): string {
  const primeiro = (nome.trim().split(/\s+/)[0] ?? '').replace(/^./, (c) => c.toUpperCase())
  const formatado = `${codigo.slice(0, 4)}-${codigo.slice(4)}`
  return `Olá, ${primeiro}! Aqui é a coordenação do voluntariado da Cruz Vermelha Brasileira Rio de Janeiro. Sua ficha foi aprovada. Seu código de aprovação é ${formatado}. Qualquer pessoa pode conferir em ${url} . Guarde este código: ele mostra que você foi aprovado(a) para seguir para o CBFI e o termo de adesão.`
}

/** O endereço de conferência do código no site. */
export const urlDeConferencia = (codigo: string) => `https://cruzvermelhariodejaneiro.org/conferir/?c=${encodeURIComponent(codigo)}`
