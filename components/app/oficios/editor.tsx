'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDown, ArrowUp, Check, FileSignature, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { emitirOficio, excluirRascunho, salvarRascunho } from '@/app/actions/oficios'
import { documentoDoRascunho } from '@/lib/oficios/documento'
import { FolhaDoOficio } from './documento'

export type Rascunho = {
  id: string
  emitente: string
  setor: string | null
  local: string
  destinatario_nome: string | null
  destinatario_cargo: string | null
  destinatario_orgao: string | null
  destinatario_endereco: string | null
  vocativo: string | null
  assunto: string
  corpo: string
  fecho: string
  updated_at: string
}

export type PessoaQueAssina = { id: string; nome: string; cargo: string | null }

type Campos = Omit<Rascunho, 'id' | 'emitente' | 'updated_at'>
const CAMPOS: (keyof Campos)[] = ['setor', 'local', 'destinatario_nome', 'destinatario_cargo', 'destinatario_orgao', 'destinatario_endereco', 'vocativo', 'assunto', 'corpo', 'fecho']

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * O rascunho: formulário à esquerda, a folha como vai sair à direita. Salva
 * sozinho um instante depois que a pessoa para de digitar; emitir salva antes.
 */
export function EditorDeOficio({ rascunho, pessoas, eu, podeEditar }: { rascunho: Rascunho; pessoas: PessoaQueAssina[]; eu: string; podeEditar: boolean }) {
  const router = useRouter()
  const [campos, setCampos] = useState<Campos>(() => Object.fromEntries(CAMPOS.map((k) => [k, rascunho[k] ?? ''])) as Campos)
  const [salvo, setSalvo] = useState<{ quando: string | null; pendente: boolean; erro: string }>({ quando: rascunho.updated_at, pendente: false, erro: '' })
  const [aba, setAba] = useState<'editar' | 'ver'>('editar')
  const [emitindo, setEmitindo] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versao = useRef(0)

  async function salvarAgora(valores: Campos): Promise<boolean> {
    const minha = ++versao.current
    const f = new FormData()
    for (const k of CAMPOS) f.set(k, String(valores[k] ?? ''))
    const r = await salvarRascunho(rascunho.id, f)
    if (minha !== versao.current) return !r.erro
    setSalvo({ quando: r.salvoEm ?? null, pendente: false, erro: r.erro ?? '' })
    return !r.erro
  }

  function mudar<K extends keyof Campos>(k: K, v: string) {
    const novos = { ...campos, [k]: v }
    setCampos(novos)
    setSalvo((s) => ({ ...s, pendente: true }))
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { void salvarAgora(novos) }, 1200)
  }

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const doc = documentoDoRascunho({ emitente: rascunho.emitente, ...campos, setor: campos.setor || null } as Parameters<typeof documentoDoRascunho>[0])
  const falta = [
    campos.assunto.trim().length < 3 && 'o assunto',
    campos.corpo.trim().length < 10 && 'o texto',
    !String(campos.destinatario_nome ?? '').trim() && !String(campos.destinatario_orgao ?? '').trim() && 'o destinatário (nome ou órgão)',
  ].filter(Boolean) as string[]

  const campo = (k: keyof Campos, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}
      <input id={`oficio-${k}`} value={String(campos[k] ?? '')} onChange={(e) => mudar(k, e.target.value)} disabled={!podeEditar} className={inputClass} {...props} />
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {salvo.erro ? <span className="font-medium text-destructive">{salvo.erro}</span>
            : salvo.pendente ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Salvando…</span>
              : salvo.quando ? <span className="inline-flex items-center gap-1"><Check className="size-3 text-success" />Rascunho salvo às {HORA.format(new Date(salvo.quando))}</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border xl:hidden" role="tablist">
            {(['editar', 'ver'] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
                className={`px-3 py-1.5 text-sm ${aba === a ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}>{a === 'editar' ? 'Editar' : 'Pré-visualizar'}</button>
            ))}
          </div>
          {podeEditar && <Button variant="ghost" onClick={() => setApagando(true)}><Trash2 className="size-4" />Apagar</Button>}
          {podeEditar && <Button data-ajuda="oficios.emitir" onClick={() => setEmitindo(true)}><FileSignature className="size-4" />Emitir para assinatura</Button>}
        </div>
      </div>

      {!podeEditar && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Só quem criou este rascunho, ou um admin, pode editá-lo.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card data-ajuda="oficios.formulario" className={`flex flex-col gap-4 p-5 ${aba === 'ver' ? 'hidden xl:flex' : ''}`}>
          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={!podeEditar}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</legend>
            {campo('setor', 'Setor', { placeholder: 'Ex.: Comunicação', maxLength: 120 })}
            {campo('local', 'Local', { maxLength: 120 })}
          </fieldset>
          <fieldset className="grid gap-3" disabled={!podeEditar}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinatário</legend>
            {campo('destinatario_nome', 'Nome', { placeholder: 'Ex.: Sr. João da Silva', maxLength: 200 })}
            <div className="grid gap-3 sm:grid-cols-2">
              {campo('destinatario_cargo', 'Cargo', { placeholder: 'Ex.: Diretor', maxLength: 200 })}
              {campo('destinatario_orgao', 'Órgão ou empresa', { placeholder: 'Ex.: Hemorio', maxLength: 200 })}
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">Endereço <span className="text-xs font-normal text-muted-foreground">opcional</span>
              <textarea id="oficio-destinatario_endereco" value={String(campos.destinatario_endereco ?? '')} onChange={(e) => mudar('destinatario_endereco', e.target.value)} rows={2} maxLength={400} className={inputClass} />
            </label>
          </fieldset>
          <fieldset className="grid gap-3" disabled={!podeEditar}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texto</legend>
            {campo('assunto', 'Assunto', { placeholder: 'Ex.: Solicitação de apoio à campanha de doação de sangue', maxLength: 300 })}
            {campo('vocativo', 'Vocativo', { placeholder: 'Ex.: Senhor Diretor,', maxLength: 200 })}
            <label className="flex flex-col gap-1 text-sm font-medium">Corpo
              <span className="text-xs font-normal text-muted-foreground">Deixe uma linha em branco entre os parágrafos.</span>
              <textarea id="oficio-corpo" value={campos.corpo} onChange={(e) => mudar('corpo', e.target.value)} rows={14} maxLength={30000} className={`${inputClass} font-serif leading-relaxed`} />
            </label>
            {campo('fecho', 'Fecho', { maxLength: 200 })}
          </fieldset>
        </Card>

        <div className={`min-w-0 ${aba === 'editar' ? 'hidden xl:block' : ''}`}>
          <FolhaDoOficio doc={doc} marcaDagua="Rascunho" />
        </div>
      </div>

      {emitindo && (
        <DialogEmitir
          pessoas={pessoas}
          eu={eu}
          falta={falta}
          ocupado={ocupado}
          aoFechar={() => setEmitindo(false)}
          aoEmitir={(assinantes, modo, aoErrar) => iniciar(async () => {
            if (temporizador.current) clearTimeout(temporizador.current)
            if (!(await salvarAgora(campos))) { aoErrar('Não foi possível salvar o rascunho antes de emitir.'); return }
            const r = await emitirOficio(rascunho.id, assinantes, modo)
            if (r.erro) { aoErrar(r.erro); return }
            setEmitindo(false)
            router.refresh()
          })}
        />
      )}

      {apagando && (
        <Dialog titulo="Apagar este rascunho?" descricao="Rascunho ainda não tem número; apagar não deixa rastro no livro de ofícios." onFechar={() => setApagando(false)} podeFechar={!ocupado}>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="outline" onClick={() => setApagando(false)} disabled={ocupado}>Manter</Button>
            <Button variant="destructive" disabled={ocupado} onClick={() => iniciar(async () => {
              const r = await excluirRascunho(rascunho.id)
              if (r?.erro) setSalvo((s) => ({ ...s, erro: r.erro ?? '' }))
            })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Apagar rascunho</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function DialogEmitir({ pessoas, eu, falta, ocupado, aoFechar, aoEmitir }: {
  pessoas: PessoaQueAssina[]
  eu: string
  falta: string[]
  ocupado: boolean
  aoFechar: () => void
  aoEmitir: (assinantes: { userId: string; cargo: string }[], modo: 'senha' | 'govbr', aoErrar: (m: string) => void) => void
}) {
  const [escolhidos, setEscolhidos] = useState<{ userId: string; cargo: string }[]>([])
  const [modo, setModo] = useState<'senha' | 'govbr'>('senha')
  const [erro, setErro] = useState('')
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  const restantes = pessoas.filter((p) => !escolhidos.some((e) => e.userId === p.id))
    .sort((a, b) => Number(b.id === eu) - Number(a.id === eu) || a.nome.localeCompare(b.nome, 'pt-BR'))

  function mover(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= escolhidos.length) return
    const copia = [...escolhidos]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    setEscolhidos(copia)
  }

  return (
    <Dialog titulo="Emitir para assinatura" descricao="O ofício recebe o próximo número do ano e o texto fica congelado." largura="max-w-xl" onFechar={aoFechar} podeFechar={!ocupado}>
      <div className="flex flex-col gap-4 px-6 py-5">
        {falta.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />Antes de emitir, preencha {falta.join(', ')}.
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Como vão assinar</legend>
          {([
            ['senha', 'Senha do Redação', 'Cada pessoa confirma com a própria senha, aqui mesmo. Mais rápido.'],
            ['govbr', 'Assinatura gov.br', 'Cada pessoa baixa o PDF, assina no gov.br (conta prata ou ouro) e envia de volta. É a assinatura avançada do governo, que qualquer pessoa confere no validar.iti.gov.br.'],
          ] as const).map(([valor, rotulo, texto]) => (
            <label key={valor} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${modo === valor ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <input id={`oficio-modo-${valor}`} type="radio" name="modo" value={valor} checked={modo === valor} onChange={() => setModo(valor)} className="mt-1 accent-primary" />
              <span><span className="block font-medium">{rotulo}</span><span className="text-xs text-muted-foreground">{texto}</span></span>
            </label>
          ))}
        </fieldset>
        <div>
          <p className="mb-2 text-sm font-medium">Quem assina, na ordem da folha</p>
          {escolhidos.length ? (
            <ol className="flex flex-col gap-2">
              {escolhidos.map((e, i) => (
                <li key={e.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-32 flex-1 text-sm font-medium">{porId.get(e.userId)?.nome}</span>
                  <input aria-label={`Cargo de ${porId.get(e.userId)?.nome}`} value={e.cargo} maxLength={120} placeholder="Cargo na folha"
                    onChange={(ev) => setEscolhidos(escolhidos.map((x) => (x.userId === e.userId ? { ...x, cargo: ev.target.value } : x)))}
                    className={`${inputClass} !w-44 py-1`} />
                  <span className="flex">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === escolhidos.length - 1} aria-label="Descer" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
                    <button type="button" onClick={() => setEscolhidos(escolhidos.filter((x) => x.userId !== e.userId))} aria-label="Tirar" className="rounded px-1.5 text-xs text-muted-foreground hover:bg-muted">Tirar</button>
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Ninguém escolhido ainda.</p>}
        </div>
        {escolhidos.length < 10 && (
          <label className="flex flex-col gap-1 text-sm font-medium">Adicionar pessoa
            <select value="" onChange={(e) => {
              const p = porId.get(e.target.value)
              if (p) setEscolhidos([...escolhidos, { userId: p.id, cargo: p.cargo ?? '' }])
            }} className={inputClass}>
              <option value="">Escolha…</option>
              {restantes.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu ? ' (você)' : ''}{p.cargo ? ` — ${p.cargo}` : ''}</option>)}
            </select>
          </label>
        )}
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="outline" onClick={aoFechar} disabled={ocupado}>Voltar</Button>
        <Button disabled={ocupado || !escolhidos.length || falta.length > 0} onClick={() => { setErro(''); aoEmitir(escolhidos, modo, setErro) }}>
          {ocupado && <Loader2 className="size-4 animate-spin" />}Emitir e enviar para assinatura
        </Button>
      </div>
    </Dialog>
  )
}
