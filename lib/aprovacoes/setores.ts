import { chaveDoNome } from '../equipe'

/**
 * O que cada setor confere antes de aprovar — a personalização da tela de
 * Aprovações. Benchmark e fontes em docs/APROVACOES.md.
 *
 * O setor de uma aprovação é o da pauta (`pautas.coordination`). O perfil
 * decide três coisas: a cor/sigla que identifica o setor na fila, o prazo de
 * resposta que conta como atraso, e a lista de conferência que aparece na
 * hora de votar. Aprovar exige marcar a lista inteira (o servidor confere de
 * novo); pedir ajustes não, porque quem pede ajuste já está dizendo o que falta.
 *
 * Os setores são cadastro do espaço (Pessoas → Setores); o perfil casa pelo
 * nome sem acento/caixa, com alguns apelidos. Setor sem perfil próprio (um
 * criado depois) usa o PADRAO — nunca fica sem conferência.
 *
 * Módulo puro: sem banco. Conferido com script (npx tsx).
 */

export type PerfilDeRevisao = {
  /** Nome como aparece na tela quando a pauta não tem setor. */
  nome: string
  sigla: string
  /** Cor do selo do setor (hex, contraste AA com texto branco). */
  cor: string
  /** Em uma frase: o olhar que este setor traz para a revisão. */
  foco: string
  /** Horas corridas até contar como atrasada. */
  prazoHoras: number
  conferencia: string[]
}

/** Vale para toda peça que sai com o nome da Cruz Vermelha, de qualquer setor. */
const BASE_INSTITUCIONAL = 'Respeita os princípios da Cruz Vermelha (neutralidade e imparcialidade) e usa o emblema e a marca como manda o manual'

export const PADRAO: PerfilDeRevisao = {
  nome: 'Sem setor',
  sigla: 'CVB',
  cor: '#57534e',
  foco: 'Revisão geral: fatos, tom institucional e uso da marca. Na dúvida, não publique.',
  prazoHoras: 48,
  conferencia: [
    'Nomes, datas, locais e números conferidos com quem fez a ação',
    BASE_INSTITUCIONAL,
    'Pessoas identificáveis nas fotos autorizaram o uso da imagem',
  ],
}

