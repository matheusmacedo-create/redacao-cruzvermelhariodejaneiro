import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { gerentesDoVoluntariado } from '@/lib/membro/comunicacao'
import { TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, conteudoConfere, ehTipoAceito } from '@/lib/rh/regras'
import { DIAS_DE_AVISO_DA_RENOVACAO, dataCurta, ehAntecedentes, somarDias } from './regras'

/**
 * Os arquivos da verificação no Storage (bucket privado voluntarios-arquivos,
 * mesmo desenho do dossiê do RH): o navegador manda direto por um link de
 * envio de uso único, o servidor confere o conteúdo e sela a impressão
 * digital; abrir passa pelo servidor, que assina um link de um minuto.
 */

export const BUCKET_DE_VOLUNTARIOS = 'voluntarios-arquivos'
const PRAZO_DO_ENVIO_S = 60 * 60 * 2

export const caminhoDoArquivo = (workspaceId: string, participanteId: string, tipo: keyof typeof TIPOS_DE_ARQUIVO) => `${workspaceId}/${participanteId}/${randomUUID()}.${TIPOS_DE_ARQUIVO[tipo]}`

/** Primeiro passo: o link de envio de uso único (vale 2 horas; quem chama registra logo depois de subir). */
export async function prepararEnvio(workspaceId: string, participanteId: string, tipo: string, tamanho: number): Promise<{ caminho: string; token: string }> {
  if (!ehTipoAceito(tipo)) throw new Error('Envie PDF, JPG, PNG ou WEBP.')
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('O arquivo pode ter até 20 MB.')
  const caminho = caminhoDoArquivo(workspaceId, participanteId, tipo)
  const { data, error } = await createAdminClient().storage.from(BUCKET_DE_VOLUNTARIOS).createSignedUploadUrl(caminho)
  if (error || !data) throw new Error('Não foi possível preparar o envio.')
  return { caminho, token: data.token }
}

/**
 * Terceiro passo: o servidor lê o arquivo, confere que o conteúdo é mesmo do
 * tipo declarado e grava a impressão digital. Arquivo que não confere é
 * excluído (pela função passada, que sabe se é a coordenação ou o candidato
 * excluindo) e apagado do Storage.
 */
export async function conferirESelar(arquivoId: string, caminho: string, excluir: () => Promise<unknown>): Promise<void> {
  const admin = createAdminClient()
  const { data: blob, error } = await admin.storage.from(BUCKET_DE_VOLUNTARIOS).download(caminho)
  const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
  if (error || !bytes || !conteudoConfere(blob?.type ?? '', bytes)) {
    await excluir().catch(() => undefined)
    await admin.storage.from(BUCKET_DE_VOLUNTARIOS).remove([caminho]).catch(() => undefined)
    throw new Error('O conteúdo do arquivo não confere com o tipo (PDF, JPG, PNG ou WEBP). Envie o arquivo original.')
  }
  await admin.rpc('selar_arquivo_participante', { p_id: arquivoId, p_sha256: createHash('sha256').update(bytes).digest('hex') })
}

export async function baixarArquivo(caminho: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const { data: blob, error } = await createAdminClient().storage.from(BUCKET_DE_VOLUNTARIOS).download(caminho)
  if (error || !blob) throw new Error('Não foi possível abrir o arquivo.')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type }
}

export async function removerDoStorage(caminho: string | null | undefined): Promise<void> {
  if (!caminho) return
  await createAdminClient().storage.from(BUCKET_DE_VOLUNTARIOS).remove([caminho]).catch(() => undefined)
}

/** Apaga a pasta inteira da pessoa (recusa da inscrição e anonimização): o banco já tirou ou marcou as linhas. */
export async function removerPastaDoParticipante(workspaceId: string, participanteId: string): Promise<number> {
  const admin = createAdminClient()
  const pasta = `${workspaceId}/${participanteId}`
  let apagados = 0
  for (let volta = 0; volta < 10; volta++) {
    const { data } = await admin.storage.from(BUCKET_DE_VOLUNTARIOS).list(pasta, { limit: 100 })
    const nomes = (data ?? []).filter((o) => o.name).map((o) => `${pasta}/${o.name}`)
    if (!nomes.length) break
    const { error } = await admin.storage.from(BUCKET_DE_VOLUNTARIOS).remove(nomes)
    if (error) { console.error('[verificacao] pasta não apagada:', error.message); break }
    apagados += nomes.length
    if (nomes.length < 100) break
  }
  return apagados
}

/**
 * Rotina diária: o atestado de antecedentes de quem está ativo vence em 15
 * dias (Lei 14.811: renovar a cada 6 meses) ou venceu ontem → aviso a quem
 * gerencia o Voluntariado, com o caminho da ficha. Ignora quem já tem um
 * atestado mais novo guardado.
 */
export async function avisarRenovacoesDeAntecedentes(admin: ReturnType<typeof createAdminClient>, hoje: string): Promise<number> {
  try {
    const dias = [somarDias(hoje, DIAS_DE_AVISO_DA_RENOVACAO), somarDias(hoje, -1)]
    const { data } = await admin.from('participantes_arquivos').select('id, workspace_id, participante_id, categoria, data_documento, vence_em')
      .is('excluido_em', null).in('categoria', ['antecedentes_pcerj', 'antecedentes_pf']).in('vence_em', dias).limit(500)
    let avisos = 0
    for (const a of data ?? []) {
      const { data: maisNovo } = await admin.from('participantes_arquivos').select('id').eq('participante_id', a.participante_id).is('excluido_em', null)
        .in('categoria', ['antecedentes_pcerj', 'antecedentes_pf']).gt('data_documento', a.data_documento as string).limit(1)
      if (maisNovo?.length) continue
      const { data: p } = await admin.from('participantes').select('nome, nome_social, situacao, anonimizado_em').eq('id', a.participante_id).maybeSingle()
      if (!p || p.situacao !== 'ativo' || p.anonimizado_em) continue
      const nome = ((p.nome_social as string | null) || (p.nome as string)) ?? 'Voluntário'
      const venceu = (a.vence_em as string) < hoje
      await notificar(admin, {
        workspaceId: a.workspace_id as string, para: await gerentesDoVoluntariado(a.workspace_id as string), atorId: null, categoria: 'aprovacoes',
        titulo: venceu ? `O atestado de antecedentes de ${nome} venceu` : `O atestado de antecedentes de ${nome} vence em ${DIAS_DE_AVISO_DA_RENOVACAO} dias`,
        mensagem: `${ehAntecedentes(String(a.categoria)) ? 'Emitido' : 'Guardado'} em ${dataCurta(a.data_documento as string)}; a lei pede renovação a cada 6 meses (até ${dataCurta(a.vence_em as string)}). Peça um novo pelo link da ficha.`,
        link: `/voluntariado/${a.participante_id}#verificacao`, botao: 'Abrir a ficha',
      })
      avisos++
    }
    return avisos
  } catch (causa) {
    console.error('[verificacao] renovações:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}

export { PRAZO_DO_ENVIO_S }
