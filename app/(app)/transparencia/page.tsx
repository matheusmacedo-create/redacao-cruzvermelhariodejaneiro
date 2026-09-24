import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { PainelDaTransparencia, type Aba } from '@/components/app/transparencia/painel'
import type { DocumentoNaTela, VersaoNaTela } from '@/components/app/transparencia/documentos'
import type { ParceriaNaTela } from '@/components/app/transparencia/parcerias'
import { codigosDaTrilha, hojeEmSaoPaulo, maisNovo, nomesDasPessoas } from '@/components/app/transparencia/servidor'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { tituloDaArea } from '@/lib/navegacao'
import { origemDoSite } from '@/lib/auditoria/consulta'
import { portalAberto } from '@/lib/transparencia/paginas'
import { ehCategoria, ehInstrumento, ehSituacao } from '@/lib/transparencia/regras'

export const metadata = { title: tituloDaArea('/transparencia') }

export const dynamic = 'force-dynamic'

type LinhaDeVersao = {
  id: string; nome_original: string; tamanho: number; sha256: string; arquivo_publico: string | null
  publicado_em: string | null; publicado_por: string | null; enviado_por: string | null; created_at: string
  removido_do_site_em: string | null
}
type LinhaDeDocumento = {
  id: string; categoria: string; titulo: string; descricao: string | null; periodo: string | null; ordem: number
  retirado_em: string | null; retirado_por: string | null; motivo_retirada: string | null; created_at: string
  transparencia_versoes: LinhaDeVersao[] | null
}
type LinhaDeParceria = {
  id: string; instrumento: string; numero: string | null; orgao: string; orgao_cnpj: string | null; objeto: string
  data_assinatura: string | null; vigencia_inicio: string | null; vigencia_fim: string | null
  valor_total: number | string | null; valor_liberado: number | string | null
  situacao_prestacao: string; prestacao_final_em: string | null; equipe: unknown; observacao: string | null
  publicado_em: string | null; retirado_em: string | null; motivo_retirada: string | null; created_at: string
}

const valor = (v: number | string | null) => (v === null || v === undefined || v === '' ? null : String(v))

/**
 * O portal de transparência por dentro: os documentos (cada um com as versões
 * de PDF que passaram por ele) e as parcerias com o poder público. O que está
 * aqui como "no ar" é o que a página pública mostra; o que é rascunho só
 * existe aqui.
 */