const PERFIS: Record<string, PerfilDeRevisao> = {
  diretoria: {
    nome: 'Diretoria', sigla: 'DIR', cor: '#7c2d12', prazoHoras: 48,
    foco: 'Posicionamento institucional: o que a filial afirma em nome da Cruz Vermelha.',
    conferencia: [
      'Posição coerente com os Princípios Fundamentais, sem manifestação político-partidária',
      'Porta-voz autorizado; cargos, nomes de autoridades e parceiros corretos',
      'Números e dados institucionais batem com os oficiais',
    ],
  },
  juridico: {
    nome: 'Jurídico', sigla: 'JUR', cor: '#1e3a8a', prazoHoras: 72,
    foco: 'Risco legal: direitos de imagem, convênios e o que pode ser prometido.',
    conferencia: [
      'Uso do nome e do emblema da Cruz Vermelha como a lei permite (são protegidos)',
      'Há termo de uso de imagem para quem aparece (e dos responsáveis, se menor de idade)',
      'Marcas e logos de parceiros e convênios estão autorizados por contrato',
      'Nenhum dado pessoal sensível exposto (LGPD) nem promessa que a filial não possa cumprir',
    ],
  },
  'comunicacao social': {
    nome: 'Comunicação Social', sigla: 'COM', cor: '#b91c1c', prazoHoras: 24,
    foco: 'Qualidade editorial: texto, tom de voz, marca e formato para cada canal.',
    conferencia: [
      'Ortografia, títulos e legendas revisados; legenda diz quem, o quê, onde e quando',
      'Tom de voz, manual de marca e emblema sem distorção',
      'Sem sensacionalismo nem exploração do sofrimento; conteúdo de IA está rotulado',
      'Links, @menções, hashtags e texto alternativo das imagens conferidos',
    ],
  },
  'tecnologia da informacao': {
    nome: 'Tecnologia da Informação', sigla: 'TI', cor: '#0f766e', prazoHoras: 24,
    foco: 'O que é digital funciona: links, formulários e páginas.',
    conferencia: [
      'Links e formulários testados, abrindo no celular',
      'Nenhum dado de acesso, senha ou endereço interno aparece',
      'Arquivos e imagens com tamanho adequado para o site',
    ],
  },
  humanitario: {
    nome: 'Humanitário', sigla: 'HUM', cor: '#c2410c', prazoHoras: 48,
    foco: 'Dignidade de quem é atendido: a pessoa é protagonista, não objeto de pena.',
    conferencia: [
      'Pessoas atendidas aparecem com dignidade e protagonismo, sem expor sofrimento',
      'Há consentimento informado registrado de cada pessoa identificável',
      'Não mostra a localização exata de pessoas vulneráveis',
      'Dados de assistência conferidos com a coordenação, sem tomar partido',
    ],
  },
  'educacao e saude': {
    nome: 'Educação e Saúde', sigla: 'ESC', cor: '#15803d', prazoHoras: 48,
    foco: 'Informação de saúde correta e dados de curso (datas, vagas, valores) certos.',
    conferencia: [
      'Informação de saúde tem fonte confiável (Ministério da Saúde, OMS) e não promete cura',
      'Datas, carga horária, vagas, valores e certificação do curso conferidos',
      'Link ou caminho de inscrição correto',
    ],
  },
  'primeiros socorros': {
    nome: 'Primeiros Socorros', sigla: 'PS', cor: '#be123c', prazoHoras: 48,
    foco: 'Técnica correta: nada pode ensinar um procedimento errado.',
    conferencia: [
      'Procedimento segue o protocolo vigente e foi revisado por um instrutor',
      'Imagens mostram a técnica correta e o uso de EPI',
      'Orienta a chamar o SAMU (192) ou os Bombeiros (193)',
      'Deixa claro que não substitui o curso',
    ],
  },
  grd: {
    nome: 'GRD', sigla: 'GRD', cor: '#b45309', prazoHoras: 4,
    foco: 'Emergência e alerta: precisão e urgência, sem alarmismo.',
    conferencia: [
      'Alerta bate com o oficial da Defesa Civil, com data e hora, sem alarmismo',
      'Números certos: Defesa Civil 199, Bombeiros 193, SAMU 192, alertas por SMS 40199',
      'Orientações práticas de preparo, rota de fuga e pontos de apoio confirmadas',
      'Nada que contradiga os órgãos oficiais ou crie pânico',
    ],
  },
  voluntariado: {
    nome: 'Voluntariado', sigla: 'VOL', cor: '#9f1239', prazoHoras: 48,
    foco: 'Quem são os voluntários e como entrar: reconhecimento e chamada corretos.',
    conferencia: [
      'Voluntários citados ou fotografados autorizaram o uso da imagem',
      'Nenhum voluntário apresentado como profissional (médico, psicólogo) sem sê-lo',
      'Chamada de inscrição com requisitos e link corretos, sem prometer vínculo ou remuneração',
    ],
  },
  juventude: {
    nome: 'Juventude', sigla: 'JUV', cor: '#6d28d9', prazoHoras: 72,
    foco: 'Menores de idade: proteção em primeiro lugar (ECA).',
    conferencia: [
      'Menores só aparecem com autorização dos responsáveis (ECA, art. 17)',
      'Não expõe nome completo, escola ou endereço de menores; vítimas nunca identificáveis',
      'Linguagem adequada à faixa etária e aos valores da Cruz Vermelha',
    ],
  },
  'psicologia / servico social': {
    nome: 'Psicologia / Serviço Social', sigla: 'PSI', cor: '#0e7490', prazoHoras: 72,
    foco: 'Sigilo e cuidado: ninguém atendido pode ser reconhecido.',
    conferencia: [
      'Nenhuma pessoa atendida é identificável (nome, rosto, voz ou detalhes) — sigilo profissional',
      'Depoimento só com consentimento específico e anonimizado',
      'Abordagem não sensacionalista de suicídio e violência, com canal de ajuda (CVV 188, CAPS/CRAS)',
      'Violência sexual ou de gênero: a equipe de proteção foi consultada antes',
    ],
  },
  esportes: {
    nome: 'Esportes', sigla: 'ESP', cor: '#1d4ed8', prazoHoras: 24,
    foco: 'Atividades e parceiros: imagem autorizada e informação prática certa.',
    conferencia: [
      'Atletas (e responsáveis, se menores) autorizaram o uso da imagem',
      'Patrocínio sem associar o emblema a marca comercial',
      'Resultados, nomes, datas e locais conferidos',
    ],
  },
}

