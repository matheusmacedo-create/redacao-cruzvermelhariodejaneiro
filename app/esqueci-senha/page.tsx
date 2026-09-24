import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { EsqueciSenhaForm } from '@/components/auth/contas'
import { TelaDeConta } from '@/components/auth/tela-de-conta'

export default function EsqueciSenhaPage() {
  return (
    <TelaDeConta
      icone={<KeyRound className="size-6" />}
      titulo="Esqueci minha senha"
      descricao="Informe seu usuário ou o seu e-mail de recuperação. Enviamos o link para o e-mail de recuperação confirmado em Meu perfil — sem ele cadastrado antes, não há para onde enviar."
      rodape={<><p>Nunca cadastrou um e-mail de recuperação? Peça a um administrador: ele gera uma senha temporária para você entrar e cadastrar o e-mail.</p><Link href="/" className="mt-2 inline-block underline-offset-4 hover:underline">Voltar ao login</Link></>}
    >
      <EsqueciSenhaForm />
    </TelaDeConta>
  )
}
