import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { EsqueciSenhaForm } from '@/components/auth/contas'
import { TelaDeConta } from '@/components/auth/tela-de-conta'

export default function EsqueciSenhaPage() {
  return (
    <TelaDeConta
      icone={<KeyRound className="size-6" />}
      titulo="Esqueci minha senha"
      descricao="Informe seu usuário ou o e-mail cadastrado. Se a conta tiver um e-mail confirmado, enviamos um link para você escolher uma senha nova."
      rodape={<><p>Sem e-mail cadastrado? Um administrador pode gerar uma senha temporária para você.</p><Link href="/" className="mt-2 inline-block underline-offset-4 hover:underline">Voltar ao login</Link></>}
    >
      <EsqueciSenhaForm />
    </TelaDeConta>
  )
}
