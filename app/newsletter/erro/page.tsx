import { Recado } from '@/components/newsletter/recado'

export const metadata = { title: 'Não deu certo — Cruz Vermelha RJ' }

// O motivo chega pela URL porque quem cai aqui veio de um POST de formulário
// sem JavaScript, que navegou para cá. Texto vindo da URL é renderizado como
// texto pelo React — nunca como HTML —, então não há injeção por este caminho.
export default async function Erro({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  return (
    <Recado tom="erro" titulo="Não foi possível concluir">
      <p>{motivo?.slice(0, 200) || 'Algo deu errado com a sua inscrição.'}</p>
      <p>Se o problema continuar, escreva para a gente pelo site.</p>
    </Recado>
  )
}
