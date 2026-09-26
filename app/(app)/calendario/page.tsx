import { PageHeader } from '@/components/app/page-header'
import { Agenda } from '@/components/app/agenda/agenda'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { tituloDaArea } from '@/lib/navegacao'
import { pode } from '@/lib/permissoes'
import { lerCamadas, TODAS_AS_CAMADAS, type ItemDaAgenda } from '@/lib/agenda/camadas'
import { camadasDisponiveis, itensDaAgenda } from '@/lib/agenda/fontes'
import { agoraEmBrasilia, somarDias, type DataComemorativa } from '@/lib/agenda/datas'
import { ehVisao, janelaDaVisao, janelasParaCarregar } from '@/lib/agenda/visao'

export const metadata = { title: tituloDaArea('/calendario') }

/** Até onde os alertas olham: uma semana para trás (vencidos) e dois meses para frente (datas comemorativas). */
const ALERTAS_ANTES = 7
const ALERTAS_DEPOIS = 60

const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const sp = await searchParams
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

  const agora = agoraEmBrasilia()
  const visao = ehVisao(texto(sp.visao)) ? (texto(sp.visao) as 'mes' | 'semana' | 'lista') : 'mes'
  const dia = DIA.test(texto(sp.dia)) ? texto(sp.dia) : agora.dia
  const janela = janelaDaVisao(visao, dia)
  const alertas = { de: somarDias(agora.dia, -ALERTAS_ANTES), ate: somarDias(agora.dia, ALERTAS_DEPOIS) }

  const [disponiveis, preferencias, datas] = await Promise.all([
    camadasDisponiveis(supabase, context.workspace.id, context.user.id, context.role),
    supabase.from('agenda_preferencias').select('camadas_ocultas,resumo_semanal,ics_token_hash,ics_camadas,ics_criado_em')
      .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle(),
    supabase.from('datas_comemorativas').select('id,nome,descricao,categoria,regra,mes,dia,semana,dia_da_semana,antecedencia_dias,ativa')
      .eq('workspace_id', context.workspace.id).order('mes').order('dia', { nullsFirst: true }).limit(500),
  ])

  const leituras = await Promise.all(janelasParaCarregar(janela, alertas).map((j) =>
    itensDaAgenda(supabase, context.workspace.id, context.user.id, j, disponiveis)))
  const vistos = new Set<string>()
  const itens: ItemDaAgenda[] = []
  for (const i of leituras.flatMap((l) => l.itens)) if (!vistos.has(i.id)) { vistos.add(i.id); itens.push(i) }
  const falhas = [...new Set(leituras.flatMap((l) => l.falhas))]

  // Sem a migração da Agenda, a tela ainda funciona com o que já existe; só não guarda escolhas.
  const instalada = !preferencias.error && !datas.error
  const pref = preferencias.data

  return (
    <div>
      <PageHeader title="Calendário" description="Tudo o que tem data no Palácio Virtual, em camadas que você liga e desliga." />
      <Agenda
        itens={itens}
        visao={visao}
        dia={dia}
        janela={janela}
        agora={agora}
        alertasAte={alertas.ate}
        disponiveis={TODAS_AS_CAMADAS.filter((c) => disponiveis.has(c))}
        ocultasIniciais={lerCamadas(pref?.camadas_ocultas)}
        falhas={falhas.filter((c) => c !== 'datas' || instalada)}
        instalada={instalada}
        resumoSemanal={pref?.resumo_semanal === true}
        link={pref?.ics_token_hash ? { camadas: lerCamadas(pref.ics_camadas), criadoEm: pref.ics_criado_em as string | null } : null}
        datas={(datas.data ?? []) as DataComemorativa[]}
        podeEditarDatas={pode(context.role, 'agenda.datas')}
        abrirConfiguracoes={texto(sp.config) === '1'}
      />
    </div>
  )
}
