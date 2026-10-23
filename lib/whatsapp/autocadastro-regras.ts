import { normalizar, type Interativo } from './regras'
import { celularEmE164, problemaDoEmailPessoal, separarNome, usuarioSugeridoDoGoogle } from '@/lib/google/contas-regras'
import type { CampoDaFicha } from '@/lib/rh/ficha'

/**
 * O autocadastro do colaborador pelo WhatsApp — as regras, sem banco nem rede
 * (`npx tsx scripts/conferir-autocadastro.ts`). O servidor fica em
 * lib/whatsapp/autocadastro.ts.
 *
 * Quem começa é a própria pessoa: ela toca no link do bot (wa.me, com o texto
 * pronto; pode ser compartilhado em qualquer lugar, a conversa é sempre
 * privada) e o bot conduz, sem site nenhum:
 *
 *   nome → coordenação → cargo → e-mail pessoal → nascimento → CEP → número →
 *   complemento → contato de emergência (nome, parentesco, telefone) → foto →
 *   ciência (LGPD) → resumo ao aprovador (botões Aprovar / Recusar).
 *
 * O que a pessoa digita vira a ficha do RH (CAMPOS_DA_FICHA) e o e-mail do
 * Google (nome.sobrenome@); a foto vira a do crachá. Nada é criado antes da
 * aprovação. Dados pessoais vivem só em colaborador_autocadastros e saem
 * (`dadosRedigidos`) quando o pedido acaba.
 */

export const FRASE_DE_ENTRADA = 'quero me cadastrar'
const LINHA_DE_PARAR = 'Para desistir, escreva *cancelar*.'

export type EtapaDoAutocadastro =
  | 'nome' | 'coordenacao' | 'cargo' | 'email' | 'nascimento' | 'cep' | 'endereco' | 'numero' | 'complemento'
  | 'emergencia_nome' | 'emergencia_parentesco' | 'emergencia_telefone' | 'foto' | 'ciencia'

export type DadosDoAutocadastro = {
  /** A lista oficial de setores, lida na hora de começar. */
  setores?: string[]
  nome?: string
  coordenacao?: string
  /** "" = a pessoa pulou. */
  cargo?: string
  emailPessoal?: string
  /** AAAA-MM-DD */
  nascimento?: string
  cep?: string
  logradouro?: string
  bairro?: string
  cidade?: string
  uf?: string
  numero?: string
  /** "" = sem complemento. */
  complemento?: string
  emergenciaNome?: string
  emergenciaParentesco?: string
  /** E.164 */
  emergenciaTelefone?: string
  /** O id da mídia na Kapso; o arquivo só vem depois da aprovação. */
  fotoMidia?: string
  fotoEndereco?: string | null
  ciente?: boolean
  etapa?: EtapaDoAutocadastro
  redigida?: boolean
}

/** As chaves com dado pessoal: saem do banco quando o pedido acaba. */
export const CHAVES_PESSOAIS: readonly (keyof DadosDoAutocadastro)[] = [
  'nome', 'emailPessoal', 'nascimento', 'cep', 'logradouro', 'bairro', 'cidade', 'uf', 'numero', 'complemento',
  'emergenciaNome', 'emergenciaParentesco', 'emergenciaTelefone', 'fotoMidia', 'fotoEndereco', 'cargo',
]

// ------------------------------------------------------------------ a entrada

/** "quero me cadastrar" (ou “cadastro”, “me cadastrar”), vindo de quem ainda não tem conta. */
export function lerAutocadastro(texto: string): boolean {
  const n = normalizar(texto)
  return n === 'cadastro' || n === 'me cadastrar' || n === 'cadastrar' || n === FRASE_DE_ENTRADA || n === 'quero me cadastrar como colaborador'
}

/** O link que vai no grupo, no cartaz ou na assinatura: um toque abre a conversa com o texto pronto. */
export function linkDoBot(numeroDoBot: string): string {
  return `https://wa.me/${numeroDoBot.replace(/\D/g, '')}?text=${encodeURIComponent(FRASE_DE_ENTRADA)}`
}

// ------------------------------------------------------------------ leitura de cada resposta

const PULAR = ['pular', 'pula', 'nao tenho', 'sem', 'nenhum', 'nenhuma', 'nao', 'n']
const pulou = (t: string) => PULAR.includes(normalizar(t))
const umaLinha = (t: string, max: number) => t.replace(/\s+/g, ' ').trim().slice(0, max)

