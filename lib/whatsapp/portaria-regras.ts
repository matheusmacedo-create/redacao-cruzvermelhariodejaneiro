import {
  BOTOES_DA_CONFERENCIA, PENDENCIA_VALE_MIN, TEXTO_PEDE_MOTIVO_DA_VISITA, TEXTO_PEDE_NOME_DO_VISITANTE, ehConfirmacao, ehPular, formatarNumero,
  interativoDaEscolha, lerEscolha, lerSetorDaVisita, limpo, normalizar, numeroCanonico, primeiroNome, textoDaConferenciaDaVisita, textoDaEscolha,
  textoPedeVisitado, type CategoriaDaMidia, type Interativo, type MidiaRecebida, type Opcao,
} from './regras'

/**
 * O registro da visita pelo WhatsApp em etapas (lib/whatsapp/portaria.ts), como o cadastro do QR da entrada — só as
 * regras, sem banco nem rede, conferidas por `npx tsx scripts/conferir-portaria.ts`:
 *
 *   nome → para quem → telefone do visitante → (com telefone e pessoa avisada) se ele aceita receber a resposta no
 *   WhatsApp → de onde vem → motivo → crachá → foto → conferência → "confirmo".
 *
 *  - Nome e para quem são obrigatórios. O resto é opcional, e cada pergunta opcional leva os botões Pular, Registrar
 *    já (o resto fica em branco e vem a conferência) e Cancelar.
 *  - O consentimento é explícito: a portaria pergunta ao visitante, e só o "Sim" grava avisar_visitante — só com ele
 *    o número do visitante recebe mensagem do Palácio (a resposta de quem é visitado, lib/portaria/servidor.ts).
 *  - A foto pode chegar em qualquer etapa (a imagem com o registro aberto) e também abrir o registro (a legenda
 *    "visitante: Nome"). Aqui só se confere o tipo e se guarda o id da mídia; baixar, normalizar e gravar no Blob
 *    privado vem só depois do "confirmo", com a visita já criada (lib/portaria/foto-servidor.ts).
 *  - Nada do visitante vai ao registro do bot (whatsapp_mensagens guarda só o comando) nem aos logs. A pendência
 *    guarda o que a conversa precisa e é redigida quando acaba (dadosRedigidos).
 */

export type EtapaDaVisita = 'nome' | 'pessoa' | 'escolher_pessoa' | 'telefone' | 'consentimento' | 'empresa' | 'motivo' | 'cracha' | 'foto' | 'conferencia'

export type PessoaNaConversa = { id: string; nome: string; setor: string | null }

/** A foto mandada ao WhatsApp: o id da mídia na Meta e, se veio, o endereço de reserva na Kapso. O arquivo só é baixado depois do "confirmo". */
export type FotoNaConversa = { midia: string; mime: string; endereco?: string }

/** O que a pendência "registrar_visita" guarda. Campo ausente = ainda não perguntado; "" (ou foto null) = pulou. */
export type DadosDaVisita = {
  etapa?: EtapaDaVisita
  nome?: string
  /** A pessoa do Palácio visitada (recebe o aviso)… */
  pessoa?: PessoaNaConversa
  /** …ou o setor em texto livre (ninguém é avisado). */
  setor?: string
  /** As pessoas da lista mostrada, quando a busca achou mais de uma. */
  opcoes?: PessoaNaConversa[]
  /** O telefone do visitante, canônico (numeroCanonico). */
  telefone?: string
  /** O visitante aceitou receber a resposta no WhatsApp: só com o "Sim", e só com telefone e pessoa avisada. */
  avisar?: boolean
  empresa?: string
  motivo?: string
  cracha?: string
  foto?: FotoNaConversa | null
  /** "Registrar já": o que falta fica em branco e vem a conferência. */
  ja?: boolean
  /** A pendência já acabou e o que era do visitante saiu dela (dadosRedigidos). */
  redigida?: boolean
}

