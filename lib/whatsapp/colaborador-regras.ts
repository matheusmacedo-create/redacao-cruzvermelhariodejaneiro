import {
  PENDENCIA_VALE_MIN, acharPeloNome, ehPular, interativoDaEscolha, lerColaborador, lerEscolha, limpo, mascararNumero, normalizar, numeroCanonico,
  textoDaEscolha, textoDoLinkDeConfirmacao, type Interativo, type Opcao,
} from './regras'
import { emailValido } from '@/lib/contas/emails'
import {
  CHAVES_DE_CONTATO, linhasDoCadastro, mascararEmail, papelSugerido, type CadastroConferido, type CanaisLigados, type PedidoDeCadastro,
} from '@/lib/contas/cadastro-regras'
import { PAPEL, type Papel } from '@/lib/permissoes'

/**
 * O cadastro de colaborador pelo WhatsApp em etapas (lib/whatsapp/colaborador.ts) — só as regras, sem banco nem
 * rede, conferidas por `npx tsx scripts/conferir-colaborador.ts`. A mesma semântica de "Adicionar pessoas"
 * (/pessoas/adicionar), para UMA pessoa:
 *
 *   nome → (com alguém da equipe sem acesso com esse nome) "é esta pessoa?" → e-mail → WhatsApp da pessoa →
 *   coordenação → cargo → papel → (com WhatsApp) o pedido da ficha do RH na mesma mensagem → o resumo com o link de
 *   confirmar no Palácio.
 *
 *  - Quem já tem conta com o mesmo nome não é cadastrado de novo: o bot avisa e para (resultadoDaBuscaNaEquipe).
 *  - E-mail e WhatsApp são opcionais, mas um dos dois é obrigatório: o convite precisa de um canal. O e-mail em uso
 *    por outra conta volta (como na tela); o número ligado a outra conta é só aviso (o convite sai igual).
 *  - "Sem coordenação" vale, como no servidor da tela. O papel padrão é o sugerido pelo setor, e administrador
 *    NUNCA (`semAdmin`): administração só pela tela.
 *  - O bot não cria nada: o resumo sai com o link de confirmar no Palácio (whatsapp_confirmacoes,
 *    "cadastrar_colaborador"), e a conta só nasce lá, pelo núcleo da tela (lib/contas/cadastro.ts).
 *  - O e-mail e o WhatsApp da pessoa nova ficam só nos dados da pergunta e do link, nas chaves de
 *    CHAVES_DE_CONTATO (o banco as tira quando a conversa acaba; a faxina, o que venceu). Nos textos, só mascarados.
 */

export type EtapaDoCadastro = 'nome' | 'quem_e' | 'email' | 'whatsapp' | 'coordenacao' | 'cargo' | 'papel' | 'ficha'

/** Alguém da equipe sem acesso ao Palácio (uma ficha do RH, ou só a lista oficial dos setores) com o nome escrito. */
export type CandidatoDaEquipe = {
  /** A ficha do RH que ganha o login; null = só na lista oficial (a ficha nasce junto, como na tela). */
  fichaId: string | null
  nome: string
  setor: string | null
  cargo: string | null
  /** A ficha tem e-mail ou celular (o valor fica na ficha: o servidor lê quando a pessoa escolhe "Usar o da ficha"). */
  temEmail: boolean
  temWhatsapp: boolean
}

/** O que a pendência "cadastrar_colaborador" guarda. Campo ausente = ainda não perguntado; "" = pulou (ou "sem coordenação"). */
export type DadosDoCadastro = {
  etapa?: EtapaDoCadastro
  nome?: string
  /** Quem da equipe sem acesso tem o nome (a lista do "é esta pessoa?"). */
  candidatos?: CandidatoDaEquipe[]
  /** A pessoa da equipe escolhida (reaproveita a ficha); null = é outra pessoa. */
  daEquipe?: CandidatoDaEquipe | null
  /** O e-mail (minúsculo) — chave de CHAVES_DE_CONTATO. */
  email?: string
  /** O WhatsApp canônico (numeroCanonico) — chave de CHAVES_DE_CONTATO. */
  whatsapp?: string
  /** O número já está confirmado em outra conta do Palácio: só aviso. */
  numeroEmUso?: boolean
  coordenacao?: string
  cargo?: string
  papel?: Papel
  pedirFicha?: boolean
  /** A lista oficial das coordenações e os canais ligados, lidos ao começar (as regras daqui não leem o banco). */
  setores?: string[]
  canais?: CanaisLigados
  /** A pendência já acabou e o que era da pessoa saiu dela (dadosRedigidos; o banco marca o mesmo). */
  redigida?: boolean
}