export function lerNome(texto: string): string | null {
  const nome = umaLinha(texto, 200)
  if (nome.length > 120 || /[\d@?!:;,/\\()[\]{}<>=+#$%&|"]/.test(nome)) return null
  return 'erro' in separarNome(nome) ? null : nome
}

/** DD/MM/AAAA (ou DD-MM-AAAA, DDMMAAAA) → AAAA-MM-DD; só datas que existem, de gente de 14 a 100 anos. */
export function lerNascimento(texto: string, hoje = new Date()): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-. ]?(\d{1,2})[/\-. ]?(\d{4})$/)
  if (!m) return null
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  const idade = hoje.getUTCFullYear() - ano - (hoje.getUTCMonth() < mes - 1 || (hoje.getUTCMonth() === mes - 1 && hoje.getUTCDate() < dia) ? 1 : 0)
  return idade >= 14 && idade <= 100 ? `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` : null
}

export function lerCep(texto: string): string | null {
  const d = texto.replace(/\D/g, '')
  return /^\d{8}$/.test(d) ? `${d.slice(0, 5)}-${d.slice(5)}` : null
}

/** "Rua das Flores, Centro, Rio de Janeiro/RJ" — o caso de a consulta do CEP não achar. */
export function lerEndereco(texto: string): { logradouro: string; bairro: string; cidade: string; uf: string } | null {
  const partes = umaLinha(texto, 300).split(',').map((p) => p.trim()).filter(Boolean)
  if (partes.length < 3) return null
  const [logradouro, bairro, local] = [partes[0], partes[1], partes.slice(2).join(', ')]
  const m = local.match(/^(.+?)\s*[/\-]\s*([A-Za-z]{2})$/)
  if (!m) return null
  return { logradouro: logradouro.slice(0, 200), bairro: bairro.slice(0, 100), cidade: m[1].trim().slice(0, 100), uf: m[2].toUpperCase() }
}

function lerCoordenacao(texto: string, setores: string[]): string | null {
  const n = normalizar(texto)
  if (/^\d{1,2}$/.test(n)) return setores[Number(n) - 1] ?? null
  return setores.find((s) => normalizar(s) === n) ?? null
}

// ------------------------------------------------------------------ as etapas

const ORDEM: EtapaDoAutocadastro[] = [
  'nome', 'coordenacao', 'cargo', 'email', 'nascimento', 'cep', 'endereco', 'numero', 'complemento',
  'emergencia_nome', 'emergencia_parentesco', 'emergencia_telefone', 'foto', 'ciencia',
]

const tem = (v: unknown) => v !== undefined && v !== null

export function proximaEtapa(d: DadosDoAutocadastro): EtapaDoAutocadastro | 'pronto' {
  for (const etapa of ORDEM) {
    const feito: Record<EtapaDoAutocadastro, boolean> = {
      nome: Boolean(d.nome), coordenacao: Boolean(d.coordenacao), cargo: tem(d.cargo), email: Boolean(d.emailPessoal),
      nascimento: Boolean(d.nascimento), cep: Boolean(d.cep),
      // O endereço só é perguntado se a consulta do CEP não trouxe a rua.
      endereco: Boolean(d.logradouro && d.cidade && d.uf), numero: Boolean(d.numero), complemento: tem(d.complemento),
      emergencia_nome: Boolean(d.emergenciaNome), emergencia_parentesco: Boolean(d.emergenciaParentesco),
      emergencia_telefone: Boolean(d.emergenciaTelefone), foto: Boolean(d.fotoMidia), ciencia: d.ciente === true,
    }
    if (!feito[etapa]) return etapa
  }
  return 'pronto'
}

export const BOTOES_DE_CIENCIA: Interativo = {
  tipo: 'botoes', botoes: [{ id: 'confirmo', titulo: 'Confirmo' }, { id: 'cancelar', titulo: 'Cancelar' }],
}
const BOTAO_PULAR: Interativo = { tipo: 'botoes', botoes: [{ id: 'pular', titulo: 'Pular' }, { id: 'cancelar', titulo: 'Cancelar' }] }

export const TEXTO_DA_CIENCIA = [
  'Última etapa. Confirme que:',
  '• os dados e a foto são seus e verdadeiros;',
  '• a Cruz Vermelha RJ pode usá-los para a sua ficha de trabalho, o seu crachá e a criação do seu e-mail institucional;',
  '• o contato de emergência sabe que foi indicado.',
  'Seus dados ficam só com o RH. Toque em *Confirmo* para enviar à aprovação.',
].join('\n')