/** Na lista para escolher a pessoa, no máximo tantas (cabe numa lista do WhatsApp, com a linha de cancelar). */
export const PESSOAS_NA_ESCOLHA = 9

/** Os limites de cada campo, os mesmos da tela e do banco (lib/portaria/regras.ts, private.portaria_campo). */
export const LIMITES_DA_VISITA = { nome: 120, empresa: 120, motivo: 300, cracha: 20, setor: 120, busca: 80 } as const

/** O nome como vai ao livro: uma linha, sem a formatação do WhatsApp. */
export const nomeLimpo = (t: string) => String(t ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITES_DA_VISITA.nome)

/** Uma linha, sem a formatação do WhatsApp nem controles, até `max`. */
const umaLinha = (t: string, max: number) => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

// ------------------------------------------------------------------ as respostas curtas

/** Além do "pular" de sempre (ehPular), o que a portaria escreve quando o visitante não tem ou não quis dizer. */
const PULA_NA_VISITA = [
  'nao tem', 'nao quis', 'nao quis dar', 'nao quis informar', 'nao quis dizer', 'nao informou', 'nao sabe', 'sem telefone', 'sem empresa',
  'sem motivo', 'sem cracha', 'sem foto', 'pular foto', 'nao tem cracha', 'nao tem telefone',
]
export const ehPularNaVisita = (t: string) => ehPular(t) || PULA_NA_VISITA.includes(normalizar(t))

/** "Registrar já": pula o resto e vai à conferência. Vem antes do pular ("pronto" e "só isso" são dos dois: aqui, fecham). */
const REGISTRAR_JA = ['registrar ja', 'registrar agora', 'registrar', 'registra', 'registra ja', 'pode registrar', 'so isso', 'e so isso', 'pronto', 'conferir']
export const ehRegistrarJa = (t: string) => REGISTRAR_JA.includes(normalizar(t))

// O "sim" e o "não" do visitante. Só palavra de quem respondeu à pergunta: "ok" solto não vale como autorização.
const SIM = ['sim', 's', 'aceita', 'aceito', 'aceitou', 'sim aceita', 'sim aceito', 'autoriza', 'autorizo', 'autorizou', 'sim autoriza', 'quer', 'quer sim',
  'pode', 'pode sim', 'pode mandar', 'sim pode', 'claro']
const NAO = ['nao', 'n', 'nao aceita', 'nao aceito', 'nao aceitou', 'nao autoriza', 'nao autorizou', 'nao quer', 'nao quis', 'prefere nao', 'nao precisa', 'nao pode']

/** A resposta do visitante à pergunta da autorização: true (sim), false (não) ou null (não é resposta). */
export function lerConsentimento(t: string): boolean | null {
  const n = normalizar(t)
  if (SIM.includes(n)) return true
  if (NAO.includes(n)) return false
  return null
}

/** O que vem antes do número do crachá: "o", "crachá (de visitante)", "nº", "número". "Nova" não é "no". */
const ANTES_DO_CRACHA = /^(?:o\s+|n[º°.]\s*|no\s+(?=\d)|n[uú]mero\s+|crach[aá](?:\s+de\s+visitante)?(?![\p{L}\d]))[\s:.\-–—]*/iu

/** O crachá como vai ao livro: "crachá V-07", "nº 7" → "V-07", "7". Até 20 caracteres (o do banco); mais que isso, null. */
export function lerCracha(t: string): string | null {
  let c = umaLinha(t, 200)
  for (let i = 0; i < 3; i++) c = c.replace(ANTES_DO_CRACHA, '').trim()
  return c.length >= 1 && c.length <= LIMITES_DA_VISITA.cracha ? c : null
}

// ------------------------------------------------------------------ as etapas

/**
 * As etapas em que "não" responde a pergunta (pula o telefone, recusa a autorização…) em vez de desistir do registro:
 * lib/whatsapp/acoes.ts (seguirPendencia) não cancela nelas. "cancelar" continua desistindo.
 */
