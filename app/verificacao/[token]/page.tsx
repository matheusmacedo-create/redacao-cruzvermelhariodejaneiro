import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CabecalhoDaPagina, Recado } from '@/components/membro/pecas'
import { FormularioDaVerificacao } from '@/components/verificacao/formulario'
import { verificacaoDoToken } from '@/lib/participantes/verificacao/link'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { Moldura } from '../../autorizacao/moldura'

// Página pública, sem login: o link pessoal que a coordenação do Voluntariado manda ao candidato
// para ele aceitar o termo e enviar os documentos da verificação. Fora do Google e sem mandar o
// endereço (com o token) adiante.
export const metadata: Metadata = {
  title: 'Verificação do candidato — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function Verificacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await verificacaoDoToken(token)
  if (!v) notFound()
  return (
    <Moldura>
      <CabecalhoDaPagina
        sobretitulo="Voluntariado"
        titulo={v.aberto && v.nome ? `${v.nome}, ${v.escopo === 'renovacao' ? 'renove o seu atestado' : 'confirme quem você é'}` : 'Verificação do candidato'}
        descricao={v.aberto && v.escopo === 'renovacao'
          ? 'A lei pede um atestado de antecedentes novo a cada 6 meses de quem atua com crianças e adolescentes. É gratuito e leva poucos minutos.'
          : 'Antes de aprovar uma inscrição, a Cruz Vermelha RJ confere a identidade, os antecedentes e as referências de quem vai atuar como voluntário. Leva uns 10 minutos.'}
      />
      {!v.aberto ? (
        <Recado tipo="aviso" titulo="Este link não vale mais">Ele venceu, já foi usado ou foi trocado por um mais novo. Se ainda falta algo, peça um link novo à coordenação do Voluntariado.</Recado>
      ) : (
        <FormularioDaVerificacao token={token} dados={v} hoje={hojeEmSaoPaulo()} />
      )}
    </Moldura>
  )
}
