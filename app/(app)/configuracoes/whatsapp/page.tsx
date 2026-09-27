import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { PainelDoWhatsapp, type LinhaDoRegistroNaTela } from '@/components/admin/whatsapp'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'
import { createClient } from '@/lib/supabase/server'
import { configDoWhatsapp, perfilConectado, situacaoDaConexao, situacaoDoWebhook } from '@/lib/whatsapp/servidor'
import { formatarNumero, mascararNumero } from '@/lib/whatsapp/regras'

export const metadata = { title: 'WhatsApp — Configurações' }

const Cabecalho = () => <p className="mb-6 text-sm text-muted-foreground">O número do Palácio Virtual no WhatsApp, pela Evolution API: os avisos do sino chegam por lá para quem confirmou o número em Meu perfil, e o bot responde a quem escreve.</p>

export default async function WhatsappPage() {
  const context = await exigirAdministracao()

  const config = await configDoWhatsapp(context.workspace.id)
  if (!config) {
    return <div className="mx-auto max-w-3xl"><Cabecalho />
      <Card data-ajuda="whatsapp.configurar" className="flex flex-col gap-3 p-6">
        <h2 className="font-semibold">Falta configurar a Evolution API</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Abra <Link href="/configuracoes/integracoes" className="text-primary hover:underline">Integrações</Link>, no submenu, e ache o cartão “WhatsApp (Evolution API)”.</li>
          <li>Preencha o endereço do servidor (ex.: https://evolution.seudominio.org), o nome da instância e a chave da API.</li>
          <li>Toque em “Salvar no cofre” e volte a esta tela para conectar o número pelo QR code.</li>
        </ol>
        <p className="text-xs text-muted-foreground">A chave vai direto para o cofre e não aparece mais para ninguém. Nunca a mande por chat, e-mail ou print.</p>
      </Card>
    </div>
  }

  const supabase = await createClient()
  const [conexao, webhook, meu, registro] = await Promise.all([
    situacaoDaConexao(config),
    situacaoDoWebhook(config, context.workspace.id),
    supabase.from('whatsapp_contas').select('numero').eq('user_id', context.user.id).maybeSingle(),
    supabase.from('whatsapp_mensagens').select('id, direcao, tipo, situacao, numero, comando, erro, criado_em, profiles:user_id(full_name)')
      .eq('workspace_id', context.workspace.id).order('criado_em', { ascending: false }).limit(30),
  ])
  const conectado = conexao.estado === 'conectado' ? await perfilConectado(config) : { numero: null, nome: null }

  const linhas: LinhaDoRegistroNaTela[] = (registro.data ?? []).map((l) => {
    const perfil = (Array.isArray(l.profiles) ? l.profiles[0] : l.profiles) as { full_name?: string | null } | null
    return {
      id: l.id as number,
      quando: l.criado_em as string,
      direcao: l.direcao as 'entrada' | 'saida',
      tipo: l.tipo as string,
      situacao: l.situacao as string,
      quem: perfil?.full_name ?? mascararNumero(l.numero as string | null),
      detalhe: (l.erro as string | null) ?? (l.comando ? `Comando: ${l.comando}` : null),
    }
  })
  const servidor = new URL(config.url)

  return <div className="mx-auto max-w-3xl"><Cabecalho />
    <PainelDoWhatsapp
      instancia={config.instancia}
      servidor={servidor.host}
      semHttps={servidor.protocol === 'http:'}
      estado={conexao.estado}
      erro={conexao.erro}
      webhook={webhook}
      numeroConectado={conectado.numero ? formatarNumero(conectado.numero) : null}
      nomeConectado={conectado.nome}
      meuNumero={meu.data?.numero ? formatarNumero(meu.data.numero as string) : null}
      registro={linhas}
      registroIndisponivel={Boolean(registro.error)}
    />
  </div>
}
