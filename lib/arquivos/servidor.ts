import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode, type Papel } from '@/lib/permissoes'
import { compartilharNoDrive, criarPastaNoDrive, ErroDoDrive, moverParaLixeiraDoDrive, obterItemDoDrive } from '@/lib/google/drive'
import { caminhoAte, PASTA, type Degrau } from './regras'

/**
 * Quem abre o quê nos Arquivos do setor. O Drive não sabe quem é do setor:
 * a conta conectada vê tudo. Por isso toda ação passa por aqui, com o
 * service role e depois de requireWorkspace:
 *  - o setor precisa ser um dos que a pessoa abre (setor_membros, ou
 *    arquivos.todos_os_setores);
 *  - o item precisa morar dentro da pasta daquele setor (caminhoAte).
 */

type Contexto = { workspace: { id: string }; user: { id: string }; role: Papel }

export type SetorDosArquivos = { id: string; nome: string; email: string | null }

export type ConexaoDoDrive = { email_conta: string; estado: 'ativa' | 'expirada'; raiz_id: string | null; raiz_nome: string | null; conectada_em: string }

export async function conexaoDoDrive(workspaceId: string): Promise<ConexaoDoDrive | null> {
  const { data } = await createAdminClient().from('drive_conexao').select('email_conta,estado,raiz_id,raiz_nome,conectada_em').eq('workspace_id', workspaceId).maybeSingle()
  return (data as ConexaoDoDrive | null) ?? null
}

/** Os setores ativos que a pessoa abre, na ordem do cadastro. */
export async function setoresQueAbro(c: Contexto): Promise<SetorDosArquivos[]> {
  const admin = createAdminClient()
  const ws = c.workspace.id
  if (pode(c.role, 'arquivos.todos_os_setores')) {
    const { data } = await admin.from('setores').select('id,nome,email').eq('workspace_id', ws).eq('ativo', true).order('ordem').order('nome')
    return (data ?? []) as SetorDosArquivos[]
  }
  const { data: vinculos } = await admin.from('setor_membros').select('setor_id').eq('workspace_id', ws).eq('user_id', c.user.id)
  const ids = (vinculos ?? []).map((v) => v.setor_id as string)
  if (!ids.length) return []
  const { data } = await admin.from('setores').select('id,nome,email').eq('workspace_id', ws).eq('ativo', true).in('id', ids).order('ordem').order('nome')
  return (data ?? []) as SetorDosArquivos[]
}

export async function setorQueAbro(c: Contexto, setorId: string): Promise<SetorDosArquivos> {
  const setor = (await setoresQueAbro(c)).find((s) => s.id === setorId)
  if (!setor) throw new Error('Você não faz parte deste setor. Peça a um administrador para incluir você em Pessoas → Setores.')
  return setor
}

/** A conexão pronta para uso: ligada, ativa e com a pasta raiz escolhida. */
export async function conexaoPronta(workspaceId: string): Promise<ConexaoDoDrive & { raiz_id: string }> {
  const conexao = await conexaoDoDrive(workspaceId)
  if (!conexao) throw new ErroDoDrive('O Google Drive ainda não foi ligado. Um administrador liga em Arquivos do setor.', 0, true)
  if (conexao.estado === 'expirada') throw new ErroDoDrive('A autorização do Google Drive expirou. Um administrador reconecta em Arquivos do setor.', 0, true)
  if (!conexao.raiz_id) throw new ErroDoDrive('Falta escolher a pasta da filial no Google Drive. Um administrador escolhe em Arquivos do setor.')
  return { ...conexao, raiz_id: conexao.raiz_id }
}

/**
 * A pasta do setor no Drive, criada na primeira vez. Duas pessoas abrindo ao
 * mesmo tempo podem criar duas pastas: a gravação no banco decide quem
 * vale, e a pasta que perdeu vai para a lixeira do Drive. Pasta que alguém
 * apagou pelo Google é criada de novo, vazia.
 */
