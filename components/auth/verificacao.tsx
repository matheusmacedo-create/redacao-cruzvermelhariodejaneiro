'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Loader2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { registrarMudancaNaVerificacao } from '@/app/actions/verificacao'
import { codigoValido, segredoLegivel } from '@/lib/usuarios/verificacao'

/**
 * Verificação em duas etapas, lado do navegador.
 *
 * Tudo aqui fala direto com o Supabase Auth (`auth.mfa.*`): o segredo do QR
 * Code vai do Auth para a tela e da tela para o app do celular, sem passar
 * pelo nosso servidor nem por log. Confirmar um código sobe a sessão para
 * `aal2`, e o cliente do @supabase/ssr regrava o cookie — é isso que o
 * servidor e o RLS leem em seguida.
 */

const EMISSOR = 'Redação CVB-RJ'

function CampoDoCodigo({ valor, onChange, autoFocus }: { valor: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus={autoFocus}
      aria-label="Código de 6 dígitos" placeholder="000000"
      className="h-12 w-full rounded-lg border border-border bg-background px-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  )
}

const mensagemDoAuth = (mensagem?: string) =>
  /invalid|expired|incorrect/i.test(mensagem ?? '')
    ? 'Código incorreto ou expirado. Confira o relógio do celular e use o código que está na tela agora.'
    : /rate|too many/i.test(mensagem ?? '')
      ? 'Muitas tentativas. Espere alguns minutos e tente de novo.'
      : 'Não foi possível confirmar o código. Tente de novo.'

// ------------------------------------------------------------------ digitar o código

export function DigitarCodigo({ fatores, aoConcluir }: { fatores: { id: string; nome: string }[]; aoConcluir: () => void }) {
  const [fatorId, setFatorId] = useState(fatores[0]?.id ?? '')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()

  function confirmar(valor: string) {
    if (!codigoValido(valor) || ocupado) return
    setErro('')
    rodar(async () => {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: fatorId, code: valor })
      if (error) { setErro(mensagemDoAuth(error.message)); setCodigo(''); return }
      aoConcluir()
    })
  }

  // Seis dígitos digitados já confirmam: é o que as pessoas esperam.
  function digitar(valor: string) {
    setCodigo(valor)
    if (codigoValido(valor)) confirmar(valor)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); confirmar(codigo) }} className="flex flex-col gap-4">
      {fatores.length > 1 && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">Aparelho
          <select value={fatorId} onChange={(e) => setFatorId(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            {fatores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
      )}
      <CampoDoCodigo valor={codigo} onChange={digitar} autoFocus />
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      <Button type="submit" size="lg" className="h-11" disabled={!codigoValido(codigo) || ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
    </form>
  )
}

// ------------------------------------------------------------------ cadastrar o app

type Cadastro = { id: string; qr: string; segredo: string }

export function CadastroDoApp({ nomesEmUso = [], aoConcluir, cancelar }: { nomesEmUso?: string[]; aoConcluir: () => void; cancelar?: () => void }) {
  const [nome, setNome] = useState(nomesEmUso.length ? `Celular ${nomesEmUso.length + 1}` : 'Celular')
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [ocupado, rodar] = useTransition()

  function comecar(event: React.FormEvent) {
    event.preventDefault()
    const apelido = nome.trim().slice(0, 40)
    if (!apelido) return setErro('Dê um nome ao aparelho, para reconhecê-lo depois.')
    if (nomesEmUso.some((n) => n.toLowerCase() === apelido.toLowerCase())) return setErro('Você já tem um aparelho com esse nome.')
    setErro('')
    rodar(async () => {
      const supabase = createClient()
      // Um cadastro abandonado no meio fica "não verificado" no Auth e
      // bloqueia outro com o mesmo nome. Limpa antes de começar.
      const { data: lista } = await supabase.auth.mfa.listFactors()
      for (const f of lista?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: apelido, issuer: EMISSOR })
      if (error || !data) return setErro('Não foi possível iniciar o cadastro. Tente de novo.')
      const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
      setCadastro({ id: data.id, qr, segredo: data.totp.secret })
    })
  }

  function confirmar(event: React.FormEvent) {
    event.preventDefault()
    if (!cadastro || !codigoValido(codigo)) return
    setErro('')
    rodar(async () => {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo })
      if (error) { setErro(mensagemDoAuth(error.message)); setCodigo(''); return }
      await registrarMudancaNaVerificacao('ativada')
      aoConcluir()
    })
  }

  async function copiar() {
    if (!cadastro) return
    try { await navigator.clipboard.writeText(cadastro.segredo); setCopiado(true) } catch { setCopiado(false) }
  }

  if (!cadastro) {
    return (
      <form onSubmit={comecar} className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="leading-relaxed text-muted-foreground">Instale no celular um app autenticador — <strong className="text-foreground">Google Authenticator</strong>, <strong className="text-foreground">Microsoft Authenticator</strong>, <strong className="text-foreground">Authy</strong> ou o do seu gerenciador de senhas. Depois continue aqui.</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nome deste aparelho
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          <span className="text-xs font-normal text-muted-foreground">Só para você reconhecer depois, por exemplo &quot;Celular pessoal&quot;.</span>
        </label>
        {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2">
          {cancelar && <Button type="button" variant="ghost" size="lg" onClick={cancelar}>Cancelar</Button>}
          <Button type="submit" size="lg" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Gerar QR Code</Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-5">
      <ol className="flex flex-col gap-4 text-sm">
        <li>
          <p className="font-medium">1. No app, toque em adicionar e leia o QR Code</p>
          <img src={cadastro.qr} alt="QR Code para o app autenticador" className="mt-3 size-48 rounded-lg border border-border bg-white p-2" />
        </li>
        <li>
          <p className="font-medium">Não dá para ler? Digite este código no app</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="select-all break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm tracking-wider">{segredoLegivel(cadastro.segredo)}</code>
            <Button type="button" variant="outline" size="sm" onClick={copiar}>{copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiado ? 'Copiado' : 'Copiar'}</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Guarde só no app. Quem tiver este código consegue gerar os seus números.</p>
        </li>
        <li>
          <p className="mb-2 font-medium">2. Digite o número de 6 dígitos que o app mostra</p>
          <CampoDoCodigo valor={codigo} onChange={setCodigo} autoFocus />
        </li>
      </ol>
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        {cancelar && <Button type="button" variant="ghost" size="lg" onClick={cancelar}>Cancelar</Button>}
        <Button type="submit" size="lg" disabled={!codigoValido(codigo) || ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Ativar</Button>
      </div>
    </form>
  )
}
