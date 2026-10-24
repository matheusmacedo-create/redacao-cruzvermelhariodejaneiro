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

/**
 * "quero me cadastrar" (ou “me cadastrar”), vindo de quem ainda não tem conta; "cadastro" solto não vale: é palavra
 * comum. Com o setor depois do "em" ("quero me cadastrar em Tecnologia da Informação"), é o link do time do
 * coordenador: o setor já vem escolhido (`setorDaEntrada`).
 */
export function lerAutocadastro(texto: string): boolean {
  const n = normalizar(texto)
  return n === 'me cadastrar' || n === FRASE_DE_ENTRADA || n.startsWith(`${FRASE_DE_ENTRADA} em `) || n.startsWith('me cadastrar em ')
}

/** O setor do link do time, se a mensagem traz um que existe na lista; senão null (a pessoa escolhe na conversa). */
export function setorDaEntrada(texto: string, setores: string[]): string | null {
  const n = normalizar(texto)
  const resto = n.startsWith(`${FRASE_DE_ENTRADA} em `) ? n.slice(FRASE_DE_ENTRADA.length + 4) : n.startsWith('me cadastrar em ') ? n.slice('me cadastrar em '.length) : ''
  return resto ? setores.find((x) => normalizar(x) === resto) ?? null : null
}

/** Quem se cadastra como coordenador: o cargo começa por "Coordenador(a)" (o botão, ou escrito à mão). */
export const ehCoordenador = (cargo: string | null | undefined): boolean => normalizar(cargo ?? '').startsWith('coordenador')

/**
 * Este ator decide este pedido? O administrador, qualquer um; o coordenador, só o pedido do próprio setor — o da equipe
 * e também o de outro coordenador do mesmo setor (decisão do responsável, 24/10/2026: setores como Comunicação Social têm
 * mais de um coordenador, e o primeiro, que um administrador aprovou, aprova os seguintes). O primeiro coordenador de um
 * setor continua dependendo de administrador (ainda não há ninguém do setor para aprovar), e coordenador nunca decide
 * outro setor.
 */
export const podeDecidir = (a: { admin: boolean; setores: string[] }, d: DadosDoAutocadastro): boolean =>
  a.admin || (Boolean(d.coordenacao) && a.setores.includes(d.coordenacao ?? ''))

/**
 * O link que vai no grupo, no cartaz ou na assinatura: um toque abre a conversa com o texto pronto. Com `setor`, é o
 * link do time de um coordenador: a pessoa já entra no setor dele.
 */
export function linkDoBot(numeroDoBot: string, setor?: string): string {
  const texto = setor ? `${FRASE_DE_ENTRADA} em ${setor}` : FRASE_DE_ENTRADA
  return `https://wa.me/${numeroDoBot.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`
}

/** A resposta ao "link do time" do coordenador: um link por setor que ele coordena. */
export function textoDoLinkDoTime(links: { setor: string; link: string }[]): string {
  if (!links.length) return 'Você não coordena nenhum setor no Palácio ainda. Cadastre-se como coordenador(a) e peça a aprovação de um administrador.'
  return [
    links.length === 1 ? 'Este é o link do seu time. Mande para quem vai se cadastrar em seu setor:' : 'Estes são os links dos seus times. Mande cada um a quem vai se cadastrar no setor:',
    ...links.map((l) => `*${l.setor}*\n${l.link}`),
    'Cada pessoa abre o link, responde as perguntas aqui no WhatsApp e você recebe o pedido para aprovar com um toque. Você aprova só o cadastro do seu setor.',
  ].join('\n\n')
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
/** O cargo mais comum no começo: quem coordena um setor. O toque vira "Coordenador(a) de <setor>". */
export const ID_DO_CARGO_COORDENADOR = 'Coordenador(a)'
const BOTOES_DO_CARGO: Interativo = { tipo: 'botoes', botoes: [{ id: ID_DO_CARGO_COORDENADOR, titulo: 'Coordenador(a)' }, { id: 'pular', titulo: 'Pular' }, { id: 'cancelar', titulo: 'Cancelar' }] }

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
    case 'nome': return com(`Olá! Vou fazer o seu cadastro de colaborador da Cruz Vermelha RJ, aqui mesmo, em poucos minutos.${d.coordenacao ? `\n\nSeu setor: *${d.coordenacao}*.` : ''}\n\nQual é o seu *nome completo* (nome e sobrenome)? ${LINHA_DE_PARAR}`)
    case 'coordenacao': {
      const setores = d.setores ?? []
      const lista = setores.map((s, i) => `${i + 1}. ${s}`).join('\n')
      return com(`Prazer, ${primeiro}! Em qual *coordenação* você vai atuar? Responda com o número:\n${lista}`)
    }
    case 'cargo': return com('Qual é o seu *cargo ou função*? Se você coordena o setor, toque em *Coordenador(a)*. Ou toque em *Pular*.', BOTOES_DO_CARGO)
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
    case 'cargo': {
      if (pulou(texto)) return ok({ cargo: '' })
      // Só o toque no botão (o texto exato) vira "Coordenador(a) de <setor>"; escrito à mão, vale o que a pessoa escreveu.
      if (texto.trim() === ID_DO_CARGO_COORDENADOR) return ok({ cargo: umaLinha(`Coordenador(a) de ${d.coordenacao ?? ''}`, 80) })
      return ok({ cargo: umaLinha(texto, 80) })
    }
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
    ...(ehCoordenador(d.cargo) ? [AVISO_DE_COORDENADOR] : []),
    'Os dados completos ficam na ficha do RH depois da aprovação.',
  ].join('\n')
}

