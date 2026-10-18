'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, RefreshCw, Send, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { enviarFilaAgora, ligarRecebimentoDoWhatsapp, testarWhatsapp } from '@/app/actions/whatsapp'
import { COTA_DE_CONVERSAS, ROTULO_DO_ESTADO, limiteDaCota, type EstadoDaConexao } from '@/lib/whatsapp/regras'

export type LinhaDoRegistroNaTela = {
  id: number
  quando: string
  direcao: 'entrada' | 'saida'
  tipo: string
  situacao: string
  quem: string
  detalhe: string | null
}

type Recado = { tom: 'ok' | 'erro'; texto: string } | null

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

const TIPO: Record<string, string> = { aviso: 'Aviso', seguranca: 'Segurança da conta', codigo: 'Código de confirmação', bot: 'Bot', teste: 'Teste' }
const SITUACAO: Record<string, string> = { recebida: 'Recebida', enviada: 'Enviada', falhou: 'Falhou', ignorada: 'Ignorada' }
const WEBHOOK: Record<string, string> = {
  ligado: 'Ligado: o que chega ao número vem para o Palácio Virtual, e o bot responde.',
  outro_endereco: 'Configurado para outro endereço (ou sem a senha do Palácio). O bot não recebe nada até ligar por aqui.',
  desligado: 'Desligado: o bot não recebe as mensagens.',
  desconhecido: 'Não deu para ler a configuração na Kapso.',
}