export const ETAPAS_EM_QUE_NAO_RESPONDE: ReadonlySet<string> = new Set<EtapaDaVisita>(['telefone', 'consentimento', 'empresa', 'motivo', 'cracha', 'foto'])

/** As etapas que esperam texto livre: aí até nome de setor que é comando ("Financeiro", "Estoque central") é resposta (acoes.ts, esperaTextoLivre). */
export const ETAPAS_DE_TEXTO_LIVRE: ReadonlySet<string> = new Set<EtapaDaVisita>(['nome', 'pessoa', 'escolher_pessoa', 'telefone', 'empresa', 'motivo', 'cracha'])

/** A etapa que falta, na ordem do registro. A busca de quem é visitado (e a lista dela) é do servidor. */
export function proximaEtapa(d: DadosDaVisita): EtapaDaVisita {
  if (!d.nome) return 'nome'
  if (!d.pessoa && !d.setor) return d.opcoes?.length ? 'escolher_pessoa' : 'pessoa'
  if (d.ja) return 'conferencia'
  if (d.telefone === undefined) return 'telefone'
  // Com o setor, ninguém responde: não há o que mandar ao visitante, e a pergunta não se faz.
  if (d.telefone && d.pessoa && d.avisar === undefined) return 'consentimento'
  if (d.empresa === undefined) return 'empresa'
  if (d.motivo === undefined) return 'motivo'
  if (d.cracha === undefined) return 'cracha'
  if (d.foto === undefined) return 'foto'
  return 'conferencia'
}

/** Os botões das perguntas opcionais: "pular" (ehPular), "registrar ja" (ehRegistrarJa) e "cancelar". */
export const BOTOES_DA_ETAPA_OPCIONAL: Interativo = {
  tipo: 'botoes', botoes: [{ id: 'pular', titulo: 'Pular' }, { id: 'registrar ja', titulo: 'Registrar já' }, { id: 'cancelar', titulo: 'Cancelar' }],
}
/** Os botões da autorização: o id não é "sim"/"não" soltos (o "não" desistiria em outra pergunta), e lerConsentimento lê os dois. */
export const BOTOES_DO_CONSENTIMENTO: Interativo = {
  tipo: 'botoes', botoes: [{ id: 'aceita', titulo: 'Sim' }, { id: 'nao aceita', titulo: 'Não' }, { id: 'cancelar', titulo: 'Cancelar' }],
}
/** A foto é a última pergunta opcional: "Registrar já" ali seria o mesmo que pular, e fica só o "Sem foto". */
export const BOTOES_DA_FOTO: Interativo = { tipo: 'botoes', botoes: [{ id: 'pular', titulo: 'Sem foto' }, { id: 'cancelar', titulo: 'Cancelar' }] }

const vale = `Vale por ${PENDENCIA_VALE_MIN} minutos.`

export function textoPedeTelefone(nome: string): string {
  return [
    `Qual é o telefone de *${limpo(nome, 80)}*, com DDD? Ou *pular*.`,
    `Em qualquer pergunta daqui em diante, *registrar já* pula o resto e vai à conferência. ${vale}`,
  ].join('\n\n')
}

export function textoPedeConsentimento(nome: string, telefone: string): string {
  return [
    `Pergunte a *${limpo(nome, 80)}*: aceita receber no WhatsApp ${formatarNumero(telefone)} a resposta de quem vai recebê-lo (pode subir, aguarde na recepção ou não pode agora)?`,
    `Só com o *sim* dele esse número recebe mensagem do Palácio. Responda *sim* ou *não*. ${vale}`,
  ].join('\n\n')
}

export const textoPedeEmpresa = (nome: string) => `De onde vem *${limpo(nome, 80)}*? A empresa, o órgão ou a instituição, ou *pular*. ${vale}`

export const TEXTO_PEDE_CRACHA = `Qual é o número do crachá de visitante entregue (ex.: _V-07_)? Ou *pular*. ${vale}`

