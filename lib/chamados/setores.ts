/**
 * Chamados para todos os setores — as regras, sem banco. Conferidas com
 * `npx tsx scripts/conferir-setores-dos-chamados.ts`.
 *
 * Cada setor do espaço (Pessoas → Setores) pode virar uma fila de chamados
 * com um clique em Chamados → Configurar. Daqui sai o que a fila nova leva:
 * prefixo (sem repetir os que já existem), ícone e um catálogo inicial de
 * assuntos, pensado para o setor quando o nome é conhecido e genérico quando
 * não é. A coordenação ajusta tudo depois, como em qualquer fila.
 */

/** Ícones que uma fila pode ter (a tela troca a chave pelo desenho: components/app/chamados/icones.tsx). */
export const ICONES_DE_FILA = [
  'ticket', 'monitor', 'wrench', 'megaphone', 'scale', 'wallet', 'shopping-cart', 'users', 'heart-handshake',
  'graduation-cap', 'stethoscope', 'siren', 'truck', 'building', 'file-signature', 'brain', 'trophy', 'sprout', 'package',
] as const
export type IconeDeFila = (typeof ICONES_DE_FILA)[number]
export const ehIconeDeFila = (v: unknown): v is IconeDeFila => typeof v === 'string' && (ICONES_DE_FILA as readonly string[]).includes(v)

export type AssuntoInicial = { nome: string; descricao: string; tipo: 'incidente' | 'solicitacao'; pedeLocal?: boolean }

/** `artigo` é o que vai antes do nome no cartaz: "a Manutenção", "o Jurídico", "o setor de Compras", "a equipe de Primeiros Socorros". */
type Modelo = { chaves: string[]; icone: IconeDeFila; prefixo?: string; artigo: string; descricao: string; assuntos: AssuntoInicial[] }

/** Tira acento e caixa: "Comunicação Social" → "comunicacao social". */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * O que cada setor conhecido recebe. `chaves` são pedaços do nome do setor
 * (sem acento; siglas com espaço nas pontas); o primeiro modelo que casar vale. Os assuntos seguem o que
 * as outras equipes da filial costumam pedir a cada setor.
 */