export default async function TransparenciaPage({ searchParams }: { searchParams: Promise<{ aba?: string | string[] }> }) {
  const context = await requireWorkspace()
  if (!pode(context.role, 'transparencia.gerenciar')) {
    return <div><PageHeader title="Transparência" /><Card className="flex items-start gap-3 p-6"><ShieldAlert className="mt-0.5 size-5 text-muted-foreground" /><div><p className="font-medium">Área restrita a administradores</p><p className="mt-1 text-sm text-muted-foreground">Publicar documentos e parcerias no portal de transparência é tarefa da administração. Se algo precisa entrar ou sair do portal, fale com um administrador do espaço.</p></div></Card></div>
  }

  const { aba } = await searchParams
  const supabase = await createClient()
  const workspaceId = context.workspace.id

  // Leitura pelo cliente da pessoa: o RLS dessas tabelas só deixa admin ler.
  const [docs, parcs] = await Promise.all([
    supabase.from('transparencia_documentos')
      .select('id,categoria,titulo,descricao,periodo,ordem,retirado_em,retirado_por,motivo_retirada,created_at,transparencia_versoes(id,nome_original,tamanho,sha256,arquivo_publico,publicado_em,publicado_por,enviado_por,created_at,removido_do_site_em)')
      .eq('workspace_id', workspaceId).order('ordem').order('created_at'),
    supabase.from('transparencia_parcerias')
      .select('id,instrumento,numero,orgao,orgao_cnpj,objeto,data_assinatura,vigencia_inicio,vigencia_fim,valor_total,valor_liberado,situacao_prestacao,prestacao_final_em,equipe,observacao,publicado_em,retirado_em,motivo_retirada,created_at')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
  ])

  const cabecalho = <PageHeader title="Transparência" description="Os documentos e as parcerias com o poder público que a filial publica no portal de transparência do site. Publicado não se troca em silêncio: arquivo novo vira versão nova, e cada publicação entra na trilha pública de auditoria." />

  if (docs.error || parcs.error) {
    console.error('[transparencia] leitura:', docs.error?.message ?? parcs.error?.message)
    return <div>{cabecalho}<Card className="flex items-start gap-3 p-6"><TriangleAlert className="mt-0.5 size-5 text-warning-foreground" /><div><p className="font-medium">Não foi possível ler o portal agora</p><p className="mt-1 text-sm text-muted-foreground">Tente de novo em instantes. Se persistir, confira se a migração do portal (cvrj_transparencia, em supabase/migrations) já foi aplicada neste banco.</p></div></Card></div>
  }

  const linhasDeDocumentos = ((docs.data ?? []) as LinhaDeDocumento[]).filter((d) => ehCategoria(d.categoria))
  const linhasDeParcerias = ((parcs.data ?? []) as LinhaDeParceria[]).filter((p) => ehInstrumento(p.instrumento) && ehSituacao(p.situacao_prestacao))

  // Depois da permissão conferida: a função da trilha só aceita a chave de serviço.
  const [codigosDeDocumentos, codigosDeParcerias, nomes] = await Promise.all([
    codigosDaTrilha('documento', linhasDeDocumentos.map((d) => d.id)),
    codigosDaTrilha('parceria', linhasDeParcerias.map((p) => p.id)),
    nomesDasPessoas(supabase, linhasDeDocumentos.flatMap((d) => [d.retirado_por, ...(d.transparencia_versoes ?? []).flatMap((v) => [v.publicado_por, v.enviado_por])])),
  ])
  const nome = (id: string | null) => (id ? nomes.get(id) ?? null : null)

  const documentos: DocumentoNaTela[] = linhasDeDocumentos.map((d) => {
    const versoes = d.transparencia_versoes ?? []
    // O código de cada arquivo é o registro mais novo com aquele SHA-256: editar
    // a ficha registra de novo o mesmo arquivo, e vale o registro de agora.
    const paraTela = (v: LinhaDeVersao): VersaoNaTela => ({
      id: v.id, nome: v.nome_original, tamanho: Number(v.tamanho), sha256: v.sha256, arquivoPublico: v.arquivo_publico,
      publicadoEm: v.publicado_em, publicadoPor: nome(v.publicado_por), enviadoEm: v.created_at, enviadoPor: nome(v.enviado_por),
      removidoDoSiteEm: v.removido_do_site_em,
      codigo: v.publicado_em ? maisNovo(codigosDeDocumentos, (c) => c.referencia_id === d.id && c.hash_arquivo === v.sha256)?.codigo ?? null : null,
    })
    const publicadas = versoes.filter((v) => v.publicado_em).sort((a, b) => Date.parse(b.publicado_em!) - Date.parse(a.publicado_em!)).map(paraTela)
    const pendentes = versoes.filter((v) => !v.publicado_em).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(paraTela)
    return {
      id: d.id, categoria: d.categoria as DocumentoNaTela['categoria'], titulo: d.titulo, descricao: d.descricao, periodo: d.periodo, ordem: d.ordem,
      retiradoEm: d.retirado_em, retiradoPor: nome(d.retirado_por), motivoRetirada: d.motivo_retirada, criadoEm: d.created_at,
      atual: publicadas[0] ?? null, anteriores: publicadas.slice(1), pendentes,
    }
  })

  const parcerias: ParceriaNaTela[] = linhasDeParcerias.map((p) => {
    const registro = p.publicado_em ? maisNovo(codigosDeParcerias, (c) => c.referencia_id === p.id) : null
    const equipe = (Array.isArray(p.equipe) ? p.equipe : []) as { funcao?: unknown; remuneracao?: unknown }[]
    return {
      id: p.id, instrumento: p.instrumento as ParceriaNaTela['instrumento'], numero: p.numero, orgao: p.orgao, orgaoCnpj: p.orgao_cnpj, objeto: p.objeto,
      dataAssinatura: p.data_assinatura, vigenciaInicio: p.vigencia_inicio, vigenciaFim: p.vigencia_fim,
      valorTotal: valor(p.valor_total), valorLiberado: valor(p.valor_liberado),
      situacao: p.situacao_prestacao as ParceriaNaTela['situacao'], prestacaoFinalEm: p.prestacao_final_em,
      equipe: equipe.map((e) => ({ funcao: String(e.funcao ?? ''), remuneracao: String(e.remuneracao ?? '') })),
      observacao: p.observacao, publicadoEm: p.publicado_em, retiradoEm: p.retirado_em, motivoRetirada: p.motivo_retirada, criadoEm: p.created_at,
      codigo: registro?.codigo ?? null, hash: registro?.hash ?? null,
    }
  })

  const abaInicial: Aba = aba === 'parcerias' ? 'parcerias' : 'documentos'

  return (
    <div>
      {cabecalho}
      <PainelDaTransparencia
        documentos={documentos}
        parcerias={parcerias}
        trilhaDisponivel={codigosDeDocumentos !== null && codigosDeParcerias !== null}
        aberto={portalAberto()}
        endereco={`${origemDoSite()}/transparencia/`}
        hoje={hojeEmSaoPaulo()}
        abaInicial={abaInicial}
      />
    </div>
  )
}
