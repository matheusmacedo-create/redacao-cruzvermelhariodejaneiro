'use client'

import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, ChevronDown, Copy, KeyRound, Loader2, Mail, MailWarning, Minus, Search, ShieldCheck, ShieldOff, Smartphone, UserCheck, UserPlus, UserX, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { cn } from '@/lib/utils'
import { matrizDePermissoes, PAPEIS, PAPEL, type Papel } from '@/lib/permissoes'
import { NOMES_DOS_SETORES, usuarioSugerido } from '@/lib/equipe'

/** Os setores do espaço (cadastro em Pessoas → Setores), para os campos de coordenação. */
const Setores = createContext<string[]>(NOMES_DOS_SETORES)
import { problemaDaSenha, SENHA_MINIMO } from '@/lib/usuarios/senha'
import { emailValido } from '@/lib/contas/emails'
import { atualizarUsuario, criarUsuario, desativarUsuario, reativarUsuario, redefinirSenha } from '@/app/actions/usuarios'
import { definirVerificacaoObrigatoria, removerVerificacaoDoUsuario } from '@/app/actions/verificacao'

export type UsuarioNaTela = {
  id: string; usuario: string; nome: string; cargo: string; iniciais: string; cor: string | null; avatar: string | null
  papel: Papel; coordenacao: string; ativo: boolean; trocarSenha: boolean; desativadoEm: string | null
  criadoEm: string; ultimoAcesso: string | null; souEu: boolean
  /** Aparelhos com o app autenticador confirmado. 0 = verificação desligada. */
  aparelhos: number
  /** E-mail de contato (links de senha e avisos). Só vale confirmado. */
  email: string | null
  emailConfirmado: boolean
}
export type PessoaSemAcesso = { nome: string; cargo: string; setor: string; papel: Papel; usuario: string }
export type EventoNaTela = { id: string; acao: string; detalhes: Record<string, unknown>; quando: string; ator: string; alvo: string | null }

type Resultado = { erro?: string; recado?: string; senhaTemporaria?: string; usuario?: string }
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null

const campo = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

const TOM_DO_PAPEL: Record<Papel, string> = {
  admin: 'bg-primary/10 text-primary',
  editor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  colaborador: 'bg-muted text-muted-foreground',
}

