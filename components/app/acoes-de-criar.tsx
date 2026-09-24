'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, LifeBuoy, Send, SquarePen, type LucideIcon } from 'lucide-react'
import { criarPacote } from '@/app/actions/pacotes'
import { criarOficio } from '@/app/actions/oficios'

/**
 * O que dá para começar de qualquer tela — o botão Criar do topo e a busca
 * (⌘K) leem desta lista. Cada item faz exatamente o que o botão da própria
 * área faz: "Nova publicação" cria o pacote como o botão de Publicações, e
 * "Novo ofício" abre o rascunho como o botão de Ofícios.
 */
export type AcaoDeCriar = {
  id: 'registrar' | 'pacote' | 'oficio' | 'chamado'
  rotulo: string
  resumo: string
  icone: LucideIcon
  termos?: string[]
  /** Leva a uma tela; sem href, a ação cria o registro e abre. */
  href?: string
}

export const ACOES_DE_CRIAR: AcaoDeCriar[] = [
  { id: 'registrar', rotulo: 'Registrar atividade', resumo: 'Conte o que aconteceu; vira pauta na Entrada', icone: SquarePen, href: '/registrar', termos: ['nova pauta', 'registrar', 'ação', 'evento', 'ideia'] },
  { id: 'pacote', rotulo: 'Nova publicação', resumo: 'Um pacote para redes, site e newsletter', icone: Send, termos: ['novo pacote', 'post', 'publicar'] },
  { id: 'oficio', rotulo: 'Novo ofício', resumo: 'Rascunho que ganha número ao ser emitido', icone: FileSignature, termos: ['documento oficial', 'carta'] },
  { id: 'chamado', rotulo: 'Abrir chamado', resumo: 'Pedido para TI, Manutenção e outras equipes', icone: LifeBuoy, href: '/chamados/novo', termos: ['suporte', 'ti', 'manutenção', 'pedido'] },
]

export function useCriar() {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState('')

  function executar(acao: AcaoDeCriar, depois?: () => void) {
    setErro('')
    if (acao.href) {
      router.push(acao.href)
      depois?.()
      return
    }
    iniciar(async () => {
      if (acao.id === 'pacote') {
        const r = await criarPacote(new FormData())
        if (r.erro) { setErro(r.erro); return }
        if (r.id) router.push(`/redes/${r.id}`)
      } else if (acao.id === 'oficio') {
        // A action redireciona para o rascunho (navegação do lado do cliente).
        try { await criarOficio() } catch {
          setErro('Não foi possível criar o ofício.')
          return
        }
      }
      depois?.()
    })
  }

  return { executar, pendente, erro, limparErro: () => setErro('') }
}