/** Grafias soltas que já aparecem nas pautas antigas. */
const APELIDOS: Record<string, string> = {
  comunicacao: 'comunicacao social',
  ti: 'tecnologia da informacao',
  tecnologia: 'tecnologia da informacao',
  saude: 'educacao e saude',
  educacao: 'educacao e saude',
  escola: 'educacao e saude',
  psicologia: 'psicologia / servico social',
  'servico social': 'psicologia / servico social',
  'psicologia/servico social': 'psicologia / servico social',
  'gestao de riscos de desastres': 'grd',
}

export function chaveDoSetor(nome: string | null | undefined): string | null {
  if (!nome || !nome.trim()) return null
  const chave = chaveDoNome(nome)
  return PERFIS[chave] ? chave : APELIDOS[chave] ?? chave
}

/** O perfil de revisão de um setor; setor desconhecido ou vazio usa o padrão (com o nome dele). */
export function perfilDoSetor(nome: string | null | undefined): PerfilDeRevisao {
  const chave = chaveDoSetor(nome)
  if (!chave) return PADRAO
  const perfil = PERFIS[chave]
  if (perfil) return perfil
  return { ...PADRAO, nome: nome!.trim(), sigla: nome!.trim().slice(0, 3).toUpperCase() }
}

/** Mesmo setor? ("Comunicação" = "Comunicação Social"). */
export function mesmoSetor(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = chaveDoSetor(a)
  return Boolean(ca) && ca === chaveDoSetor(b)
}

/**
 * O que precisa estar marcado para aprovar: a conferência do setor da peça e,
 * se quem vota é de outro setor com perfil próprio, a do setor dele também —
 * cada pessoa entra na rodada pelo olhar do próprio setor.
 */
export function conferenciaDaRodada(setorDaPeca: string | null | undefined, setorDeQuemVota: string | null | undefined): { setor: PerfilDeRevisao; itens: string[] }[] {
  const daPeca = perfilDoSetor(setorDaPeca)
  const blocos = [{ setor: daPeca, itens: daPeca.conferencia }]
  const chaveDeQuemVota = chaveDoSetor(setorDeQuemVota)
  if (chaveDeQuemVota && PERFIS[chaveDeQuemVota] && !mesmoSetor(setorDaPeca, setorDeQuemVota)) {
    const vistos = new Set(daPeca.conferencia)
    const extras = PERFIS[chaveDeQuemVota].conferencia.filter((i) => !vistos.has(i))
    if (extras.length) blocos.push({ setor: PERFIS[chaveDeQuemVota], itens: extras })
  }
  return blocos
}

/** Texto que vai junto do voto: fica no histórico, dizendo o que foi conferido. */
export function registroDaConferencia(blocos: { setor: PerfilDeRevisao; itens: string[] }[]): string {
  return blocos.map((b) => `Conferido (${b.setor.nome}): ${b.itens.join('; ')}.`).join('\n')
}

export const PERFIS_DE_REVISAO = Object.values(PERFIS)
