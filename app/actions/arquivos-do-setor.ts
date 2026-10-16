'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requirePermissao, requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { urlBase } from '@/lib/newsletter/contexto'
import { abrirEnvioNoDrive, criarPastaNoDrive, esquecerTokenDoDrive, listarPastaDoDrive, moverParaLixeiraDoDrive, obterItemDoDrive, renomearNoDrive } from '@/lib/google/drive'
import { noSetor } from '@/lib/arquivos/servidor'
import {
  ehIdDoDrive, idDaPastaNoLink, MAXIMO_POR_ENVIO, ordenarItens, PASTA, problemaDoNome, TAMANHO_MAXIMO, tamanhoLegivel, tipoDoItem,
  type Degrau, type ItemDoDrive, type TipoDoItem,
} from '@/lib/arquivos/regras'

/**
 * Os Arquivos do setor (lib/arquivos). Toda action começa com
 * requireWorkspace, confere que a pessoa abre o setor e que o item mora
 * dentro da pasta dele (noSetor) — o id que chega do navegador nunca basta.
 * Ligar o Drive e escolher a pasta da filial é de arquivos.configurar.
 */

type Resultado = { erro?: string; recado?: string }

const UUID = /^[0-9a-f-]{36}$/

export type ItemNaTela = {
  id: string
  nome: string
  mime: string
  tipo: TipoDoItem
  tamanho: number | null
  modificadoEm: string | null
  linkNoGoogle: string | null
  podeEditar: boolean
}

export type PastaAberta = {
  setorId: string
  id: string
  caminho: Degrau[]
  podeAcrescentar: boolean
  itens: ItemNaTela[]
  continuacao: string | null
}

const naTela = (i: ItemDoDrive): ItemNaTela => ({
  id: i.id, nome: i.nome, mime: i.mime, tipo: tipoDoItem(i.mime), tamanho: i.tamanho, modificadoEm: i.modificadoEm, linkNoGoogle: i.linkNoGoogle, podeEditar: i.podeEditar,
})

function conferirIds(setorId: string, ...ids: (string | undefined)[]) {
  if (!UUID.test(setorId)) throw new Error('Setor não encontrado.')
  for (const id of ids) if (id !== undefined && !ehIdDoDrive(id)) throw new Error('Item não encontrado.')
}

