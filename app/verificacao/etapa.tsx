'use client'

import { useRouter } from 'next/navigation'
import { CadastroDoApp, DigitarCodigo } from '@/components/auth/verificacao'

export function EtapaDeVerificacao({ modo, fatores }: { modo: 'codigo' | 'cadastrar'; fatores: { id: string; nome: string }[] }) {
  const router = useRouter()
  // A sessão subiu para aal2 e o cookie foi regravado: o servidor precisa
  // ler de novo, por isso refresh antes de seguir.
  const seguir = () => { router.refresh(); router.replace('/dashboard') }
  return modo === 'cadastrar'
    ? <CadastroDoApp aoConcluir={seguir} />
    : <DigitarCodigo fatores={fatores} aoConcluir={seguir} />
}
