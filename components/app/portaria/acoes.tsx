'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, DoorOpen, Loader2, LogOut, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { ErroDaFoto, prepararFotoDePerfil } from '@/lib/membro/preparar-foto'
import { confirmarEntrada, descartarCadastro, devolverCracha, registrarEntrada, registrarSaida, trocarLinkDaEntrada } from '@/app/actions/portaria'

export type Pessoa = { id: string; nome: string; setor: string | null }
type Inicial = { nome?: string; telefone?: string | null; empresa?: string | null; motivo?: string | null; visitado_id?: string | null; visitado_texto?: string | null; cracha_numero?: string | null }

const rotulo = 'flex flex-col gap-1.5 text-sm font-medium'

/** Sobe a foto (reduzida no navegador, sem metadados) para a visita. */
async function enviarFoto(visitaId: string, file: File): Promise<string | null> {
  try {
    const foto = await prepararFotoDePerfil(file)
    const corpo = new FormData()
    corpo.append('foto', foto)
    const r = await fetch(`/api/portaria/${visitaId}/foto`, { method: 'POST', body: corpo })
    const dados = await r.json().catch(() => ({})) as { error?: string }
    return r.ok ? null : dados.error ?? 'A foto não foi salva.'
  } catch (causa) {
    return causa instanceof ErroDaFoto ? causa.message : 'A foto não foi salva. Tente de novo pelo botão da foto.'
  }
}

