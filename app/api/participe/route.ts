import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerFormulario, TERMO_VERSAO } from '@/lib/participantes/regras'
import { nomesDosSetores } from '@/lib/setores'
import { notificar } from '@/lib/notificacoes/servidor'
import { gerentesDoVoluntariado } from '@/lib/membro/comunicacao'
import { LIMITE_DA_FOTO, conferirFoto } from '@/lib/membro/foto'
import { trocarFoto } from '@/lib/membro/foto-servidor'

export const dynamic = 'force-dynamic'

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * A inscrição pública de voluntários. Entra como "inscrição pendente" e só
 * vira participante quando a coordenação aprova. Armadilhas contra robôs:
 * um campo escondido que pessoa não preenche e um tempo mínimo de
 * preenchimento; o banco ainda limita 5 inscrições por hora por origem.
 */
export async function POST(request: Request) {
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status })
  let f: FormData
  try { f = await request.formData() } catch { return responder(400, { erro: 'Formulário inválido.' }) }

  // Robô: preencheu o campo invisível, ou enviou rápido demais. Responde como
  // se tivesse dado certo, para não ensinar o robô a contornar.
  const inicio = Number(f.get('_inicio') ?? 0)
  if (String(f.get('site') ?? '') || !inicio || Date.now() - inicio < 4000) return responder(200, { ok: true })

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  if (!ws) return responder(503, { erro: 'Inscrições indisponíveis no momento.' })

  const { dados, erros } = lerFormulario(f, hoje(), { publico: true, setores: await nomesDosSetores(admin, ws.id as string) })
  if (erros.length) return responder(422, { erro: erros.join(' ') })
  dados.vinculo = f.get('vinculo') === 'jovem' ? 'jovem' : 'voluntario'
  // A foto é opcional e já vem reduzida pelo navegador (lib/membro/preparar-foto.ts);
  // aqui só se confere, antes de inscrever, para não gravar inscrição e recusar a foto depois.
  const arquivo = f.get('foto')
  let foto: Uint8Array | null = null
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > LIMITE_DA_FOTO) return responder(422, { erro: 'A foto chegou grande demais. Escolha outra ou envie a inscrição sem foto.' })
    const r = conferirFoto(new Uint8Array(await arquivo.arrayBuffer()))
    if ('erro' in r) return responder(422, { erro: r.erro.replace(' Tente de novo pela tela do perfil.', ' Escolha outra ou envie a inscrição sem foto.') })
    foto = r.bytes
  }
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido'
  const ipHash = createHash('sha256').update(`participe:${ip}`).digest('hex')
  const { data: participanteId, error } = await admin.rpc('inscrever_participante', { p_workspace_id: ws.id, p: dados, p_ip_hash: ipHash, p_versao_termo: TERMO_VERSAO })
  if (error) return responder(error.code === 'P0001' ? 422 : 500, { erro: error.code === 'P0001' ? error.message : 'Não foi possível enviar a inscrição agora. Tente de novo em instantes.' })
  // A inscrição já está gravada: se a foto falhar, a pessoa não precisa saber (ela pode
  // mandar outra pela Área do Voluntário depois de aprovada), e a coordenação vê a ficha sem foto.
  let comFoto = false
  if (foto && typeof participanteId === 'string') {
    try {
      await trocarFoto({
        workspaceId: ws.id as string, participanteId, bytes: foto,
        definir: async (caminho) => {
          const { error: e } = await admin.rpc('definir_foto_na_inscricao', { p_participante_id: participanteId, p_foto_path: caminho })
          if (e) throw new Error(e.message)
          return null
        },
      })
      comFoto = true
    } catch (causa) {
      console.error('[participe] foto não gravada:', causa instanceof Error ? causa.message : causa)
    }
  }
  // Quem gerencia o Voluntariado fica sabendo (sino e, conforme a preferência, e-mail).
  await notificar(admin, {
    workspaceId: ws.id, para: await gerentesDoVoluntariado(ws.id), atorId: null, categoria: 'aprovacoes',
    titulo: 'Nova inscrição de voluntário', mensagem: `${String(dados.nome ?? '').slice(0, 120)} se inscreveu pelo formulário público${comFoto ? ', com foto' : ''}.`,
    link: '/voluntariado?aba=inscricoes', botao: 'Ver inscrições', nota: 'Aprove ou recuse em Voluntários → Inscrições pendentes.',
  })
  return responder(200, { ok: true })
}