export type PerguntaDoAutocadastro = { etapa: EtapaDoAutocadastro; texto: string; interativo: Interativo | null }

export function perguntaDoAutocadastro(d: DadosDoAutocadastro, antes?: string | null): PerguntaDoAutocadastro | null {
  const etapa = proximaEtapa(d)
  if (etapa === 'pronto') return null
  const primeiro = (d.nome ?? '').split(' ')[0]
  const com = (texto: string, interativo: Interativo | null = null): PerguntaDoAutocadastro => ({ etapa, texto: antes ? `${antes}\n\n${texto}` : texto, interativo })
  switch (etapa) {
    case 'nome': return com(`Olá! Vou fazer o seu cadastro de colaborador da Cruz Vermelha RJ, aqui mesmo, em poucos minutos.\n\nQual é o seu *nome completo* (nome e sobrenome)? ${LINHA_DE_PARAR}`)
    case 'coordenacao': {
      const setores = d.setores ?? []
      const lista = setores.map((s, i) => `${i + 1}. ${s}`).join('\n')
      return com(`Prazer, ${primeiro}! Em qual *coordenação* você vai atuar? Responda com o número:\n${lista}`)
    }
    case 'cargo': return com('Qual é o seu *cargo ou função*? Ou toque em *Pular*.', BOTAO_PULAR)
    case 'email': return com('Qual é o seu *e-mail pessoal* (Gmail, Outlook…)? É nele que chegam a senha provisória e o passo a passo do seu e-mail institucional.')
    case 'nascimento': return com('Qual é a sua *data de nascimento*? Escreva assim: 25/03/1990')
    case 'cep': return com('Qual é o *CEP* da sua residência?')
    case 'endereco': return com('Não achei esse CEP. Escreva *rua, bairro, cidade/UF*. Exemplo: Rua das Flores, Centro, Rio de Janeiro/RJ')
    case 'numero': return com(`${d.logradouro ? `Encontrei: *${d.logradouro}${d.bairro ? `, ${d.bairro}` : ''}${d.cidade ? ` — ${d.cidade}/${d.uf}` : ''}*.\n\n` : ''}Qual é o *número* da casa ou do prédio? (Sem número: escreva S/N)`)
    case 'complemento': return com('Algum *complemento* (apto, bloco)? Ou toque em *Pular*.', BOTAO_PULAR)
    case 'emergencia_nome': return com('Agora o *contato de emergência*: qual é o nome de alguém que possamos avisar se precisar?')
    case 'emergencia_parentesco': return com(`Qual é o parentesco ou relação de *${(d.emergenciaNome ?? '').split(' ')[0]}* com você? (mãe, esposo, amiga…)`)
    case 'emergencia_telefone': return com(`Qual é o *telefone com DDD* de ${(d.emergenciaNome ?? '').split(' ')[0]}?`)
    case 'foto': return com('Agora a *foto do seu rosto* para o crachá: de frente, com boa luz, sem óculos escuros ou boné. Mande a imagem aqui na conversa (como foto, não como documento).')
    case 'ciencia': return com(TEXTO_DA_CIENCIA, BOTOES_DE_CIENCIA)
  }
}

export type PassoDoAutocadastro =
  | { tipo: 'avancar'; dados: DadosDoAutocadastro; recibo: string | null }
  | { tipo: 'repetir'; texto: string }
  | { tipo: 'cancelar' }
  /** O CEP está certo no formato: o servidor consulta e devolve com `comEnderecoDoCep`. */
  | { tipo: 'consultar_cep'; dados: DadosDoAutocadastro }