/** O que muda com o cargo de coordenador: a pessoa ganha poder sobre o setor (aprovar a equipe e outros coordenadores dele). */
export const AVISO_DE_COORDENADOR = '⚠️ Cargo de coordenador(a): ao aprovar, a pessoa passa a aprovar o cadastro da equipe do setor (e de outros coordenadores dele) e, se quem aprova é administrador e o endereço do setor está livre, recebe a senha da *caixa própria* (privada) do setor.'

/** O mesmo aviso, para o coordenador que aprova outro coordenador do próprio setor: a caixa do setor não muda. */
export const AVISO_DE_COORDENADOR_PELO_COORDENADOR = '⚠️ Cargo de coordenador(a): ao aprovar, a pessoa passa a coordenar o setor com você e também aprova o cadastro da equipe e de outros coordenadores. A *caixa própria* do setor não muda: quem já tem a senha continua com ela (para entregar a caixa a mais alguém, fale com um administrador).'

export const BOTOES_DE_APROVACAO = (id: string): Interativo => ({
  tipo: 'botoes', imagem: null,
  botoes: [{ id: idDoBotao('aprovar', id), titulo: 'Aprovar' }, { id: idDoBotao('recusar', id), titulo: 'Recusar' }],
})
/** O segundo toque: criar e-mail e ficha é irreversível o bastante para não valer um toque só. */
export const BOTOES_DA_SEGUNDA_CONFIRMACAO = (id: string): Interativo => ({
  tipo: 'botoes', botoes: [{ id: idDoBotao('sim', id), titulo: 'Sim, criar' }, { id: idDoBotao('voltar', id), titulo: 'Voltar' }],
})
/** `porAdministrador` false: quem aprova é coordenador do setor (o aviso do cargo muda: a caixa do setor não se mexe). */
export const textoDaSegundaConfirmacao = (d: DadosDoAutocadastro, porAdministrador = true) =>
  `Confirma a criação do e-mail institucional (${usuarioSugeridoDoGoogle(d.nome ?? '')}@…) e da ficha de *${d.nome}*? A senha provisória vai para o WhatsApp dela, com o passo a passo.${ehCoordenador(d.cargo) ? `\n\n${porAdministrador ? AVISO_DE_COORDENADOR : AVISO_DE_COORDENADOR_PELO_COORDENADOR}` : ''}`

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
/**
 * A mensagem que a pessoa recebe quando o cadastro é aprovado: o e-mail, a senha provisória e o passo a passo. É a
 * única cópia da senha (decisão do responsável, 23/10/2026: pelo WhatsApp, no lugar do e-mail pessoal): sai uma vez,
 * nunca é gravada, e o Google obriga a trocá-la no primeiro acesso.
 */
