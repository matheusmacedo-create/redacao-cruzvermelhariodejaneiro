import { Recado } from '@/components/newsletter/recado'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sair da lista — Cruz Vermelha RJ' }

/**
 * A página do link de saída dos comunicados. Não descadastra ninguém: só
 * mostra o botão, que faz POST. Filtro de segurança corporativo abre todo
 * link de todo e-mail — se sair fosse GET, ele tiraria da lista quem nunca
 * clicou. Formulário comum, sem JavaScript: sair não pode depender do
 * navegador cooperar.
 */
export default async function SairDosComunicados({
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
      titulo="Quer deixar de receber nossos comunicados?"
      acao={
        <form action="/api/comunicados/sair" method="post">
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
      <p>Você deixa de receber os comunicados da assessoria da Cruz Vermelha do Rio de Janeiro.</p>
      <p>Se preferir continuar recebendo, é só fechar esta página — nada muda.</p>
    </Recado>
  )
}