export function textoPedeFoto(nome: string): string {
  return [
    `Mande agora a foto de *${limpo(nome, 80)}*, tirada pela câmera do WhatsApp 📷. Ou toque em *Sem foto*.`,
    `A foto fica na ficha da visita, no Palácio, e só entra depois do *confirmo*. ${vale}`,
  ].join('\n\n')
}

export type PerguntaDaVisita = { etapa: EtapaDaVisita; texto: string; interativo: Interativo | null }

/**
 * A pergunta da etapa que falta (proximaEtapa), com os botões dela. `antes`: o que vai na frente, na mesma mensagem
 * ("Foto recebida ✓").
 */
export function perguntaDaVisita(d: DadosDaVisita, antes?: string | null): PerguntaDaVisita {
  const etapa = proximaEtapa(d)
  const nome = d.nome ?? ''
  const com = (texto: string, interativo: Interativo | null = null): PerguntaDaVisita => ({ etapa, texto: antes ? `${antes}\n\n${texto}` : texto, interativo })
  switch (etapa) {
    case 'nome': return com(TEXTO_PEDE_NOME_DO_VISITANTE)
    case 'pessoa': return com(textoPedeVisitado(nome))
    case 'escolher_pessoa': {
      const opcoes: Opcao[] = (d.opcoes ?? []).map((p) => ({ nome: p.nome, detalhe: p.setor }))
      return com(textoDaEscolha({ pergunta: `Qual destas pessoas vai receber *${limpo(nome, 80)}*?`, opcoes }), interativoDaEscolha(opcoes, { cancelar: 'Não registrar a entrada' }))
    }
    case 'telefone': return com(textoPedeTelefone(nome), BOTOES_DA_ETAPA_OPCIONAL)
    case 'consentimento': return com(textoPedeConsentimento(nome, d.telefone ?? ''), BOTOES_DO_CONSENTIMENTO)
    case 'empresa': return com(textoPedeEmpresa(nome), BOTOES_DA_ETAPA_OPCIONAL)
    case 'motivo': return com(TEXTO_PEDE_MOTIVO_DA_VISITA, BOTOES_DA_ETAPA_OPCIONAL)
    case 'cracha': return com(TEXTO_PEDE_CRACHA, BOTOES_DA_ETAPA_OPCIONAL)
    case 'foto': return com(textoPedeFoto(nome), BOTOES_DA_FOTO)
    default: return com(textoDaConferencia(d), BOTOES_DA_CONFERENCIA)
  }
}

/** A conferência com tudo o que foi dito (regras.ts, textoDaConferenciaDaVisita). */
export function textoDaConferencia(d: DadosDaVisita): string {
  return textoDaConferenciaDaVisita({
    nome: d.nome ?? '', pessoa: d.pessoa ?? null, setor: d.setor ?? null, motivo: d.motivo || null,
    telefone: d.telefone || null, avisar: Boolean(d.avisar), empresa: d.empresa || null, cracha: d.cracha || null, foto: Boolean(d.foto),
  })
}

/**
 * O que a busca de quem é visitado achou: uma pessoa segue; até PESSOAS_NA_ESCOLHA viram a lista para escolher;
 * nenhuma ou muitas pedem de novo. `pergunta`: a resposta que sai no lugar da próxima etapa.
 */
