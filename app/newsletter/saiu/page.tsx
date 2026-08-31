import { Recado } from '@/components/newsletter/recado'

export const metadata = { title: 'Você saiu da lista — Cruz Vermelha RJ' }

export default function Saiu() {
  return (
    <Recado tom="saiu" titulo="Pronto, você saiu da lista">
      <p>Não vamos mais enviar a newsletter para este endereço.</p>
      <p>
        Se foi engano, ou se um dia quiser voltar, a inscrição continua aberta no rodapé
        do site.
      </p>
    </Recado>
  )
}