export function textoDaContaCriada(p: { nome: string; email: string; senha: string; caixaDoSetor?: { nome: string; email: string; senha: string } | null }): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? ''
  return [
    `Seu cadastro foi aprovado${primeiro ? `, ${primeiro}` : ''}! 🎉`,
    `*Seu e-mail institucional:*\n${p.email}\n\n*Senha provisória:*\n${p.senha}`,
    ...(p.caixaDoSetor ? [`*E, como coordenador(a), a caixa do setor ${p.caixaDoSetor.nome} (conta própria, caixa privada):*\n${p.caixaDoSetor.email}\n\n*Senha provisória da caixa do setor:*\n${p.caixaDoSetor.senha}`] : []),
    // Logo depois das senhas, não no fim: fora da janela de 24 h o texto vai por modelo da Meta, que corta em 1000 caracteres,
    // e o que se perde primeiro tem de ser o passo a passo, nunca o aviso de apagar a mensagem.
    '_Depois de trocar as senhas, apague esta mensagem. A Cruz Vermelha nunca pede a sua senha por mensagem nem por ligação._',
    [
      '*Como entrar (leva 2 minutos):*',
      '1. No celular, abra o app *Gmail* → toque na sua foto → *Adicionar outra conta* → *Google*. No computador, entre em mail.google.com.',
      `2. Digite *${p.email}* e a senha provisória acima.`,
      '3. O Google vai pedir uma *senha nova*: crie uma só sua, com 12 ou mais caracteres. A provisória deixa de valer.',
      '4. Se o Google pedir um telefone ou e-mail de recuperação, confirme os que você já informou.',
      ...(p.caixaDoSetor ? [`5. Repita os passos 1 a 4 com *${p.caixaDoSetor.email}* e a senha provisória da caixa do setor. Cada caixa é uma conta separada, com a sua própria senha.`] : []),
      `${p.caixaDoSetor ? '6' : '5'}. Pronto: o e-mail institucional já funciona.`,
    ].join('\n'),
  ].join('\n\n')
}

/** Se o WhatsApp falhar, o mesmo conteúdo vai ao e-mail pessoal (lib/google/contas-emails.ts), sem duplicar a senha em dois canais. */
export const TEXTO_DA_SENHA_NO_WHATSAPP = 'A senha provisória foi enviada ao WhatsApp da pessoa.'

// ------------------------------------------------------------------ "caixas dos setores": a caixa própria de todos os setores de uma vez

/** "caixas dos setores" (e "apelidos", como era chamado antes: agora é a mesma operação, num passo só). */
export const ehPedidoDeCaixas = (textoNormalizado: string) => /^(criar )?(as )?caixas dos setores$|^apelidos( dos setores)?$/.test(textoNormalizado)

/** O id do botão carrega a hora (minutos, base 36) e a impressão do plano: botão velho, ou de uma prévia que já não vale, não faz nada. */
export const VALIDADE_DO_BOTAO_DE_CAIXAS_MIN = 15
export const idDoBotaoDeCaixas = (acao: 'sim' | 'nao', assinatura: string, agora = Date.now()) => `cx:${acao === 'sim' ? 's' : 'n'}:${Math.floor(agora / 60_000).toString(36)}:${assinatura}`

export function lerBotaoDeCaixas(texto: string, agora = Date.now()): { acao: 'sim' | 'nao'; vencido: boolean; assinatura: string } | null {
  const m = texto.trim().match(/^cx:([sn]):([0-9a-z]{4,8}):([0-9a-f]{12})$/)
  if (!m) return null
  const minutos = parseInt(m[2], 36)
  const vencido = !Number.isFinite(minutos) || Math.floor(agora / 60_000) - minutos > VALIDADE_DO_BOTAO_DE_CAIXAS_MIN || minutos > Math.floor(agora / 60_000) + 1
  return { acao: m[1] === 's' ? 'sim' : 'nao', vencido, assinatura: m[3] }
}

export const BOTOES_DE_CAIXAS = (assinatura: string, agora = Date.now()): Interativo => ({
  tipo: 'botoes', botoes: [{ id: idDoBotaoDeCaixas('sim', assinatura, agora), titulo: 'Sim, criar' }, { id: idDoBotaoDeCaixas('nao', assinatura, agora), titulo: 'Não' }],
})
/** A pergunta do botão vai em mensagem própria: a prévia, com muitos setores, passa de 1024 caracteres e perderia os botões. */
export const PERGUNTA_DAS_CAIXAS = 'Criar essas caixas?'

/**
 * Junta blocos de texto em mensagens de até `limite` caracteres sem partir um bloco ao meio (um bloco maior que o limite é
 * partido por linhas). A Meta corta o que passa de 4096 e o corte come justamente o fim, onde ficam os alertas.
 */