/** Abre uma pasta do setor (sem pastaId, a pasta do próprio setor). Com continuação, só a página seguinte. */
export async function abrirNosArquivos(setorId: string, pastaId?: string, continuacao?: string): Promise<{ erro?: string; pasta?: PastaAberta }> {
  try {
    conferirIds(setorId, pastaId)
    const contexto = await requireWorkspace()
    const { caminho, item } = await noSetor(contexto, setorId, pastaId)
    if (item.mime !== PASTA) throw new Error('Isto é um arquivo, não uma pasta.')
    const lista = await listarPastaDoDrive(contexto.workspace.id, item.id, continuacao && continuacao.length < 2000 ? continuacao : undefined)
    return {
      pasta: {
        setorId, id: item.id, caminho, podeAcrescentar: item.podeAcrescentar,
        itens: ordenarItens(lista.itens).map(naTela), continuacao: lista.continuacao,
      },
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir a pasta.') }
  }
}

export async function criarPastaNosArquivos(setorId: string, paiId: string, nome: string): Promise<Resultado> {
  try {
    conferirIds(setorId, paiId)
    const problema = problemaDoNome(nome)
    if (problema) throw new Error(problema)
    const contexto = await requireWorkspace()
    const { item } = await noSetor(contexto, setorId, paiId)
    if (item.mime !== PASTA) throw new Error('Escolha uma pasta.')
    await criarPastaNoDrive(contexto.workspace.id, nome.trim(), item.id)
    return { recado: `Pasta “${nome.trim()}” criada.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a pasta.') }
  }
}

export async function renomearNosArquivos(setorId: string, itemId: string, nome: string): Promise<Resultado> {
  try {
    conferirIds(setorId, itemId)
    const problema = problemaDoNome(nome)
    if (problema) throw new Error(problema)
    const contexto = await requireWorkspace()
    const { pasta, item } = await noSetor(contexto, setorId, itemId)
    if (item.id === pasta) throw new Error('A pasta do setor leva o nome do setor: renomeie o setor em Pessoas → Setores.')
    await renomearNoDrive(contexto.workspace.id, item.id, nome.trim())
    return { recado: `Agora se chama “${nome.trim()}”.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível renomear.') }
  }
}

export async function moverParaLixeiraNosArquivos(setorId: string, itemId: string): Promise<Resultado> {
  try {
    conferirIds(setorId, itemId)
    const contexto = await requireWorkspace()
    const { setor, pasta, item } = await noSetor(contexto, setorId, itemId)
    if (item.id === pasta) throw new Error('A pasta do setor não vai para a lixeira.')
    await moverParaLixeiraDoDrive(contexto.workspace.id, item.id)
    await createAdminClient().from('activity_log').insert({
      workspace_id: contexto.workspace.id, actor_id: contexto.user.id, action: 'arquivos_item_na_lixeira', entity_type: 'setor', entity_id: setor.id,
      metadata: { setor: setor.nome, item: item.nome, pasta: item.mime === PASTA },
    })
    return { recado: `“${item.nome}” foi para a lixeira do Google Drive. Dá para recuperar por lá em até 30 dias.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mover para a lixeira.') }
  }
}

export type EnvioPreparado = { nome: string; url: string }

/** A origem do Palácio aberto agora (produção ou prévia da Vercel): é para ela que o Google libera o envio. */
async function origemDoPedido(): Promise<string> {
  const h = await headers()
  const origem = h.get('origin') ?? ''
  try {
    const u = new URL(origem)
    if (u.protocol === 'https:' || u.hostname === 'localhost') return u.origin
  } catch { /* sem origem: a do Palácio em produção */ }
  return new URL(urlBase()).origin
}

/**
 * Abre no Google uma sessão de envio por arquivo, já dentro da pasta. O
 * navegador manda cada arquivo direto ao Google; quando termina, o arquivo
 * já está no Drive — não há segundo passo.
 */
export async function prepararEnvioAosArquivos(setorId: string, paiId: string, arquivos: { nome: string; tipo: string; tamanho: number }[]): Promise<{ erro?: string; envios?: EnvioPreparado[] }> {
  try {
    conferirIds(setorId, paiId)
    if (!Array.isArray(arquivos) || !arquivos.length) throw new Error('Escolha ao menos um arquivo.')
    if (arquivos.length > MAXIMO_POR_ENVIO) throw new Error(`Envie até ${MAXIMO_POR_ENVIO} arquivos de cada vez.`)
    for (const a of arquivos) {
      const problema = problemaDoNome(String(a?.nome ?? ''))
      if (problema) throw new Error(`${a?.nome || 'Arquivo sem nome'}: ${problema}`)
      if (!Number.isSafeInteger(a.tamanho) || a.tamanho <= 0) throw new Error(`${a.nome}: o arquivo está vazio.`)
      if (a.tamanho > TAMANHO_MAXIMO) throw new Error(`${a.nome}: tem ${tamanhoLegivel(a.tamanho)}; o limite pelo Palácio é ${tamanhoLegivel(TAMANHO_MAXIMO)} por arquivo.`)
    }
    const contexto = await requireWorkspace()
    const { setor, item } = await noSetor(contexto, setorId, paiId)
    if (item.mime !== PASTA) throw new Error('Escolha uma pasta.')
    if (!item.podeAcrescentar) throw new Error('A conta do Google conectada não pode pôr arquivos nesta pasta.')
    const origem = await origemDoPedido()
    const envios: EnvioPreparado[] = []
    for (const a of arquivos) {
      const tipo = /^[\w.+-]+\/[\w.+-]+$/.test(a.tipo) ? a.tipo : 'application/octet-stream'
      const url = await abrirEnvioNoDrive(contexto.workspace.id, { nome: a.nome.trim(), tipo, tamanho: a.tamanho, paiId: item.id, origem })
      envios.push({ nome: a.nome.trim(), url })
    }
    await createAdminClient().from('activity_log').insert({
      workspace_id: contexto.workspace.id, actor_id: contexto.user.id, action: 'arquivos_envio', entity_type: 'setor', entity_id: setor.id,
      metadata: { setor: setor.nome, pasta: item.nome, arquivos: arquivos.length },
    })
    return { envios }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

// ---------------------------------------------------------------- a ligação (arquivos.configurar)

/** A pasta da filial no Drive, de onde saem as pastas dos setores: pelo link que o administrador colou. */
export async function definirPastaDaFilial(_anterior: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const contexto = await requirePermissao('arquivos.configurar')
    const id = idDaPastaNoLink(String(formData.get('link') ?? ''))
    if (!id) throw new Error('Cole o link de uma pasta do Google Drive (o endereço que aparece no navegador com a pasta aberta).')
    const ws = contexto.workspace.id
    const admin = createAdminClient()
    const { data: conexao } = await admin.from('drive_conexao').select('raiz_id').eq('workspace_id', ws).maybeSingle()
    if (!conexao) throw new Error('Conecte o Google Drive antes de escolher a pasta.')
    const pasta = await obterItemDoDrive(ws, id)
    if (!pasta || pasta.naLixeira) throw new Error('A conta conectada não enxerga essa pasta. Compartilhe a pasta com ela como Editor, ou conecte a conta dona da pasta.')
    if (pasta.mime !== PASTA) throw new Error('Esse link é de um arquivo, não de uma pasta.')
    if (!pasta.podeAcrescentar) throw new Error('A conta conectada só pode ver essa pasta. Dê a ela acesso de Editor.')
    const { error } = await admin.from('drive_conexao').update({ raiz_id: pasta.id, raiz_nome: pasta.nome, updated_at: new Date().toISOString() }).eq('workspace_id', ws)
    if (error) throw new Error('Não foi possível guardar a pasta.')
    await admin.from('activity_log').insert({
      workspace_id: ws, actor_id: contexto.user.id, action: 'arquivos_pasta_da_filial', entity_type: 'integracao',
      metadata: { pasta: pasta.nome, anterior: conexao.raiz_id },
    })
    revalidatePath('/arquivos')
    return { recado: `Pasta “${pasta.nome}” escolhida. A pasta de cada setor nasce dentro dela na primeira vez que alguém do setor abrir.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível escolher a pasta.') }
  }
}

export async function desconectarDrive(): Promise<Resultado> {
  try {
    const contexto = await requirePermissao('arquivos.configurar')
    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: contexto.workspace.id, p_servico: 'google_drive' })
    if (error) throw new Error('Não foi possível remover a autorização.')
    esquecerTokenDoDrive(contexto.workspace.id)
    const admin = createAdminClient()
    await admin.from('drive_conexao').delete().eq('workspace_id', contexto.workspace.id)
    await admin.from('activity_log').insert({
      workspace_id: contexto.workspace.id, actor_id: contexto.user.id, action: 'arquivos_drive_desconectado', entity_type: 'integracao', metadata: {},
    })
    revalidatePath('/arquivos')
    return { recado: 'Google Drive desconectado. Os arquivos continuam no Drive; pelo Palácio, só voltam a abrir depois de reconectar. Para revogar também do lado do Google: myaccount.google.com/permissions.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desconectar.') }
  }
}