/** As chaves de contato daqui são as do banco (private.whatsapp_cadastro_sem_contato): mudou lá, muda aqui. */
export const CHAVES_DO_CONTATO_NA_CONVERSA: readonly (keyof DadosDoCadastro)[] = CHAVES_DE_CONTATO

/** No "é esta pessoa?", no máximo tantas (cabe numa lista, com a linha "Outra pessoa"). */
export const CANDIDATOS_NA_ESCOLHA = 9

/** Os papéis que o WhatsApp dá (administrador, nunca), na ordem dos botões quando o sugerido não muda nada. */
export const PAPEIS_PELO_WHATSAPP: readonly Papel[] = ['colaborador', 'editor', 'escola']

const vale = `Vale por ${PENDENCIA_VALE_MIN} minutos.`

/** Uma linha, sem a formatação do WhatsApp nem controles, até `max`. */
const umaLinha = (t: string, max: number) => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

// ------------------------------------------------------------------ o nome

/**
 * O nome como vai ao Palácio, ou null se não parece um nome: nome e sobrenome, até 120 letras, sem número, @ ou
 * pergunta ("novo colaborador chegou hoje, como faço?" não vira o nome de ninguém).
 */
export function nomeDoColaborador(texto: string): string | null {
  const nome = umaLinha(texto, 200)
  if (nome.length > 120 || nome.split(' ').length < 2 || nome.split(' ').length > 8) return null
  if (/[\d@?!:;,/\\()[\]{}<>=+#$%&|"]/.test(nome)) return null
  return nome
}

// ------------------------------------------------------------------ as respostas curtas

const USAR_DA_FICHA = ['usar o da ficha', 'usar da ficha', 'o da ficha', 'da ficha', 'usar o que esta na ficha', 'manter', 'manter o da ficha', 'usar esse', 'usar este']
const ehUsarDaFicha = (t: string) => USAR_DA_FICHA.includes(normalizar(t))

const E_ESTA = ['sim', 's', 'e esta pessoa', 'sim e esta', 'sim e esta pessoa', 'e esta', 'e ela', 'e ele', 'sim e ela', 'sim e ele', 'essa', 'esta', 'isso']
const OUTRA = ['outra pessoa', 'outra', 'outro', 'nao', 'n', 'nao e', 'nao e ela', 'nao e ele', 'nenhuma', 'nenhum', 'nenhuma delas', 'pessoa nova']

const SEM_COORDENACAO = ['sem coordenacao', 'sem', 'nenhuma', 'nenhum', 'sem setor', 'nenhuma coordenacao', 'sem coordenacao por enquanto']

const PEDIR_A_FICHA = ['sim', 's', 'pedir a ficha', 'pedir', 'quero', 'pode', 'pode pedir', 'sim pedir', 'manda', 'mandar']
const SEM_A_FICHA = ['nao', 'n', 'sem pedido da ficha', 'nao pedir', 'sem pedido', 'nao precisa', 'agora nao']

const PAPEL_SUGERIDO = ['manter', 'sugerido', 'o sugerido', 'usar o sugerido', 'pode ser', 'ok', 'pular', 'pula']
const ADMINISTRADOR = ['admin', 'administrador', 'administradora', 'adm', 'administracao']

/** O papel escrito ("editor", "equipe da escola") ou null. */
function lerPapel(t: string): Papel | null {
  const n = normalizar(t)
  if (n === 'colaborador' || n === 'colaboradora') return 'colaborador'
  if (n === 'editor' || n === 'editora') return 'editor'
  if (n === 'escola' || n === 'equipe da escola' || n === 'equipe escola') return 'escola'
  return null
}

// ------------------------------------------------------------------ as etapas

/**
 * As etapas em que "não" responde (é outra pessoa, sem e-mail, sem WhatsApp, sem cargo, não pedir a ficha) em vez de
 * desistir do cadastro: lib/whatsapp/acoes.ts (seguirPendencia) não cancela nelas. "cancelar" continua desistindo.
 */
export const ETAPAS_DO_CADASTRO_EM_QUE_NAO_RESPONDE: ReadonlySet<string> = new Set<EtapaDoCadastro>(['quem_e', 'email', 'whatsapp', 'cargo', 'ficha'])

/** As etapas que esperam texto livre: aí até nome de setor que é comando é resposta (acoes.ts, esperaTextoLivre). */
export const ETAPAS_DO_CADASTRO_DE_TEXTO_LIVRE: ReadonlySet<string> = new Set<EtapaDoCadastro>(['nome', 'email', 'whatsapp', 'coordenacao', 'cargo'])

/** A etapa que falta, na ordem do cadastro; "pronto" = vem o resumo com o link. */
export function proximaEtapa(d: DadosDoCadastro): EtapaDoCadastro | 'pronto' {
  if (!d.nome) return 'nome'
  if (d.candidatos?.length && d.daEquipe === undefined) return 'quem_e'
  if (d.email === undefined) return 'email'
  if (d.whatsapp === undefined) return 'whatsapp'
  if (d.coordenacao === undefined) return 'coordenacao'
  if (d.cargo === undefined) return 'cargo'
  if (d.papel === undefined) return 'papel'
  // O pedido da ficha vai dentro do convite pelo WhatsApp: sem número (ou sem o WhatsApp do Palácio), não há o que perguntar.
  if (d.whatsapp && d.canais?.whatsapp !== false && d.pedirFicha === undefined) return 'ficha'
  return 'pronto'
}

/** O papel que vem marcado: o sugerido pelo setor, nunca administrador (cadastro-regras.ts, papelSugerido). */
export const papelDoCadastro = (d: DadosDoCadastro): Papel => papelSugerido(d.coordenacao, { semAdmin: true })

/** A coordenação da ficha escolhida, se está na lista oficial (só então "Usar o da ficha" vale). */
const setorDaFicha = (d: DadosDoCadastro): string | null => {
  const s = d.daEquipe?.setor ?? null
  return s && (d.setores ?? []).includes(s) ? s : null
}

const BOTOES_OPCIONAIS = (daFicha: boolean): Interativo => ({
  tipo: 'botoes',
  botoes: [...(daFicha ? [{ id: 'usar o da ficha', titulo: 'Usar o da ficha' }] : []), { id: 'pular', titulo: 'Pular' }, { id: 'cancelar', titulo: 'Cancelar' }],
})

/** O "é esta pessoa?" de uma pessoa só: o id não é "sim"/"não" soltos (o "não" desistiria em outra pergunta). */
export const BOTOES_DE_QUEM_E: Interativo = {
  tipo: 'botoes', botoes: [{ id: 'e esta pessoa', titulo: 'Sim, é esta' }, { id: 'outra pessoa', titulo: 'Outra pessoa' }, { id: 'cancelar', titulo: 'Cancelar' }],
}
export const BOTOES_DA_FICHA: Interativo = {
  tipo: 'botoes', botoes: [{ id: 'pedir a ficha', titulo: 'Sim' }, { id: 'sem pedido da ficha', titulo: 'Não' }, { id: 'cancelar', titulo: 'Cancelar' }],
}

/** Os papéis do WhatsApp, o sugerido primeiro (os três cabem nos botões; "cancelar" se escreve). */
export function ordemDosPapeis(sugerido: Papel): Papel[] {
  return [sugerido, ...PAPEIS_PELO_WHATSAPP.filter((p) => p !== sugerido)].filter((p) => PAPEIS_PELO_WHATSAPP.includes(p))
}

const rotuloDaPessoa = (c: CandidatoDaEquipe) => [c.cargo, c.setor].filter(Boolean).map((x) => limpo(String(x), 60)).join(' · ')

export const TEXTO_PEDE_NOME_DO_COLABORADOR = `Qual é o nome completo da pessoa (nome e sobrenome, como vai aparecer no Palácio)? Ou *cancelar*. ${vale}`

export type PerguntaDoCadastro = { etapa: EtapaDoCadastro; texto: string; interativo: Interativo | null }

/**
 * A pergunta da etapa que falta (proximaEtapa), com os botões dela. `antes`: o que vai na frente, na mesma mensagem
 * ("E-mail anotado ✓", o aviso do número ligado a outra conta). null quando não falta nada (vem o resumo).
 */
export function perguntaDoCadastro(d: DadosDoCadastro, antes?: string | null): PerguntaDoCadastro | null {
  const etapa = proximaEtapa(d)
  if (etapa === 'pronto') return null
  const nome = limpo(d.nome ?? '', 80)
  const com = (texto: string, interativo: Interativo | null = null): PerguntaDoCadastro => ({ etapa, texto: antes ? `${antes}\n\n${texto}` : texto, interativo })
  switch (etapa) {
    case 'nome': return com(TEXTO_PEDE_NOME_DO_COLABORADOR)
    case 'quem_e': {
      const candidatos = d.candidatos ?? []
      if (candidatos.length === 1) {
        const c = candidatos[0]
        const detalhe = rotuloDaPessoa(c)
        return com([
          `Na equipe já está *${limpo(c.nome, 80)}*${detalhe ? ` (${detalhe})` : ''}, ${c.fichaId ? 'com ficha no RH' : 'na lista dos setores'} e sem acesso ao Palácio. É esta pessoa?`,
          `Se for, o cadastro ${c.fichaId ? 'liga o acesso à ficha que já existe' : 'cria a ficha no RH junto'}. ${vale}`,
        ].join('\n\n'), BOTOES_DE_QUEM_E)
      }
      const opcoes: Opcao[] = candidatos.map((c) => ({ nome: c.nome, detalhe: rotuloDaPessoa(c) || null }))
      const lista = interativoDaEscolha(opcoes, { cancelar: null })
      if (lista?.tipo === 'lista') lista.secoes[0].linhas.push({ id: 'outra pessoa', titulo: 'Outra pessoa', descricao: 'Nenhuma destas: é alguém novo' })
      return com(textoDaEscolha({
        pergunta: `Na equipe sem acesso ao Palácio há mais de uma pessoa com “${nome}”. É uma destas?`, opcoes,
        rodape: `Responda com o número, *outra pessoa* ou *cancelar*. ${vale}`,
      }), lista)
    }
    case 'email': return com([
      `Qual é o e-mail de *${nome}*? É por ele que sai o convite (o link para criar a senha).`,
      `${d.daEquipe?.temEmail ? 'Toque em *Usar o da ficha* para o e-mail que está no RH, ou' : 'Ou'} *pular*, se o convite vai só pelo WhatsApp. ${vale}`,
    ].join('\n\n'), BOTOES_OPCIONAIS(Boolean(d.daEquipe?.temEmail)))
    case 'whatsapp': return com([
      `Qual é o WhatsApp de *${nome}*, com DDD?`,
      d.email
        ? `${d.daEquipe?.temWhatsapp ? 'Toque em *Usar o da ficha* para o celular que está no RH, ou' : 'Ou'} *pular*: o convite vai pelo e-mail. ${vale}`
        : `Sem e-mail, o convite só tem o WhatsApp${d.daEquipe?.temWhatsapp ? ' (*Usar o da ficha* pega o celular do RH)' : ''}. Para dar o e-mail, escreva o endereço aqui. ${vale}`,
    ].join('\n\n'), d.email ? BOTOES_OPCIONAIS(Boolean(d.daEquipe?.temWhatsapp))
      : d.daEquipe?.temWhatsapp ? { tipo: 'botoes', botoes: [{ id: 'usar o da ficha', titulo: 'Usar o da ficha' }, { id: 'cancelar', titulo: 'Cancelar' }] } : null)
    case 'coordenacao': return com(...perguntaDaCoordenacao(d))
    case 'cargo': {
      const daFicha = Boolean(d.daEquipe?.cargo)
      return com(`Qual é o cargo de *${nome}*?${daFicha ? ` Na ficha: _${limpo(d.daEquipe?.cargo ?? '', 80)}_ (*Usar o da ficha*).` : ''} Ou *pular*. ${vale}`, BOTOES_OPCIONAIS(daFicha))
    }
    case 'papel': {
      const sugerido = papelDoCadastro(d)
      const ordem = ordemDosPapeis(sugerido)
      return com([
        `Qual papel *${nome}* vai ter no Palácio? O sugerido pela coordenação é *${PAPEL[sugerido].rotulo}*.`,
        ordem.map((p) => `• *${PAPEL[p].rotulo}*: ${PAPEL[p].descricao}`).join('\n'),
        `Administrador só se dá pela tela (Pessoas → Adicionar). ${vale}`,
      ].join('\n\n'), { tipo: 'botoes', botoes: ordem.map((p) => ({ id: normalizar(PAPEL[p].rotulo), titulo: PAPEL[p].rotulo })) })
    }
    default: return com([
      `Mando junto, na mesma mensagem do convite pelo WhatsApp, o pedido para *${nome}* completar a ficha do RH (dados pessoais, endereço, documentos)?`,
      vale,
    ].join('\n\n'), BOTOES_DA_FICHA)
  }
}

/**
 * A coordenação: a lista oficial numerada. Cabendo numa lista do WhatsApp (com "Sem coordenação"), vai como lista;
 * senão, a lista fica no texto e os botões trazem "Usar o da ficha" (se a ficha tem uma da lista), "Sem coordenação"
 * e "Cancelar". Também vale escrever o nome da coordenação.
 */
function perguntaDaCoordenacao(d: DadosDoCadastro): [string, Interativo | null] {
  const setores = d.setores ?? []
  const daFicha = setorDaFicha(d)
  const opcoes: Opcao[] = setores.map((s) => ({ nome: s, detalhe: s === daFicha ? 'a da ficha' : null }))
  const texto = textoDaEscolha({
    pergunta: `De qual coordenação *${limpo(d.nome ?? '', 80)}* vai ser?${daFicha ? ` Na ficha: _${limpo(daFicha, 60)}_.` : ''}`,
    opcoes,
    rodape: `Responda com o número ou o nome, *sem coordenação*${daFicha ? ', *usar o da ficha*' : ''} ou *cancelar*. ${vale}`,
  })
  if (setores.length + 1 <= 10) {
    const lista = interativoDaEscolha(opcoes, { cancelar: null })
    if (lista?.tipo === 'lista') {
      lista.secoes[0].linhas.push({ id: 'sem coordenacao', titulo: 'Sem coordenação', descricao: 'Fica sem setor por enquanto' })
      return [texto, lista]
    }
  }
  return [texto, {
    tipo: 'botoes',
    botoes: [...(daFicha ? [{ id: 'usar o da ficha', titulo: 'Usar o da ficha' }] : []), { id: 'sem coordenacao', titulo: 'Sem coordenação' }, { id: 'cancelar', titulo: 'Cancelar' }],
  }]
}

// ------------------------------------------------------------------ quem já está na equipe

/** Uma pessoa do Diretório (lib/pessoas/diretorio.ts, montarDiretorio), só com o que a busca usa. */
export type PessoaNaBusca = {
  origem: 'conta' | 'ficha' | 'lista'
  nome: string; usuario?: string | null; acesso: 'ativo' | 'convite' | 'desativado' | 'sem_acesso'
  fichaId: string | null; setor: string | null; cargo: string | null; temEmail?: boolean; temWhatsapp?: boolean
}

/**
 * Quem tem o nome escrito: com conta, só o nome igual (sem acento nem caixa) — é a mesma pessoa, e o cadastro para;
 * sem acesso (ficha do RH ou lista oficial), o nome igual ou cada palavra escrita começando uma palavra do nome
 * ("Ana Lima" acha "Ana Paula Lima"), até CANDIDATOS_NA_ESCOLHA.
 */
export function quemTemONome(pessoas: PessoaNaBusca[], nome: string): { comConta: PessoaNaBusca[]; semAcesso: CandidatoDaEquipe[] } {
  const chave = normalizar(nome)
  const comConta = pessoas.filter((p) => p.origem === 'conta' && normalizar(p.nome) === chave)
  const semAcesso = acharPeloNome(pessoas.filter((p) => p.acesso === 'sem_acesso'), nome).slice(0, CANDIDATOS_NA_ESCOLHA)
    .map((p): CandidatoDaEquipe => ({ fichaId: p.fichaId, nome: p.nome, setor: p.setor, cargo: p.cargo, temEmail: Boolean(p.temEmail), temWhatsapp: Boolean(p.temWhatsapp) }))
  return { comConta, semAcesso }
}

const ACESSO_POR_EXTENSO: Record<PessoaNaBusca['acesso'], string> = {
  ativo: 'já tem acesso ao Palácio', convite: 'já tem conta, com o convite pendente', desativado: 'tem uma conta desativada', sem_acesso: 'está sem acesso',
}

/** Já há conta com o nome: o cadastro para (sem duplicar), com o caminho de cada caso. */
export function textoDeQuemJaTemConta(contas: PessoaNaBusca[], base: string): string {
  const linhas = contas.slice(0, 5).map((c) => `• *${limpo(c.nome, 80)}*${c.usuario ? ` (@${limpo(c.usuario, 40)})` : ''}: ${ACESSO_POR_EXTENSO[c.acesso]}`)
  const desativada = contas.some((c) => c.acesso === 'desativado')
  const convite = contas.some((c) => c.acesso === 'convite')
  return [
    contas.length === 1 ? 'Esta pessoa já está no Palácio, e o cadastro não foi feito (para não duplicar):' : 'Já há contas no Palácio com este nome, e o cadastro não foi feito (para não duplicar):',
    linhas.join('\n'),
    [
      convite ? `Para mandar o convite de novo: ${base}/pessoas/adicionar (convites pendentes).` : null,
      desativada ? `Para reativar: ${base}/usuarios` : null,
      `Se for mesmo outra pessoa com o mesmo nome, cadastre pela tela "Adicionar pessoas": ${base}/pessoas/adicionar`,
    ].filter(Boolean).join('\n'),
  ].join('\n\n')
}

/** O que a busca na equipe achou: `parar` (já tem conta) ou os dados com os candidatos (nenhum = pessoa nova). */
export function resultadoDaBuscaNaEquipe(d: DadosDoCadastro, achados: { comConta: PessoaNaBusca[]; semAcesso: CandidatoDaEquipe[] }, base: string):
  { parar: string } | { dados: DadosDoCadastro } {
  if (achados.comConta.length) return { parar: textoDeQuemJaTemConta(achados.comConta, base) }
  if (achados.semAcesso.length) return { dados: { ...d, candidatos: achados.semAcesso, daEquipe: undefined } }
  return { dados: { ...d, candidatos: undefined, daEquipe: null } }
}

// ------------------------------------------------------------------ a resposta a cada etapa

/**
 * O passo depois de uma resposta: `seguir` (a próxima pergunta, ou o resumo; `conferir`: o servidor confere se o
 * e-mail já é de outra conta ou se o número já está ligado a uma), `buscar` (o nome chegou: procurar na equipe),
 * `da_ficha` (o servidor lê da ficha o e-mail ou o celular), `repetir` (não serviu: pede de novo — só se a pessoa
 * citou a pergunta, ou `sempre`, quando é claramente uma tentativa de resposta) ou `perdido` (etapa que não se
 * reconhece).
 */
export type PassoDoCadastro =
  | { tipo: 'seguir'; dados: DadosDoCadastro; conferir?: 'email' | 'whatsapp' }
  | { tipo: 'buscar'; dados: DadosDoCadastro }
  | { tipo: 'da_ficha'; campo: 'email' | 'whatsapp' }
  | { tipo: 'repetir'; texto: string; sempre?: boolean }
  | { tipo: 'perdido' }

export function seguirNoCadastro(d: DadosDoCadastro, texto: string): PassoDoCadastro {
  const seguir = (dados: DadosDoCadastro, conferir?: 'email' | 'whatsapp'): PassoDoCadastro => ({ tipo: 'seguir', dados, ...(conferir ? { conferir } : {}) })
  const repetir = (t: string, sempre = false): PassoDoCadastro => ({ tipo: 'repetir', texto: t, ...(sempre ? { sempre } : {}) })
  const n = normalizar(texto)
  const etapa = d.etapa

  if (etapa === 'nome') {
    // "colaborador: Ana Lima" respondendo ao nome: o nome é o que vem depois.
    const nome = nomeDoColaborador(lerColaborador(texto) ?? texto)
    if (!nome) return repetir('Escreva o nome e o sobrenome da pessoa (ex.: _Ana Paula Lima_), ou *cancelar*.')
    return { tipo: 'buscar', dados: { ...d, nome, candidatos: undefined, daEquipe: undefined } }
  }

  if (etapa === 'quem_e') {
    const candidatos = d.candidatos ?? []
    if (OUTRA.includes(n)) return seguir({ ...d, candidatos: undefined, daEquipe: null })
    const escolha = candidatos.length > 1 ? lerEscolha(texto, candidatos.length) : (E_ESTA.includes(n) ? 1 : null)
    if (!escolha || !candidatos[escolha - 1]) {
      return repetir(candidatos.length > 1 ? `Responda com o número da pessoa (1 a ${candidatos.length}), *outra pessoa* ou *cancelar*.` : 'É esta pessoa? Responda *sim* ou *outra pessoa* (ou *cancelar*).')
    }
    const c = candidatos[escolha - 1]
    // O nome é o do RH (ou da lista oficial): a conta e a ficha ficam com o mesmo.
    return seguir({ ...d, nome: c.nome, candidatos: undefined, daEquipe: c })
  }

  if (etapa === 'email') {
    if (ehUsarDaFicha(texto) && d.daEquipe?.temEmail) return { tipo: 'da_ficha', campo: 'email' }
    if (ehPular(texto) || ['sem email', 'nao tem', 'nao tem email', 'sem e mail'].includes(n)) return seguir({ ...d, email: '' })
    const email = emailValido(umaLinha(texto, 300))
    if (!email) return repetir('Não entendi o e-mail. Escreva só o endereço (ex.: _ana.lima@gmail.com_), ou *pular*.', texto.includes('@'))
    return seguir({ ...d, email }, 'email')
  }

  if (etapa === 'whatsapp') {
    if (ehUsarDaFicha(texto) && d.daEquipe?.temWhatsapp) return { tipo: 'da_ficha', campo: 'whatsapp' }
    // Sem e-mail ainda, o endereço escrito aqui vale: a pergunta do WhatsApp volta, agora com o "pular".
    if (!d.email && texto.includes('@')) {
      const email = emailValido(umaLinha(texto, 300))
      if (!email) return repetir('Não entendi o e-mail. Escreva só o endereço (ex.: _ana.lima@gmail.com_), ou o WhatsApp com DDD.', true)
      return seguir({ ...d, email }, 'email')
    }
    if (ehPular(texto) || ['sem whatsapp', 'nao tem', 'nao tem whatsapp', 'sem celular', 'sem telefone'].includes(n)) {
      // O convite precisa de um canal ligado (as mesmas regras de conferirCadastro).
      if (!d.email) return repetir('Sem e-mail e sem WhatsApp o convite não tem por onde ir. Escreva o WhatsApp da pessoa com DDD, ou o e-mail dela, ou *cancelar*.', true)
      if (d.canais?.email === false) return repetir('O envio de e-mail do Palácio não está configurado: o convite precisa do WhatsApp. Escreva o número com DDD, ou *cancelar*.', true)
      return seguir({ ...d, whatsapp: '', numeroEmUso: undefined, pedirFicha: undefined })
    }
    const numero = numeroCanonico(texto)
    if (!numero) return repetir('Não entendi o número. Escreva com o DDD (ex.: _21 99999-1234_), ou *pular*.', texto.replace(/\D/g, '').length >= 6)
    return seguir({ ...d, whatsapp: numero, numeroEmUso: undefined }, 'whatsapp')
  }

  if (etapa === 'coordenacao') {
    const setores = d.setores ?? []
    if (SEM_COORDENACAO.includes(n)) return seguir({ ...d, coordenacao: '' })
    const daFicha = setorDaFicha(d)
    if (ehUsarDaFicha(texto) && daFicha) return seguir({ ...d, coordenacao: daFicha })
    const escolha = lerEscolha(texto, setores.length)
    if (escolha) return seguir({ ...d, coordenacao: setores[escolha - 1] })
    const achadas = acharPeloNome(setores.map((s) => ({ nome: s })), umaLinha(texto, 80))
    if (achadas.length === 1) return seguir({ ...d, coordenacao: achadas[0].nome })
    return repetir(`Responda com o número da coordenação (1 a ${setores.length}) ou o nome dela, *sem coordenação* ou *cancelar*.`)
  }

  if (etapa === 'cargo') {
    if (ehUsarDaFicha(texto) && d.daEquipe?.cargo) return seguir({ ...d, cargo: umaLinha(d.daEquipe.cargo, 120) })
    if (ehPular(texto) || ['sem cargo', 'nao tem'].includes(n)) return seguir({ ...d, cargo: '' })
    const cargo = umaLinha(texto, 120)
    if (cargo.length < 2 || lerEscolha(texto, 99) !== null) return repetir('Escreva o cargo em poucas palavras (ex.: _Assistente administrativo_), ou *pular*.')
    return seguir({ ...d, cargo })
  }

  if (etapa === 'papel') {
    if (ADMINISTRADOR.includes(n)) {
      return repetir('Administrador só se dá pela tela (Pessoas → Adicionar), com a verificação de lá. Pelo WhatsApp, escolha *Colaborador*, *Editor* ou *Equipe da escola*.', true)
    }
    const sugerido = papelDoCadastro(d)
    if (PAPEL_SUGERIDO.includes(n)) return seguir({ ...d, papel: sugerido })
    const ordem = ordemDosPapeis(sugerido)
    const papel = lerPapel(texto) ?? (lerEscolha(texto, ordem.length) ? ordem[(lerEscolha(texto, ordem.length) as number) - 1] : null)
    if (!papel) return repetir('Responda com o papel: *Colaborador*, *Editor* ou *Equipe da escola* (ou *cancelar*).')
    return seguir({ ...d, papel })
  }

  if (etapa === 'ficha') {
    if (PEDIR_A_FICHA.includes(n)) return seguir({ ...d, pedirFicha: true })
    if (SEM_A_FICHA.includes(n) || ehPular(texto)) return seguir({ ...d, pedirFicha: false })
    return repetir('Mando o pedido para completar a ficha do RH junto do convite? Responda *sim* ou *não* (ou *cancelar*).')
  }

  return { tipo: 'perdido' }
}

/** O recibo do que acabou de entrar, na frente da pergunta seguinte (sempre mascarado). */
export function reciboDoPasso(antes: DadosDoCadastro, depois: DadosDoCadastro): string | null {
  const partes: string[] = []
  if (depois.email && depois.email !== antes.email) partes.push(`E-mail anotado: ${mascararEmail(depois.email)} ✓`)
  if (depois.whatsapp && depois.whatsapp !== antes.whatsapp) partes.push(`WhatsApp anotado: ${mascararNumero(depois.whatsapp)} ✓`)
  if (depois.numeroEmUso && depois.whatsapp) partes.push(TEXTO_DO_NUMERO_EM_USO)
  return partes.length ? partes.join('\n') : null
}

export const TEXTO_DO_NUMERO_EM_USO = '⚠️ Este número já está ligado a outra conta do Palácio. O convite sai para ele do mesmo jeito: confira se é mesmo da pessoa.'
export const TEXTO_DO_EMAIL_EM_USO = 'Este e-mail já está em uso por outra conta do Palácio. Escreva outro, ou *pular*.'
export const TEXTO_SEM_O_DA_FICHA = 'A ficha do RH não tem esse dado agora. Escreva aqui, ou *pular*.'

// ------------------------------------------------------------------ o pedido e o resumo

/** O pedido que vai no link (os mesmos campos de "Adicionar pessoas"); o contato nas chaves de CHAVES_DE_CONTATO. */
export function pedidoDoCadastro(d: DadosDoCadastro): PedidoDeCadastro {
  const fichaId = d.daEquipe?.fichaId ?? undefined
  return {
    nome: d.nome ?? '', email: d.email ?? '', whatsapp: d.whatsapp ?? '', papel: d.papel ?? papelDoCadastro(d), coordenacao: d.coordenacao ?? '', cargo: d.cargo ?? '',
    ...(fichaId ? { fichaId } : { criarFicha: true }), pedirFicha: Boolean(d.pedirFicha && d.whatsapp),
  }
}

/**
 * Os dados do link de confirmar (whatsapp_confirmacoes.dados): o pedido, o usuário sugerido e o aviso do número. O
 * e-mail e o WhatsApp só entram com valor, nas chaves que o banco tira quando o link é usado.
 */
export function dadosDoLink(pedido: PedidoDeCadastro, extra: { usuario: string; numeroEmUso?: boolean }): Record<string, unknown> {
  return {
    nome: pedido.nome, papel: pedido.papel, coordenacao: pedido.coordenacao, cargo: pedido.cargo, usuario: extra.usuario,
    fichaId: pedido.fichaId ?? null, criarFicha: Boolean(pedido.criarFicha), pedirFicha: Boolean(pedido.pedirFicha),
    ...(pedido.email ? { email: pedido.email } : {}), ...(pedido.whatsapp ? { whatsapp: pedido.whatsapp } : {}),
    ...(extra.numeroEmUso ? { numeroEmUso: true } : {}),
  }
}

/** O que o link vai confirmar: o resumo, com o contato mascarado e o usuário sugerido. Nada foi criado ainda. */
export function oQueDoCadastro(c: CadastroConferido & { usuario: string }, extra: { numeroEmUso?: boolean } = {}): string {
  const linhas = linhasDoCadastro(c).map((l) => `${l.rotulo}: ${l.rotulo === 'Usuário' ? `${limpo(l.valor, 42)} _(sugerido; dá para mudar no Palácio)_` : limpo(l.valor, 120)}`)
  return [
    `Cadastrar *${limpo(c.nome, 80)}* no Palácio? Nada foi criado ainda: a conta só nasce quando você confirmar no Palácio, e aí sai o convite.`,
    linhas.join('\n'),
    extra.numeroEmUso ? TEXTO_DO_NUMERO_EM_USO : null,
    !c.email ? 'Sem e-mail, o convite depende só do WhatsApp, que pode demorar ou não chegar a quem nunca escreveu ao Palácio.' : null,
  ].filter(Boolean).join('\n\n')
}

/** O resumo com o link de confirmar (regras.ts, textoDoLinkDeConfirmacao). */
export const textoDoCadastroParaConfirmar = (c: CadastroConferido & { usuario: string }, url: string, extra: { numeroEmUso?: boolean } = {}) =>
  textoDoLinkDeConfirmacao({ oQue: oQueDoCadastro(c, extra), url })

// ------------------------------------------------------------------ os textos fora das etapas

export const TEXTO_DO_CADASTRO_COM_DUAS_ETAPAS =
  'Sua conta usa a verificação em duas etapas, então o cadastro de colaboradores fica na tela "Adicionar pessoas" (o WhatsApp não pede o código do app).'

export const textoDoCadastroPelaTela = (base: string) => `O cadastro de colaborador pelo WhatsApp ainda não está ligado. Cadastre pela tela "Adicionar pessoas": ${base}/pessoas/adicionar`

/** A pendência que acabou: fica só a etapa (o nome, o contato e o resto saem do banco). */
export function dadosRedigidos(d: unknown): DadosDoCadastro {
  const etapa = (d as DadosDoCadastro | null)?.etapa
  return { ...(etapa ? { etapa } : {}), redigida: true }
}

/** Os dados do link vencido sem uso: saem o e-mail e o WhatsApp (o banco faz o mesmo no link usado). */
export function dadosDoLinkRedigidos(d: unknown): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...((d ?? {}) as Record<string, unknown>) }
  for (const chave of CHAVES_DE_CONTATO) delete copia[chave]
  return { ...copia, redigida: true }
}
