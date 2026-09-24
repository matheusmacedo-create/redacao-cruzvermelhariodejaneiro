import { exigirMembro } from '@/lib/membro/sessao'
import { historicoDoMembro, perfilDoMembro } from '@/lib/membro/dados'
import { catalogoDoMembro } from '@/lib/membro/cursos'
import { oportunidadesDoMembro } from '@/lib/membro/oportunidades'
import { avisosDoMembro } from '@/lib/membro/canal'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { InicioView } from '@/components/membro/inicio'
import { bensDoMembro } from '@/lib/membro/bens'

export const dynamic = 'force-dynamic'

/** O início da área do membro: carrega e entrega para a vista. */
export default async function InicioDoMembro() {
  const m = await exigirMembro()
  const [perfil, { formacoes, atividades }, cursos, oportunidades, avisos, bens] = await Promise.all([perfilDoMembro(m), historicoDoMembro(m), catalogoDoMembro(m), oportunidadesDoMembro(m), avisosDoMembro(m, hojeEmSaoPaulo()), bensDoMembro(m)])
  const agora = new Date().toISOString()
  const proxima = oportunidades.find((o) => o.fim > agora && !o.cancelada_em && (o.minha === 'inscrito' || o.minha === 'espera')) ?? null
  // Um curso em andamento; senão, o primeiro ainda não começado.
  const continuar = cursos.find((c) => c.progresso.feitas > 0 && !c.certificado) ?? cursos.find((c) => !c.progresso.feitas && !c.certificado) ?? null
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  const termos = bens.filter((b) => !b.termo_aceito_em).length
  return (
    <>
      {termos > 0 && (
        <Link href="/membro/perfil#bens" className="mb-4 flex items-center gap-3 rounded-xl border border-warning/60 bg-warning/15 p-4 text-sm text-warning-foreground hover:bg-warning/25" id="termos-pendentes">
          <Package className="size-5 shrink-0" />
          <span><span className="font-semibold">{termos === 1 ? 'Um bem da filial foi entregue a você.' : `${termos} bens da filial foram entregues a você.`}</span> Confira e aceite o termo de responsabilidade.</span>
        </Link>
      )}
      <InicioView nome={m.nome} perfil={perfil} formacoes={formacoes} atividades={atividades} hoje={hojeEmSaoPaulo()} hora={hora} continuar={continuar} proxima={proxima} avisos={avisos} />
    </>
  )
}
