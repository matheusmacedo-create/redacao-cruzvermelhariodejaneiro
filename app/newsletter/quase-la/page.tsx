import { Recado } from '@/components/newsletter/recado'

export const metadata = { title: 'Confirme sua inscrição — Cruz Vermelha RJ' }

/**
 * Onde o formulário sem JavaScript chega depois de enviar.
 *
 * O recado vem pela URL porque ele MUDA conforme o estado do sistema: com o
 * envio ligado, é "confira seu e-mail"; sem ele, é "o convite sai quando o
 * envio entrar no ar". Fixar o primeiro texto aqui mandaria a pessoa esperar
 * por uma mensagem que não vem. Texto de URL é renderizado como texto pelo
 * React, nunca como HTML — não há injeção por este caminho.
 */
export default async function QuaseLa({
  searchParams,
}: {
  searchParams: Promise<{ recado?: string }>
}) {
  const { recado } = await searchParams

  return (
    <Recado tom="aguardando" titulo="Falta um passo">
      <p>
        {recado?.slice(0, 240)
          || 'Enviamos um e-mail para você confirmar a inscrição. É só clicar no botão da mensagem e pronto.'}
      </p>
      <p>
        Não chegou em alguns minutos? Confira a caixa de spam ou a aba de promoções — é
        onde a primeira mensagem de um remetente novo costuma cair.
      </p>
    </Recado>
  )
}
