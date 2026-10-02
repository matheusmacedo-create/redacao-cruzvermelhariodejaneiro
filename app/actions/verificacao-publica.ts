'use server'

import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { cpfValido } from '@/lib/participantes/regras'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { avisarCoordenacao, ehToken, hashDoLink, verificacaoDoToken, type VerificacaoAberta } from '@/lib/participantes/verificacao/link'
import { conferirESelar, prepararEnvio, removerDoStorage } from '@/lib/participantes/verificacao/arquivos'
import {
  VERIFICACAO_TERMO_VERSAO, atestadoAceitavel, ehAntecedentes, ehCategoriaDeDocumento, lerReferencias, lerRegistroProfissional, type Lado,
} from '@/lib/participantes/verificacao/regras'

/**
 * A página pública /verificacao/<token>: o candidato aceita o termo, manda
 * os documentos, as referências e o registro profissional, e conclui. Sem
 * login — quem autoriza é o token (14 dias, várias visitas até concluir),
 * conferido pelas funções do banco, que também registram na auditoria que
 * foi a própria pessoa. O servidor confere o conteúdo de cada arquivo e
 * avisa a coordenação quando o envio termina.
 */

type Resultado = { erro?: string; ok?: boolean }
const SEM_LINK = 'Este link não vale. Peça um novo à coordenação do Voluntariado.'
const VENCIDO = 'Este link venceu ou já foi usado. Peça um novo à coordenação do Voluntariado.'

function doBanco(error: { code?: string; message?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  throw new Error(padrao)
}

async function abrir(token: string): Promise<VerificacaoAberta> {
  if (!ehToken(token)) throw new Error(SEM_LINK)
  const v = await verificacaoDoToken(token)
  if (!v) throw new Error(SEM_LINK)
  if (!v.aberto) throw new Error(VENCIDO)
  return v
}

/** Até 20 aceites por hora por origem: o CPF é conferido contra o cadastro, e ninguém testa CPFs à vontade. */
async function limitarPorOrigem() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'desconhecido'
  const ipHash = createHash('sha256').update(`verificacao:${ip}`).digest('hex')
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await admin.from('participantes_inscricoes_tentativas').select('ip_hash', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('criado_em', desde)
  if ((count ?? 0) >= 20) throw new Error('Muitas tentativas seguidas deste endereço. Tente de novo mais tarde.')
  await admin.from('participantes_inscricoes_tentativas').insert({ ip_hash: ipHash })
}

export async function aceitarTermo(token: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehToken(token)) throw new Error(SEM_LINK)
    if (String(formData.get('aceito') ?? '') !== 'sim') throw new Error('Marque que leu o termo e autoriza a verificação.')
    const cpf = String(formData.get('cpf') ?? '').replace(/\D/g, '')
    if (!cpfValido(cpf)) throw new Error('Confira o CPF: ele não parece certo.')
    await limitarPorOrigem()
    const { error } = await createAdminClient().rpc('aceitar_termo_pelo_token', { p_token_hash: hashDoLink(token), p_versao: VERIFICACAO_TERMO_VERSAO, p_cpf: cpf })
    if (error) doBanco(error, 'Não foi possível registrar o aceite agora. Tente de novo em instantes.')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o aceite agora.') }
  }
}

export async function prepararEnvioPeloLink(token: string, categoria: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const v = await abrir(token)
    if (!v.termoAceito) throw new Error('Aceite o termo antes de enviar documentos.')
    if (!ehCategoriaDeDocumento(categoria)) throw new Error('Escolha o tipo do documento.')
    return await prepararEnvio(v.workspaceId, v.participanteId, tipo, tamanho)
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

export async function registrarArquivoPeloLink(token: string, caminho: string, nomeOriginal: string, dados: { categoria: string; lado?: Lado | null; dataDocumento?: string | null; codigo?: string | null }): Promise<Resultado & { id?: string }> {
  const admin = createAdminClient()
  try {
    if (!ehToken(token)) throw new Error(SEM_LINK)
    if (!ehCategoriaDeDocumento(dados.categoria)) throw new Error('Escolha o tipo do documento.')
    if (ehAntecedentes(dados.categoria)) {
      const r = atestadoAceitavel(dados.dataDocumento ?? '', hojeEmSaoPaulo())
      if (!r.ok) throw new Error(r.erro)
    }
    const { data: id, error } = await admin.rpc('registrar_arquivo_pelo_token', {
      p_token_hash: hashDoLink(token), p_caminho: caminho,
      p: { categoria: dados.categoria, lado: dados.lado ?? null, data_documento: dados.dataDocumento ?? null, codigo_autenticacao: dados.codigo ?? null, nome_original: nomeOriginal.slice(0, 200) },
    })
    if (error || !id) doBanco(error, 'Não foi possível registrar o arquivo.')
    await conferirESelar(String(id), caminho, async () => { await admin.rpc('excluir_arquivo_pelo_token', { p_token_hash: hashDoLink(token), p_id: id }) })
    return { id: String(id) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

export async function excluirArquivoPeloLink(token: string, id: string): Promise<Resultado> {
  try {
    if (!ehToken(token) || !/^[0-9a-f-]{36}$/.test(id)) throw new Error(SEM_LINK)
    const { data: caminho, error } = await createAdminClient().rpc('excluir_arquivo_pelo_token', { p_token_hash: hashDoLink(token), p_id: id })
    if (error) doBanco(error, 'Não foi possível remover o arquivo.')
    await removerDoStorage(typeof caminho === 'string' ? caminho : null)
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover o arquivo.') }
  }
}

/** O registro profissional (passo 4) ou as referências (passo 5), conforme o que vier no formulário. */
export async function guardarDadosPeloLink(token: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehToken(token)) throw new Error(SEM_LINK)
    const f = Object.fromEntries(formData.entries())
    const p: Record<string, unknown> = {}
    if (f.passo === 'registro') {
      const { registro, erros } = lerRegistroProfissional(f)
      if (erros.length) throw new Error(erros.join(' '))
      p.registro_profissional = registro
    } else if (f.passo === 'referencias') {
      const { referencias, erros } = lerReferencias(f)
      if (erros.length) throw new Error(erros.join(' '))
      p.referencias = referencias
    } else throw new Error('Passo desconhecido.')
    const { error } = await createAdminClient().rpc('guardar_dados_pelo_token', { p_token_hash: hashDoLink(token), p })
    if (error) doBanco(error, 'Não foi possível guardar agora. Tente de novo em instantes.')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar agora.') }
  }
}

export async function concluirEnvio(token: string): Promise<Resultado> {
  try {
    if (!ehToken(token)) throw new Error(SEM_LINK)
    const { data, error } = await createAdminClient().rpc('concluir_envio_pelo_token', { p_token_hash: hashDoLink(token) })
    if (error) doBanco(error, 'Não foi possível concluir agora. Tente de novo em instantes.')
    const linha = (Array.isArray(data) ? data[0] : data) as { participante_id: string; workspace_id: string; nome: string } | undefined
    if (!linha) throw new Error(VENCIDO)
    after(() => avisarCoordenacao({ workspaceId: linha.workspace_id, participanteId: linha.participante_id, nome: linha.nome }))
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível concluir agora.') }
  }
}
