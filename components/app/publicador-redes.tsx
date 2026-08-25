'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, Send, Share2, TriangleAlert, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { publicarNasRedes, atualizarStatusPublicacao } from '@/app/actions/redes'

/** Rótulo e regra de cada rede oferecida na tela. */
const REDES = [
  { id: 'facebook', nome: 'Facebook', exigeImagem: false },
  { id: 'instagram', nome: 'Instagram', exigeImagem: true },
  { id: 'linkedin', nome: 'LinkedIn', exigeImagem: false },
  { id: 'x', nome: 'X', exigeImagem: false },
  { id: 'threads', nome: 'Threads', exigeImagem: false },
  { id: 'bluesky', nome: 'Bluesky', exigeImagem: false },
] as const

/** Limites por rede, para mostrar o contador antes de o envio ser recusado. */
const LIMITES: Record<string, number> = {
  bluesky: 300, linkedin: 3_000, instagram: 2_200, pinterest: 500,
}

export type PublicacaoRegistro = {
  id: string
  redes: string[]
  corpo: string
  status: string
  criadaEm: string
  agendadaPara: string | null
  erro: string | null
  resultados: Array<{ rede: string; ok: boolean; mensagem: string | null; url: string | null; pulada: boolean }>
}

const ROTULO_STATUS: Record<string, string> = {
  pending: 'aguardando', queued: 'na fila', processing: 'processando',
  in_progress: 'em andamento', completed: 'publicado', failed: 'falhou',
}

