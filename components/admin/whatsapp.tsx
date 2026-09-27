'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, LogOut, PlugZap, QrCode, RefreshCw, Send, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { conectarWhatsapp, criarInstanciaDoWhatsapp, desconectarWhatsapp, enviarFilaAgora, estadoDoWhatsapp, ligarRecebimentoDoWhatsapp, testarWhatsapp } from '@/app/actions/whatsapp'
import { ROTULO_DO_ESTADO, type EstadoDaConexao } from '@/lib/whatsapp/regras'

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
const campo = 'h-10 min-w-56 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

const TIPO: Record<string, string> = { aviso: 'Aviso', seguranca: 'Segurança da conta', codigo: 'Código de confirmação', bot: 'Bot', teste: 'Teste' }
const SITUACAO: Record<string, string> = { recebida: 'Recebida', enviada: 'Enviada', falhou: 'Falhou', ignorada: 'Ignorada' }
const WEBHOOK: Record<string, string> = {
  ligado: 'Ligado: o que chega ao número vem para o Palácio Virtual, e o bot responde.',
  outro_endereco: 'Configurado para outro endereço (ou sem a senha do Palácio). O bot não recebe nada até ligar por aqui.',
  desligado: 'Desligado: o bot não recebe as mensagens.',
  desconhecido: 'Não deu para ler a configuração no servidor.',
}

