/**
 * De que setor é um endereço do Gmail — a sugestão que a sincronização faz
 * para cada caixa nova. Puro, sem banco: dá para conferir com um script.
 *
 * Só sugere quando há UM setor claro: o e-mail cadastrado no setor, o nome
 * do setor escrito no endereço (humanitario@ → Humanitário, comunicacao@ →
 * Comunicação Social) ou uma abreviação conhecida (edusaude@, psocorros@,
 * ti@). Endereço de pessoa ou de cargo (presidente@, jorge.braz@, contato@)
 * fica sem setor: quem decide é um administrador. E a sugestão nunca ativa a
 * caixa — ativar continua sendo decisão de quem administra.
 */

export type SetorParaSugerir = { id: string; nome: string; email?: string | null }

/** "Psicologia / Serviço Social" → "psicologia servico social". */
export const chaveDoTexto = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Abreviações usadas nos endereços da filial → o nome (em chave) do setor. */
const ABREVIACOES: Record<string, string> = {
  edusaude: 'educacao e saude',
  psocorros: 'primeiros socorros',
  ti: 'tecnologia da informacao',
  comunicacao: 'comunicacao social',
  psicologia: 'psicologia servico social',
  servicosocial: 'psicologia servico social',
}

export function setorDoEndereco(email: string, setores: SetorParaSugerir[]): string | null {
  const endereco = email.trim().toLowerCase()
  const porEmail = setores.filter((s) => s.email && s.email.trim().toLowerCase() === endereco)
  if (porEmail.length === 1) return porEmail[0].id

  const local = chaveDoTexto(endereco.split('@')[0] ?? '')
  if (!local) return null
  const junto = local.replace(/ /g, '')
  const alvo = ABREVIACOES[junto]
  const candidatos = setores.filter((s) => {
    const nome = chaveDoTexto(s.nome)
    if (alvo) return nome === alvo
    // O nome inteiro do setor, ou o começo dele com uma palavra inteira (comunicacao → comunicacao social).
    return nome === local || nome.replace(/ /g, '') === junto || (local.length >= 5 && nome.startsWith(`${local} `))
  })
  return candidatos.length === 1 ? candidatos[0].id : null
}

/** Endereços de cargo, que não têm o nome do setor. */
const CARGOS: Record<string, string> = { presidente: 'Presidência', presidencia: 'Presidência', vicepresidente: 'Vice-Presidência', vicepresidencia: 'Vice-Presidência', contato: 'Contato' }

/**
 * O nome de remetente sugerido: "CVB-RJ · <setor>". Endereço de pessoa
 * (nome.sobrenome) vira "Nome Sobrenome · CVB-RJ"; de cargo, o cargo.
 */
export function nomeSugerido(email: string, setor: string | null | undefined): string {
  const local = (email.split('@')[0] ?? '').toLowerCase()
  if (CARGOS[local]) return `CVB-RJ · ${CARGOS[local]}`
  if (/^[a-z]+(\.[a-z]+)+$/.test(local)) {
    return `${local.split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')} · CVB-RJ`
  }
  if (setor?.trim()) return `CVB-RJ · ${setor.trim().replace(/\s*\/\s*/g, ' e ')}`
  return `CVB-RJ · ${local.charAt(0).toUpperCase()}${local.slice(1)}`
}