export function seguirNoAutocadastro(d: DadosDoAutocadastro, texto: string): PassoDoAutocadastro {
  const n = normalizar(texto)
  if (['cancelar', 'cancela', 'desistir', 'sair'].includes(n)) return { tipo: 'cancelar' }
  const etapa = proximaEtapa(d)
  if (etapa === 'pronto') return { tipo: 'repetir', texto: 'Seu cadastro já foi enviado à aprovação.' }
  const ok = (campos: Partial<DadosDoAutocadastro>, recibo: string | null = null): PassoDoAutocadastro => ({ tipo: 'avancar', dados: { ...d, ...campos }, recibo })
  const de = (msg: string): PassoDoAutocadastro => ({ tipo: 'repetir', texto: msg })
  switch (etapa) {
    case 'nome': {
      const nome = lerNome(texto)
      return nome ? ok({ nome }) : de('Escreva o nome e o sobrenome, só com letras. Exemplo: Ana Lima')
    }
    case 'coordenacao': {
      const c = lerCoordenacao(texto, d.setores ?? [])
      return c ? ok({ coordenacao: c }, `Coordenação: ${c} ✓`) : de('Não reconheci. Responda com o *número* da coordenação da lista.')
    }
    case 'cargo': return ok({ cargo: pulou(texto) ? '' : umaLinha(texto, 80) })
    case 'email': {
      const e = texto.trim().toLowerCase()
      const problema = problemaDoEmailPessoal(e)
      return problema ? de(problema) : ok({ emailPessoal: e }, 'E-mail anotado ✓')
    }
    case 'nascimento': {
      const nasc = lerNascimento(texto)
      return nasc ? ok({ nascimento: nasc }) : de('Não entendi a data. Escreva dia, mês e ano com 4 dígitos. Exemplo: 25/03/1990')
    }
    case 'cep': {
      const cep = lerCep(texto)
      return cep ? { tipo: 'consultar_cep', dados: { ...d, cep } } : de('O CEP tem 8 números. Exemplo: 20230-024')
    }
    case 'endereco': {
      const e = lerEndereco(texto)
      return e ? ok(e) : de('Escreva separado por vírgulas: *rua, bairro, cidade/UF*. Exemplo: Rua das Flores, Centro, Rio de Janeiro/RJ')
    }
    case 'numero': {
      const num = umaLinha(texto, 20)
      return /^(s\/?n|\d{1,6}[a-zA-Z]?)$/i.test(num) ? ok({ numero: num.toUpperCase() }) : de('Escreva só o número (ex.: 120) ou S/N.')
    }
    case 'complemento': return ok({ complemento: pulou(texto) ? '' : umaLinha(texto, 100) })
    case 'emergencia_nome': {
      const nome = lerNome(texto)
      return nome ? ok({ emergenciaNome: nome }) : de('Escreva o nome e o sobrenome da pessoa.')
    }
    case 'emergencia_parentesco': {
      const p = umaLinha(texto, 60)
      return p.length >= 2 && !/\d/.test(p) ? ok({ emergenciaParentesco: p }) : de('Escreva a relação: mãe, esposo, amiga…')
    }
    case 'emergencia_telefone': {
      const t = celularEmE164(texto)
      return typeof t === 'string' && t ? ok({ emergenciaTelefone: t }) : de('Telefone com DDD, como (21) 99999-9999.')
    }
    case 'foto': return de('Preciso da foto aqui na conversa. Toque no clipe 📎 → Câmera ou Galeria e envie a imagem.')
    case 'ciencia': return ['confirmo', 'sim', 'confirmar', 'ok'].includes(n) ? ok({ ciente: true }) : de('Toque em *Confirmo* para enviar, ou escreva *cancelar*.')
  }
}

/** A resposta da consulta do CEP: com a rua, pula o endereço; sem, a etapa pede. */
export function comEnderecoDoCep(d: DadosDoAutocadastro, achado: { logradouro?: string; bairro?: string; cidade?: string; uf?: string } | null): DadosDoAutocadastro {
  if (!achado?.cidade || !achado.uf) return d
  // Rua em branco (CEP de cidade pequena): o bairro/rua ficam para a pessoa; a cidade vale.
  return { ...d, logradouro: achado.logradouro || 'Rua não informada', bairro: achado.bairro ?? '', cidade: achado.cidade, uf: achado.uf.toUpperCase() }
}

// ------------------------------------------------------------------ a aprovação

// O id do botão cabe em 40 caracteres (LIMITES_DO_INTERATIVO.id): "cad:" + 1 letra + ":" + 32 do uuid = 38.
const LETRA = { aprovar: 'a', recusar: 'r', sim: 's', voltar: 'v' } as const
export const idDoBotao = (acao: keyof typeof LETRA, id: string) => `cad:${LETRA[acao]}:${id.replace(/-/g, '')}`

