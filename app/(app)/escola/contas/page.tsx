import { redirect } from 'next/navigation'

/** Endereço antigo: as contas da Únicopag moram em Contas e integrações. */
export default function ContasAntigas() {
  redirect('/escola/configuracoes')
}