const MODELOS: Modelo[] = [
  {
    chaves: ['tecnologia', 'informatica', ' ti '], icone: 'monitor', prefixo: 'TI', artigo: 'a',
    descricao: 'Computadores, internet, e-mail, acessos, impressoras e sistemas.',
    assuntos: [
      { nome: 'Algo parou de funcionar', descricao: 'Computador, internet, impressora, sistema fora do ar.', tipo: 'incidente', pedeLocal: true },
      { nome: 'Acesso ou senha', descricao: 'Criar, liberar ou recuperar acesso a e-mail, pasta ou sistema.', tipo: 'solicitacao' },
      { nome: 'Equipamento ou programa novo', descricao: 'Instalar programa, pedir notebook, periférico ou ramal.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['manutencao', 'predial', 'infraestrutura', 'zeladoria'], icone: 'wrench', prefixo: 'MAN', artigo: 'a',
    descricao: 'Elétrica, hidráulica, ar-condicionado, mobiliário e reparos na sede.',
    assuntos: [
      { nome: 'Algo quebrou ou vazou', descricao: 'Lâmpada, tomada, torneira, porta, ar-condicionado.', tipo: 'incidente', pedeLocal: true },
      { nome: 'Pequena obra ou instalação', descricao: 'Montar móvel, fixar quadro, pintar, trocar fechadura.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['comunicacao', 'imprensa', 'marketing'], icone: 'megaphone', prefixo: 'COM', artigo: 'a',
    descricao: 'Artes, divulgação, cobertura de ações, site, redes e imprensa.',
    assuntos: [
      { nome: 'Arte ou material gráfico', descricao: 'Card, cartaz, banner, apresentação, certificado.', tipo: 'solicitacao' },
      { nome: 'Divulgar uma ação', descricao: 'Post nas redes, notícia no site, newsletter.', tipo: 'solicitacao' },
      { nome: 'Cobertura de foto ou vídeo', descricao: 'Registro de evento, treinamento ou ação em campo.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Atendimento à imprensa', descricao: 'Pedido de entrevista, nota ou posicionamento oficial.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['juridic', 'legal'], icone: 'scale', prefixo: 'JUR', artigo: 'o',
    descricao: 'Contratos, convênios, termos, pareceres e questões legais.',
    assuntos: [
      { nome: 'Análise de contrato ou convênio', descricao: 'Revisar minuta antes de assinar ou renovar.', tipo: 'solicitacao' },
      { nome: 'Termo ou documento', descricao: 'Termo de cessão, autorização, declaração, procuração.', tipo: 'solicitacao' },
      { nome: 'Dúvida jurídica', descricao: 'Orientação sobre um caso ou uma decisão.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['financ', 'tesouraria', 'contab'], icone: 'wallet', prefixo: 'FIN', artigo: 'o',
    descricao: 'Pagamentos, reembolsos, notas fiscais e prestação de contas.',
    assuntos: [
      { nome: 'Reembolso', descricao: 'Despesa paga do próprio bolso, com comprovante.', tipo: 'solicitacao' },
      { nome: 'Pagamento a fornecedor', descricao: 'Nota fiscal ou boleto para pagar.', tipo: 'solicitacao' },
      { nome: 'Prestação de contas', descricao: 'Adiantamento, projeto ou convênio.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['compra', 'suprimento', 'almoxarifado'], icone: 'shopping-cart', prefixo: 'CPR', artigo: 'o setor de',
    descricao: 'Compras, cotações e material de consumo.',
    assuntos: [
      { nome: 'Material de consumo', descricao: 'Papelaria, limpeza, copa.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Cotação de serviço ou produto', descricao: 'Antes de abrir um pedido de compra.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['recursos humanos', ' rh ', 'departamento pessoal', 'gente e gestao'], icone: 'users', prefixo: 'RH', artigo: 'o setor de',
    descricao: 'Documentos, férias, ponto, benefícios e admissões.',
    assuntos: [
      { nome: 'Declaração ou documento', descricao: 'Declaração de vínculo, informe de rendimentos, holerite.', tipo: 'solicitacao' },
      { nome: 'Férias, ponto ou afastamento', descricao: 'Pedido, ajuste ou dúvida.', tipo: 'solicitacao' },
      { nome: 'Benefícios', descricao: 'Vale-transporte, alimentação, plano de saúde.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['diretoria', 'presidencia', 'secretaria'], icone: 'file-signature', prefixo: 'DIR', artigo: 'a',
    descricao: 'Assinaturas, agenda, autorizações e representação institucional.',
    assuntos: [
      { nome: 'Assinatura de documento', descricao: 'Ofício, contrato, termo ou declaração.', tipo: 'solicitacao' },
      { nome: 'Agenda ou representação', descricao: 'Reunião, evento ou visita com a diretoria.', tipo: 'solicitacao' },
      { nome: 'Autorização', descricao: 'Aprovação de ação, gasto ou uso do nome da filial.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['voluntari'], icone: 'heart-handshake', prefixo: 'VOL', artigo: 'o',
    descricao: 'Voluntários para ações, cadastro e declarações de horas.',
    assuntos: [
      { nome: 'Voluntários para uma ação', descricao: 'Quantas pessoas, quando, onde e para quê.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Declaração de horas', descricao: 'Para um voluntário ou um grupo.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['juventude', 'jovem'], icone: 'sprout', prefixo: 'JUV', artigo: 'a',
    descricao: 'Juventude da Cruz Vermelha: grupos, atividades e ações com jovens.',
    assuntos: [
      { nome: 'Apoio da Juventude numa ação', descricao: 'Quantas pessoas, quando e onde.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['primeiros socorros', 'socorro', 'ambulancia'], icone: 'siren', prefixo: 'PSO', artigo: 'a equipe de',
    descricao: 'Equipe de primeiros socorros em eventos e treinamentos.',
    assuntos: [
      { nome: 'Cobertura de evento', descricao: 'Data, local, público esperado e duração.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Treinamento', descricao: 'Curso de primeiros socorros para uma equipe ou parceiro.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['grd', 'desastre', 'defesa civil', 'emergencia'], icone: 'siren', prefixo: 'GRD', artigo: 'a',
    descricao: 'Gestão de riscos e desastres: resposta a emergências e prevenção.',
    assuntos: [
      { nome: 'Emergência em andamento', descricao: 'Enchente, deslizamento, incêndio: o que, onde, quantas pessoas.', tipo: 'incidente', pedeLocal: true },
      { nome: 'Ação de prevenção ou simulado', descricao: 'Palestra, simulado, mapeamento de risco.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['educacao', 'escola', 'ensino', 'curso'], icone: 'graduation-cap', prefixo: 'EDU', artigo: 'a',
    descricao: 'Cursos, turmas, certificados e parcerias de ensino.',
    assuntos: [
      { nome: 'Curso ou turma', descricao: 'Abrir turma, inscrição, material.', tipo: 'solicitacao' },
      { nome: 'Certificado', descricao: 'Emissão, correção ou segunda via.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['psicolog', 'servico social', 'assistencia social'], icone: 'brain', prefixo: 'PSS', artigo: 'a',
    descricao: 'Apoio psicossocial e encaminhamentos de serviço social.',
    assuntos: [
      { nome: 'Apoio psicossocial numa ação', descricao: 'Acolhimento em emergência ou atividade.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Encaminhamento', descricao: 'Pessoa ou família que precisa de atendimento.', tipo: 'solicitacao' },
    ],
  },
  {
    chaves: ['saude', 'medic', 'enfermagem'], icone: 'stethoscope', prefixo: 'SAU', artigo: 'a',
    descricao: 'Ações de saúde, campanhas e atendimentos.',
    assuntos: [
      { nome: 'Ação de saúde', descricao: 'Campanha, aferição, vacinação, palestra.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['humanitari', 'assistencia', 'doacao', 'doacoes'], icone: 'package', prefixo: 'HUM', artigo: 'o setor',
    descricao: 'Ações humanitárias, doações e distribuição de itens.',
    assuntos: [
      { nome: 'Doação recebida ou oferecida', descricao: 'O que é, quantidade e onde está.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Apoio a uma ação humanitária', descricao: 'Itens, pessoas ou transporte para uma ação.', tipo: 'solicitacao', pedeLocal: true },
    ],
  },
  {
    chaves: ['esporte'], icone: 'trophy', prefixo: 'ESP', artigo: 'o setor de',
    descricao: 'Atividades esportivas e eventos.',
    assuntos: [{ nome: 'Atividade ou evento esportivo', descricao: 'Data, local e público.', tipo: 'solicitacao', pedeLocal: true }],
  },
  {
    chaves: ['frota', 'transporte', 'logistic', 'veiculo'], icone: 'truck', prefixo: 'FRO', artigo: 'a',
    descricao: 'Veículos, transporte e logística.',
    assuntos: [
      { nome: 'Transporte ou veículo', descricao: 'Data, horário, trajeto e quantas pessoas ou volumes.', tipo: 'solicitacao', pedeLocal: true },
      { nome: 'Problema com veículo', descricao: 'Pane, avaria, multa ou documento.', tipo: 'incidente' },
    ],
  },
]

/** O catálogo de qualquer setor sem modelo: pedir, perguntar, avisar que algo parou. */
export const ASSUNTOS_GENERICOS: AssuntoInicial[] = [
  { nome: 'Pedido ao setor', descricao: 'Algo que você precisa que este setor faça.', tipo: 'solicitacao' },
  { nome: 'Informação ou dúvida', descricao: 'Uma pergunta ou orientação.', tipo: 'solicitacao' },
  { nome: 'Algo não está funcionando', descricao: 'Um problema que precisa de atenção.', tipo: 'incidente' },
]

export function modeloDoSetor(nome: string): Modelo | null {
  const n = ` ${normalizar(nome)} `
  // Com espaço nas pontas do nome, ' ti ' casa só a sigla inteira (e não "tinta" ou "direito").
  return MODELOS.find((m) => m.chaves.some((c) => n.includes(c))) ?? null
}

/**
 * O artigo do setor no cartaz de chamados: o do modelo ou, para um setor sem
 * modelo, um palpite pela terminação da primeira palavra ("Secretaria" → a,
 * "Almoxarifado" → o, "Suprimentos" → o setor de). Quem imprime vê o
 * resultado e pode trocar de chamada se ler estranho.
 */
export function artigoDoSetor(nome: string): string {
  const m = modeloDoSetor(nome)
  if (m) return m.artigo
  const primeira = normalizar(nome).split(/[^a-z0-9]+/).filter(Boolean)[0] ?? ''
  if (/(cao|sao|ia|dade|gem|tura|eza|a)$/.test(primeira)) return 'a'
  if (/s$/.test(primeira)) return 'o setor de'
  return 'o'
}

export const slugDoNome = (nome: string) => normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o'])

/**
 * Um prefixo de 2 a 6 letras que ainda não está em uso: o do modelo, as
 * iniciais das palavras ("Comunicação Social" → CS), as 3, 4, 5 ou 6
 * primeiras letras. Sem saída (tudo usado), null — a coordenação escolhe.
 */
export function prefixoDoSetor(nome: string, usados: ReadonlySet<string>): string | null {
  const letras = normalizar(nome).toUpperCase().replace(/[^A-Z ]/g, '')
  const palavras = letras.split(/\s+/).filter((p) => p && !PALAVRAS_VAZIAS.has(p.toLowerCase()))
  const juntas = palavras.join('')
  const candidatos = [
    modeloDoSetor(nome)?.prefixo,
    palavras.length > 1 ? palavras.map((p) => p[0]).join('').slice(0, 6) : undefined,
    juntas.slice(0, 3), juntas.slice(0, 4), juntas.slice(0, 5), juntas.slice(0, 6),
    palavras.length > 1 ? (palavras[0].slice(0, 3) + palavras[1][0]) : undefined,
  ]
  return candidatos.find((c): c is string => Boolean(c && /^[A-Z]{2,6}$/.test(c) && !usados.has(c))) ?? null
}

export type SetorParaFila = { id: string; nome: string; descricao: string | null }
export type FilaExistente = { slug: string; nome: string; prefixo: string }

/**
 * O setor já tem fila? Casa pelo nome (sem acento), pelo endereço (slug) ou
 * pelo prefixo do modelo: "Tecnologia da Informação" já é atendido pela
 * fila "TI", mesmo com outro nome.
 */
export function setorJaTemFila(setor: SetorParaFila, filas: readonly FilaExistente[]): boolean {
  const nome = normalizar(setor.nome)
  const slug = slugDoNome(setor.nome)
  const prefixo = modeloDoSetor(setor.nome)?.prefixo
  return filas.some((f) => normalizar(f.nome) === nome || f.slug === slug || (prefixo !== undefined && f.prefixo === prefixo))
}

export type FilaProposta = { setorId: string; nome: string; slug: string; prefixo: string | null; icone: IconeDeFila; descricao: string; assuntos: AssuntoInicial[] }

/** A fila que cada setor sem fila ganharia — prefixos distintos entre si e dos que já existem. */
export function propostasDeFila(setores: readonly SetorParaFila[], filas: readonly FilaExistente[]): FilaProposta[] {
  const usados = new Set(filas.map((f) => f.prefixo))
  const slugs = new Set(filas.map((f) => f.slug))
  return setores.filter((s) => !setorJaTemFila(s, filas)).flatMap((s) => {
    const slug = slugDoNome(s.nome)
    if (!/^[a-z0-9-]{2,40}$/.test(slug) || slugs.has(slug)) return []
    slugs.add(slug)
    const modelo = modeloDoSetor(s.nome)
    const prefixo = prefixoDoSetor(s.nome, usados)
    if (prefixo) usados.add(prefixo)
    return [{
      setorId: s.id, nome: s.nome.trim().slice(0, 60), slug, prefixo,
      icone: modelo?.icone ?? 'ticket',
      descricao: (s.descricao?.trim() || modelo?.descricao || `Pedidos ao setor ${s.nome.trim()}.`).slice(0, 300),
      assuntos: modelo?.assuntos ?? ASSUNTOS_GENERICOS,
    }]
  })
}