export async function pastaDoSetor(c: Contexto, setor: SetorDosArquivos, raizId: string): Promise<string> {
  const admin = createAdminClient()
  const ws = c.workspace.id
  const ler = async () => {
    const { data } = await admin.from('drive_pastas_dos_setores').select('pasta_id,raiz_id').eq('setor_id', setor.id).eq('workspace_id', ws).maybeSingle()
    return data as { pasta_id: string; raiz_id: string } | null
  }
  const atual = await ler()
  if (atual && atual.raiz_id === raizId) {
    const pasta = await obterItemDoDrive(ws, atual.pasta_id)
    if (pasta && !pasta.naLixeira && pasta.mime === PASTA) return atual.pasta_id
  }

  const nova = await criarPastaNoDrive(ws, setor.nome, raizId)
  const linha = { setor_id: setor.id, workspace_id: ws, pasta_id: nova.id, raiz_id: raizId, criada_por: c.user.id, created_at: new Date().toISOString(), compartilhada_com: null }
  let venceu: boolean
  if (atual) {
    const { data } = await admin.from('drive_pastas_dos_setores').update(linha).eq('setor_id', setor.id).eq('pasta_id', atual.pasta_id).select('setor_id')
    venceu = Boolean(data?.length)
  } else {
    const { error } = await admin.from('drive_pastas_dos_setores').insert(linha)
    if (error && error.code !== '23505') throw new Error('Não foi possível guardar a pasta do setor.')
    venceu = !error
  }
  if (!venceu) {
    await moverParaLixeiraDoDrive(ws, nova.id).catch(() => undefined)
    const outra = await ler()
    if (!outra) throw new Error('Não foi possível guardar a pasta do setor. Tente de novo.')
    return outra.pasta_id
  }

  // Com o endereço do setor no Google, quem é do setor também abre a pasta
  // pela própria conta ("Abrir no Google"). Apelido que não é grupo é recusado
  // pelo Google, e tudo continua funcionando pelo Palácio.
  if (setor.email) {
    const ok = await compartilharNoDrive(ws, nova.id, setor.email).catch(() => false)
    if (ok) await admin.from('drive_pastas_dos_setores').update({ compartilhada_com: setor.email.toLowerCase() }).eq('setor_id', setor.id)
  }
  await admin.from('activity_log').insert({
    workspace_id: ws, actor_id: c.user.id, action: 'arquivos_pasta_do_setor_criada', entity_type: 'setor', entity_id: setor.id,
    metadata: { setor: setor.nome },
  })
  return nova.id
}

/**
 * O setor, a pasta dele e o caminho até o item, conferindo que o item mora
 * dentro da pasta. Sem itemId, o item é a própria pasta do setor.
 */
export async function noSetor(c: Contexto, setorId: string, itemId?: string) {
  const ws = c.workspace.id
  const [setor, conexao] = await Promise.all([setorQueAbro(c, setorId), conexaoPronta(ws)])
  const pasta = await pastaDoSetor(c, setor, conexao.raiz_id)
  const alvo = itemId || pasta
  const vistos = new Map<string, Awaited<ReturnType<typeof obterItemDoDrive>>>()
  const obter = async (id: string) => {
    if (!vistos.has(id)) vistos.set(id, await obterItemDoDrive(ws, id))
    return vistos.get(id) ?? null
  }
  const caminho: Degrau[] | null = await caminhoAte(alvo, pasta, obter)
  const item = vistos.get(alvo)
  if (!caminho || !item) throw new Error('Este item não está na pasta do setor (ou foi para a lixeira).')
  // O primeiro degrau é a pasta do setor: na tela ela leva o nome do setor, mesmo que alguém a renomeie no Google.
  caminho[0] = { id: pasta, nome: setor.nome }
  return { setor, pasta, caminho, item, conexao }
}
