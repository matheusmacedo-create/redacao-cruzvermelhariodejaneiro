import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicSupabaseEnv, SupabaseConfigError } from '@/lib/supabase/env'
import { enderecoNoDominioNovo } from '@/lib/dominio'
import {
  CABECALHO_DO_CAMINHO, COOKIE_DA_RENOVACAO, COOKIE_DO_MEMBRO, caminhoParaVoltar, diaDaRenovacao, naAreaDoMembro, opcoesDoCookieDoMembro, renovaCookieDoMembro,
} from '@/lib/membro/entrada'
import { CABECALHO_DO_ENDERECO, CABECALHO_DO_LIVRO, caminhoInterno, ehLivro, livroDoCaminho } from '@/lib/financeiro/livro'

export async function proxy(request: NextRequest) {
  // Domínio antigo (redacao.) → novo (palacio.), só para páginas: /api segue
  // respondendo nos dois (webhooks, formulário do site, .ics). lib/dominio.ts.
  const novo = enderecoNoDominioNovo(request.headers.get('host'), request.method, request.nextUrl.pathname, request.nextUrl.search)
  if (novo) return NextResponse.redirect(novo, 308)

  // Antes de qualquer NextResponse.next({ request }): o cabeçalho da área do
  // voluntário tem de ir junto nos dois retornos abaixo.
  const naArea = prepararAreaDoMembro(request)
  const seguir = prepararLivroDoFinanceiro(request)
  const { url, key, missing, invalid } = publicSupabaseEnv()

  // O proxy roda em toda requisição. Se ele lançar por falta de variável, o
  // site inteiro devolve 500 sem dizer o motivo — inclusive a página que
  // explicaria o problema. Sem credenciais, segue sem renovar a sessão.
  if (missing.length || invalid.length) {
    console.error('[proxy] Supabase não configurado.', new SupabaseConfigError(missing, invalid).message)
    return renovarSessaoDoMembro(request, naArea, seguir())
  }

  let response = seguir()
  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = seguir()
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getClaims, não getUser: renova a sessão vencida do mesmo jeito, mas confere
  // o token aqui mesmo com a chave pública do projeto (ES256), sem uma ida ao
  // servidor do Auth a cada requisição. A página ainda chama getUser() — é lá
  // que vale a checagem forte (conta desativada, sessão revogada).
  try {
    await supabase.auth.getClaims()
  } catch (cause) {
    // Supabase fora do ar não pode derrubar o site inteiro: as páginas já
    // tratam a ausência de sessão redirecionando para o login.
    console.error('[proxy] falha ao renovar a sessão:', cause instanceof Error ? cause.message : cause)
  }

  return renovarSessaoDoMembro(request, naArea, response)
}

// ---------------------------------------------------------------- Livros do Financeiro

/**
 * O livro do Financeiro vem do endereço (lib/financeiro/livro.ts):
 * /financeiro/... é a filial e /escola/financeiro/... é a Escola, que é
 * reescrito para as mesmas telas. O cabeçalho diz às telas e às server
 * actions qual é o livro; o que o navegador mande nele é sempre
 * sobrescrito (ou apagado, fora do Financeiro). Devolve como seguir: a
 * reescrita da Escola ou o caminho normal.
 */
function prepararLivroDoFinanceiro(request: NextRequest): () => NextResponse {
  const { pathname, searchParams } = request.nextUrl
  // As rotas de API do Financeiro (o pacote do contador) não têm o livro no
  // caminho: vem em ?livro=, conferido aqui do mesmo jeito.
  const pedido = searchParams.get('livro')
  const livro = livroDoCaminho(pathname) ?? (pathname.startsWith('/api/financeiro/') && ehLivro(pedido) ? pedido : null)
  if (livro) request.headers.set(CABECALHO_DO_LIVRO, livro)
  else request.headers.delete(CABECALHO_DO_LIVRO)
  if (livro) request.headers.set(CABECALHO_DO_ENDERECO, `${pathname}${request.nextUrl.search}`.slice(0, 500))
  else request.headers.delete(CABECALHO_DO_ENDERECO)
  if (livro !== 'escola') return () => NextResponse.next({ request })
  const destino = request.nextUrl.clone()
  destino.pathname = caminhoInterno(pathname)
  return () => NextResponse.rewrite(destino, { request })
}

// ---------------------------------------------------------------- Área do Voluntário
//
// Bloco isolado: a área do voluntário tem sessão própria (cookie cvrj_membro,
// ver lib/membro/sessao), fora do Supabase Auth, e nada daqui toca na sessão
// da equipe acima. Só age em /membro.

/**
 * Põe o caminho pedido num cabeçalho da requisição, para `exigirMembro()`
 * mandar à entrada com `?voltar=` quando a sessão acabou. O valor que o
 * navegador tenha mandado nesse cabeçalho é sempre sobrescrito (ou apagado).
 */
function prepararAreaDoMembro(request: NextRequest): boolean {
  const { pathname, search } = request.nextUrl
  if (!naAreaDoMembro(pathname)) return false
  const caminho = caminhoParaVoltar(pathname, search)
  if (caminho) request.headers.set(CABECALHO_DO_CAMINHO, caminho)
  else request.headers.delete(CABECALHO_DO_CAMINHO)
  return true
}

/**
 * Regrava o cookie da sessão do voluntário no máximo uma vez por dia (regras
 * em `renovaCookieDoMembro`). O banco já estende a sessão a cada acesso; sem
 * isto, o cookie vencia 30 dias depois do login mesmo com uso diário.
 */
function renovarSessaoDoMembro(request: NextRequest, naArea: boolean, response: NextResponse): NextResponse {
  if (!naArea) return response
  const token = request.cookies.get(COOKIE_DO_MEMBRO)?.value
  const hoje = diaDaRenovacao(Date.now())
  const renova = renovaCookieDoMembro({ metodo: request.method, caminho: request.nextUrl.pathname, token, renovadoEm: request.cookies.get(COOKIE_DA_RENOVACAO)?.value, hoje })
  if (!renova || !token) return response
  const opcoes = opcoesDoCookieDoMembro(process.env.NODE_ENV === 'production')
  response.cookies.set(COOKIE_DO_MEMBRO, token, opcoes)
  response.cookies.set(COOKIE_DA_RENOVACAO, hoje, opcoes)
  return response
}

// A consulta pública da trilha (/api/publico/) não tem sessão: fica fora, sem
// uma ida ao Supabase Auth a cada verificação.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|images/|api/publico/|sw.js|offline.html).*)'] }