export function emMensagens(blocos: string[], limite = 3500): string[] {
  const partes: string[] = []
  let atual = ''
  const empurra = (b: string) => {
    if (!atual) atual = b
    else if ((atual + '\n\n' + b).length <= limite) atual += '\n\n' + b
    else { partes.push(atual); atual = b }
  }
  for (const b of blocos.filter(Boolean)) {
    if (b.length <= limite) { empurra(b); continue }
    let pedaco = ''
    for (const linha of b.split('\n')) {
      if (pedaco && (pedaco + '\n' + linha).length > limite) { empurra(pedaco); pedaco = linha } else pedaco = pedaco ? `${pedaco}\n${linha}` : linha
    }
    if (pedaco) empurra(pedaco)
  }
  if (atual) partes.push(atual)
  return partes
}

type SetorNoPlano = { nome: string; endereco: string; estado: 'apelido' | 'livre' | 'caixa_real' | 'grupo'; dono?: string }

/** `comCoordenador`: os endereços (minúsculos) dos setores que já têm coordenador(a) registrado(a). */
export const textoDaPreviaDasCaixas = (plano: SetorNoPlano[], comCoordenador: Set<string> = new Set()) => blocosDaPreviaDasCaixas(plano, comCoordenador).join('\n\n')
/** A prévia em mensagens que cabem no WhatsApp (a lista pode passar de 4096 com muitos setores de nome longo). */
export const mensagensDaPreviaDasCaixas = (plano: SetorNoPlano[], comCoordenador: Set<string> = new Set()) => emMensagens(blocosDaPreviaDasCaixas(plano, comCoordenador))

function blocosDaPreviaDasCaixas(plano: SetorNoPlano[], comCoordenador: Set<string>): string[] {
  const criar = plano.filter((p) => p.estado === 'apelido' || p.estado === 'livre')
  const jaTem = plano.filter((p) => p.estado === 'caixa_real')
  const grupos = plano.filter((p) => p.estado === 'grupo')
  const restante = [
    jaTem.length ? `Já têm caixa (não mexo): ${jaTem.map((p) => p.nome).join(', ')}.` : '',
    grupos.length ? `São grupo do Google (não mexo): ${grupos.map((p) => p.nome).join(', ')}.` : '',
  ].filter(Boolean)
  if (!plano.length) return ['Não achei nenhum setor com endereço cadastrado.']
  if (!criar.length) return ['Nenhum setor precisa de caixa nova: todos os endereços já têm caixa. ✓', ...restante]
  return [
    `Vou criar a *caixa própria* de ${criar.length} setor${criar.length === 1 ? '' : 'es'} (conta de verdade, caixa privada):`,
    criar.map((p) => `• ${p.nome}: ${p.endereco}${p.estado === 'apelido' ? ` _(hoje apelido de ${p.dono}: o apelido é apagado e a caixa nasce em seguida)_` : ''}${comCoordenador.has(p.endereco.toLowerCase()) ? ' — já tem coordenador(a): recebe a senha agora' : ''}`).join('\n'),
    ...restante,
    '*Quem recebe a senha:* setor com coordenador(a) já registrado(a) recebe por WhatsApp agora. Nos outros ninguém recebe senha: a caixa fica pronta e *sem dono* (ninguém entra nela) até a coordenação do setor ser aprovada — nesse momento ela é entregue à pessoa, com senha nova por WhatsApp.',
    ...(criar.some((p) => !comCoordenador.has(p.endereco.toLowerCase())) ? ['⚠️ *Atenção:* o e-mail que chegar a um setor sem coordenador(a) cai numa caixa em que *ninguém abre* até a aprovação — hoje, nos setores que são apelido, ele chegaria ao contato@. Se algum desses setores recebe e-mail importante, aprove a coordenação *antes* ou deixe-o de fora.'] : []),
    '*O que muda:* o e-mail enviado a um setor que hoje é apelido passa a cair na caixa nova (o que já chegou continua no contato@, que não é tocado). Esses setores deixam de aparecer no /correio e no /email do Palácio. Se uma caixa não puder ser criada, o apelido volta ao lugar.',
  ]
}

/** A mensagem com a senha da caixa de um setor para quem a coordena (a única cópia: sai uma vez e não é gravada). */
export const textoDaSenhaDaCaixa = (p: { setor: string; email: string; senha: string }) => [
  `A caixa do setor *${p.setor}* está pronta: *${p.email}* (conta própria, caixa privada).`,
  `*Senha provisória:*\n${p.senha}`,
  'No Gmail: foto → *Adicionar outra conta* → esse endereço e essa senha. O Google pede uma senha nova na hora. Depois de trocar, apague esta mensagem.',
].join('\n\n')

