/**
 * O perfil social de cada pessoa: apresentação, habilidades, contatos com
 * visibilidade e a leitura das métricas. Puro — dá para conferir com tsx.
 *
 * Contato é dado pessoal. Cada um escolhe quem vê cada contato, e quem
 * decide o que sai para quem lê é visiveisPara(), no servidor, antes de a
 * página ser montada: o que não pode ser visto nem chega ao navegador.
 */

export const CAPAS = {
  vermelho: { rotulo: 'Vermelho', classe: 'from-[#cc0000] via-[#a30000] to-[#5c0000]' },
  grafite: { rotulo: 'Grafite', classe: 'from-slate-700 via-slate-800 to-slate-950' },
  azul: { rotulo: 'Azul', classe: 'from-sky-600 via-blue-700 to-indigo-900' },
  verde: { rotulo: 'Verde', classe: 'from-emerald-600 via-teal-700 to-emerald-950' },
  ambar: { rotulo: 'Âmbar', classe: 'from-amber-500 via-orange-600 to-red-800' },
  roxo: { rotulo: 'Roxo', classe: 'from-violet-600 via-purple-700 to-fuchsia-900' },
} as const
export type Capa = keyof typeof CAPAS
export const ehCapa = (v: unknown): v is Capa => typeof v === 'string' && v in CAPAS

export const TIPOS_DE_CONTATO = {
  institucional: 'Contatos institucionais',
  pessoal: 'Contatos pessoais',
} as const
export type TipoDeContato = keyof typeof TIPOS_DE_CONTATO

export const CANAIS = {
  email: { rotulo: 'E-mail', exemplo: 'nome@cruzvermelhariodejaneiro.org' },
  telefone: { rotulo: 'Telefone', exemplo: '(21) 2222-3333' },
  whatsapp: { rotulo: 'WhatsApp', exemplo: '(21) 99999-8888' },
  ramal: { rotulo: 'Ramal', exemplo: '215' },
  instagram: { rotulo: 'Instagram', exemplo: '@seuperfil' },
  linkedin: { rotulo: 'LinkedIn', exemplo: 'linkedin.com/in/seu-nome' },
  site: { rotulo: 'Site', exemplo: 'https://…' },
  outro: { rotulo: 'Outro', exemplo: 'Sala 3, 2º andar' },
} as const
export type Canal = keyof typeof CANAIS

export const VISIBILIDADES = {
  equipe: { rotulo: 'Toda a equipe', ajuda: 'Qualquer pessoa com acesso à Redação.' },
  setor: { rotulo: 'Só o meu setor', ajuda: 'Quem é do mesmo setor que você (e administradores).' },
  admins: { rotulo: 'Só administradores', ajuda: 'Só quem administra a Redação.' },
} as const
export type Visibilidade = keyof typeof VISIBILIDADES

export type Contato = { tipo: TipoDeContato; canal: Canal; valor: string; rotulo: string; visibilidade: Visibilidade }

export const LIMITES = { bio: 600, pronomes: 30, disponibilidade: 160, habilidades: 15, habilidade: 40, contatos: 20, valor: 200, rotulo: 40 }

const ehTipo = (v: unknown): v is TipoDeContato => typeof v === 'string' && v in TIPOS_DE_CONTATO
const ehCanal = (v: unknown): v is Canal => typeof v === 'string' && v in CANAIS
const ehVisibilidade = (v: unknown): v is Visibilidade => typeof v === 'string' && v in VISIBILIDADES

const limpo = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Confere e normaliza um contato digitado. Devolve o motivo em português
 * quando não serve — a tela mostra ao lado do campo.
 */
export function normalizarContato(entrada: Partial<Record<keyof Contato, unknown>>): { contato?: Contato; erro?: string } {
  const tipo = ehTipo(entrada.tipo) ? entrada.tipo : null
  const canal = ehCanal(entrada.canal) ? entrada.canal : null
  if (!tipo || !canal) return { erro: 'Escolha o tipo e o canal do contato.' }
  const visibilidade = ehVisibilidade(entrada.visibilidade) ? entrada.visibilidade : (tipo === 'pessoal' ? 'admins' : 'equipe')
  const rotulo = limpo(entrada.rotulo, LIMITES.rotulo)
  let valor = limpo(entrada.valor, LIMITES.valor)
  if (!valor) return { erro: `Preencha o ${CANAIS[canal].rotulo.toLowerCase()}.` }

  switch (canal) {
    case 'email':
      valor = valor.toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return { erro: 'E-mail inválido.' }
      break
    case 'telefone':
    case 'whatsapp': {
      const digitos = valor.replace(/\D/g, '')
      if (digitos.length < 8 || digitos.length > 15) return { erro: 'Telefone inválido: use DDD e número.' }
      break
    }
    case 'ramal':
      if (!/^[0-9]{2,6}$/.test(valor.replace(/\s/g, ''))) return { erro: 'Ramal: só números (2 a 6 dígitos).' }
      valor = valor.replace(/\s/g, '')
      break
    case 'instagram': {
      const usuario = valor.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '')
      if (!/^[a-zA-Z0-9._]{1,30}$/.test(usuario)) return { erro: 'Instagram: use só o @usuario.' }
      valor = `@${usuario}`
      break
    }
    case 'linkedin': {
      const url = valor.startsWith('http') ? valor : `https://${valor}`
      if (!/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9\-_%.]+\/?$/i.test(url)) return { erro: 'LinkedIn: cole o endereço do perfil (linkedin.com/in/…).' }
      valor = url.replace(/\/+$/, '')
      break
    }
    case 'site': {
      const url = valor.startsWith('http') ? valor : `https://${valor}`
      try {
        const u = new URL(url)
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return { erro: 'Site inválido.' }
        valor = u.toString().replace(/\/$/, '')
      } catch {
        return { erro: 'Site inválido.' }
      }
      break
    }
    case 'outro':
      break
  }
  return { contato: { tipo, canal, valor, rotulo, visibilidade } }
}

