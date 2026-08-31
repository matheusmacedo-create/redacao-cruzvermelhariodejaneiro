import { Recado } from '@/components/newsletter/recado'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sair da lista — Cruz Vermelha RJ' }

/**
 * A página do link de saída visível no rodapé das mensagens.
 *
 * ELA NÃO DESCADASTRA NINGUÉM. Só mostra o botão; sair acontece no POST que o
 * botão envia para /api/newsletter/sair.
 *
 * O motivo é concreto: filtros de segurança de e-mail corporativo abrem todos
 * os links de toda mensagem que entra na empresa, antes de a pessoa ver a
 * caixa. Se sair fosse um GET, esses robôs tirariam da lista quem nunca clicou
 * em nada — e ninguém descobriria, porque o sintoma seria só uma lista que
 * encolhe.
 *
 * O botão é um formulário comum, sem JavaScript: quem abre o link num cliente
 * de e-mail com script bloqueado precisa conseguir sair do mesmo jeito. Sair
 * de uma lista é um direito, não pode depender de o navegador cooperar.
 */
export default async function Sair({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t } = await searchParams
  const token = (t ?? '').trim()

  if (!/^[0-9a-f]{48}$/.test(token)) {
    return (
      <Recado tom="erro" titulo="Link inválido">
        <p>Este endereço não parece um link de saída válido.</p>
        <p>Se copiou e colou da mensagem, confira se veio inteiro — links longos às vezes quebram em duas linhas.</p>
      </Recado>
    )
  }

  return (
    <Recado
      tom="saiu"
      titulo="Quer sair da nossa lista?"
      acao={
        <form action="/api/newsletter/sair" method="post">
          <input type="hidden" name="t" value={token} />
          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Confirmar saída
          </button>
        </form>
      }
    >
      <p>Você deixa de receber a newsletter da Cruz Vermelha do Rio de Janeiro.</p>
      <p>Se preferir continuar recebendo, é só fechar esta página — nada muda.</p>
    </Recado>
  )
}
