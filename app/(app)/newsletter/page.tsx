import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, remetente, respostaPara } from '@/lib/newsletter/resend'
import { Central, type Inscrito, type Edicao } from './central'

export const dynamic = 'force-dynamic'

/**
 * A Central de e-mail: quem está na lista, como ela cresceu, e o que já saiu.
 *
 * Lê pelo cliente administrativo. A tabela tem política de leitura para
 * membros do espaço, então o cliente de sessão também funcionaria; o
 * administrativo é usado por consistência com as ações desta tela, que
 * PRECISAM dele (não há política de escrita, de propósito). A autorização é
 * conferida aqui em cima, com requireWorkspace().
 *
 * O estado do envio NÃO é conferido no carregamento. Saber se o domínio está
 * verificado é uma chamada ao Resend, e pendurá-la aqui faria a tela abrir na
 * velocidade de um serviço externo — a mesma razão pela qual as redes
 * conectadas ficam fora da página da matéria. O botão "Conferir envio" busca
 * o diagnóstico quando alguém quer.
 */

/** Quantas linhas a tela carrega. Busca e filtro acontecem sobre estas. */
const LIMITE_DA_TELA = 500

export default async function NewsletterPage() {
  const context = await requireWorkspace()
  const admin = createAdminClient()
  const espaco = context.workspace.id

  const contar = async (estado?: string) => {
    let q = admin.from('newsletter_inscritos').select('id', { count: 'exact', head: true }).eq('workspace_id', espaco)
    if (estado) q = q.eq('estado', estado)
    const { count } = await q
    return count ?? 0
  }

  const [total, confirmados, pendentes, descadastrados, invalidos] = await Promise.all([
    contar(), contar('confirmado'), contar('pendente'), contar('descadastrado'), contar('invalido'),
  ])

  // A lista da tela e a série do gráfico saem de consultas diferentes: a
  // primeira traz tudo o que a tabela mostra e é limitada; a segunda traz só a
  // data e o estado, então cabe a base inteira. Calcular o gráfico a partir da
  // página limitada faria os meses antigos encolherem sozinhos conforme a
  // lista crescesse — um erro que ninguém perceberia.
  const [{ data: linhas }, { data: paraOGrafico }, { data: edicoes }] = await Promise.all([
    admin.from('newsletter_inscritos')
      .select('id, email, nome, estado, origem, created_at, confirmado_em, descadastrado_em')
      .eq('workspace_id', espaco).order('created_at', { ascending: false }).limit(LIMITE_DA_TELA),
    admin.from('newsletter_inscritos')
      .select('created_at, estado').eq('workspace_id', espaco).limit(50_000),
    admin.from('package_destinations')
      .select('id, estado, external_url, erro, publicado_em, agendar_para, extras, social_packages(titulo_interno)')
      .eq('workspace_id', espaco).eq('canal', 'newsletter')
      .order('created_at', { ascending: false }).limit(20),
  ])

  const inscritos = (linhas ?? []) as Inscrito[]

  // Últimos 6 meses, incluindo o atual. Meses sem inscrição continuam na série
  // — um buraco na sequência diz mais do que a ausência da barra.
  const agora = new Date()
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (5 - i), 1))
    return { chave: d.toISOString().slice(0, 7), rotulo: d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''), quantos: 0 }
  })
  for (const linha of paraOGrafico ?? []) {
    const chave = String(linha.created_at).slice(0, 7)
    const mes = meses.find((m) => m.chave === chave)
    if (mes) mes.quantos++
  }

  const historico: Edicao[] = (edicoes ?? []).map((d) => {
    const pacote = Array.isArray(d.social_packages) ? d.social_packages[0] : d.social_packages
    const extras = (d.extras ?? {}) as Record<string, string>
    return {
      id: d.id as string,
      assunto: extras.assunto || (pacote as { titulo_interno?: string } | null)?.titulo_interno || 'Edição sem assunto',
      estado: d.estado as string,
      destinatarios: (d.external_url as string | null) ?? '',
      erro: (d.erro as string | null) ?? '',
      quando: (d.publicado_em as string | null) ?? (d.agendar_para as string | null) ?? '',
    }
  })

  return (
    <div>
      <PageHeader
        title="Central de e-mail"
        description="Quem pediu para receber as notícias da Cruz Vermelha do Rio de Janeiro, como a lista cresceu e o que já foi enviado."
      />
      <Central
        contagens={{ total, confirmados, pendentes, descadastrados, invalidos }}
        inscritos={inscritos}
        truncada={total > LIMITE_DA_TELA}
        limiteDaTela={LIMITE_DA_TELA}
        meses={meses}
        historico={historico}
        envio={{
          configurado: emailConfigurado(),
          remetente: remetente(),
          responderPara: respostaPara() ?? '',
        }}
        podeApagar={context.role === 'admin'}
      />
    </div>
  )
}