/** Lê o jsonb guardado, descartando o que não for contato válido. */
export function lerContatos(valor: unknown): Contato[] {
  if (!Array.isArray(valor)) return []
  return valor.slice(0, LIMITES.contatos).flatMap((c) => {
    const r = normalizarContato((c ?? {}) as Partial<Record<keyof Contato, unknown>>)
    return r.contato ? [r.contato] : []
  })
}

/** Endereço clicável do contato (ou null quando é só texto, como "outro"). */
export function hrefDoContato(c: Pick<Contato, 'canal' | 'valor'>): string | null {
  const digitos = c.valor.replace(/\D/g, '')
  switch (c.canal) {
    case 'email': return `mailto:${c.valor}`
    case 'telefone': return `tel:+${digitos.length <= 11 ? `55${digitos}` : digitos}`
    case 'whatsapp': return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`
    case 'instagram': return `https://instagram.com/${c.valor.replace(/^@/, '')}`
    case 'linkedin':
    case 'site': return c.valor
    default: return null
  }
}

/** Quem está vendo o perfil, em relação ao dono. */
export type Leitor = { ehDono: boolean; ehAdmin: boolean; mesmoSetor: boolean }

export function podeVer(v: Visibilidade, leitor: Leitor): boolean {
  if (leitor.ehDono || leitor.ehAdmin) return true
  if (v === 'equipe') return true
  if (v === 'setor') return leitor.mesmoSetor
  return false
}

export function visiveisPara(contatos: Contato[], leitor: Leitor): Contato[] {
  return contatos.filter((c) => podeVer(c.visibilidade, leitor))
}

/** Setores iguais sem acento, caixa ou espaço extra (mesma regra do banco). */
export function mesmoSetor(a: string | null | undefined, b: string | null | undefined): boolean {
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return Boolean(a && b && chave(a) && chave(a) === chave(b))
}

/** Habilidades digitadas separadas por vírgula → lista limpa, sem repetição. */
export function lerHabilidades(texto: string | string[]): string[] {
  const partes = Array.isArray(texto) ? texto : String(texto ?? '').split(/[,;\n]/)
  const vistas = new Set<string>()
  const r: string[] = []
  for (const p of partes) {
    const h = limpo(p, LIMITES.habilidade)
    if (!h || vistas.has(h.toLowerCase())) continue
    vistas.add(h.toLowerCase())
    r.push(h)
    if (r.length === LIMITES.habilidades) break
  }
  return r
}

// ---------------------------------------------------------------- métricas

export type Metricas = {
  dias: number
  chat: { recebidas: number; respondidas: number; mediana_min: number | null; enviadas: number }
  aprovacoes: { pedidos: number; decididos: number; mediana_min: number | null }
  chamados: { atendidos: number; resolvidos: number; primeira_resposta_mediana_min: number | null; nota_media: number | null; avaliacoes: number }
  producao: { pautas_em_andamento: number; conteudos_criados: number }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const int = (v: unknown) => Math.max(0, Math.round(num(v) ?? 0))

/** Lê o jsonb de metricas_da_pessoa (null = a pessoa escondeu). */
export function lerMetricas(valor: unknown): Metricas | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, Record<string, unknown> | number>
  const o = (k: string) => (v[k] && typeof v[k] === 'object' ? v[k] as Record<string, unknown> : {})
  const chat = o('chat'), aprov = o('aprovacoes'), cham = o('chamados'), prod = o('producao')
  return {
    dias: int(v.dias) || 90,
    chat: { recebidas: int(chat.recebidas), respondidas: int(chat.respondidas), mediana_min: num(chat.mediana_min), enviadas: int(chat.enviadas) },
    aprovacoes: { pedidos: int(aprov.pedidos), decididos: int(aprov.decididos), mediana_min: num(aprov.mediana_min) },
    chamados: { atendidos: int(cham.atendidos), resolvidos: int(cham.resolvidos), primeira_resposta_mediana_min: num(cham.primeira_resposta_mediana_min), nota_media: num(cham.nota_media), avaliacoes: int(cham.avaliacoes) },
    producao: { pautas_em_andamento: int(prod.pautas_em_andamento), conteudos_criados: int(prod.conteudos_criados) },
  }
}

/** 4 → "menos de 5 min", 42 → "42 min", 150 → "2 h 30 min", 3000 → "2 dias". */
export function duracao(minutos: number | null | undefined): string | null {
  if (minutos == null || !Number.isFinite(minutos) || minutos < 0) return null
  if (minutos < 5) return 'menos de 5 min'
  if (minutos < 60) return `${Math.round(minutos)} min`
  if (minutos < 24 * 60) {
    const h = Math.floor(minutos / 60)
    const m = Math.round((minutos - h * 60) / 5) * 5
    return m && m < 60 ? `${h} h ${m} min` : `${m === 60 ? h + 1 : h} h`
  }
  const d = Math.round(minutos / (24 * 60))
  return d === 1 ? '1 dia' : `${d} dias`
}

/** Porcentagem inteira (ou null sem base). */
export function taxa(parte: number, todo: number): number | null {
  return todo > 0 ? Math.round((parte / todo) * 100) : null
}

/** Rótulo do tempo de resposta no chat, como nas redes: "Costuma responder em 20 min". */
export function selinhoDeResposta(m: Metricas | null): string | null {
  if (!m || m.chat.respondidas < 3) return null
  const d = duracao(m.chat.mediana_min)
  return d ? `Costuma responder em ${d}` : null
}
