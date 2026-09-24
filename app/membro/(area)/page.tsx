import { exigirMembro } from '@/lib/membro/sessao'
import { historicoDoMembro, perfilDoMembro } from '@/lib/membro/dados'
import { catalogoDoMembro } from '@/lib/membro/cursos'
import { oportunidadesDoMembro } from '@/lib/membro/oportunidades'
import { avisosDoMembro } from '@/lib/membro/canal'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { InicioView } from '@/components/membro/inicio'

export const dynamic = 'force-dynamic'

/** O início da área do membro: carrega e entrega para a vista. */
export default async function InicioDoMembro() {
  const m = await exigirMembro()
  const [perfil, { formacoes, atividades }, cursos, oportunidades, avisos] = await Promise.all([perfilDoMembro(m), historicoDoMembro(m), catalogoDoMembro(m), oportunidadesDoMembro(m), avisosDoMembro(m, hojeEmSaoPaulo())])
  const agora = new Date().toISOString()
  const proxima = oportunidades.find((o) => o.fim > agora && !o.cancelada_em && (o.minha === 'inscrito' || o.minha === 'espera')) ?? null
  // Um curso em andamento; senão, o primeiro ainda não começado.
  const continuar = cursos.find((c) => c.progresso.feitas > 0 && !c.certificado) ?? cursos.find((c) => !c.progresso.feitas && !c.certificado) ?? null
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return <InicioView nome={m.nome} perfil={perfil} formacoes={formacoes} atividades={atividades} hoje={hojeEmSaoPaulo()} hora={hora} continuar={continuar} proxima={proxima} avisos={avisos} />
}