export function lerBotaoDeAprovacao(texto: string): { acao: 'aprovar' | 'recusar' | 'sim' | 'voltar'; id: string } | null {
  const m = texto.trim().match(/^cad:([arsv]):([0-9a-f]{32})$/)
  const acao = m ? (Object.keys(LETRA) as (keyof typeof LETRA)[]).find((k) => LETRA[k] === m[1]) : undefined
  return m && acao ? { acao, id: m[2] } : null
}

const mascarar = (e: string) => e.replace(/^(.).*(@.*)$/, '$1•••$2')
const mascararTel = (t: string) => t.replace(/^(\+55\d{2}).*(\d{2})$/, '$1•••••$2')

/** O que o aprovador vê: o necessário para decidir, sem CPF, endereço nem telefone inteiro. */
export function resumoParaAprovador(d: DadosDoAutocadastro): string {
  return [
    '*Novo colaborador pedindo cadastro*',
    `Nome: ${d.nome}`,
    `Coordenação: ${d.coordenacao}${d.cargo ? ` · ${d.cargo}` : ''}`,
    `E-mail pessoal: ${mascarar(d.emailPessoal ?? '')}`,
    `Cidade: ${d.cidade}/${d.uf}`,
    `Emergência: ${d.emergenciaNome} (${d.emergenciaParentesco}) ${mascararTel(d.emergenciaTelefone ?? '')}`,
    `E-mail institucional previsto: *${usuarioSugeridoDoGoogle(d.nome ?? '')}@…*`,
    'Os dados completos ficam na ficha do RH depois da aprovação.',
  ].join('\n')
}

export const BOTOES_DE_APROVACAO = (id: string): Interativo => ({
  tipo: 'botoes', imagem: null,
  botoes: [{ id: idDoBotao('aprovar', id), titulo: 'Aprovar' }, { id: idDoBotao('recusar', id), titulo: 'Recusar' }],
})
/** O segundo toque: criar e-mail e ficha é irreversível o bastante para não valer um toque só. */
export const BOTOES_DA_SEGUNDA_CONFIRMACAO = (id: string): Interativo => ({
  tipo: 'botoes', botoes: [{ id: idDoBotao('sim', id), titulo: 'Sim, criar' }, { id: idDoBotao('voltar', id), titulo: 'Voltar' }],
})
export const textoDaSegundaConfirmacao = (d: DadosDoAutocadastro) =>
  `Confirma a criação do e-mail institucional (${usuarioSugeridoDoGoogle(d.nome ?? '')}@…) e da ficha de *${d.nome}*? A senha provisória vai para o e-mail pessoal dela.`

// ------------------------------------------------------------------ o destino dos dados

/** O que vai para equipe_preencher_pelo_convite (CAMPOS_DA_FICHA): mesmos nomes, mesmos limites. */
export function fichaDoAutocadastro(d: DadosDoAutocadastro, telefonePessoal: string): Partial<Record<CampoDaFicha, string>> {
  const f: Partial<Record<CampoDaFicha, string>> = {
    telefone_pessoal: telefonePessoal, email_pessoal: d.emailPessoal, data_nascimento: d.nascimento, cep: d.cep,
    logradouro: d.logradouro, numero: d.numero, complemento: d.complemento || undefined, bairro: d.bairro, cidade: d.cidade, uf: d.uf,
    emergencia_nome: d.emergenciaNome, emergencia_parentesco: d.emergenciaParentesco, emergencia_telefone: d.emergenciaTelefone,
  }
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Partial<Record<CampoDaFicha, string>>
}

/** Os dados com tudo o que é pessoal fora; ficam a etapa e a marca. */
export function dadosRedigidos(d: DadosDoAutocadastro): DadosDoAutocadastro {
  const base: Record<string, unknown> = { ...d }
  for (const k of CHAVES_PESSOAIS) delete base[k]
  return { ...(base as DadosDoAutocadastro), redigida: true }
}

export const TEXTO_DE_ENVIADO = 'Pronto! Seu cadastro foi enviado à coordenação para aprovação. Assim que aprovarem, você recebe aqui o seu e-mail institucional. 💚'
export const TEXTO_DE_RECUSADO = 'Seu cadastro não foi aprovado desta vez. Fale com a sua coordenação para entender o motivo e, se for o caso, envie *quero me cadastrar* de novo.'
export const textoDeAprovado = (email: string, paraOnde: string) =>
  `Seu cadastro foi aprovado! 🎉\n\nSeu e-mail institucional: *${email}*\nA senha provisória foi enviada para ${paraOnde}; o Google pede para trocá-la no primeiro acesso.`