export type EntregaDaCaixa = 'enviada' | 'na_fila' | 'falhou' | 'sem_coordenador'

type ResultadoParaTexto = { nome: string; endereco: string; resultado: 'criada' | 'ja_existe' | 'e_grupo' | 'falhou' | 'adiada'; apelidoApagado?: boolean; apelidoDevolvido?: boolean; incerto?: boolean; motivo?: string; entrega?: EntregaDaCaixa; registro?: 'ok' | 'falhou' }

export const textoDoResultadoDasCaixas = (r: ResultadoParaTexto[]) => blocosDoResultadoDasCaixas(r).join('\n\n')
/** O resultado em mensagens que cabem no WhatsApp; o que deu errado vem PRIMEIRO, para o corte nunca comer um alerta. */
export const mensagensDoResultadoDasCaixas = (r: ResultadoParaTexto[]) => emMensagens(blocosDoResultadoDasCaixas(r))

function blocosDoResultadoDasCaixas(r: ResultadoParaTexto[]): string[] {
  const criadas = r.filter((x) => x.resultado === 'criada')
  const falhou = r.filter((x) => x.resultado === 'falhou')
  const adiadas = r.filter((x) => x.resultado === 'adiada')
  const jaTem = r.filter((x) => x.resultado === 'ja_existe')
  const grupos = r.filter((x) => x.resultado === 'e_grupo')
  const destino = (x: { entrega?: EntregaDaCaixa }) => x.entrega === 'enviada' ? 'senha enviada à coordenação' : x.entrega === 'na_fila' ? 'senha na fila do WhatsApp da coordenação' : x.entrega === 'falhou' ? '⚠️ a senha NÃO chegou à coordenação: use *caixa do setor: <nome>* para reenviar' : 'sem dono, aguardando a coordenação'
  const semDono = criadas.some((x) => x.entrega === 'sem_coordenador' || x.entrega === undefined)
  const motivosDeParada = [...new Set(adiadas.map((x) => x.motivo).filter((m): m is string => Boolean(m)))]
  // Com muitas falhas o motivo de cada uma é encurtado: a lista tem de caber, e o que importa é qual endereço ficou como.
  const tetoDoMotivo = falhou.length > 5 ? 100 : 200
  const falhaDe = (x: ResultadoParaTexto) => `• ${x.nome}: ${x.endereco} — ${(x.motivo ?? 'erro').slice(0, tetoDoMotivo)}${x.apelidoApagado ? (x.apelidoDevolvido ? ' (o apelido voltou ao lugar)' : ' ⚠️ o apelido foi apagado e NÃO voltou: o endereço está sem destino. Restaure o apelido no Admin do Google ou mande *caixas dos setores* de novo') : ''}${x.incerto && !x.apelidoApagado ? ' ⚠️ confira este endereço no Admin do Google antes de tentar de novo' : ''}`
  return [
    falhou.length ? `❌ Não consegui (${falhou.length}):\n${falhou.map(falhaDe).join('\n')}` : '',
    adiadas.length ? `⏳ Não foi feito (${adiadas.length}): ${adiadas.map((x) => x.nome).join(', ')}.${motivosDeParada.length ? ` ${motivosDeParada.join(' ')}.` : ''} Mande *caixas dos setores* de novo para continuar.` : '',
    criadas.length ? `✅ Caixas criadas (${criadas.length}):\n${criadas.map((x) => `• ${x.nome}: ${x.endereco} — ${destino(x)}${x.registro === 'falhou' ? ' ⚠️ a caixa existe mas NÃO ficou registrada no Palácio: ela não poderá ser entregue à coordenação — avise a TI' : ''}`).join('\n')}` : 'Nenhuma caixa foi criada.',
    jaTem.length ? `Já tinham caixa (${jaTem.length}): ${jaTem.map((x) => x.nome).join(', ')}.` : '',
    grupos.length ? `São grupo do Google (${grupos.length}): ${grupos.map((x) => x.nome).join(', ')}.` : '',
    semDono ? 'Próximo passo: a coordenação de cada setor se cadastra (link do setor) e um administrador aprova — na aprovação a caixa é entregue a ela, com senha nova por WhatsApp. Não precisa criar nada à mão.' : '',
  ].filter(Boolean)
}

// ------------------------------------------------------------------ "acompanhamento": quem já se cadastrou e quem falta

/** "acompanhamento" e jeitos de pedir a mesma coisa. */
export const ehPedidoDeAcompanhamento = (textoNormalizado: string) => ['acompanhamento', 'andamento', 'quem falta', 'quem ja se cadastrou', 'quem ja fez o cadastro', 'cadastros andamento'].includes(textoNormalizado)

