'use client'

import { useRouter } from 'next/navigation'
import { CadastroDoApp, DigitarCodigo } from '@/components/auth/verificacao'

/** `destino`: para onde seguir depois do código (já conferido na página: só caminho do Palácio); sem ele, o início. */
export function EtapaDeVerificacao({ modo, fatores, destino }: { modo: 'codigo' | 'cadastrar'; fatores: { id: string; nome: string }[]; destino?: string | null }) {
  const router = useRouter()
  // A sessão subiu para aal2 e o cookie foi regravado: o servidor precisa
  // ler de novo, por isso refresh antes de seguir.
  const seguir = () => { router.refresh(); router.replace(destino ?? '/dashboard') }
  return modo === 'cadastrar'
    ? <CadastroDoApp aoConcluir={seguir} />
    : <DigitarCodigo fatores={fatores} aoConcluir={seguir} />
}
