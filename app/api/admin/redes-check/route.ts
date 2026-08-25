import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import {
  conta,
  listarPerfis,
  paginasDoFacebook,
  normalizarPaginas,
  chavesDaPagina,
  type PaginaFacebook,
  perfilPadrao,
  paginaFacebookPadrao,
  redesConectadas,
  semSegredo,
  UploadPostConfigError,
  UploadPostError,
} from '@/lib/publicacao/upload-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Etapa = { etapa: string; ok: boolean; detalhe: string }

/**
 * Conferência do Upload-Post, no mesmo espírito do /api/admin/ftp-check: antes
 * de escrever a tela de publicação, descobrir de fato se a chave vale, em que
 * plano ela está, quais contas da Cruz Vermelha estão conectadas e qual é o id
 * da página do Facebook. Cada uma dessas respostas muda o que precisa ser
 * construído — supor qualquer uma delas custaria retrabalho.
 *
 * A chave nunca aparece na resposta, nem em mensagem de erro do servidor.
 */
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const perfil = perfilPadrao()
  const etapas: Etapa[] = []

  const chave = process.env.UPLOAD_POST_API_KEY
  if (!chave) {
    return NextResponse.json({
      ok: false,
      faltando: ['UPLOAD_POST_API_KEY'],
      mensagem: new UploadPostConfigError(['UPLOAD_POST_API_KEY']).message,
    }, { status: 503 })
  }
  etapas.push({
    etapa: 'variáveis de ambiente',
    ok: true,
    detalhe: `perfil=${perfil} chave=${chave.length} caracteres`
      + ` paginaFacebook=${paginaFacebookPadrao() || '(não definida)'}`,
  })

  const falhar = (erro: unknown): NextResponse => {
    const status = erro instanceof UploadPostError ? erro.status : 0
    etapas.push({
      etapa: 'erro',
      ok: false,
      detalhe: semSegredo(erro instanceof Error ? erro.message : String(erro)).slice(0, 300),
    })
    return NextResponse.json({ ok: false, etapas }, { status: status === 401 ? 401 : 502 })
  }

  // 1. A chave é válida e em que plano está.
  let plano: string | undefined
  try {
    const { dados, limites } = await conta()
    plano = dados.plan
    etapas.push({
      etapa: 'chave',
      ok: true,
      detalhe: `válida · conta=${dados.email || '?'} · plano=${dados.plan || '?'}`
        + ` · limite restante na janela=${limites.restante ?? '?'}`,
    })
  } catch (erro) {
    return falhar(erro)
  }

  // 2. Lista os perfis existentes. Conferir NÃO pode criar nada: no plano
  // gratuito são dois perfis no total, e um perfil criado por engano — por
  // UPLOAD_POST_PROFILE apontar para um nome que não existe — queimaria uma
  // das duas vagas e ainda pareceria certo, porque perfil vazio não dá erro,
  // só não publica em lugar nenhum.
  let redes: string[] = []
  let nomes: string[] = []
  let existe = false
  try {
    const { dados } = await listarPerfis()
    const lista = dados.profiles ?? []
    nomes = lista.map((p) => p.username)
    etapas.push({
      etapa: 'perfis do plano',
      ok: true,
      detalhe: `${lista.length} em uso de ${dados.limit ?? '?'} permitidos`
        + (nomes.length ? ` · nomes exatos: ${nomes.join(' | ')}` : ''),
    })

    const encontrado = lista.find((p) => p.username === perfil)
    existe = Boolean(encontrado)
    redes = encontrado ? redesConectadas(encontrado) : []

    etapas.push({
      etapa: 'perfil configurado',
      ok: existe,
      detalhe: !existe
        ? `UPLOAD_POST_PROFILE está como "${perfil}", que não existe nesta conta.`
          + ` Copie um dos nomes acima para a variável — nenhum perfil foi criado.`
        : redes.length
          ? `${perfil} · conectadas: ${redes.join(', ')}`
          : `${perfil} existe, mas nenhuma rede foi conectada ainda`,
    })
  } catch (erro) {
    return falhar(erro)
  }

  // 4. O id da página do Facebook, que precisa ir em toda publicação.
  let paginas: PaginaFacebook[] = []
  let chaves: string[] = []
  if (redes.includes('facebook')) {
    try {
      const { dados } = await paginasDoFacebook(perfil)
      const brutas = dados.pages || []
      paginas = normalizarPaginas(brutas)
      chaves = chavesDaPagina(brutas)
      etapas.push({
        etapa: 'páginas do Facebook',
        // Receber páginas e não conseguir ler nenhuma é falha, não sucesso
        // vazio: sem id não há como publicar, e o silêncio esconderia isso.
        ok: paginas.length > 0 || brutas.length === 0,
        detalhe: paginas.length
          ? `${paginas.length} encontradas · ${paginas.map((p) => `${p.nome} = ${p.id}`).join(' · ')}`
          : brutas.length
            ? `${brutas.length} páginas vieram, mas sem id reconhecível.`
              + ` Chaves recebidas: ${chaves.join(', ') || '(nenhuma)'}`
            : 'nenhuma página encontrada nesta conta',
      })
    } catch (erro) {
      etapas.push({ etapa: 'páginas do Facebook', ok: false, detalhe: semSegredo(String(erro)).slice(0, 200) })
    }
  } else {
    etapas.push({ etapa: 'páginas do Facebook', ok: true, detalhe: 'pulado: Facebook não conectado' })
  }

  return NextResponse.json({
    ok: existe,
    perfil,
    plano,
    redesConectadas: redes,
    paginasFacebook: paginas,
    chavesDaPaginaFacebook: chaves,
    perfisDisponiveis: nomes,
    proximoPasso: !existe
      ? `Ajuste UPLOAD_POST_PROFILE para um dos nomes em perfisDisponiveis.`
      : redes.length
        ? 'Redes conectadas. Dá para publicar.'
        : 'Abra /api/admin/redes-conectar para autorizar as contas da instituição.',
    etapas,
  })
}