export function PublicadorRedes({
  contentId,
  textoInicial,
  linkInicial = '',
  publicacoes = [],
}: {
  contentId?: string
  textoInicial: string
  linkInicial?: string
  publicacoes?: PublicacaoRegistro[]
}) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [corpo, setCorpo] = useState(textoInicial)
  const [linkUrl, setLinkUrl] = useState(linkInicial)
  const [imagemUrl, setImagemUrl] = useState('')
  const [agendarPara, setAgendarPara] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [conectadas, setConectadas] = useState<string[] | null>(null)
  const [estadoConexao, setEstadoConexao] = useState<'carregando' | 'ok' | 'sem-chave' | 'indisponivel'>('carregando')

  useEffect(() => {
    let ativo = true
    fetch('/api/redes/conectadas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((dados) => {
        if (!ativo) return
        setConectadas(dados.redes ?? [])
        setEstadoConexao(!dados.configurado ? 'sem-chave' : dados.indisponivel ? 'indisponivel' : 'ok')
      })
      .catch(() => { if (ativo) setEstadoConexao('indisponivel') })
    return () => { ativo = false }
  }, [])

  const alternar = (id: string) =>
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((r) => r !== id) : [...atual, id]))

  // O menor limite entre as redes marcadas é o que vale: o mesmo texto vai
  // para todas, então quem tem o teto mais baixo manda no contador.
  const limite = selecionadas.reduce<number | null>((menor, rede) => {
    const l = LIMITES[rede]
    if (!l) return menor
    return menor === null ? l : Math.min(menor, l)
  }, null)

  const precisaImagem = selecionadas.includes('instagram') && !imagemUrl.trim()
  const excedeu = limite !== null && corpo.length > limite

  function enviar() {
    setErro(''); setAviso('')
    const form = new FormData()
    if (contentId) form.set('contentId', contentId)
    for (const rede of selecionadas) form.append('redes', rede)
    form.set('corpo', corpo)
    form.set('linkUrl', linkUrl.trim())
    form.set('imagemUrl', imagemUrl.trim())
    form.set('agendarPara', agendarPara)

    iniciarEnvio(async () => {
      try {
        await publicarNasRedes(form)
        setAviso(agendarPara ? 'Publicação agendada.' : 'Enviado. O resultado por rede aparece abaixo em alguns segundos.')
        setSelecionadas([])
        router.refresh()
      } catch (causa) {
        setErro(causa instanceof Error ? causa.message : 'Não foi possível publicar.')
      }
    })
  }

  const bloqueado =
    enviando || !selecionadas.length || corpo.trim().length < 2 || precisaImagem || excedeu || estadoConexao !== 'ok'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="size-4" />
          Publicar nas redes
        </CardTitle>
        <CardDescription>
          O mesmo texto vai para as redes marcadas. O envio é assíncrono: o resultado de cada
          rede chega em seguida.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {estadoConexao === 'sem-chave' && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            A integração com as redes ainda não foi configurada neste ambiente.
          </p>
        )}
        {estadoConexao === 'indisponivel' && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Não foi possível consultar as redes conectadas agora. Tente novamente em instantes.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {REDES.map((rede) => {
            const disponivel = conectadas === null || conectadas.includes(rede.id)
            const marcada = selecionadas.includes(rede.id)
            return (
              <button
                key={rede.id}
                type="button"
                disabled={!disponivel || estadoConexao !== 'ok'}
                onClick={() => alternar(rede.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  marcada
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={disponivel ? undefined : 'Conta não conectada'}
              >
                {rede.nome}
              </button>
            )
          })}
        </div>
        {conectadas?.length === 0 && estadoConexao === 'ok' && (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta conectada ainda. Um administrador precisa autorizar as contas em{' '}
            <span className="font-medium text-foreground">/api/admin/redes-conectar</span>.
          </p>
        )}

        <div>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:border-ring"
            placeholder="Texto da publicação"
          />
          <p className={`mt-1 text-xs ${excedeu ? 'text-destructive' : 'text-muted-foreground'}`}>
            {corpo.length} caracteres
            {limite !== null && ` · limite de ${limite} na rede mais restrita marcada`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Link da matéria (opcional)</span>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://cruzvermelhariodejaneiro.org/noticias/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">
              URL da imagem {selecionadas.includes('instagram') && <span className="text-destructive">obrigatória</span>}
            </span>
            <input
              type="url"
              value={imagemUrl}
              onChange={(e) => setImagemUrl(e.target.value)}
              placeholder="https://cruzvermelhariodejaneiro.org/noticias/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Agendar (opcional)</span>
            <input
              type="datetime-local"
              value={agendarPara}
              onChange={(e) => setAgendarPara(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </label>
        </div>

        {precisaImagem && (
          <p className="text-sm text-destructive">
            O Instagram não aceita publicação sem imagem. Informe a URL ou desmarque o Instagram.
          </p>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

        <div className="flex justify-end">
          <Button onClick={enviar} disabled={bloqueado}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {agendarPara ? 'Agendar' : 'Publicar agora'}
          </Button>
        </div>

        {publicacoes.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Envios desta matéria</p>
            {publicacoes.map((pub) => (
              <RegistroDeEnvio key={pub.id} publicacao={pub} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RegistroDeEnvio({ publicacao }: { publicacao: PublicacaoRegistro }) {
  const router = useRouter()
  const [atualizando, iniciar] = useTransition()
  const [erro, setErro] = useState('')

  const terminou = publicacao.status === 'completed' || publicacao.status === 'failed'

  function atualizar() {
    setErro('')
    const form = new FormData()
    form.set('publicacaoId', publicacao.id)
    iniciar(async () => {
      try {
        await atualizarStatusPublicacao(form)
        router.refresh()
      } catch (causa) {
        setErro(causa instanceof Error ? causa.message : 'Não foi possível atualizar.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              publicacao.status === 'failed'
                ? 'bg-destructive/10 text-destructive'
                : publicacao.status === 'completed'
                  ? 'bg-muted text-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {ROTULO_STATUS[publicacao.status] ?? publicacao.status}
          </span>
          <span className="text-muted-foreground">{publicacao.redes.join(', ')}</span>
          <span className="text-xs text-muted-foreground">
            {publicacao.agendadaPara ? `agendado para ${publicacao.agendadaPara}` : publicacao.criadaEm}
          </span>
        </div>
        {!terminou && (
          <Button variant="ghost" size="sm" onClick={atualizar} disabled={atualizando}>
            {atualizando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Atualizar
          </Button>
        )}
      </div>

      {publicacao.resultados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {publicacao.resultados.map((r, i) => (
            <li key={`${r.rede}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{r.rede}</span>
              <span className={r.ok ? 'text-muted-foreground' : 'text-destructive'}>
                {r.pulada ? 'conta não conectada' : r.ok ? 'ok' : (r.mensagem ?? 'falhou')}
              </span>
              {r.url && (
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  ver post <ExternalLink className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {publicacao.erro && <p className="mt-2 text-xs text-destructive">{publicacao.erro}</p>}
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
    </div>
  )
}