export function resultadoDaBusca(d: DadosDaVisita, busca: string, achadas: PessoaNaConversa[]): { dados: DadosDaVisita; pergunta?: PerguntaDaVisita } {
  const nome = limpo(d.nome ?? '', 80)
  const termo = limpo(busca, LIMITES_DA_VISITA.busca)
  if (achadas.length === 1) return { dados: { ...d, pessoa: achadas[0], opcoes: undefined } }
  if (achadas.length > 1 && achadas.length <= PESSOAS_NA_ESCOLHA) {
    const opcoes: Opcao[] = achadas.map((p) => ({ nome: p.nome, detalhe: p.setor }))
    return {
      dados: { ...d, opcoes: achadas },
      pergunta: {
        etapa: 'escolher_pessoa', texto: textoDaEscolha({ pergunta: `Achei mais de uma pessoa com “${termo}”. Qual delas vai receber *${nome}*?`, opcoes }),
        interativo: interativoDaEscolha(opcoes, { cancelar: 'Não registrar a entrada' }),
      },
    }
  }
  return {
    dados: { ...d, opcoes: undefined },
    pergunta: {
      etapa: 'pessoa', interativo: null,
      texto: achadas.length
        ? `Achei ${achadas.length} pessoas com “${termo}”. Escreva mais do nome (o sobrenome, por exemplo), ou *setor:* e o setor.`
        : `Não achei “${termo}” na equipe do Palácio. Escreva de outro jeito (o primeiro nome ou o sobrenome), ou *setor:* e o setor (aí ninguém é avisado).`,
    },
  }
}

/**
 * O passo depois de uma resposta: `seguir` (a próxima pergunta, ou a conferência), `buscar` (procurar quem é
 * visitado na equipe), `confirmar` (o "confirmo" da conferência), `repetir` (não serviu: pede de novo — só se a
 * pessoa citou a pergunta, ou `sempre`, quando é claramente uma tentativa de resposta) ou `perdido` (etapa que
 * não se reconhece).
 */
export type PassoDoRegistro =
  | { tipo: 'seguir'; dados: DadosDaVisita }
  | { tipo: 'buscar'; dados: DadosDaVisita; busca: string }
  | { tipo: 'confirmar' }
  | { tipo: 'repetir'; texto: string; sempre?: boolean }
  | { tipo: 'perdido' }

export function seguirNoRegistro(d: DadosDaVisita, texto: string): PassoDoRegistro {
  const seguir = (dados: DadosDaVisita): PassoDoRegistro => ({ tipo: 'seguir', dados })
  const repetir = (t: string, sempre = false): PassoDoRegistro => ({ tipo: 'repetir', texto: t, ...(sempre ? { sempre } : {}) })
  const numero = lerEscolha(texto, 99) !== null
  const etapa = d.etapa

  if (etapa === 'nome') {
    const nome = nomeLimpo(texto)
    if (nome.length < 2 || numero) return repetir('Escreva o nome do visitante, ou *cancelar*.')
    return seguir({ ...d, nome })
  }
  if (etapa === 'pessoa' || etapa === 'escolher_pessoa') {
    const n = etapa === 'escolher_pessoa' && d.opcoes ? lerEscolha(texto, d.opcoes.length) : null
    if (n && d.opcoes) return seguir({ ...d, pessoa: d.opcoes[n - 1], opcoes: undefined })
    const setor = lerSetorDaVisita(texto)
    if (setor) return seguir({ ...d, setor: nomeLimpo(setor).slice(0, LIMITES_DA_VISITA.setor), opcoes: undefined })
    // Na lista, também vale escrever outro nome em vez do número.
    const busca = umaLinha(texto, LIMITES_DA_VISITA.busca)
    if (busca.length < 2 || numero) {
      return repetir(d.opcoes?.length ? `Responda com o número da pessoa (1 a ${d.opcoes.length}), ou *cancelar*.` : 'Escreva o nome de quem vai receber, ou *setor:* e o setor.')
    }
    return { tipo: 'buscar', dados: { ...d, opcoes: undefined }, busca }
  }

  if (etapa === 'conferencia') return ehConfirmacao(texto) ? { tipo: 'confirmar' } : repetir('Para registrar, responda a conferência com *confirmo*; para desistir, *cancelar*.')

  // As perguntas opcionais: "registrar já" fecha (o que falta fica em branco); "pular" deixa esta em branco.
  const opcional = etapa === 'telefone' || etapa === 'consentimento' || etapa === 'empresa' || etapa === 'motivo' || etapa === 'cracha' || etapa === 'foto'
  if (!opcional) return { tipo: 'perdido' }
  if (ehRegistrarJa(texto)) return seguir({ ...d, ...(etapa === 'consentimento' ? { avisar: false } : {}), ...(etapa === 'foto' ? { foto: null } : {}), ja: true })

  if (etapa === 'consentimento') {
    const sim = lerConsentimento(texto)
    if (sim === null) return repetir('O visitante aceita receber a resposta no WhatsApp? Responda *sim* ou *não* (ou *cancelar*).')
    return seguir({ ...d, avisar: sim })
  }

  const pula = ehPularNaVisita(texto)
  if (etapa === 'telefone') {
    if (pula) return seguir({ ...d, telefone: '', avisar: undefined })
    const canonico = numeroCanonico(texto)
    // Seis dígitos ou mais é tentativa de telefone, mesmo sem citar: pede de novo em vez de cair no menu.
    if (!canonico) return repetir('Não entendi o telefone. Escreva com o DDD (ex.: _21 99999-1234_), ou *pular*.', texto.replace(/\D/g, '').length >= 6)
    return seguir({ ...d, telefone: canonico, avisar: undefined })
  }
  if (etapa === 'empresa') {
    if (pula) return seguir({ ...d, empresa: '' })
    const empresa = umaLinha(texto, LIMITES_DA_VISITA.empresa)
    if (empresa.length < 2 || numero) return repetir('Escreva de onde vem o visitante (a empresa, o órgão ou a instituição), ou *pular*.')
    return seguir({ ...d, empresa })
  }
  if (etapa === 'motivo') {
    if (pula) return seguir({ ...d, motivo: '' })
    const motivo = umaLinha(texto, LIMITES_DA_VISITA.motivo)
    if (motivo.length < 2 || numero) return repetir('Escreva o motivo em poucas palavras, ou responda *pular*.')
    return seguir({ ...d, motivo })
  }
  if (etapa === 'cracha') {
    if (pula) return seguir({ ...d, cracha: '' })
    const cracha = lerCracha(texto)
    if (!cracha) return repetir(`Escreva só o número do crachá (até ${LIMITES_DA_VISITA.cracha} caracteres, ex.: _V-07_), ou *pular*.`)
    return seguir({ ...d, cracha })
  }
  // A foto: texto aqui só pula; a foto em si chega como imagem (comFoto).
  if (pula) return seguir({ ...d, foto: null })
  return repetir('Mande a foto do visitante pela câmera do WhatsApp, ou toque em *Sem foto*.')
}

