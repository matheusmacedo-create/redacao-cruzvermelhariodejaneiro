import { Recado } from '@/components/newsletter/recado'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pronto — Cruz Vermelha RJ' }

export default async function SaiuDosComunicados({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams
  if (erro) {
    return (
      <Recado tom="erro" titulo="Não deu para concluir agora">
        <p>Tente abrir o link de novo em alguns minutos. Se continuar, responda a qualquer mensagem nossa pedindo para sair — atendemos à mão.</p>
      </Recado>
    )
  }
  return (
    <Recado tom="saiu" titulo="Pronto, você saiu da lista">
      <p>Não enviaremos mais comunicados para este endereço.</p>
    </Recado>
  )
}
