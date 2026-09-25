import type { Metadata } from 'next'
import { exigirMembro } from '@/lib/membro/sessao'
import { historicoDoMembro, perfilDoMembro } from '@/lib/membro/dados'
import { catalogoDoMembro } from '@/lib/membro/cursos'
import { oportunidadesDoMembro } from '@/lib/membro/oportunidades'
import { avisosDoMembro } from '@/lib/membro/canal'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { InicioView } from '@/components/membro/inicio'
import { bensDoMembro } from '@/lib/membro/bens'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Início · Área do Voluntário".
export const metadata: Metadata = { title: 'Início' }

/** O início da área do membro: carrega e entrega para a vista, que decide o que mostrar. */
export default async function InicioDoMembro() {
  const m = await exigirMembro()
  const hoje = hojeEmSaoPaulo()
  const [perfil, { formacoes, atividades }, cursos, oportunidades, avisos, bens] = await Promise.all([
    perfilDoMembro(m), historicoDoMembro(m), catalogoDoMembro(m), oportunidadesDoMembro(m),
    // Os avisos têm página própria; aqui são só um resumo. Se a leitura falhar, o Início abre sem eles em vez de cair na tela de erro.
    avisosDoMembro(m, hoje).catch(() => []), bensDoMembro(m),
  ])
  const agora = new Date()
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora))
  const termos = bens.filter((b) => !b.termo_aceito_em).length
  return (
    <InicioView nome={m.nome} perfil={perfil} hoje={hoje} hora={hora} agora={agora} formacoes={formacoes} atividades={atividades}
      cursos={cursos} oportunidades={oportunidades} avisos={avisos} termosPendentes={termos} />
  )
}
