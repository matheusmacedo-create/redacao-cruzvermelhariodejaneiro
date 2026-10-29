import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { EsqueciSenhaForm } from '@/components/auth/contas'
import { TelaDeConta } from '@/components/auth/tela-de-conta'

export default function EsqueciSenhaPage() {
  return (
    <TelaDeConta
      icone={<KeyRound className="size-6" />}
      titulo="Esqueci minha senha"
      descricao="Informe seu usuário, o seu e-mail de recuperação ou o seu WhatsApp. Enviamos o link para o e-mail confirmado em Meu perfil e para o WhatsApp confirmado na conta — sem nenhum dos dois, não há para onde enviar."
      rodape={<><p>Sem e-mail de recuperação e sem WhatsApp confirmado? Peça a um administrador: ele gera uma senha temporária para você entrar e cadastrar o e-mail.</p><Link href="/" className="mt-2 inline-block underline-offset-4 hover:underline">Voltar ao login</Link></>}
    >
      <EsqueciSenhaForm />
    </TelaDeConta>
  )
}