// ------------------------------------------------------------------ a foto

/** Os tipos de foto que o Palácio abre (lib/portaria/foto-servidor.ts). O HEIC do iPhone não: o servidor não decodifica HEVC. */
export const TIPOS_DA_FOTO_DO_VISITANTE = ['image/jpeg', 'image/png', 'image/webp'] as const
/** O teto para baixar a foto: a câmera do WhatsApp manda até 5 MB; como documento, a foto inteira do celular. */
export const TETO_DA_FOTO_DO_VISITANTE = 16 * 1024 * 1024

/**
 * A imagem que chegou serve de foto do visitante? Só confere o tipo, o tamanho e se há como baixar — o arquivo vem
 * depois do "confirmo". null quando nem é foto (vídeo, áudio, documento que não é imagem): segue o caminho de sempre.
 */
export function fotoRecebida(midia: MidiaRecebida | null): { foto: FotoNaConversa } | { erro: string } | null {
  if (!midia || midia.categoria !== 'foto') return null
  const mime = midia.mime.toLowerCase()
  if (mime === 'image/heic' || mime === 'image/heif') {
    return { erro: 'Esta foto veio em HEIC (o formato do iPhone), que o Palácio não abre. Tire a foto pela câmera do WhatsApp, sem mandar como documento.' }
  }
  if (!(TIPOS_DA_FOTO_DO_VISITANTE as readonly string[]).includes(mime)) return { erro: 'Esta imagem não serve como foto do visitante. Tire a foto pela câmera do WhatsApp.' }
  if (midia.tamanho && midia.tamanho > TETO_DA_FOTO_DO_VISITANTE) return { erro: 'Esta foto é grande demais. Tire pela câmera do WhatsApp, sem mandar como documento.' }
  const id = midia.arquivo && /^[\w.-]{1,128}$/.test(midia.arquivo) ? midia.arquivo : ''
  if (!id && !midia.endereco) return { erro: 'Não consegui pegar esta foto. Mande de novo.' }
  return { foto: { midia: id, mime, ...(midia.endereco ? { endereco: midia.endereco } : {}) } }
}

