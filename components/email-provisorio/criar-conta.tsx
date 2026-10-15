'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { criarContaPeloConvite, type ContaCriadaNoGoogle } from '@/app/actions/google-contas'
import { DOMINIO_DAS_CONTAS, usuarioSugeridoDoGoogle } from '@/lib/google/contas-regras'

const campo = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * O formulário de quem abriu o link: nome, e-mail desejado (sugerido a partir
 * do nome até a pessoa mexer), setor (quando o link não fixa um), celular e
 * e-mail pessoal para recuperar a senha. A conta nasce no Google ao enviar;
 * a senha provisória aparece uma vez e some ao fechar a página.
 */
export function CriarContaDoGoogle({ token, setorFixo, setores }: {
  token: string
  setorFixo: string | null
  setores: { id: string; nome: string }[]
}) {
  const [nome, setNome] = useState('')
  const [usuario, setUsuario] = useState('')
  const [usuarioEditado, setUsuarioEditado] = useState(false)
  const [erro, setErro] = useState('')
  const [conta, setConta] = useState<ContaCriadaNoGoogle | null>(null)
  const [ocupado, rodar] = useTransition()

  function mudarNome(v: string) {
    setNome(v)
    if (!usuarioEditado) setUsuario(usuarioSugeridoDoGoogle(v))
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    f.set('token', token)
    setErro('')
    rodar(async () => {
      const r = await criarContaPeloConvite(f)
      if (r.erro) setErro(r.erro)
      else if (r.conta) setConta(r.conta)
    })
  }

  if (conta) return <ContaPronta conta={conta} />

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Nome completo
        <input name="nome" required minLength={3} maxLength={120} autoComplete="name" autoCapitalize="words" value={nome} onChange={(e) => mudarNome(e.target.value)} className={campo} placeholder="Maria da Silva" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Seu e-mail na Cruz Vermelha
        <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <input name="usuario" required minLength={3} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={usuario}
            onChange={(e) => { setUsuario(e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, '')); setUsuarioEditado(true) }}
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" placeholder="nome.sobrenome" />
          <span className="shrink-0 border-l border-border bg-muted/40 px-3 text-sm text-muted-foreground">@{DOMINIO_DAS_CONTAS}</span>
        </div>
        <span className="text-xs font-normal text-muted-foreground">Só letras, números e ponto. Sugerimos a partir do nome; pode mudar.</span>
      </label>
      {setorFixo ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">Setor: <strong className="font-medium">{setorFixo}</strong></p>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Seu setor
          <select name="setorId" required defaultValue="" className={campo}>
            <option value="" disabled>Escolha…</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        Celular
        <input name="celular" required inputMode="tel" autoComplete="tel" maxLength={20} className={campo} placeholder="(21) 99999-9999" />
        <span className="text-xs font-normal text-muted-foreground">Para recuperar a senha se esquecer.</span>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        E-mail pessoal
        <input name="emailPessoal" type="email" inputMode="email" autoComplete="email" maxLength={120} className={campo} placeholder="voce@gmail.com (opcional)" />
        <span className="text-xs font-normal text-muted-foreground">Também para recuperar a senha. De fora da Cruz Vermelha.</span>
      </label>
      {erro && <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{erro}</p>}
      <Button type="submit" size="lg" className="h-12" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}{ocupado ? 'Criando no Google…' : 'Criar meu e-mail'}</Button>
      <p className="text-center text-[11px] leading-snug text-muted-foreground">A conta é criada no Google Workspace da Cruz Vermelha RJ. Registramos data e local aproximado de cada criação.</p>
    </form>
  )
}

function ContaPronta({ conta }: { conta: ContaCriadaNoGoogle }) {
  const [copiou, setCopiou] = useState(false)
  const texto = `E-mail: ${conta.email}\nSenha provisória: ${conta.senha}\nEntre em https://mail.google.com e, no primeiro acesso, o Google pede uma senha nova.`
  return (
    <div className="flex flex-col gap-4" role="status">
      <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-5" />Seu e-mail está criado</p>
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-primary" />Anote agora: a senha não aparece de novo</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-sm">{texto}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(texto).then(() => setCopiou(true)) }}><Copy className="size-4" />{copiou ? 'Copiado' : 'Copiar'}</Button>
          <Button size="sm" render={<a href="https://mail.google.com" target="_blank" rel="noreferrer" />}>Abrir o Gmail</Button>
        </div>
      </div>
      {conta.grupo && <p className="text-sm text-muted-foreground">Você já recebe os e-mails de <strong className="font-medium text-foreground">{conta.grupo}</strong> na sua caixa.</p>}
      {conta.grupoPendente && <p className="text-sm text-muted-foreground">O endereço do seu setor, {conta.grupoPendente}, ainda vai ser ligado à sua conta pelo administrador.</p>}
      <p className="text-sm text-muted-foreground">No celular, baixe o app do Gmail e entre com esse e-mail. Dica: nas configurações do Gmail, em “Enviar e-mail como”, dá para responder em nome do seu setor.</p>
    </div>
  )
}
