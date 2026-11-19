import { Recado } from '@/components/newsletter/recado'

export const metadata = { title: 'Inscrição feita — Cruz Vermelha RJ' }

/**
 * Onde o formulário sem JavaScript chega depois de enviar.
 *
 * O endereço continua "quase-la" porque há formulários no ar apontando para
 * cá; desde 19/11/2026 não falta passo nenhum: quem se inscreve entra direto.
 *
 * O recado vem pela URL porque ele MUDA conforme o pedido: a inscrição comum
 * diz que está feita; o pedido de material diz que o arquivo vai por e-mail,
 * ou que o envio está fora do ar. Texto de URL é renderizado como texto pelo
 * React, nunca como HTML — não há injeção por este caminho.
 */
export default async function QuaseLa({
  searchParams,
}: {
  searchParams: Promise<{ recado?: string }>
}) {
  const { recado } = await searchParams

  return (
    <Recado tom="aguardando" titulo="Pronto">
      <p>
        {recado?.slice(0, 240)
          || 'Você passa a receber as novidades da Cruz Vermelha do Rio de Janeiro no seu e-mail.'}
      </p>
      <p>
        A nossa primeira mensagem não chegou em alguns minutos? Confira a caixa de spam ou a
        aba de promoções — é onde a mensagem de um remetente novo costuma cair.
      </p>
    </Recado>
  )
}
