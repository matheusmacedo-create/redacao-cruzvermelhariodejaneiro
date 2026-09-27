'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Globe, LayoutGrid, Mail, PlugZap, Smartphone } from 'lucide-react'

const ITENS = [
  { href: '/configuracoes', rotulo: 'Visão geral', icone: LayoutGrid },
  { href: '/configuracoes/email', rotulo: 'E-mail dos setores', icone: Mail },
  { href: '/configuracoes/integracoes', rotulo: 'Integrações', icone: PlugZap },
  { href: '/configuracoes/whatsapp', rotulo: 'WhatsApp', icone: Smartphone },
  { href: '/configuracoes/site', rotulo: 'Site', icone: Globe },
  { href: '/configuracoes/zona-de-risco', rotulo: 'Zona de risco', icone: AlertTriangle },
] as const

/**
 * O submenu das Configurações (só administradores): cada assunto numa tela,
 * em vez de tudo empilhado numa página só. Mora no layout, então aparece em
 * todas as telas daqui.
 */
export function SubmenuDasConfiguracoes() {
  const atual = usePathname()
  return (
    <nav className="-mt-2 mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Seções das configurações" data-ajuda="configuracoes.submenu">
      {ITENS.map((i) => {
        const aberto = atual === i.href
        return (
          <Link key={i.href} href={i.href} aria-current={aberto ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aberto ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <i.icone className="size-4" aria-hidden="true" />{i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