/** A foto entra no registro aberto (a mais nova vale); `antes` vai na frente da pergunta que continua. */
export function comFoto(d: DadosDaVisita, foto: FotoNaConversa): { dados: DadosDaVisita; antes: string } {
  return { dados: { ...d, foto }, antes: d.foto ? 'Foto trocada ✓ (vale a última).' : 'Foto recebida ✓' }
}

/** O outro visitante da legenda "visitante: Nome", com um registro aberto para outro nome? Sem nome, é a foto do aberto. */
export function outroVisitante(aberto: DadosDaVisita, legenda: string): boolean {
  const nome = normalizar(nomeLimpo(legenda))
  return nome.length >= 2 && nome !== normalizar(aberto.nome ?? '')
}

/**
 * Para onde vai uma imagem de quem é da equipe: a foto do registro aberto (`foto`), um registro novo com ela (a
 * legenda "visitante: Nome" de quem tem a portaria: `comecar`) ou o caminho de sempre (null: o envio de fotos, o
 * Drive). `legenda`: o nome depois de "visitante:" (lerPedido), ou null se a legenda não é isso. Citando um aviso, a
 * imagem nunca é da visita (o bot responde o que sempre respondeu).
 */
export function destinoDaImagem(p: { categoria: CategoriaDaMidia | null; citouAviso: boolean; aberto: DadosDaVisita | null; legenda: string | null; temPortaria: boolean }): 'foto' | 'comecar' | null {
  if (p.categoria !== 'foto' || p.citouAviso) return null
  if (p.legenda !== null && p.temPortaria && (!p.aberto || outroVisitante(p.aberto, p.legenda))) return 'comecar'
  return p.aberto ? 'foto' : null
}

// ------------------------------------------------------------------ depois do "confirmo"

/** A resposta depois de registrar: a hora, quem foi avisado, a autorização do visitante e se a foto entrou. */
export function textoDaEntradaRegistrada(p: {
  nome: string; hora: string; pessoa: { nome: string } | null; setor: string | null; foto: 'ok' | 'falhou' | null; avisar: boolean; abrir: string
}): string {
  const quem = limpo(p.nome, 80)
  const comFoto = p.foto === 'ok' ? ', com a foto' : ''
  const primeira = p.pessoa
    ? `Pronto: entrada de *${quem}* registrada às ${p.hora}${comFoto}. ${primeiroNome(limpo(p.pessoa.nome, 80)) || 'Quem vai receber'} recebeu o aviso; quando responder, você é avisado.`
    : `Pronto: entrada de *${quem}* registrada às ${p.hora}${comFoto}, para ${limpo(p.setor ?? '', 120) || 'o setor'}. Ninguém foi avisado: confirme com o setor.`
  return [
    [primeira, p.pessoa && p.avisar ? 'O visitante autorizou: a resposta também vai para o WhatsApp dele.' : null].filter(Boolean).join(' '),
    p.foto === 'falhou' ? 'A foto não entrou: tire pela tela da portaria.' : null,
    `Tela da portaria: ${p.abrir}`,
  ].filter(Boolean).join('\n\n')
}

/** O que fica na pendência que acabou: só a etapa (o nome, o telefone, a empresa, o motivo, o crachá e a foto saem). */
export const dadosRedigidos = (d: unknown): DadosDaVisita => {
  const etapa = d && typeof d === 'object' ? (d as DadosDaVisita).etapa : undefined
  return { ...(etapa ? { etapa } : {}), redigida: true }
}
