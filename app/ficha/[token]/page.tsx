import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CabecalhoDaPagina, Recado } from '@/components/membro/pecas'
import { FormularioDaFicha } from '@/components/ficha/formulario'
import { conviteDoToken } from '@/lib/rh/convites'
import { DOCUMENTOS } from '@/lib/rh/regras'
import { CAMPOS_DA_FICHA } from '@/lib/rh/ficha'
import { Moldura } from '../../autorizacao/moldura'

// Página pública, sem login: o link pessoal que o RH manda para a pessoa completar a própria ficha.
// Fora do Google e sem mandar o endereço (com o token) adiante.
export const metadata: Metadata = {
  title: 'Complete a sua ficha — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function Ficha({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const convite = await conviteDoToken(token)
  if (!convite) notFound()
  return (
    <Moldura>
      <CabecalhoDaPagina
        sobretitulo="Recursos humanos"
        titulo={convite.aberto && convite.nome ? `${convite.nome}, complete a sua ficha` : 'Complete a sua ficha'}
        descricao="Estes dados ficam com o RH da Cruz Vermelha RJ e só são usados para a sua ficha de trabalho."
      />
      {!convite.aberto ? (
        <Recado tipo="aviso" titulo="Este link não vale mais">Ele já foi usado, venceu ou foi trocado por um mais novo. Se ainda falta algo, peça um link novo ao RH.</Recado>
      ) : (
        <FormularioDaFicha
          token={token}
          campos={CAMPOS_DA_FICHA.map((c) => ({ ...c, preenchido: convite.preenchidos.includes(c.campo) }))}
          documentos={convite.incluiDocumentos ? DOCUMENTOS.map((d) => ({ campo: d.campo, rotulo: d.rotulo })) : []}
          temDocumentos={convite.temDocumentos}
        />
      )}
    </Moldura>
  )
}