function MostrarRecado({ recado }: { recado: Recado }) {
  if (!recado) return null
  return <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`}>{recado.texto}</p>
}

/**
 * A conexão do número do Palácio: estado, QR code, recebimento (webhook),
 * teste e as últimas mensagens. Tudo passa pelas actions de
 * app/actions/whatsapp.ts, que conferem de novo que quem clicou é admin.
 */
export function PainelDoWhatsapp(p: {
  instancia: string
  servidor: string
  semHttps: boolean
  estado: EstadoDaConexao
  erro: string | null
  webhook: string
  numeroConectado: string | null
  nomeConectado: string | null
  meuNumero: string | null
  registro: LinhaDoRegistroNaTela[]
  registroIndisponivel: boolean
  /** null: a fila ainda não existe no banco. */
  fila: { silencio: number; volume: number; falha: number } | null
}) {
  const router = useRouter()
  // O que a tela descobriu sozinha (conectou pelo QR) vale até a próxima leitura do servidor.
  const [estadoVisto, setEstado] = useState<EstadoDaConexao | null>(null)
  const estado = estadoVisto ?? p.estado
  const [qr, setQr] = useState<{ imagem: string | null; codigo: string | null } | null>(null)
  const [numeroDoPareamento, setNumeroDoPareamento] = useState('')
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()
  const renovacoes = useRef(0)

  // Com o QR aberto: confere a conexão a cada 4 s e troca o QR a cada 30 s (ele vence).
  useEffect(() => {
    if (!qr) return
    const conferir = setInterval(async () => {
      const r = await estadoDoWhatsapp()
      if (r.estado === 'conectado') {
        setQr(null)
        setEstado('conectado')
        setRecado({ tom: 'ok', texto: 'Conectado. Agora ligue o recebimento de mensagens, logo abaixo, se ainda não estiver ligado.' })
        router.refresh()
      }
    }, 4000)
    const renovar = setInterval(async () => {
      if (renovacoes.current >= 6) { setQr(null); setRecado({ tom: 'erro', texto: 'O QR code venceu. Toque em “Conectar pelo QR code” de novo.' }); return }
      renovacoes.current++
      const form = new FormData()
      const r = await conectarWhatsapp(form)
      if (r.imagem) setQr((atual) => (atual ? { ...atual, imagem: r.imagem ?? null } : atual))
    }, 30_000)
    return () => { clearInterval(conferir); clearInterval(renovar) }
  }, [qr, router])

  function acao(fn: () => Promise<{ erro?: string; recado?: string }>, depois?: () => void) {
    setRecado(null)
    rodar(async () => {
      const r = await fn()
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) { depois?.(); setEstado(null); router.refresh() }
    })
  }

  function conectar(comNumero: boolean) {
    setRecado(null)
    renovacoes.current = 0
    rodar(async () => {
      const form = new FormData()
      if (comNumero) form.set('numero', numeroDoPareamento)
      const r = await conectarWhatsapp(form)
      if (r.erro) return setRecado({ tom: 'erro', texto: r.erro })
      if (r.conectado) { setEstado('conectado'); router.refresh(); return setRecado({ tom: 'ok', texto: 'Este número já está conectado.' }) }
      setQr({ imagem: r.imagem ?? null, codigo: r.codigo ?? null })
    })
  }

  const conectado = estado === 'conectado'

  return (
    <div className="flex flex-col gap-6">
      <Card data-ajuda="whatsapp.conexao" className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conexão</h2>
            <p className="mt-1 text-sm text-muted-foreground">Instância <strong className="text-foreground">{p.instancia}</strong> em {p.servidor}.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${conectado ? 'bg-success/10 text-success' : estado === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-foreground'}`}>
            {conectado && <CheckCircle2 className="size-3.5" aria-hidden="true" />}{ROTULO_DO_ESTADO[estado]}
          </span>
        </div>
        {p.semHttps && <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">O endereço do servidor é <strong>http</strong>, sem cadeado: a chave da API viaja sem criptografia. Use https no servidor da Evolution assim que puder.</p>}
        {estado === 'erro' && p.erro && <p className="text-sm text-destructive">{p.erro}</p>}

        {conectado && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {p.numeroConectado ? <>Número conectado: <strong>{p.numeroConectado}</strong>{p.nomeConectado ? ` (${p.nomeConectado})` : ''}.</> : 'Conectado ao WhatsApp.'}
            </p>
            <Button variant="destructive" disabled={ocupado} onClick={() => { if (confirm('Desconectar o WhatsApp do Palácio? Os avisos e o bot param até conectar de novo pelo QR code.')) acao(desconectarWhatsapp) }}>
              <LogOut className="size-4" />Desconectar
            </Button>
          </div>
        )}

        {estado === 'sem_instancia' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">O servidor não tem uma instância com esse nome. Crie aqui (a chave precisa ser a global do servidor) ou no painel da Evolution, e confira o nome em Configurações → Integrações.</p>
            <div><Button disabled={ocupado} onClick={() => acao(criarInstanciaDoWhatsapp)}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}Criar a instância</Button></div>
          </div>
        )}

        {(estado === 'desconectado' || estado === 'conectando') && !qr && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Use um celular com o chip do Palácio (não um número pessoal). No WhatsApp desse celular: <strong>Configurações → Dispositivos conectados → Conectar um dispositivo</strong>, e aponte a câmera para o QR code.
            </p>
            <div><Button disabled={ocupado} onClick={() => conectar(false)}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}Conectar pelo QR code</Button></div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Não consegue ler o QR code? Receba um código de pareamento</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <input className={campo} inputMode="tel" autoComplete="off" placeholder="Número do chip do Palácio, com DDD" aria-label="Número do chip do Palácio" value={numeroDoPareamento} onChange={(e) => setNumeroDoPareamento(e.target.value)} disabled={ocupado} />
                <Button variant="outline" disabled={ocupado || numeroDoPareamento.replace(/\D/g, '').length < 10} onClick={() => conectar(true)}>Gerar código</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">No celular: Dispositivos conectados → Conectar um dispositivo → “Conectar com número de telefone”, e digite o código.</p>
            </details>
          </div>
        )}

        {qr && (
          <div className="flex flex-col items-start gap-3">
            {qr.imagem && (
              // O QR vem da Evolution como data URL; next/image não serve para isso.
              <img src={qr.imagem} alt="QR code para conectar o WhatsApp do Palácio Virtual" className="size-64 rounded-lg border border-border bg-white p-2" />
            )}
            {qr.codigo && <p className="text-sm">Código de pareamento: <strong className="font-mono text-lg tracking-widest">{qr.codigo}</strong></p>}
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Esperando a leitura. O QR code se renova sozinho a cada 30 segundos.</p>
            <Button variant="ghost" size="sm" onClick={() => setQr(null)}>Cancelar</Button>
          </div>
        )}
        <MostrarRecado recado={recado} />
      </Card>

      <Card data-ajuda="whatsapp.recebimento" className="flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Receber mensagens (bot)</h2>
        <p className="text-sm">{WEBHOOK[p.webhook] ?? WEBHOOK.desconhecido}</p>
        <p className="text-sm text-muted-foreground">
          O botão configura o servidor da Evolution para mandar ao Palácio só as mensagens recebidas e as mudanças de conexão, com uma senha num cabeçalho.
          Não preencha a URL do webhook à mão no painel da Evolution: sem a senha, o Palácio recusa. Trocou a chave em Integrações? Ligue de novo.
        </p>
        <div><Button variant={p.webhook === 'ligado' ? 'outline' : 'default'} disabled={ocupado} onClick={() => acao(ligarRecebimentoDoWhatsapp)}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Webhook className="size-4" />}{p.webhook === 'ligado' ? 'Ligar de novo' : 'Ligar o recebimento de mensagens'}
        </Button></div>
      </Card>

      <Card data-ajuda="whatsapp.fila" className="flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fila e horário de silêncio</h2>
        <p className="text-sm text-muted-foreground">
          De 22h às 7h, os avisos comuns esperam e saem às 7h; portaria, segurança da conta, códigos e respostas do bot saem na hora.
          Saem no máximo 12 mensagens por minuto, e o que passar espera a vez. O que falhou porque o servidor estava fora volta a ser tentado sozinho quando a conexão voltar.
        </p>
        {p.fila === null
          ? <p className="text-sm text-muted-foreground">A fila ainda não existe no banco (falta aplicar a migração da fila).</p>
          : p.fila.silencio + p.fila.volume + p.fila.falha === 0
            ? <p className="text-sm">A fila está vazia.</p>
            : <p className="text-sm">Na fila agora: <strong>{p.fila.silencio}</strong> esperando o fim do silêncio, <strong>{p.fila.volume}</strong> esperando a vez e <strong>{p.fila.falha}</strong> para reenviar.</p>}
        <div><Button variant="outline" disabled={ocupado || !p.fila || p.fila.volume + p.fila.falha === 0} onClick={() => acao(enviarFilaAgora)}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}Enviar a fila agora
        </Button></div>
        <p className="text-xs text-muted-foreground">O botão manda o que já pode sair. O que espera o fim do silêncio continua esperando.</p>
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
