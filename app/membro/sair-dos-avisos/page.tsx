import Link from 'next/link'
import { Recado } from '@/components/newsletter/recado'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Avisos por e-mail — Cruz Vermelha RJ' }

/**
 * A página do link de saída no rodapé dos avisos. Ela NÃO tira ninguém da
 * lista: só mostra o botão, que envia o POST para /api/membro/sair-dos-avisos
 * (ver o motivo lá). Formulário comum, sem JavaScript.
 */
export default async function SairDosAvisos({ searchParams }: { searchParams: Promise<{ p?: string; t?: string; estado?: string }> }) {
  const { p = '', t = '', estado } = await searchParams

  if (estado === 'saiu') {
    return (
      <Recado tom="saiu" titulo="Pronto, você não recebe mais os avisos por e-mail">
        <p>Os avisos da coordenação continuam no mural da sua Área do Voluntário.</p>
        <p>Mudou de ideia? Volte a receber em <Link href="/membro/perfil" className="font-semibold text-primary hover:underline">Meu perfil</Link>.</p>
      </Recado>
    )
  }
  if (estado === 'falhou') {
    return <Recado tom="erro" titulo="Não deu para concluir agora"><p>Tente de novo em alguns minutos, ou desligue os avisos em Meu perfil, na Área do Voluntário.</p></Recado>
  }
  if (estado === 'invalido' || !/^[0-9a-f-]{36}$/.test(p) || !/^[0-9a-f]{64}$/.test(t)) {
    return (
      <Recado tom="erro" titulo="Link inválido">
        <p>Este endereço não parece um link de saída válido. Se copiou da mensagem, confira se veio inteiro.</p>
        <p>Você também pode desligar os avisos em Meu perfil, na Área do Voluntário.</p>
      </Recado>
    )
  }
  return (
    <Recado tom="saiu" titulo="Parar de receber os avisos por e-mail?"
      acao={
        <form action="/api/membro/sair-dos-avisos" method="post">
          <input type="hidden" name="p" value={p} />
          <input type="hidden" name="t" value={t} />
          <button type="submit" className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90">Confirmar</button>
        </form>
      }>
      <p>Você deixa de receber por e-mail os avisos da coordenação do Voluntariado. Eles continuam no mural da sua Área do Voluntário.</p>
      <p>E-mails sobre as suas inscrições, certificados e respostas às suas mensagens continuam chegando.</p>
    </Recado>
  )
}
