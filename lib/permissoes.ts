/**
 * Quem pode o quê — o catálogo único de permissões da Redação.
 *
 * Antes daqui, cada action comparava `context.role !== 'admin'` do seu jeito,
 * e a regra só existia espalhada pelo código: ninguém conseguia responder "o
 * que um editor pode fazer?" sem ler tudo. Agora a regra mora nesta tabela, a
 * action pergunta `pode(papel, 'x')` (ou usa `requirePermissao`), e a tela de
 * Usuários desenha a matriz a partir da mesma fonte — o que a tela mostra é o
 * que o servidor aplica.
 *
 * Módulo puro de propósito: sem banco e sem `server-only`, para a tela poder
 * esconder o botão e para dar para conferir com um script avulso. Esconder o
 * botão é conforto; a autoridade continua sendo a action, que confere de novo.
 *
 * Os papéis são gravados em `workspace_members.role` e o banco tem um CHECK
 * com esta mesma lista. Papel novo exige migração antes do deploy.
 */

export const PAPEIS = ['admin', 'editor', 'colaborador', 'escola'] as const
export type Papel = (typeof PAPEIS)[number]

export const ehPapel = (valor: unknown): valor is Papel =>
  typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor)

export const PAPEL: Record<Papel, { rotulo: string; descricao: string }> = {
  admin: {
    rotulo: 'Administrador',
    descricao: 'Controla o espaço inteiro: pessoas, acessos, integrações, site e dados.',
  },
  editor: {
    rotulo: 'Editor',
    descricao: 'Toca a produção: publica, dispara campanhas e cuida da Biblioteca.',
  },
  colaborador: {
    rotulo: 'Colaborador',
    descricao: 'Registra, escreve, comenta e vota nas aprovações para as quais foi convidado.',
  },
  // A Escola é uma empresa à parte: a equipe dela entra só na área da Escola.
  escola: {
    rotulo: 'Equipe da escola',
    descricao: 'Vê só a Escola de Educação e Saúde: vendas, marketing, advertoriais e, se um admin liberar, os livros da Escola no Financeiro. Nada do resto da Redação.',
  },
}

/** A equipe da escola só entra na área da Escola (lib/session.ts barra o resto). */
export const ehEquipeDaEscola = (papel: string | null | undefined) => papel === 'escola'

type Definicao = { grupo: string; rotulo: string; papeis: readonly Papel[] }

/**
 * A tabela. A ordem aqui é a ordem da matriz na tela.
 *
 * O que todo membro ativo pode (registrar, criar pauta, escrever, comentar,
 * votar quando convidado, subir arquivo) não está aqui: é o piso do espaço, e
 * o RLS já garante. Aqui só entra o que DIFERENCIA os papéis.
 */
export const PERMISSOES = {
  // Administração
  'usuarios.gerenciar': { grupo: 'Administração', rotulo: 'Criar usuários, mudar papéis, redefinir senhas e desativar contas', papeis: ['admin'] },
  'usuarios.auditoria': { grupo: 'Administração', rotulo: 'Ver o registro de acessos e mudanças de permissão', papeis: ['admin'] },
  'integracoes.configurar': { grupo: 'Administração', rotulo: 'Configurar chaves de integração e a conta Google', papeis: ['admin'] },
  'correio.configurar': { grupo: 'Administração', rotulo: 'Configurar o E-mail do setor: setores, caixas e assinaturas', papeis: ['admin'] },
  'diagnosticos.executar': { grupo: 'Administração', rotulo: 'Rodar os diagnósticos de FTP, redes, IA e e-mail', papeis: ['admin'] },
  'chamados.configurar': { grupo: 'Administração', rotulo: 'Configurar filas de chamados, equipes de atendimento, categorias e SLA', papeis: ['admin'] },
  'chamados.ver_todos': { grupo: 'Administração', rotulo: 'Ver e atender chamados de todas as filas', papeis: ['admin'] },
  'espaco.reiniciar': { grupo: 'Administração', rotulo: 'Apagar todos os dados do espaço', papeis: ['admin'] },
  'trilha.ver': { grupo: 'Administração', rotulo: 'Acompanhar a trilha pública: registros verificáveis, lotes diários e carimbos', papeis: ['admin'] },
  'transparencia.gerenciar': { grupo: 'Administração', rotulo: 'Publicar documentos e parcerias no portal de transparência e a página de canais oficiais', papeis: ['admin'] },

  // Site e publicação
  'site.configurar': { grupo: 'Site e publicação', rotulo: 'Alterar páginas do site, analytics e formulário da newsletter', papeis: ['admin'] },
  'site.republicar': { grupo: 'Site e publicação', rotulo: 'Republicar matérias no site', papeis: ['admin', 'editor'] },
  'imprensa.campanhas': { grupo: 'Site e publicação', rotulo: 'Criar e disparar campanhas de imprensa', papeis: ['admin', 'editor'] },
  'newsletter.apagar': { grupo: 'Site e publicação', rotulo: 'Apagar edições e inscritos da newsletter', papeis: ['admin'] },
  'biblioteca.liberar_terceiros': { grupo: 'Site e publicação', rotulo: 'Liberar mídia de terceiros para publicação', papeis: ['admin'] },

  // Conteúdo de outras pessoas
  'biblioteca.apagar_de_outros': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Apagar arquivos da Biblioteca enviados por outras pessoas', papeis: ['admin', 'editor'] },
  'pautas.apagar_de_outros': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Apagar pautas criadas por outras pessoas', papeis: ['admin'] },
  'projetos.apagar_de_outros': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Apagar projetos e atualizações de outras pessoas', papeis: ['admin'] },
  'aprovacoes.gerenciar': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Convidar aprovadores e ver conversas de aprovações alheias', papeis: ['admin'] },
  'oficios.gerenciar_de_outros': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Editar e cancelar ofícios criados por outras pessoas', papeis: ['admin'] },
  'correio.todas_as_caixas': { grupo: 'Conteúdo de outras pessoas', rotulo: 'Enviar pelo e-mail de qualquer setor, mesmo sem fazer parte dele', papeis: ['admin'] },
} as const satisfies Record<string, Definicao>

export type Permissao = keyof typeof PERMISSOES

export const ehPermissao = (valor: unknown): valor is Permissao =>
  typeof valor === 'string' && Object.hasOwn(PERMISSOES, valor)

/** Papel desconhecido (ou ausente) não pode nada: a falha é sempre fechada. */
export function pode(papel: string | null | undefined, permissao: Permissao): boolean {
  if (!ehPapel(papel)) return false
  return (PERMISSOES[permissao].papeis as readonly Papel[]).includes(papel)
}

/** Tudo o que um papel pode, na ordem da tabela. */
export const permissoesDo = (papel: Papel): Permissao[] =>
  (Object.keys(PERMISSOES) as Permissao[]).filter((p) => pode(papel, p))

/** A tabela agrupada, pronta para a matriz da tela. */
export function matrizDePermissoes() {
  const grupos = new Map<string, { id: Permissao; rotulo: string; papeis: Record<Papel, boolean> }[]>()
  for (const id of Object.keys(PERMISSOES) as Permissao[]) {
    const def = PERMISSOES[id]
    const linha = { id, rotulo: def.rotulo, papeis: Object.fromEntries(PAPEIS.map((p) => [p, pode(p, id)])) as Record<Papel, boolean> }
    grupos.set(def.grupo, [...(grupos.get(def.grupo) ?? []), linha])
  }
  return [...grupos].map(([grupo, linhas]) => ({ grupo, linhas }))
}
