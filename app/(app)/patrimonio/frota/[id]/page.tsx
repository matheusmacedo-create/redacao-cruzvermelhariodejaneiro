import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import {
  Abastecer, DocumentoDoVeiculoDialog, ExcluirDaFrota, NovoServico, PlanoDeManutencao, RetornarVeiculo, SairComVeiculo, type CondutorParaUso, type DocumentoDoVeiculo, type PlanoDoVeiculo,
} from '@/components/app/patrimonio/frota'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { somarDias } from '@/lib/financeiro/avisos'
import {
  COMBUSTIVEIS, FINALIDADES_DE_USO, SITUACOES_DO_VEICULO, TIPOS_DE_DOCUMENTO, TIPOS_DE_SERVICO, TIPOS_DE_VEICULO, consumoMedio, custoPorKm, km, placaLegivel, situacaoDoPlano,
  situacaoDoVencimento, type Abastecimento, type Combustivel, type FinalidadeDeUso, type TipoDeDocumento, type TipoDeServico, type TipoDeVeiculo,
} from '@/lib/patrimonio/frota'

export const metadata = { title: 'Veículo' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const quando = (t: string) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

function Dado({ rotulo, children, destaque }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className={destaque ? 'text-lg font-semibold tabular-nums' : 'text-sm'}>{children || '—'}</dd></div>
}

export default async function VeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const { data: v } = await supabase.from('frota_veiculos').select('id,bem_id,placa,apelido,tipo,marca,modelo,ano_fabricacao,ano_modelo,cor,renavam,chassi,combustivel,tanque_litros,km_atual,local_id,situacao,observacao')
    .eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!v) notFound()
  const kmAtual = Number(v.km_atual)
  const umAno = somarDias(hoje, -365)
  const [{ data: usos }, { data: abast }, { data: servicos }, { data: planos }, { data: docs }, { data: condutores }, { data: bem }] = await Promise.all([
    supabase.from('frota_usos').select('id,condutor_id,finalidade,destino,saida_em,km_saida,retorno_em,km_retorno,observacao,frota_condutores(nome)').eq('veiculo_id', id).order('saida_em', { ascending: false }).limit(60),
    supabase.from('frota_abastecimentos').select('id,data,km,litros,valor,combustivel,tanque_cheio,posto').eq('veiculo_id', id).order('km', { ascending: false }).limit(200),
    supabase.from('frota_servicos').select('id,plano_id,tipo,descricao,data,km,custo,fornecedor').eq('veiculo_id', id).order('data', { ascending: false }).limit(100),
    supabase.from('frota_planos').select('id,nome,a_cada_km,a_cada_meses,ultima_km,ultima_data,ativo').eq('veiculo_id', id).order('nome'),
    supabase.from('frota_documentos').select('id,tipo,descricao,numero,vencimento,valor,observacao').eq('veiculo_id', id).order('vencimento', { ascending: false, nullsFirst: false }),
    supabase.from('frota_condutores').select('id,nome,cnh_categoria,cnh_validade,emergencia_validade,ativo').eq('workspace_id', ws).eq('ativo', true).order('nome'),
    v.bem_id ? supabase.from('pat_bens').select('id,plaqueta,nome').eq('id', v.bem_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const c = await cadastrosDoPatrimonio()
  const aberto = (usos ?? []).find((u) => !u.retorno_em)
  const nomeDoCondutor = (u: { frota_condutores: unknown }) => ((Array.isArray(u.frota_condutores) ? u.frota_condutores[0] : u.frota_condutores) as { nome: string } | null)?.nome ?? '—'
  const abastecimentos = (abast ?? []).map((a) => ({ ...a, km: Number(a.km), litros: Number(a.litros), valor: Number(a.valor) }))
  const consumo = consumoMedio(abastecimentos.filter((a) => (a.data as string) >= umAno) as Abastecimento[])
  // Custo por km nos últimos 12 meses: combustível + serviços ÷ km rodado nas viagens encerradas.
  const rodado = (usos ?? []).filter((u) => u.retorno_em && (u.saida_em as string).slice(0, 10) >= umAno).reduce((s, u) => s + Number(u.km_retorno) - Number(u.km_saida), 0)
  const gastoCombustivel = abastecimentos.filter((a) => (a.data as string) >= umAno).reduce((s, a) => s + a.valor, 0)
  const gastoServicos = (servicos ?? []).filter((s) => (s.data as string) >= umAno).reduce((s, x) => s + Number(x.custo ?? 0), 0)
  const cpk = custoPorKm(gastoCombustivel, gastoServicos, rodado)
  const locaisNome = new Map(c.locais.map((l) => [l.id, l.nome]))
  const sit = SITUACOES_DO_VEICULO[v.situacao as keyof typeof SITUACOES_DO_VEICULO]
  const listaPlanos = (planos ?? []) as PlanoDoVeiculo[]

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/frota" nivel={nivel} />
      <PageHeader
        title={`${v.apelido ? `${v.apelido} · ` : ''}${placaLegivel(v.placa as string)}`}
        description={[TIPOS_DE_VEICULO[v.tipo as TipoDeVeiculo], v.marca, v.modelo, v.ano_modelo, COMBUSTIVEIS[v.combustivel as Combustivel]].filter(Boolean).join(' · ')}
        actions={nivel >= 2 ? (
          <div className="flex flex-wrap items-start gap-2">
            {aberto ? <RetornarVeiculo veiculoId={id} usoId={aberto.id as string} kmSaida={Number(aberto.km_saida)} />
              : v.situacao === 'ativo' && <SairComVeiculo veiculoId={id} tipo={v.tipo as string} kmAtual={kmAtual} condutores={(condutores ?? []) as CondutorParaUso[]} projetos={c.projetos.map((p) => ({ id: p.id, nome: p.name }))} hoje={hoje} />}
            <Abastecer veiculoId={id} combustivel={v.combustivel as string} kmAtual={kmAtual} condutores={(condutores ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string }))} hoje={hoje} />
            <NovoServico veiculoId={id} kmAtual={kmAtual} planos={listaPlanos.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))} hoje={hoje} />
            {nivel >= 3 && <Button variant="outline" render={<Link href={`/patrimonio/frota/${id}/editar`} />}><Pencil className="size-4" />Editar</Button>}
          </div>
        ) : undefined}
      />

      <Card className="p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" id="resumo-veiculo">
          <Dado rotulo="Hodômetro" destaque>{km(kmAtual)}</Dado>
          <Dado rotulo="Consumo médio (12 meses)" destaque>{consumo ? `${consumo.kmPorLitro.toLocaleString('pt-BR')} km/L` : '—'}</Dado>
          <Dado rotulo="Custo por km (12 meses)" destaque>{cpk !== null ? reais(cpk) : '—'}</Dado>
          <Dado rotulo="Situação" destaque>{aberto ? 'Em viagem' : sit.rotulo}</Dado>
        </dl>
        {aberto && <p className="mt-3 rounded-lg bg-[var(--chart-4)]/10 px-3 py-2 text-sm" id="viagem-aberta">Saiu {quando(aberto.saida_em as string)} com {nomeDoCondutor(aberto)} para {aberto.destino as string} ({km(Number(aberto.km_saida))} na saída).</p>}
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Dado rotulo="Base">{v.local_id ? locaisNome.get(v.local_id as string) : null}</Dado>
          <Dado rotulo="RENAVAM">{v.renavam as string}</Dado>
          <Dado rotulo="Chassi">{v.chassi as string}</Dado>
          <Dado rotulo="Patrimônio">{bem ? <Link href={`/patrimonio/${bem.id}`} className="text-primary hover:underline">{bem.plaqueta as string}</Link> : null}</Dado>
        </dl>
        {v.observacao && <p className="mt-3 text-sm text-muted-foreground">{v.observacao as string}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5" id="planos">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Manutenção programada</h2>{nivel >= 3 && <PlanoDeManutencao veiculoId={id} kmAtual={kmAtual} hoje={hoje} />}</div>
          {!listaPlanos.length ? <p className="text-sm text-muted-foreground">Nenhum plano. Sugestão: troca de óleo (10.000 km ou 6 meses), revisão geral (anual), pneus e freios.</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {listaPlanos.map((p) => {
                const s = situacaoDoPlano(p, kmAtual, hoje)
                const cor = s.situacao === 'vencido' ? 'text-destructive' : s.situacao === 'proximo' ? 'text-warning-foreground' : 'text-muted-foreground'
                return (
                  <li key={p.id} className={`flex items-start gap-3 py-2.5 ${p.ativo ? '' : 'opacity-50'}`}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{[p.a_cada_km ? `a cada ${km(p.a_cada_km)}` : null, p.a_cada_meses ? `${p.a_cada_meses} meses` : null].filter(Boolean).join(' ou ')}</p>
                      <p className={`text-xs font-medium ${cor}`}>
                        {s.situacao === 'sem_registro' ? 'Sem registro da última vez' : `${s.situacao === 'vencido' ? 'Vencida' : 'Próxima'}: ${[s.proximaKm !== null ? km(s.proximaKm) : null, s.proximaData ? dataBr(s.proximaData) : null].filter(Boolean).join(' ou ')}`}
                      </p>
                    </div>
                    {nivel >= 2 && p.ativo && <NovoServico veiculoId={id} kmAtual={kmAtual} planos={[{ id: p.id, nome: p.nome }]} hoje={hoje} planoInicial={p.id} />}
                    {nivel >= 3 && <PlanoDeManutencao veiculoId={id} plano={p} kmAtual={kmAtual} hoje={hoje} />}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5" id="documentos">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Documentos</h2>{nivel >= 2 && <DocumentoDoVeiculoDialog veiculoId={id} />}</div>
          {!(docs ?? []).length ? <p className="text-sm text-muted-foreground">Cadastre CRLV, licenciamento, seguro e vistorias com o vencimento.</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {((docs ?? []) as DocumentoDoVeiculo[]).map((d) => {
                const s = situacaoDoVencimento(d.vencimento, hoje, 30)
                return (
                  <li key={d.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{TIPOS_DE_DOCUMENTO[d.tipo as TipoDeDocumento]}{d.descricao ? ` · ${d.descricao}` : ''}</p>
                      <p className={`text-xs ${s === 'vencido' ? 'font-medium text-destructive' : s === 'vencendo' ? 'font-medium text-warning-foreground' : 'text-muted-foreground'}`}>
                        {d.vencimento ? `${s === 'vencido' ? 'Venceu' : 'Vence'} em ${dataBr(d.vencimento)}` : 'Sem vencimento'}{d.numero ? ` · nº ${d.numero}` : ''}{d.valor !== null ? ` · ${reais(Number(d.valor))}` : ''}
                      </p>
                    </div>
                    {nivel >= 2 && <DocumentoDoVeiculoDialog veiculoId={id} doc={{ ...d, valor: d.valor === null ? null : Number(d.valor) }} />}
                    {nivel >= 3 && <ExcluirDaFrota veiculoId={id} tabela="documento" id={d.id} rotulo={TIPOS_DE_DOCUMENTO[d.tipo as TipoDeDocumento]} />}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0" id="diario">
        <h2 className="px-5 pt-5 font-semibold">Diário de bordo</h2>
        {!(usos ?? []).length ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nenhuma viagem registrada.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[44rem] border-collapse text-sm">
              <thead><tr className="border-y border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2">Saída</th><th className="px-3 py-2">Condutor</th><th className="px-3 py-2">Destino</th><th className="px-3 py-2 text-right">Km</th><th className="px-5 py-2">Retorno</th>
              </tr></thead>
              <tbody>
                {(usos ?? []).map((u) => (
                  <tr key={u.id as string} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs">{quando(u.saida_em as string)}</td>
                    <td className="px-3 py-2.5">{nomeDoCondutor(u)}</td>
                    <td className="px-3 py-2.5">{u.destino as string}<span className="block text-xs text-muted-foreground">{FINALIDADES_DE_USO[u.finalidade as FinalidadeDeUso]}{u.observacao ? ` · ${u.observacao}` : ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{u.km_retorno !== null ? km(Number(u.km_retorno) - Number(u.km_saida)) : '—'}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs">{u.retorno_em ? quando(u.retorno_em as string) : <span className="font-medium text-[var(--chart-4)]">em viagem</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden p-0" id="abastecimentos">
          <h2 className="px-5 pt-5 font-semibold">Abastecimentos</h2>
          {!abastecimentos.length ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nenhum.</p> : (
            <ul className="mt-2 divide-y divide-border">
              {abastecimentos.slice(0, 30).map((a) => (
                <li key={a.id as string} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>{dataBr(a.data as string)} · {a.litros.toLocaleString('pt-BR')} L · {reais(a.valor)}</p>
                    <p className="text-xs text-muted-foreground">{km(a.km)} · {COMBUSTIVEIS[a.combustivel as Combustivel]}{a.tanque_cheio ? ' · tanque cheio' : ''}{a.posto ? ` · ${a.posto}` : ''}</p>
                  </div>
                  {nivel >= 3 && <ExcluirDaFrota veiculoId={id} tabela="abastecimento" id={a.id as string} rotulo={`Abastecimento de ${dataBr(a.data as string)}`} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden p-0" id="servicos">
          <h2 className="px-5 pt-5 font-semibold">Serviços</h2>
          {!(servicos ?? []).length ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nenhum.</p> : (
            <ul className="mt-2 divide-y divide-border">
              {(servicos ?? []).map((s) => (
                <li key={s.id as string} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>{s.descricao as string}</p>
                    <p className="text-xs text-muted-foreground">{dataBr(s.data as string)} · {TIPOS_DE_SERVICO[s.tipo as TipoDeServico]}{s.km !== null ? ` · ${km(Number(s.km))}` : ''}{s.custo !== null ? ` · ${reais(Number(s.custo))}` : ''}{s.fornecedor ? ` · ${s.fornecedor}` : ''}</p>
                  </div>
                  {nivel >= 3 && <ExcluirDaFrota veiculoId={id} tabela="servico" id={s.id as string} rotulo={s.descricao as string} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