export function GestaoDeUsuarios({ usuarios, semAcesso, eventos, auditoriaDisponivel, verificacaoObrigatoriaPara, envioConfigurado, setores }: {
  setores: string[]; usuarios: UsuarioNaTela[]; semAcesso: PessoaSemAcesso[]; eventos: EventoNaTela[]; auditoriaDisponivel: boolean; verificacaoObrigatoriaPara: string[]
  /** RESEND_API_KEY presente: dá para mandar convite e links por e-mail. */
  envioConfigurado: boolean
}) {
  const [criando, setCriando] = useState<Partial<PessoaSemAcesso> | null>(null)
  const [senhaNova, setSenhaNova] = useState<{ usuario: string; senha: string } | null>(null)
  const [recadoDaCriacao, setRecadoDaCriacao] = useState<string | null>(null)

  const ativos = usuarios.filter((u) => u.ativo)
  const numeros = [
    { rotulo: 'Ativos', valor: ativos.length },
    { rotulo: 'Administradores', valor: ativos.filter((u) => u.papel === 'admin').length },
    { rotulo: 'Aguardando 1º acesso', valor: ativos.filter((u) => u.trocarSenha).length },
    { rotulo: 'Com verificação em 2 etapas', valor: ativos.filter((u) => u.aparelhos > 0).length },
    { rotulo: 'Sem e-mail confirmado', valor: ativos.filter((u) => !u.emailConfirmado).length },
    { rotulo: 'Desativados', valor: usuarios.length - ativos.length },
  ]

  function aoCriar(r: Resultado) {
    if (r.senhaTemporaria && r.usuario) setSenhaNova({ usuario: r.usuario, senha: r.senhaTemporaria })
    setRecadoDaCriacao(r.recado ?? null)
    setCriando(null)
  }

  return (
    <Setores.Provider value={setores}>
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {numeros.map((n) => <Card key={n.rotulo} className="p-4"><p className="text-2xl font-bold tabular-nums">{n.valor}</p><p className="text-sm text-muted-foreground">{n.rotulo}</p></Card>)}
      </div>

      {senhaNova && <SenhaTemporaria {...senhaNova} fechar={() => setSenhaNova(null)} />}
      {recadoDaCriacao && <div role="status" className={cn('flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm', recadoDaCriacao.startsWith('Atenção') ? 'bg-warning/15' : 'bg-success/10 text-success')}><span>{recadoDaCriacao}</span><button type="button" onClick={() => setRecadoDaCriacao(null)} aria-label="Fechar" className="shrink-0 rounded p-0.5 hover:bg-muted"><X className="size-4" /></button></div>}
      {!envioConfigurado && <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><MailWarning className="mt-0.5 size-4 shrink-0" /><span>O envio de e-mail não está configurado (falta a variável <code className="font-mono">RESEND_API_KEY</code> na Vercel). Sem ela, convites, links de senha e avisos de segurança não saem — só a senha temporária funciona.</span></div>}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">Pessoas com acesso</h2><p className="text-sm text-muted-foreground">Login por usuário (ou e-mail confirmado) e senha. O jeito mais seguro de dar acesso é o convite por e-mail: a pessoa escolhe a própria senha pelo link, e ninguém mais a conhece.</p></div>
          <Button size="lg" onClick={() => setCriando(criando ? null : {})}><UserPlus className="size-4" />Novo usuário</Button>
        </div>
        {criando && <FormularioDeCriacao inicial={criando} envioConfigurado={envioConfigurado} aoConcluir={aoCriar} cancelar={() => setCriando(null)} />}
        <ListaDeUsuarios usuarios={usuarios} envioConfigurado={envioConfigurado} aoGerarSenha={setSenhaNova} />
      </section>

      {semAcesso.length > 0 && (
        <section className="flex flex-col gap-3">
          <div><h2 className="font-semibold">Da equipe, ainda sem acesso</h2><p className="text-sm text-muted-foreground">Pessoas da lista oficial de setores que ainda não têm login. O papel vem sugerido pelo setor; você confirma na criação.</p></div>
          <Card className="divide-y divide-border">
            {semAcesso.map((p) => (
              <div key={p.nome} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="text-sm font-medium">{p.nome}{p.cargo && <span className="font-normal text-muted-foreground"> · {p.cargo}</span>}</p><p className="text-xs text-muted-foreground">{p.setor} · sugestão: {PAPEL[p.papel].rotulo.toLowerCase()} · @{p.usuario}</p></div>
                <Button variant="outline" size="sm" onClick={() => { setCriando(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><UserPlus className="size-3.5" />Criar acesso</Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <ExigenciaDeVerificacao usuarios={ativos} obrigatorioPara={verificacaoObrigatoriaPara} />

      <MatrizDePermissoes />

      <Auditoria eventos={eventos} disponivel={auditoriaDisponivel} />
    </div>
    </Setores.Provider>
  )
}

// ------------------------------------------------------------------ senha temporária

function SenhaTemporaria({ usuario, senha, fechar }: { usuario: string; senha: string; fechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(`Usuário: ${usuario}\nSenha temporária: ${senha}`); setCopiado(true) } catch { setCopiado(false) }
  }
  return (
    <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Senha temporária de @{usuario}</p>
            <p className="mt-1 text-sm text-muted-foreground">Ela aparece só agora e não fica guardada em lugar nenhum. Repasse pessoalmente ou por um canal privado — nunca em grupo.</p>
            <p className="mt-3 select-all rounded-lg bg-background px-3 py-2 font-mono text-lg tracking-wider">{senha}</p>
          </div>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex justify-end"><Button variant="outline" size="sm" onClick={copiar}>{copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiado ? 'Copiado' : 'Copiar usuário e senha'}</Button></div>
    </div>
  )
}

// ------------------------------------------------------------------ criação

function SeletorDePapel({ valor, onChange, desabilitado }: { valor: Papel; onChange: (p: Papel) => void; desabilitado?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Papel">
      {PAPEIS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} disabled={desabilitado} onClick={() => onChange(p)}
          className={cn('rounded-lg border p-3 text-left transition-colors disabled:opacity-50', valor === p ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted/50')}>
          <p className="text-sm font-medium">{PAPEL[p].rotulo}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{PAPEL[p].descricao}</p>
        </button>
      ))}
    </div>
  )
}

type ModoDeSenha = 'convite' | 'link' | 'gerar' | 'definir'

const ROTULO_DO_MODO: Record<ModoDeSenha, string> = {
  convite: 'Enviar convite por e-mail (recomendado)',
  link: 'Enviar link por e-mail (recomendado)',
  gerar: 'Gerar senha temporária',
  definir: 'Definir uma senha',
}

const AJUDA_DO_MODO: Partial<Record<ModoDeSenha, string>> = {
  convite: 'A pessoa recebe o usuário e um link para criar a própria senha. Ninguém mais conhece a senha, e o e-mail fica confirmado.',
  link: 'A pessoa recebe um link para escolher a senha nova. A senha atual continua valendo até ela usar o link.',
  gerar: 'A senha aparece uma vez aqui, para você repassar pessoalmente. A pessoa troca no primeiro acesso.',
}

function CampoDeSenha({ opcoes, modo, setModo, senha, setSenha, usuario, nome, motivoSemEmail }: {
  opcoes: ModoDeSenha[]; modo: ModoDeSenha; setModo: (m: ModoDeSenha) => void; senha: string; setSenha: (s: string) => void; usuario: string; nome: string
  /** Por que as opções por e-mail não aparecem, quando não aparecem. */
  motivoSemEmail?: string | null
}) {
  const problema = modo === 'definir' && senha ? problemaDaSenha(senha, { usuario, nome }) : null
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {opcoes.map((o) => <label key={o} className="flex items-center gap-2"><input type="radio" checked={modo === o} onChange={() => setModo(o)} />{ROTULO_DO_MODO[o]}</label>)}
      </div>
      {AJUDA_DO_MODO[modo] && <p className="text-xs text-muted-foreground">{AJUDA_DO_MODO[modo]}</p>}
      {motivoSemEmail && <p className="text-xs text-muted-foreground">{motivoSemEmail}</p>}
      {modo === 'definir' && <>
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={`Mínimo de ${SENHA_MINIMO} caracteres, letras e números`} className={campo} aria-invalid={Boolean(problema)} />
        {problema && <p className="text-xs text-destructive">{problema}</p>}
      </>}
    </div>
  )
}

function FormularioDeCriacao({ inicial, envioConfigurado, aoConcluir, cancelar }: { inicial: Partial<PessoaSemAcesso>; envioConfigurado: boolean; aoConcluir: (r: Resultado) => void; cancelar: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(inicial.nome ?? '')
  const [usuario, setUsuario] = useState(inicial.usuario ?? '')
  const [usuarioEditado, setUsuarioEditado] = useState(Boolean(inicial.usuario))
  const [cargo, setCargo] = useState(inicial.cargo ?? '')
  const setores = useContext(Setores)
  const [coordenacao, setCoordenacao] = useState(inicial.setor ?? '')
  const [papel, setPapel] = useState<Papel>(inicial.papel ?? 'colaborador')
  const [email, setEmail] = useState('')
  const [modoEscolhido, setModo] = useState<ModoDeSenha>(envioConfigurado ? 'convite' : 'gerar')
  const [senha, setSenha] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const temEmail = Boolean(emailValido(email))
  const podeConvidar = envioConfigurado && temEmail
  // Sem e-mail válido, o convite some da lista e o modo cai para a temporária.
  const modo: ModoDeSenha = modoEscolhido === 'convite' && !podeConvidar ? 'gerar' : modoEscolhido
  const opcoes: ModoDeSenha[] = podeConvidar ? ['convite', 'gerar', 'definir'] : ['gerar', 'definir']

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      Object.entries({ nome, usuario, cargo, coordenacao, papel, email, modoSenha: modo, senha }).forEach(([k, v]) => form.set(k, v))
      const r = await criarUsuario(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      aoConcluir(r)
      router.refresh()
    })
  }

  return (
    <Card className="p-5">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Nome completo
            <input required minLength={3} value={nome} className={campo} onChange={(e) => { setNome(e.target.value); if (!usuarioEditado) setUsuario(usuarioSugerido(e.target.value)) }} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Usuário (para o login)
            <input required pattern="[a-z0-9._\-]{3,40}" value={usuario} className={campo} placeholder="nome.sobrenome" onChange={(e) => { setUsuario(e.target.value.toLowerCase()); setUsuarioEditado(true) }} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">E-mail
            <input type="email" value={email} maxLength={254} className={campo} placeholder="pessoa@email.com" onChange={(e) => setEmail(e.target.value)} aria-invalid={email.length > 0 && !temEmail} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Cargo ou função
            <input value={cargo} maxLength={120} className={campo} onChange={(e) => setCargo(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium md:col-span-2">Coordenação
            <select value={coordenacao} className={campo} onChange={(e) => setCoordenacao(e.target.value)}>
              <option value="">Sem coordenação</option>
              {setores.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <SeletorDePapel valor={papel} onChange={setPapel} />
        <CampoDeSenha opcoes={opcoes} modo={modo} setModo={setModo} senha={senha} setSenha={setSenha} usuario={usuario} nome={nome}
          motivoSemEmail={!envioConfigurado ? 'Convite por e-mail indisponível: o envio de e-mail não está configurado.' : !temEmail ? 'Informe o e-mail para poder enviar o convite.' : null} />
        {aviso && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{aviso.texto}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={cancelar}>Cancelar</Button>
          <Button type="submit" size="lg" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Criar acesso</Button>
        </div>
      </form>
    </Card>
  )
}

// ------------------------------------------------------------------ lista

function ListaDeUsuarios({ usuarios, envioConfigurado, aoGerarSenha }: { usuarios: UsuarioNaTela[]; envioConfigurado: boolean; aoGerarSenha: (s: { usuario: string; senha: string }) => void }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | Papel | 'desativados'>('todos')
  const [aberto, setAberto] = useState<string | null>(null)

  const lista = useMemo(() => {
    const termo = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    return usuarios.filter((u) => {
      if (filtro === 'desativados' ? u.ativo : filtro !== 'todos' && (u.papel !== filtro || !u.ativo)) return false
      if (!termo) return true
      return `${u.nome} ${u.usuario} ${u.coordenacao} ${u.cargo} ${u.email ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(termo)
    })
  }, [usuarios, busca, filtro])

  const filtros: { id: typeof filtro; rotulo: string }[] = [
    { id: 'todos', rotulo: 'Todos' }, ...PAPEIS.map((p) => ({ id: p, rotulo: PAPEL[p].rotulo })), { id: 'desativados', rotulo: 'Desativados' },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, usuário ou setor" className={cn(campo, 'pl-9')} /></div>
        <div className="flex flex-wrap gap-1.5">{filtros.map((f) => <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', filtro === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{f.rotulo}</button>)}</div>
      </div>
      <ul className="divide-y divide-border">
        {lista.map((u) => <LinhaDoUsuario key={u.id} usuario={u} aberto={aberto === u.id} alternar={() => setAberto(aberto === u.id ? null : u.id)} envioConfigurado={envioConfigurado} aoGerarSenha={aoGerarSenha} />)}
        {!lista.length && <li className="px-5 py-10 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-5" />Ninguém encontrado com esse filtro.</li>}
      </ul>
    </Card>
  )
}

function LinhaDoUsuario({ usuario: u, aberto, alternar, envioConfigurado, aoGerarSenha }: { usuario: UsuarioNaTela; aberto: boolean; alternar: () => void; envioConfigurado: boolean; aoGerarSenha: (s: { usuario: string; senha: string }) => void }) {
  return (
    <li className={cn(!u.ativo && 'bg-muted/30')}>
      <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40">
        <Avatar initials={u.iniciais || '?'} color={u.cor ?? undefined} src={privateAvatarUrl(u.avatar)} alt={u.nome} size="md" className={cn(!u.ativo && 'opacity-50 grayscale')} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{u.nome}{u.souEu && <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>}</p>
          <p className="truncate text-xs text-muted-foreground">@{u.usuario} · {u.coordenacao || 'Sem coordenação'}{u.cargo && ` · ${u.cargo}`}</p>
          <p className={cn('flex items-center gap-1 truncate text-xs', u.emailConfirmado ? 'text-muted-foreground' : 'text-warning-foreground')}>{u.emailConfirmado ? <Mail className="size-3 shrink-0" /> : <MailWarning className="size-3 shrink-0" />}{u.email ? `${u.email}${u.emailConfirmado ? '' : ' (não confirmado)'}` : 'Sem e-mail'}</p>
        </div>
        <div className="hidden flex-col items-end gap-1 text-xs text-muted-foreground sm:flex">
          <span>{u.ultimoAcesso ? `Último acesso ${dataHora.format(new Date(u.ultimoAcesso))}` : 'Nunca entrou'}</span>
          {u.trocarSenha && u.ativo && <span className="text-warning-foreground">Aguardando troca de senha</span>}
        </div>
        {u.ativo && (u.aparelhos > 0
          ? <span title="Verificação em duas etapas ativada" className="shrink-0 text-success"><ShieldCheck className="size-4" aria-label="Verificação em duas etapas ativada" /></span>
          : <span title="Sem verificação em duas etapas" className="shrink-0 text-muted-foreground/50"><ShieldOff className="size-4" aria-label="Sem verificação em duas etapas" /></span>)}
        {u.ativo
          ? <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium', TOM_DO_PAPEL[u.papel])}>{PAPEL[u.papel].rotulo}</span>
          : <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">Desativado</span>}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && <PainelDoUsuario usuario={u} envioConfigurado={envioConfigurado} aoGerarSenha={aoGerarSenha} />}
    </li>
  )
}

function PainelDoUsuario({ usuario: u, envioConfigurado, aoGerarSenha }: { usuario: UsuarioNaTela; envioConfigurado: boolean; aoGerarSenha: (s: { usuario: string; senha: string }) => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(u.nome)
  const [cargo, setCargo] = useState(u.cargo)
  const [coordenacao, setCoordenacao] = useState(u.coordenacao)
  const [papel, setPapel] = useState<Papel>(u.papel)
  const [email, setEmail] = useState(u.email ?? '')
  const [redefinindo, setRedefinindo] = useState(false)
  // Link por e-mail só para quem tem e-mail CONFIRMADO: um endereço digitado
  // errado não pode receber o link de senha de ninguém.
  const podeLink = envioConfigurado && u.emailConfirmado
  const [modo, setModo] = useState<ModoDeSenha>(podeLink ? 'link' : 'gerar')
  const [senha, setSenha] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()

  const emailNovo = email.trim().toLowerCase()
  const emailMudou = emailNovo !== (u.email ?? '') && emailNovo.length > 0
  const emailInvalido = emailNovo.length > 0 && !emailValido(emailNovo)
  const mudou = nome !== u.nome || cargo !== u.cargo || coordenacao !== u.coordenacao || papel !== u.papel || emailMudou
  // Coordenação antiga fora da lista oficial continua selecionável até alguém trocar.
  const setores = useContext(Setores)
  const opcoes = u.coordenacao && !setores.includes(u.coordenacao) ? [u.coordenacao, ...setores] : setores

  function executar(acao: (f: FormData) => Promise<Resultado>, campos: Record<string, string>) {
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('userId', u.id)
      Object.entries(campos).forEach(([k, v]) => form.set(k, v))
      const r = await acao(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      setAviso({ tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (r.senhaTemporaria && r.usuario) aoGerarSenha({ usuario: r.usuario, senha: r.senhaTemporaria })
      setRedefinindo(false); setSenha('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-muted/20 px-5 py-5">
      <div className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Acesso criado em {data.format(new Date(u.criadoEm))}</span>
        <span>{u.ultimoAcesso ? `Último acesso ${dataHora.format(new Date(u.ultimoAcesso))}` : 'Nunca entrou'}</span>
        {u.desativadoEm && <span>Desativado em {data.format(new Date(u.desativadoEm))}</span>}
        <span className="flex items-center gap-1"><Smartphone className="size-3.5" />{u.aparelhos ? `Verificação em duas etapas: ${u.aparelhos} ${u.aparelhos === 1 ? 'aparelho' : 'aparelhos'}` : 'Sem verificação em duas etapas'}</span>
      </div>

      {u.ativo && <>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Nome completo<input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">E-mail
            <input type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" className={campo} aria-invalid={emailInvalido} />
            <span className="text-xs font-normal text-muted-foreground">{emailMudou ? 'Ao salvar, enviamos um link de confirmação para o endereço novo. Ele só passa a valer quando for aberto.' : u.email && !u.emailConfirmado ? 'Ainda não confirmado. Salvar sem mudar reenvia a confirmação.' : 'Recebe os links de senha e os avisos de segurança.'}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Cargo ou função<input value={cargo} maxLength={120} onChange={(e) => setCargo(e.target.value)} className={campo} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Coordenação
            <select value={coordenacao} onChange={(e) => setCoordenacao(e.target.value)} className={campo}><option value="">Sem coordenação</option>{opcoes.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        <SeletorDePapel valor={papel} onChange={setPapel} desabilitado={u.souEu} />
        {u.souEu && <p className="text-xs text-muted-foreground">Você não pode mudar o seu próprio papel nem desativar a sua conta — outro administrador faz isso.</p>}
        <div className="flex justify-end"><Button size="lg" disabled={(!mudou && !(u.email && !u.emailConfirmado)) || emailInvalido || ocupado} onClick={() => executar(atualizarUsuario, { nome, cargo, coordenacao, papel, email: emailNovo })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar alterações</Button></div>
      </>}

      {redefinindo && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">Redefinir a senha de {u.nome}</p>
          <CampoDeSenha opcoes={podeLink ? ['link', 'gerar', 'definir'] : ['gerar', 'definir']} modo={modo} setModo={setModo} senha={senha} setSenha={setSenha} usuario={u.usuario} nome={u.nome}
            motivoSemEmail={podeLink ? null : !envioConfigurado ? 'Link por e-mail indisponível: o envio de e-mail não está configurado.' : 'Link por e-mail indisponível: esta pessoa não tem e-mail confirmado.'} />
          <p className="text-xs text-muted-foreground">As sessões abertas dessa pessoa são encerradas, e ela troca a senha no próximo acesso.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRedefinindo(false)}>Cancelar</Button>
            <Button disabled={ocupado} onClick={() => executar(redefinirSenha, { modoSenha: modo, senha })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Redefinir</Button>
          </div>
        </div>
      )}

      {aviso && <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={cn('rounded-lg px-3 py-2 text-sm', aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>{aviso.texto}</p>}

      {!u.souEu && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          {u.ativo ? <>
            {u.aparelhos > 0 && <Button variant="outline" disabled={ocupado} onClick={() => { if (confirm(`Remover a verificação em duas etapas de ${u.nome}? Use quando a pessoa perdeu ou trocou de celular. As sessões abertas dela são encerradas.`)) executar(removerVerificacaoDoUsuario, {}) }}><ShieldOff className="size-4" />Remover verificação em 2 etapas</Button>}
            {!redefinindo && <Button variant="outline" onClick={() => setRedefinindo(true)}><KeyRound className="size-4" />Redefinir senha</Button>}
            <Button variant="destructive" disabled={ocupado} onClick={() => { if (confirm(`Desativar ${u.nome}? A pessoa perde o acesso na hora e sai de todas as sessões. O histórico dela continua no sistema.`)) executar(desativarUsuario, {}) }}><UserX className="size-4" />Desativar acesso</Button>
          </> : (
            <Button disabled={ocupado} onClick={() => { if (confirm(podeLink ? `Reativar ${u.nome}? Enviaremos para ${u.email} um link para escolher uma senha nova.` : `Reativar ${u.nome}? Uma senha temporária nova será gerada.`)) executar(reativarUsuario, {}) }}><UserCheck className="size-4" />{podeLink ? 'Reativar e enviar link de senha' : 'Reativar com senha temporária'}</Button>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ matriz

function MatrizDePermissoes() {
  const grupos = matrizDePermissoes()
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="font-semibold">O que cada papel pode fazer</h2><p className="text-sm text-muted-foreground">Todo usuário ativo registra, cria pautas, escreve, comenta, sobe arquivos e vota quando é convidado. A tabela mostra só o que muda de um papel para outro — e é a mesma regra que o servidor aplica.</p></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left"><th className="px-5 py-3 font-medium">Permissão</th>{PAPEIS.map((p) => <th key={p} className="w-28 px-3 py-3 text-center font-medium">{PAPEL[p].rotulo}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g) => [
              <tr key={g.grupo} className="bg-muted/40"><td colSpan={PAPEIS.length + 1} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</td></tr>,
              ...g.linhas.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">{l.rotulo}</td>
                  {PAPEIS.map((p) => <td key={p} className="px-3 py-2.5 text-center">{l.papeis[p] ? <Check className="mx-auto size-4 text-success" aria-label="Sim" /> : <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Não" />}</td>)}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </Card>
    </section>
  )
}

// ------------------------------------------------------------------ auditoria

const ROTULO_DA_ACAO: Record<string, string> = {
  usuario_criado: 'criou o acesso de',
  vinculo_criado: 'vinculou ao espaço',
  vinculo_removido: 'removeu do espaço',
  papel_alterado: 'mudou o papel de',
  coordenacao_alterada: 'mudou a coordenação de',
  dados_alterados: 'alterou os dados de',
  senha_redefinida: 'redefiniu a senha de',
  senha_trocada: 'trocou a própria senha',
  usuario_desativado: 'desativou',
  usuario_reativado: 'reativou',
  verificacao_ativada: 'ativou a verificação em duas etapas',
  verificacao_removida: 'removeu um aparelho da própria verificação em duas etapas',
  verificacao_removida_pelo_admin: 'removeu a verificação em duas etapas de',
  verificacao_exigencia_alterada: 'mudou quem é obrigado a usar a verificação em duas etapas',
  link_de_senha_pedido: 'enviou o link de "Esqueci minha senha" para',
  link_de_senha_enviado_pelo_admin: 'enviou um link de nova senha para',
  senha_definida_pelo_convite: 'criou a própria senha pelo convite',
  senha_redefinida_pelo_link: 'redefiniu a própria senha pelo link do e-mail',
  confirmacao_de_email_enviada: 'pediu a confirmação de um e-mail novo',
  email_confirmado: 'confirmou o e-mail da conta',
  ajuda_com_verificacao_pedida: 'pediu ajuda: perdeu ou trocou o celular do app autenticador',
}

// Ações sobre a própria conta: o alvo é o próprio ator, não se repete o nome.
const PROPRIAS = new Set(['senha_trocada', 'verificacao_ativada', 'verificacao_removida', 'senha_definida_pelo_convite', 'senha_redefinida_pelo_link', 'confirmacao_de_email_enviada', 'email_confirmado', 'ajuda_com_verificacao_pedida'])

function detalheDoEvento(e: EventoNaTela): string {
  const d = e.detalhes
  const papel = (v: unknown) => (typeof v === 'string' && v in PAPEL ? PAPEL[v as Papel].rotulo : String(v ?? '—'))
  if (e.acao === 'papel_alterado') return `${papel(d.de)} → ${papel(d.para)}`
  if (e.acao === 'coordenacao_alterada') return `${d.de || 'sem coordenação'} → ${d.para || 'sem coordenação'}`
  if (e.acao === 'usuario_criado' || e.acao === 'vinculo_criado') return papel(d.papel)
  if (e.acao === 'dados_alterados') return `nome: ${d.nome_anterior} → ${d.nome_novo}`
  if (e.acao === 'verificacao_exigencia_alterada') {
    const lista = (v: unknown) => (Array.isArray(v) && v.length ? v.map(papel).join(', ') : 'ninguém')
    return `${lista(d.de)} → ${lista(d.para)}`
  }
  return ''
}

function Auditoria({ eventos, disponivel }: { eventos: EventoNaTela[]; disponivel: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 text-muted-foreground" /><div><h2 className="font-semibold">Registro de acessos</h2><p className="text-sm text-muted-foreground">Toda criação, mudança de papel, senha redefinida e desativação — com quem fez e quando. Ninguém edita este registro, nem administradores.</p></div></div>
      <Card>
        {!disponivel ? <p className="px-5 py-6 text-sm text-muted-foreground">O registro ainda não está disponível: a migração de usuários e permissões precisa ser aplicada no banco.</p>
          : eventos.length ? (
            <ul className="divide-y divide-border">
              {eventos.map((e) => {
                const detalhe = detalheDoEvento(e)
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                    <span><strong className="font-medium">{e.ator}</strong> {ROTULO_DA_ACAO[e.acao] ?? e.acao.replaceAll('_', ' ')}{e.alvo && !PROPRIAS.has(e.acao) && <strong className="font-medium"> {e.alvo}</strong>}{detalhe && <span className="text-muted-foreground"> · {detalhe}</span>}</span>
                    <time className="text-xs text-muted-foreground">{dataHora.format(new Date(e.quando))}</time>
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-5 py-6 text-sm text-muted-foreground">Nada registrado ainda.</p>}
      </Card>
    </section>
  )
}

// ------------------------------------------------------------------ exigência da verificação

function ExigenciaDeVerificacao({ usuarios, obrigatorioPara }: { usuarios: UsuarioNaTela[]; obrigatorioPara: string[] }) {
  const router = useRouter()
  const [marcados, setMarcados] = useState<Papel[]>(PAPEIS.filter((p) => obrigatorioPara.includes(p)))
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const mudou = PAPEIS.some((p) => marcados.includes(p) !== obrigatorioPara.includes(p))
  const semApp = (p: Papel) => usuarios.filter((u) => u.papel === p && u.aparelhos === 0)
  const eu = usuarios.find((u) => u.souEu)

  function salvar() {
    const novos = marcados.filter((p) => !obrigatorioPara.includes(p))
    const afetados = novos.flatMap(semApp)
    const euAfetado = eu && novos.includes(eu.papel) && eu.aparelhos === 0
    const partes = [
      afetados.length ? `${afetados.length} ${afetados.length === 1 ? 'pessoa ainda não tem' : 'pessoas ainda não têm'} o app e ${afetados.length === 1 ? 'será levada' : 'serão levadas'} a cadastrar no próximo acesso.` : '',
      euAfetado ? 'Isso inclui a sua conta: ao salvar, você cadastra o app em seguida.' : '',
    ].filter(Boolean)
    if (partes.length && !confirm(partes.join(' ') + ' Continuar?')) return
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      marcados.forEach((p) => form.append('papeis', p))
      const r = await definirVerificacaoObrigatoria(form)
      setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2"><Smartphone className="mt-0.5 size-4 text-muted-foreground" /><div><h2 className="font-semibold">Verificação em duas etapas</h2><p className="text-sm text-muted-foreground">Qualquer pessoa pode ativar em Meu perfil → Segurança. Aqui você decide se algum papel é <strong className="font-medium text-foreground">obrigado</strong> a usar — quem ainda não tiver o app é levado a cadastrar no próximo acesso. Hoje: {obrigatorioPara.length ? 'obrigatória para ' + PAPEIS.filter((p) => obrigatorioPara.includes(p)).map((p) => PAPEL[p].rotulo.toLowerCase()).join(', ') : 'opcional para todos'}.</p></div></div>
      <Card className="flex flex-col gap-4 p-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {PAPEIS.map((p) => {
            const faltam = semApp(p).length
            const total = usuarios.filter((u) => u.papel === p).length
            return (
              <label key={p} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', marcados.includes(p) ? 'border-primary bg-primary/5' : 'border-border')}>
                <input type="checkbox" className="mt-1" checked={marcados.includes(p)} onChange={(e) => setMarcados(e.target.checked ? [...marcados, p] : marcados.filter((x) => x !== p))} />
                <span><span className="block text-sm font-medium">Exigir de {PAPEL[p].rotulo.toLowerCase()}es</span><span className="block text-xs text-muted-foreground">{total ? `${total - faltam} de ${total} já usam` : 'Ninguém com este papel'}</span></span>
              </label>
            )
          })}
        </div>
        {aviso && <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={cn('rounded-lg px-3 py-2 text-sm', aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>{aviso.texto}</p>}
        <div className="flex justify-end"><Button size="lg" disabled={!mudou || ocupado} onClick={salvar}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar exigência</Button></div>
      </Card>
    </section>
  )
}