function MostrarRecado({ recado }: { recado: Recado }) {
  if (!recado) return null
  return <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`}>{recado.texto}</p>
}

/** Os nomes dos modelos aprovados para fora da janela de 24 h (null = não informado em Integrações). Não são segredo. */
type ModelosNaTela = { aviso: string | null; codigo: string | null; seguranca: string | null }

const Nome = ({ nome }: { nome: string }) => <strong className="font-mono text-xs text-foreground">{nome}</strong>

/**
 * Fora da janela de 24 h, só sai modelo aprovado, um por finalidade (lib/whatsapp/regras.ts,
 * modeloParaEnviar): diz quais estão em Integrações e o que acontece sem cada um.
 */
function ModelosDaJanela({ modelos }: { modelos: ModelosNaTela }) {
  return (
    <div data-ajuda="whatsapp.modelos" className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p>Pela API oficial, o Palácio só manda texto livre para quem escreveu ao número nas últimas 24 horas. Para os outros, só sai modelo aprovado pela Meta:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>Avisos e teste: {modelos.aviso ? <>modelo <Nome nome={modelos.aviso} />, com o texto inteiro na variável.</> : 'nenhum modelo; fora da janela, o aviso falha e fica em “Últimas mensagens”.'}</li>
        <li>Código de confirmação: {modelos.codigo
          ? <>modelo <Nome nome={modelos.codigo} />, da categoria Autenticação (texto fixo da Meta, com o botão de copiar).</>
          : 'nenhum modelo de Autenticação; fora da janela, o código não sai (“Gerar código”, o caminho padrão, não depende disso).'}</li>
        <li>Segurança da conta: {modelos.seguranca ? <>modelo <Nome nome={modelos.seguranca} />.</> : modelos.aviso ? <>pelo modelo dos avisos, <Nome nome={modelos.aviso} />.</> : 'nenhum modelo.'}</li>
      </ul>
      <p>As respostas do bot nunca vão por modelo: quem escreve abre a janela. Os nomes ficam em <Link href="/configuracoes/integracoes" className="text-primary hover:underline">Integrações</Link>, no cartão da Kapso.</p>
    </div>
  )
}

/**
 * A conexão do número do Palácio (pela Kapso): estado, recebimento (webhook),
 * fila, teste e as últimas mensagens. Tudo passa pelas actions de
 * app/actions/whatsapp.ts, que conferem de novo que quem clicou é admin.
 */
export function PainelDoWhatsapp(p: {
  /** O Phone number ID do número na Kapso. */
  numeroId: string
  estado: EstadoDaConexao
  erro: string | null
  modelos: ModelosNaTela
  webhook: string
  numeroConectado: string | null
  nomeConectado: string | null
  meuNumero: string | null
  registro: LinhaDoRegistroNaTela[]
  registroIndisponivel: boolean
  /** null: a fila ainda não existe no banco. `cota`: o que ficou para o dia seguinte pela cota diária. */
  fila: { silencio: number; volume: number; falha: number; cota: number } | null
  /** As conversas que o Palácio iniciou nas últimas 24 h (a cota diária da Meta); null: não deu para contar. */
  conversas: number | null
}) {
  const router = useRouter()
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()

  function acao(fn: () => Promise<{ erro?: string; recado?: string }>) {
    setRecado(null)
    rodar(async () => {
      const r = await fn()
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  const conectado = p.estado === 'conectado'

  return (
    <div className="flex flex-col gap-6">
      <Card data-ajuda="whatsapp.conexao" className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conexão</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pela Kapso (API oficial do WhatsApp), número <strong className="text-foreground">{p.numeroId}</strong>.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${conectado ? 'bg-success/10 text-success' : p.estado === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-foreground'}`}>
            {conectado && <CheckCircle2 className="size-3.5" aria-hidden="true" />}{ROTULO_DO_ESTADO[p.estado]}
          </span>
        </div>
        {p.estado === 'erro' && p.erro && <p className="text-sm text-destructive">{p.erro}</p>}
        {p.estado === 'sem_instancia' && (
          <p className="text-sm text-muted-foreground">A Kapso não achou esse número. Confira o Phone number ID em Configurações → Integrações (está na tela do número no painel da Kapso).</p>
        )}
        {conectado && (
          <p className="text-sm">
            {p.numeroConectado ? <>Número conectado: <strong>{p.numeroConectado}</strong>{p.nomeConectado ? ` (${p.nomeConectado})` : ''}.</> : 'Conectado ao WhatsApp.'}
          </p>
        )}
        {conectado && <ModelosDaJanela modelos={p.modelos} />}
        <p className="text-xs text-muted-foreground">O número se conecta e se desconecta no painel da Kapso, não aqui.</p>
        <MostrarRecado recado={recado} />
      </Card>

      <Card data-ajuda="whatsapp.recebimento" className="flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Receber mensagens (bot)</h2>
        <p className="text-sm">{WEBHOOK[p.webhook] ?? WEBHOOK.desconhecido}</p>
        <p className="text-sm text-muted-foreground">
          O botão cria na Kapso o webhook deste número, só com as mensagens recebidas, assinadas com uma senha que o Palácio confere.
          Não cadastre a URL à mão no painel da Kapso: sem a senha certa, o Palácio recusa. Trocou a chave em Integrações? Ligue de novo.
        </p>
        <div><Button variant={p.webhook === 'ligado' ? 'outline' : 'default'} disabled={ocupado} onClick={() => acao(ligarRecebimentoDoWhatsapp)}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Webhook className="size-4" />}{p.webhook === 'ligado' ? 'Ligar de novo' : 'Ligar o recebimento de mensagens'}
        </Button></div>
      </Card>

      <Card data-ajuda="whatsapp.fila" className="flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fila e horário de silêncio</h2>
        <p className="text-sm text-muted-foreground">
          De 22h às 7h, os avisos comuns esperam e saem às 7h; portaria, segurança da conta, códigos e respostas do bot saem na hora.
          Saem no máximo 12 mensagens por minuto, e o que passar espera a vez. O que falhou porque a Kapso estava fora volta a ser tentado sozinho quando a conexão voltar.
        </p>
        {p.fila === null
          ? <p className="text-sm text-muted-foreground">A fila ainda não existe no banco (falta aplicar a migração da fila).</p>
          : p.fila.silencio + p.fila.volume + p.fila.falha + p.fila.cota === 0
            ? <p className="text-sm">A fila está vazia.</p>
            : <p className="text-sm">
              Na fila agora: <strong>{p.fila.silencio}</strong> esperando o fim do silêncio, <strong>{p.fila.volume}</strong> esperando a vez
              {p.fila.cota ? <>, <strong>{p.fila.falha}</strong> para reenviar e <strong>{p.fila.cota}</strong> para amanhã pela cota diária.</> : <> e <strong>{p.fila.falha}</strong> para reenviar.</>}
            </p>}
        <div data-ajuda="whatsapp.cota" className="flex flex-col gap-1 rounded-lg border border-border p-3">
          {p.conversas === null
            ? <p className="text-sm text-muted-foreground">Não deu para contar as conversas iniciadas agora. Sem a migração da cota, nada espera por ela.</p>
            : <p className="text-sm">
              Conversas que o Palácio iniciou nas últimas 24 horas: <strong>{p.conversas}</strong> de {COTA_DE_CONVERSAS.teto}
              {p.conversas >= limiteDaCota() && <span className="text-destructive"> — no limite: avisos comuns, convites e anúncios ficam para amanhã.</span>}
            </p>}
          <p className="text-xs text-muted-foreground">
            A Meta limita quantas pessoas diferentes o número procura por dia, fora da janela de 24 horas (quem escreveu ao número nas últimas 24 horas não conta).
            A partir de {limiteDaCota()}, avisos comuns, convites e anúncios aos voluntários esperam o dia seguinte; segurança da conta, códigos, portaria, alertas e respostas do bot continuam saindo.
          </p>
        </div>
        <div><Button variant="outline" disabled={ocupado || !p.fila || p.fila.volume + p.fila.falha === 0} onClick={() => acao(enviarFilaAgora)}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}Enviar a fila agora
        </Button></div>
        <p className="text-xs text-muted-foreground">O botão manda o que já pode sair. O que espera o fim do silêncio ou a cota diária continua esperando.</p>
      </Card>

      <Card data-ajuda="whatsapp.teste" className="flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Testar</h2>
        {p.meuNumero
          ? <p className="text-sm text-muted-foreground">O teste vai para o seu WhatsApp confirmado, <strong className="text-foreground">{p.meuNumero}</strong>. Depois, responda <strong className="text-foreground">menu</strong> para ver o bot.</p>
          : <p className="text-sm text-muted-foreground">Para testar, confirme antes o seu WhatsApp em <Link href="/perfil#whatsapp" className="text-primary hover:underline">Meu perfil</Link>.</p>}
        <div><Button variant="outline" disabled={ocupado || !p.meuNumero || !conectado} onClick={() => acao(testarWhatsapp)}><Send className="size-4" />Mandar mensagem de teste</Button></div>
      </Card>

      <Card data-ajuda="whatsapp.registro" className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Últimas mensagens</h2>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}><RefreshCw className="size-4" />Atualizar</Button>
        </div>
        <p className="text-xs text-muted-foreground">O que o Palácio mandou e recebeu. Do que chega, só fica o comando que o bot entendeu, nunca o texto da mensagem.</p>
        {p.registroIndisponivel
          ? <p className="text-sm text-muted-foreground">O registro ainda não existe no banco (falta aplicar a migração do WhatsApp).</p>
          : p.registro.length === 0
            ? <p className="text-sm text-muted-foreground">Nada ainda.</p>
            : <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {p.registro.map((l) => (
                <li key={l.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{l.direcao === 'entrada' ? 'Recebida' : 'Enviada'} · {TIPO[l.tipo] ?? l.tipo} · <span className="text-muted-foreground">{l.quem}</span></p>
                    {l.detalhe && <p className={`text-xs ${l.situacao === 'falhou' ? 'text-destructive' : 'text-muted-foreground'}`}>{l.detalhe}</p>}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{SITUACAO[l.situacao] ?? l.situacao} · {quando.format(new Date(l.quando))}</p>
                </li>
              ))}
            </ul>}
      </Card>
    </div>
  )
}
