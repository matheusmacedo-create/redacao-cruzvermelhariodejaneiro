import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { PainelDaVoz } from '@/components/admin/voz'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'
import { createAdminClient } from '@/lib/supabase/admin'
import { chaveDaElevenlabs, configDaVoz, listarVozes } from '@/lib/voz/elevenlabs'

export const metadata = { title: 'Voz — Configurações' }

const Cabecalho = () => <p className="mb-6 text-sm text-muted-foreground">A voz da instituição, pela ElevenLabs: narra as matérias publicadas no site e, no WhatsApp, responde em áudio a quem mandou áudio ao assistente. Os dois usos começam desligados.</p>

export default async function VozPage() {
  const context = await exigirAdministracao()

  const chave = await chaveDaElevenlabs(context.workspace.id)
  if (!chave) {
    return <div className="mx-auto max-w-3xl"><Cabecalho />
      <Card data-ajuda="voz.configurar" className="flex flex-col gap-3 p-6">
        <h2 className="font-semibold">Falta a chave da ElevenLabs</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Em elevenlabs.io → Developers → API keys, crie uma chave com acesso a “Text to Speech” e “Voices”.</li>
          <li>Abra <Link href="/configuracoes/integracoes" className="text-primary hover:underline">Integrações</Link>, ache o cartão “ElevenLabs (voz da instituição)”, cole a chave e toque em “Salvar no cofre”.</li>
          <li>Volte a esta tela para escolher a voz e ligar a narração.</li>
        </ol>
        <p className="text-xs text-muted-foreground">A chave vai direto para o cofre e não aparece mais para ninguém. Nunca a mande por chat, e-mail ou print.</p>
      </Card>
    </div>
  }

  // Listar as vozes não custa crédito; a amostra pronta de cada uma é da própria ElevenLabs.
  const [config, vozes] = await Promise.all([configDaVoz(createAdminClient(), context.workspace.id), listarVozes(chave)])

  return <div className="mx-auto max-w-3xl"><Cabecalho />
    <PainelDaVoz
      pronto={config !== 'indisponivel'}
      config={config === 'indisponivel' ? null : config}
      vozes={vozes.ok ? vozes.vozes : []}
      erroDasVozes={vozes.ok ? null : vozes.erro}
    />
  </div>
}
