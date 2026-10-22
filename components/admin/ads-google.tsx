'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, Megaphone, PlayCircle, ShieldCheck, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { criarCampanhaDoGrants, desconectarGoogleAds, escolherContaDoAds, validarCampanhaDoGrants } from '@/app/actions/google-ads'

export type ConexaoDoAdsNaTela = {
  email: string; estado: 'ativa' | 'expirada'; conectadaEm: string
  contaEscolhida: string | null; contasAcessiveis: string[]
  campanha: { link: string | null; criadaEm: string } | null
} | null

export type PlanoNaTela = { nome: string; grupos: number; palavras: number; anuncios: number; negativas: number; sitelinks: number; orcamentoDiario: string; lanceMaximo: string; local: string }

type Resultado = { erro?: string; recado?: string; link?: string }
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const comTracos = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')

/**
 * 7. Google Ads: a conexão da conta Google da filial que administra o Google Ads (lib/google/ads.ts) — a conta do Ad
 * Grants onde rodam as campanhas de pesquisa que levam ao site. Outra conexão, separada das dos passos 1, 5 e 6, com
 * os escopos do Ads. Daqui saem "Conferir o plano" (o pedido com validateOnly: o Google confere e não grava) e
 * "Criar campanha (pausada)" (o mesmo pedido, gravado; ligar é no painel do Google). `disponivel`: a tabela da
 * conexão existe (a migração do Google Ads foi aplicada).
 */
export function AdsDoGoogle({ conexao, clienteConfigurado, disponivel, aviso, plano }: {
  conexao: ConexaoDoAdsNaTela
  clienteConfigurado: boolean
  disponivel: boolean
  aviso: { tom: 'ok' | 'erro'; texto: string } | null
  plano: PlanoNaTela
}) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string; link?: string } | null>(aviso)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<Resultado>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado, link: r.link } : null)
    router.refresh()
  })

  const conectada = conexao?.estado === 'ativa'
  const pronta = conectada && Boolean(conexao?.contaEscolhida)
  return (
    <Card className="flex flex-col gap-4 p-5" id="google-ads" data-ajuda="configuracoes.google-ads">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium"><Megaphone className="size-4" aria-hidden="true" />7. Google Ads</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!disponivel
              ? 'Falta aplicar a migração do Google Ads no banco; depois disso, o botão de conectar aparece aqui.'
              : !clienteConfigurado
                ? 'Primeiro, o cliente OAuth do Google em Integrações (o mesmo do passo 1). O projeto do Google Cloud desse cliente precisa ter a API do Google Ads ativada e o acesso Explorer.'
                : !conexao
                  ? 'Conecte a conta Google que administra o Google Ads da filial (a do Ad Grants): o Palácio confere e cria, pausada, a campanha de pesquisa que leva ao site. Ligar é no painel do Google, por uma pessoa.'
                  : conexao.estado === 'expirada'
                    ? `A autorização de ${conexao.email} expirou ou foi revogada. Reconecte para o Palácio voltar a mexer nas campanhas.`
                    : `Conectado: ${conexao.email} (desde ${quando.format(new Date(conexao.conectadaEm))}).`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {disponivel && clienteConfigurado && (
            <Button render={<a href="/api/google/conectar-ads" />} variant={conectada ? 'outline' : 'default'}>
              <Link2 className="size-4" />{conexao ? 'Reconectar' : 'Conectar Google Ads'}
            </Button>
          )}
          {conexao && (
            <Button variant="ghost" className="text-destructive" disabled={ocupado}
              onClick={() => { if (confirm('Desconectar o Google Ads? As campanhas continuam no Google como estão; o Palácio só deixa de mexer nelas.')) executar(desconectarGoogleAds) }}>
              <Unlink className="size-4" />Desconectar
            </Button>
          )}
        </div>
      </div>

      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <span>
            {recado.texto}
            {recado.link && <>{' '}<a href={recado.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Abrir no Google Ads<ExternalLink className="size-3.5" aria-hidden="true" /></a></>}
          </span>
        </p>
      )}

      {conexao && (
        <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Situação</dt>
            <dd className={conectada ? 'text-emerald-700' : 'text-destructive'}>{conectada ? 'Ativa' : 'Expirada: reconecte'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Conta Google conectada</dt>
            <dd className="truncate">{conexao.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Conta de anúncios em uso</dt>
            <dd>{conexao.contaEscolhida ? comTracos(conexao.contaEscolhida) : <span className="text-muted-foreground">nenhuma escolhida</span>}</dd>
          </div>
        </dl>
      )}

      {conectada && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); const dados = new FormData(e.currentTarget); executar(() => escolherContaDoAds(dados)) }}
        >
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Conta de anúncios (10 dígitos, como no painel)</span>
            <input name="customer_id" defaultValue={conexao?.contaEscolhida ? comTracos(conexao.contaEscolhida) : ''} placeholder="123-456-7890" inputMode="numeric" maxLength={14}
              className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm" />
          </label>
          <Button type="submit" variant="outline" disabled={ocupado}>Usar esta conta</Button>
          {conexao?.contasAcessiveis.length ? (
            <span className="text-xs text-muted-foreground">A conta conectada alcança: {conexao.contasAcessiveis.map(comTracos).join(', ')}.</span>
          ) : (
            <span className="text-xs text-muted-foreground">A autorização não listou nenhuma conta de anúncios: sem o acesso Explorer no projeto do Google Cloud, a lista vem vazia.</span>
          )}
        </form>
      )}

      {conectada && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm">
          <div>
            <p className="font-medium">Campanha do plano: {plano.nome}</p>
            <p className="text-muted-foreground">
              Rede de pesquisa, {plano.local}. {plano.grupos} grupos, {plano.palavras} palavras-chave, {plano.anuncios} anúncios responsivos, {plano.negativas} palavras negativas e {plano.sitelinks} sitelinks.
              {' '}Orçamento de {plano.orcamentoDiario} por dia e “Maximizar cliques” com lance de até {plano.lanceMaximo} (as regras do Ad Grants). Os cursos pagos ficam de fora.
            </p>
          </div>
          {conexao?.campanha ? (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-4 shrink-0" />Criada pelo Palácio em {quando.format(new Date(conexao.campanha.criadaEm))}.
              {conexao.campanha.link && <a href={conexao.campanha.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Abrir no Google Ads<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!pronta || ocupado} onClick={() => executar(validarCampanhaDoGrants)}>
                <ShieldCheck className="size-4" />Conferir o plano no Google
              </Button>
              <Button disabled={!pronta || ocupado}
                onClick={() => { if (confirm(`Criar a campanha "${plano.nome}" na conta ${conexao?.contaEscolhida ? comTracos(conexao.contaEscolhida) : ''}? Ela nasce pausada: nada é veiculado até alguém ativar no painel do Google Ads.`)) executar(criarCampanhaDoGrants) }}>
                <PlayCircle className="size-4" />Criar campanha (pausada)
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            “Conferir” manda o mesmo pedido da criação com validateOnly: o Google confere tudo (limites, políticas, segmentação) e não grava nada. Criada, a campanha fica pausada: revise grupos, palavras e anúncios no painel e ative por lá. As conversões (doação e cadastro de voluntário) vêm do GA4, importadas no painel depois de vincular o Analytics ao Ads.
          </p>
        </div>
      )}
    </Card>
  )
}