/** Os campos do visitante, comuns à entrada pela portaria e à confirmação do autocadastro. */
function Campos({ pessoas, inicial, foto, setFoto }: { pessoas: Pessoa[]; inicial?: Inicial; foto: File | null; setFoto: (f: File | null) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className={`${rotulo} sm:col-span-2`}>Nome do visitante *
        <input name="nome" required minLength={2} maxLength={120} defaultValue={inicial?.nome ?? ''} className={inputClass} autoComplete="off" />
      </label>
      <label className={rotulo}>Telefone
        <input name="telefone" type="tel" maxLength={30} defaultValue={inicial?.telefone ?? ''} className={inputClass} placeholder="(21) 90000-0000" />
      </label>
      <label className={rotulo}>De onde vem
        <input name="empresa" maxLength={120} defaultValue={inicial?.empresa ?? ''} className={inputClass} placeholder="Empresa, órgão ou particular" />
      </label>
      <label className={rotulo}>Quem vai visitar (recebe aviso)
        <select name="visitado_id" defaultValue={inicial?.visitado_id ?? ''} className={inputClass}>
          <option value="">Ninguém do Palácio / não sei</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${p.setor}` : ''}</option>)}
        </select>
      </label>
      <label className={rotulo}>Setor ou pessoa (texto)
        <input name="visitado_texto" maxLength={120} defaultValue={inicial?.visitado_texto ?? ''} className={inputClass} placeholder="Ex.: Voluntariado, Escola" />
      </label>
      <label className={rotulo}>Motivo
        <input name="motivo" maxLength={300} defaultValue={inicial?.motivo ?? ''} className={inputClass} placeholder="Reunião, entrega, curso…" />
      </label>
      <label className={rotulo}>Nº do crachá de visitante
        <input name="cracha_numero" maxLength={20} defaultValue={inicial?.cracha_numero ?? ''} className={inputClass} placeholder="Ex.: V-07" />
      </label>
      <div className={`${rotulo} sm:col-span-2`}>
        <span>Foto do visitante</span>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={entrada} type="file" accept="image/*" capture="user" className="sr-only" id="foto-visitante" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" size="sm" onClick={() => entrada.current?.click()} data-portaria-foto><Camera className="size-3.5" />{foto ? 'Tirar outra' : 'Tirar foto'}</Button>
          <span className="text-xs font-normal text-muted-foreground">{foto ? `Foto pronta (${foto.name || 'câmera'}).` : 'Opcional. No celular ou tablet, abre a câmera.'}</span>
        </div>
      </div>
    </div>
  )
}

/** A portaria registra quem chegou: grava, sobe a foto e avisa quem é visitado. */
export function NovaEntrada({ pessoas }: { pessoas: Pessoa[] }) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <form ref={form} className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault()
      const dados = new FormData(e.currentTarget)
      iniciar(async () => {
        setErro(''); setOk('')
        const r = await registrarEntrada(dados)
        if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível registrar.'); return }
        const erroDaFoto = foto ? await enviarFoto(r.id, foto) : null
        form.current?.reset(); setFoto(null)
        setOk(`Entrada de ${String(dados.get('nome')).trim()} registrada${erroDaFoto ? `, mas ${erroDaFoto.charAt(0).toLowerCase()}${erroDaFoto.slice(1)}` : '.'}`)
        router.refresh()
      })
    }}>
      <Campos pessoas={pessoas} foto={foto} setFoto={setFoto} />
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {ok && <p role="status" className="text-sm text-success">{ok}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={ocupado} data-portaria-registrar>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}Registrar entrada</Button>
      </div>
    </form>
  )
}

/** Confirma (ou descarta) quem se cadastrou pelo QR. */
export function ConfirmarCadastro({ id, pessoas, inicial }: { id: string; pessoas: Pessoa[]; inicial: Inicial }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setAberto(true)} data-portaria-confirmar><UserPlus className="size-3.5" />Confirmar entrada</Button>
      <Button size="sm" variant="ghost" disabled={ocupado} aria-label={`Descartar o cadastro de ${inicial.nome}`} onClick={() => {
        if (!window.confirm(`Descartar o cadastro de ${inicial.nome}? Ele não entra no livro como visita.`)) return
        iniciar(async () => { const r = await descartarCadastro(id); if (r.erro) setErro(r.erro); else router.refresh() })
      }}><Trash2 className="size-3.5" />Descartar</Button>
      {erro && !aberto && <p role="alert" className="w-full text-sm text-destructive">{erro}</p>}
      {aberto && (
        <Dialog titulo="Confirmar a entrada" descricao="Confira os dados com o visitante, escolha quem é visitado (recebe o aviso) e anote o crachá." largura="max-w-2xl" onFechar={() => !ocupado && setAberto(false)}>
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            iniciar(async () => {
              setErro('')
              const r = await confirmarEntrada(id, dados)
              if (r.erro) { setErro(r.erro); return }
              const erroDaFoto = foto ? await enviarFoto(id, foto) : null
              if (erroDaFoto) { setErro(`Entrada confirmada, mas ${erroDaFoto.charAt(0).toLowerCase()}${erroDaFoto.slice(1)}`); router.refresh(); return }
              setAberto(false); router.refresh()
            })
          }}>
            <Campos pessoas={pessoas} inicial={inicial} foto={foto} setFoto={setFoto} />
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Confirmar entrada</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

/** Saída: se havia crachá de visitante, pergunta se ele voltou. */
export function RegistrarSaida({ id, nome, cracha }: { id: string; nome: string; cracha: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [devolvido, setDevolvido] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const sair = (d: boolean) => iniciar(async () => {
    setErro('')
    const r = await registrarSaida(id, d)
    if (r.erro) { setErro(r.erro); return }
    setAberto(false); router.refresh()
  })
  return (
    <>
      <Button size="sm" variant="outline" disabled={ocupado} aria-label={`Registrar a saída de ${nome}`} data-portaria-saida
        onClick={() => (cracha ? setAberto(true) : sair(false))}>
        {ocupado && !aberto ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Saída
      </Button>
      {erro && !aberto && <span role="alert" className="text-xs text-destructive">{erro}</span>}
      {aberto && (
        <Dialog titulo={`Saída de ${nome}`} descricao={`Ele(a) está com o crachá de visitante ${cracha}.`} onFechar={() => !ocupado && setAberto(false)}>
          <form className="flex flex-col gap-4 p-6" onSubmit={(e) => { e.preventDefault(); sair(devolvido) }}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={devolvido} onChange={(e) => setDevolvido(e.target.checked)} className="size-4" />
              Devolveu o crachá {cracha}
            </label>
            {!devolvido && <p className="text-sm text-warning-foreground">O crachá fica em “Crachás não devolvidos” até alguém registrar a devolução.</p>}
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Registrar saída</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function DevolverCracha({ id, cracha }: { id: string; cracha: string }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={ocupado} data-portaria-devolver onClick={() => iniciar(async () => {
        const r = await devolverCracha(id); if (r.erro) setErro(r.erro); else router.refresh()
      })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Crachá {cracha} devolvido</Button>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}

/** Foto depois da entrada (esqueceu na hora, ou quer trocar). */
export function TirarFoto({ id, nome, tem }: { id: string; nome: string; tem: boolean }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <>
      <input ref={entrada} type="file" accept="image/*" capture="user" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return
        iniciar(async () => { const r = await enviarFoto(id, f); setErro(r ?? ''); if (!r) router.refresh(); if (entrada.current) entrada.current.value = '' })
      }} />
      <Button size="sm" variant="ghost" disabled={ocupado} aria-label={`${tem ? 'Trocar' : 'Tirar'} a foto de ${nome}`} onClick={() => entrada.current?.click()}>
        {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}{tem ? 'Trocar foto' : 'Foto'}
      </Button>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </>
  )
}

/** A tela da portaria fica aberta o dia todo: recarrega sozinha para mostrar quem se cadastrou pelo QR. */
export function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, segundos * 1000)
    return () => clearInterval(t)
  }, [router, segundos])
  return null
}

export function TrocarLink() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="outline" disabled={ocupado} data-portaria-trocar-link onClick={() => {
        if (!window.confirm('Gerar um link novo? O cartaz impresso hoje para de funcionar e precisa ser trocado.')) return
        iniciar(async () => { const r = await trocarLinkDaEntrada(); if (r.erro) setErro(r.erro); else router.refresh() })
      }}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Gerar link novo</Button>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}

