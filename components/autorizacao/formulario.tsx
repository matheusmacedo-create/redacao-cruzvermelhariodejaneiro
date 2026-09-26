'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PenLine } from 'lucide-react'
import { botaoDoMembro, campoDoMembro } from '@/components/membro/marca'
import { Recado } from '@/components/membro/pecas'
import { USOS, VINCULOS, type DicasDoAparelho, type Tracos, type Uso, type Vinculo } from '@/lib/imagem/regras'
import { QuadroDeAssinatura } from './quadro-de-assinatura'

type NavegadorComDicas = Navigator & {
  userAgentData?: { mobile?: boolean; platform?: string; getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>> }
}

/**
 * O aparelho em que a pessoa assina: o que o navegador conta além do
 * User-Agent. O Chrome no Android só revela o modelo (ex.: SM-A546E) por aqui.
 */
async function dicasDoAparelho(): Promise<DicasDoAparelho> {
  const nav = navigator as NavegadorComDicas
  const dicas: DicasDoAparelho = {
    tela: `${screen.width}x${screen.height}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`,
    idioma: navigator.language,
    fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    toque: navigator.maxTouchPoints > 0,
  }
  const uad = nav.userAgentData
  if (uad) {
    dicas.movel = uad.mobile
    dicas.plataforma = uad.platform
    try {
      const alta = await uad.getHighEntropyValues?.(['model', 'platformVersion'])
      if (typeof alta?.model === 'string' && alta.model) dicas.modelo = alta.model
      if (typeof alta?.platformVersion === 'string') dicas.versaoDaPlataforma = alta.platformVersion
    } catch { /* o navegador pode recusar: fica o User-Agent */ }
  }
  return dicas
}

function Campo({ id, rotulo, dica, obrigatorio, children }: { id: string; rotulo: string; dica?: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{rotulo}{obrigatorio && <span aria-hidden="true" className="text-primary"> *</span>}</label>
      {dica && <p className="text-sm text-muted-foreground">{dica}</p>}
      {children}
    </div>
  )
}

export function FormularioDeAutorizacao({ token }: { token: string }) {
  const [nome, setNome] = useState('')
  const [vinculo, setVinculo] = useState<Vinculo | ''>('')
  const [contato, setContato] = useState('')
  const [menor, setMenor] = useState(false)
  const [responsavelNome, setResponsavelNome] = useState('')
  const [responsavelParentesco, setResponsavelParentesco] = useState('')
  const [usos, setUsos] = useState<Uso[]>([])
  const [aceite, setAceite] = useState(false)
  const [tracos, setTracos] = useState<Tracos>([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const router = useRouter()
  const inicio = useRef(0)
  const site = useRef<HTMLInputElement>(null)

  const marcarInicio = () => { if (!inicio.current) inicio.current = Date.now() }
  const alternarUso = (u: Uso) => setUsos((atual) => atual.includes(u) ? atual.filter((x) => x !== u) : [...atual, u])
  const todos = Object.keys(USOS) as Uso[]

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!tracos.length) { setErro('Assine no quadro antes de enviar.'); return }
    setEnviando(true)
    try {
      const resposta = await fetch(`/api/publico/autorizacao/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, vinculo, contato, menor, responsavelNome, responsavelParentesco, usos, aceite,
          assinatura: tracos, dicas: await dicasDoAparelho(), site: site.current?.value ?? '', _inicio: inicio.current,
        }),
      })
      const corpo = await resposta.json().catch(() => ({}))
      if (!resposta.ok || !corpo.codigo) { setErro(corpo.erro ?? 'Não foi possível enviar. Tente de novo.'); setEnviando(false); return }
      router.push(`/autorizacao/comprovante/${corpo.codigo}?c=${encodeURIComponent(corpo.chave)}&novo=1`)
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} onFocusCapture={marcarInicio} onPointerDownCapture={marcarInicio} className="flex flex-col gap-5" noValidate>
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label>Site<input ref={site} name="site" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Quem aparece nas fotos</legend>
        <Campo id="aut-nome" rotulo="Nome completo" obrigatorio>
          <input id="aut-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={200} className={campoDoMembro} required />
        </Campo>
        <Campo id="aut-vinculo" rotulo="Relação com a Cruz Vermelha" obrigatorio>
          <select id="aut-vinculo" value={vinculo} onChange={(e) => setVinculo(e.target.value as Vinculo)} className={campoDoMembro} required>
            <option value="">Escolha…</option>
            {(Object.entries(VINCULOS) as [Vinculo, string][]).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo id="aut-contato" rotulo="E-mail ou WhatsApp (opcional)" dica="Só para falarmos com você sobre esta autorização.">
          <input id="aut-contato" value={contato} onChange={(e) => setContato(e.target.value)} autoComplete="email" maxLength={200} className={campoDoMembro} />
        </Campo>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" checked={menor} onChange={(e) => setMenor(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
          <span>A pessoa das fotos tem <strong>menos de 18 anos</strong> — quem assina é o pai, a mãe ou o responsável.</span>
        </label>
        {menor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="aut-resp" rotulo="Nome completo do responsável" obrigatorio>
              <input id="aut-resp" value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} maxLength={200} className={campoDoMembro} />
            </Campo>
            <Campo id="aut-parentesco" rotulo="Parentesco" obrigatorio>
              <input id="aut-parentesco" value={responsavelParentesco} onChange={(e) => setResponsavelParentesco(e.target.value)} placeholder="Mãe, pai, avó, tutor…" maxLength={60} className={campoDoMembro} />
            </Campo>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">Onde as fotos podem aparecer</legend>
        <p className="text-sm text-muted-foreground">Marque só o que você autoriza.</p>
        <button type="button" onClick={() => setUsos(usos.length === todos.length ? [] : todos)} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          {usos.length === todos.length ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
        {todos.map((u) => (
          <label key={u} className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <input type="checkbox" checked={usos.includes(u)} onChange={() => alternarUso(u)} className="mt-0.5 size-5 accent-[var(--primary)]" />
            <span><span className="font-medium">{USOS[u].rotulo}</span><span className="block text-muted-foreground">{USOS[u].detalhe}</span></span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-lg font-semibold"><PenLine className="size-5" aria-hidden="true" />{menor ? 'Assinatura do responsável' : 'Sua assinatura'}</legend>
        <p className="text-sm text-muted-foreground">Assine com o dedo (ou o mouse) dentro do quadro, como no papel.</p>
        <QuadroDeAssinatura id="aut-assinatura" onChange={setTracos} />
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
          <span>Li o termo acima e concordo. Sei que posso revogar esta autorização quando quiser.</span>
        </label>
      </fieldset>

      {erro && <Recado tipo="erro">{erro}</Recado>}
      <button type="submit" disabled={enviando} className={`${botaoDoMembro} w-full sm:w-auto sm:self-start`}>
        {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{enviando ? 'Registrando…' : 'Assinar e enviar'}
      </button>
      <p className="text-xs text-muted-foreground">Ao assinar, ficam registrados a data e a hora, o endereço de internet (IP) e o aparelho usado, como prova da assinatura eletrônica.</p>
    </form>
  )
}
