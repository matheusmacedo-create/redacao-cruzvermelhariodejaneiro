import { Recado } from '@/components/newsletter/recado'
import { RedirecionarParaNoticias } from '@/components/newsletter/redirecionar'

export const metadata = { title: 'Inscrição confirmada — Cruz Vermelha RJ' }

/** Quem acabou de pedir notícias vai para as notícias. */
const CENTRAL_DE_NOTICIAS = 'https://cruzvermelhariodejaneiro.org/noticias/'

export default async function Confirmado({
  searchParams,
}: {
  searchParams: Promise<{ ja?: string }>
}) {
  const { ja } = await searchParams

  // "ja" marca quem abriu o link uma segunda vez. A tela precisa dizer que
  // está tudo certo — acusar erro em quem só reabriu a mensagem faz a pessoa
  // achar que a inscrição falhou e tentar de novo.
  if (ja) {
    return (
      <Recado
        tom="confirmado"
        titulo="Inscrição confirmada"
        acao={<RedirecionarParaNoticias url={CENTRAL_DE_NOTICIAS} />}
      >
        <p>Você já está na lista — não precisa fazer mais nada.</p>
        <p>A próxima edição chega no seu e-mail.</p>
      </Recado>
    )
  }

  return (
    <Recado
      tom="confirmado"
      titulo="Pronto! Inscrição confirmada"
      acao={<RedirecionarParaNoticias url={CENTRAL_DE_NOTICIAS} />}
    >
      <p>
        Você vai receber as novidades da Cruz Vermelha do Rio de Janeiro: cursos,
        campanhas e o destino das doações.
      </p>
      <p>Toda mensagem que enviarmos traz um link para sair da lista, caso mude de ideia.</p>
    </Recado>
  )
}
