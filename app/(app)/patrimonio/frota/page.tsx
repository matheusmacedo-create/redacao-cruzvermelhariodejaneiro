import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IdCard, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { SITUACOES_DO_VEICULO, TIPOS_DE_DOCUMENTO, TIPOS_DE_VEICULO, km, placaLegivel, situacaoDoPlano, situacaoDoVencimento, type Plano, type TipoDeDocumento, type TipoDeVeiculo } from '@/lib/patrimonio/frota'

export const metadata = { title: 'Frota' }
export const dynamic = 'force-dynamic'

/**
 * A frota num olhar: onde está cada veículo (na base ou em viagem, com
 * quem), o hodômetro e o que pede atenção — manutenção vencida por km ou
 * data, documento vencendo e condutor com CNH vencendo.
 */
export default async function FrotaPage() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const [{ data: veiculos }, { data: usos }, { data: planos }, { data: docs }, { data: condutores }, { data: locais }] = await Promise.all([
    supabase.from('frota_veiculos').select('id,placa,apelido,tipo,marca,modelo,km_atual,situacao,local_id').eq('workspace_id', ws).order('apelido', { nullsFirst: false }).order('placa'),
    supabase.from('frota_usos').select('veiculo_id,destino,saida_em,frota_condutores(nome)').eq('workspace_id', ws).is('retorno_em', null),
    supabase.from('frota_planos').select('veiculo_id,nome,a_cada_km,a_cada_meses,ultima_km,ultima_data').eq('workspace_id', ws).eq('ativo', true),
    supabase.from('frota_documentos').select('veiculo_id,tipo,vencimento').eq('workspace_id', ws).not('vencimento', 'is', null),
    supabase.from('frota_condutores').select('nome,cnh_validade,emergencia_validade').eq('workspace_id', ws).eq('ativo', true),
    supabase.from('pat_locais').select('id,nome').eq('workspace_id', ws),
  ])
  const emUso = new Map((usos ?? []).map((u) => [u.veiculo_id as string, u]))
  const nomeDoLocal = new Map((locais ?? []).map((l) => [l.id as string, l.nome as string]))
  const alertas = (v: { id: string; km_atual: number }) => {
    const r: { texto: string; grave: boolean }[] = []
    for (const p of (planos ?? []).filter((x) => x.veiculo_id === v.id)) {
      const s = situacaoDoPlano(p as Plano, v.km_atual, hoje)
      if (s.situacao === 'vencido') r.push({ texto: `${p.nome} vencida`, grave: true })
      else if (s.situacao === 'proximo') r.push({ texto: `${p.nome} em ${s.faltaKm !== null && s.faltaKm <= 1000 ? km(s.faltaKm) : `${s.faltaDias} dias`}`, grave: false })
    }
    // Do mesmo tipo, vale o documento mais novo (o vencido antigo já foi renovado).
    const ultimoPorTipo = new Map<string, string>()
    for (const d of (docs ?? []).filter((x) => x.veiculo_id === v.id)) if ((d.vencimento as string) > (ultimoPorTipo.get(d.tipo as string) ?? '')) ultimoPorTipo.set(d.tipo as string, d.vencimento as string)
    for (const [tipo, venc] of ultimoPorTipo) {
      const s = situacaoDoVencimento(venc, hoje, 30)
      if (s === 'vencido') r.push({ texto: `${TIPOS_DE_DOCUMENTO[tipo as TipoDeDocumento]} vencido`, grave: true })
      else if (s === 'vencendo') r.push({ texto: `${TIPOS_DE_DOCUMENTO[tipo as TipoDeDocumento]} vence ${venc.split('-').reverse().join('/')}`, grave: false })
    }
    return r
  }
  const lista = (veiculos ?? []).map((v) => ({ ...v, km_atual: Number(v.km_atual), alertas: alertas({ id: v.id as string, km_atual: Number(v.km_atual) }) }))
  const cnh = (condutores ?? []).flatMap((c) => {
    const s = situacaoDoVencimento(c.cnh_validade as string, hoje, 30), e = situacaoDoVencimento(c.emergencia_validade as string | null, hoje, 30)
    return [s && s !== 'ok' ? `${c.nome}: CNH ${s === 'vencido' ? 'vencida' : 'vence em breve'}` : null, e && e !== 'ok' ? `${c.nome}: curso de emergência ${e === 'vencido' ? 'vencido' : 'vence em breve'}` : null].filter(Boolean) as string[]
  })

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/frota" nivel={nivel} />
      <PageHeader
        title="Frota"
        description="Ambulâncias e veículos: diário de bordo, abastecimento, manutenção por km e por data, e documentos com vencimento."
        actions={<div className="flex flex-wrap items-start gap-2">
          <Button variant="outline" render={<Link href="/patrimonio/frota/condutores" />}><IdCard className="size-4" />Condutores</Button>
          {nivel >= 3 && <Button render={<Link href="/patrimonio/frota/novo" />}><Plus className="size-4" />Novo veículo</Button>}
        </div>}
      />
      {cnh.length > 0 && (
        <Card className="border-warning/60 p-4 text-sm" id="alerta-condutores">
          <p className="font-medium text-warning-foreground">Condutores</p>
          <ul className="mt-1 list-disc pl-5">{cnh.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      )}
      {!lista.length ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado.{nivel >= 3 ? ' Comece pelas ambulâncias.' : ''}</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" id="veiculos">
          {lista.map((v) => {
            const u = emUso.get(v.id as string)
            const condutor = u ? ((Array.isArray(u.frota_condutores) ? u.frota_condutores[0] : u.frota_condutores) as { nome: string } | null)?.nome : null
            const sit = SITUACOES_DO_VEICULO[v.situacao as keyof typeof SITUACOES_DO_VEICULO]
            return (
              <Link key={v.id as string} href={`/patrimonio/frota/${v.id}`} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40" data-placa={v.placa as string}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{v.apelido ? `${v.apelido} · ` : ''}<span className="font-mono">{placaLegivel(v.placa as string)}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{[TIPOS_DE_VEICULO[v.tipo as TipoDeVeiculo], v.marca, v.modelo].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u ? 'bg-[var(--chart-4)]/15 text-[var(--chart-4)]' : sit.classe}`}>{u ? 'Em viagem' : sit.rotulo}</span>
                </div>
                <p className="text-sm">{u ? <>Com {condutor} · {u.destino as string}</> : <span className="text-muted-foreground">{v.local_id ? nomeDoLocal.get(v.local_id as string) : 'Sem base'}</span>}</p>
                <p className="text-xs tabular-nums text-muted-foreground">Hodômetro {km(v.km_atual)}</p>
                {v.alertas.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">{v.alertas.map((a) => <li key={a.texto} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.grave ? 'bg-destructive/10 text-destructive' : 'bg-warning/20 text-warning-foreground'}`}>{a.texto}</li>)}</ul>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