export type LinhaDeSetor = {
  setor: string
  coordenacao: 'cadastrada' | 'aguardando' | 'nenhuma'
  /** 'entregue': a senha da caixa do setor chegou à coordenação; 'sem_dono': a caixa existe e ninguém a recebeu; 'nao_nossa': o Palácio não criou (ex.: contato@); 'nao_criada': ainda não existe. */
  caixa: 'entregue' | 'sem_dono' | 'nao_nossa' | 'nao_criada'
  /** Pessoas ativas do setor na equipe e quantas já têm e-mail institucional. */
  pessoas: number
  comEmail: number
  /** Pedidos de cadastro (de qualquer pessoa do setor) esperando aprovação. */
  aguardando: number
}

const ICONE_DA_CAIXA: Record<LinhaDeSetor['caixa'], string> = { entregue: '✅ entregue', sem_dono: '⏳ sem dono', nao_nossa: '➖ já existia', nao_criada: '❌ não criada' }

/** O andamento do cadastro por setor, em mensagens do WhatsApp: o que falta (coordenação sem cadastro) vem primeiro. */
export function mensagensDoAcompanhamento(linhas: LinhaDeSetor[]): string[] {
  if (!linhas.length) return ['Não achei nenhum setor para acompanhar.']
  const semCoord = linhas.filter((l) => l.coordenacao === 'nenhuma')
  const esperando = linhas.filter((l) => l.coordenacao === 'aguardando')
  const comCoord = linhas.filter((l) => l.coordenacao === 'cadastrada')
  const totalAguardando = linhas.reduce((n, l) => n + l.aguardando, 0)
  const totalPessoas = linhas.reduce((n, l) => n + l.pessoas, 0)
  const totalComEmail = linhas.reduce((n, l) => n + l.comEmail, 0)
  const detalhe = (l: LinhaDeSetor) => `• *${l.setor}* — caixa do setor ${ICONE_DA_CAIXA[l.caixa]} · pessoas com e-mail ${l.comEmail}/${l.pessoas}${l.aguardando ? ` · ${l.aguardando} aguardando aprovação` : ''}`
  return emMensagens([
    `*Andamento do cadastro* 📋
Coordenações cadastradas: *${comCoord.length} de ${linhas.length}*${esperando.length ? ` (+${esperando.length} aguardando aprovação)` : ''}
Pessoas com e-mail institucional: *${totalComEmail} de ${totalPessoas}* na equipe
Pedidos esperando aprovação: *${totalAguardando}*${totalAguardando ? ' (mande *cadastros* para ver)' : ''}`,
    semCoord.length ? `❌ *Ainda sem coordenação cadastrada (${semCoord.length}):*
${semCoord.map((l) => `• ${l.setor}${l.pessoas ? ` — ${l.comEmail}/${l.pessoas} pessoas com e-mail` : ''}${l.aguardando ? ` · ${l.aguardando} aguardando` : ''}`).join('\n')}` : '',
    esperando.length ? `⏳ *Coordenação aguardando a sua aprovação (${esperando.length}):*
${esperando.map(detalhe).join('\n')}` : '',
    comCoord.length ? `✅ *Coordenação cadastrada (${comCoord.length}):*
${comCoord.map(detalhe).join('\n')}` : '',
    'Legenda da caixa do setor: ✅ entregue à coordenação · ⏳ criada, sem dono (a senha vai na aprovação da coordenação) · ➖ já existia (contato@).',
  ])
}

// ------------------------------------------------------------------ "caixa do setor: <nome>"

/**
 * "caixa do setor: Comunicação Social" → "comunicacao social" (normalizado), ou null se não é o comando. Exige os dois-pontos:
 * o comando cria uma conta de verdade, e uma pergunta solta ("caixa do setor de comunicação está recebendo?") não pode virar isso.
 */
export function lerCaixaDoSetor(texto: string): string | null {
  const m = texto.trim().match(/^caixa\s+do\s+setor\s*:\s*(.+)$/i)
  if (!m) return null
  const nome = normalizar(m[1])
  return nome || null
}

/** O setor da lista cujo nome normalizado é o pedido. Só o nome inteiro: pela metade não se cria conta. */
export function setorDoPedido(pedido: string, setores: string[]): string | null {
  return setores.find((x) => normalizar(x) === pedido) ?? null
}
