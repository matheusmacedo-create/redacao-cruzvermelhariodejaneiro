'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArchiveX, Check, ClipboardCheck, HandHelping, Loader2, Printer, Undo2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import {
  aceitarTermo, baixarBem, concluirInventario, conferirBem, definirAcessoDoPatrimonio, devolverBem, entregarBem, excluirManutencao, iniciarInventario,
  registrarManutencao,
} from '@/app/actions/patrimonio'
import { DESTINOS_DE_BAIXA, ESTADOS, NIVEIS, TIPOS_DE_MANUTENCAO, type NomeDoNivel } from '@/lib/patrimonio/regras'

type R = { erro?: string }
function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<R>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar }
}
const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)
const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}{children}</label>
type Opcao = { id: string; nome: string }

export function Entregar({ bemId, equipe, voluntarios }: { bemId: string; equipe: Opcao[]; voluntarios: Opcao[] }) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<'equipe' | 'voluntario'>('equipe')
  const [p, setP] = useState({ pessoa: '', prevista: '', observacao: '' })
  const { erro, ocupado, executar } = useAcao()
  const lista = tipo === 'equipe' ? equipe : voluntarios
  return (
    <>
      <Button onClick={() => setAberto(true)} id="botao-entregar"><HandHelping className="size-4" />Entregar a alguém</Button>
      {aberto && (
        <Dialog titulo="Entregar o bem" descricao="A pessoa recebe o termo de responsabilidade para aceitar: a equipe no Palácio Virtual, o voluntário na Área do Voluntário (e por e-mail)." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2" role="radiogroup">
              {(['equipe', 'voluntario'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); setP({ ...p, pessoa: '' }) }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${tipo === t ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{t === 'equipe' ? 'Equipe (login do Palácio Virtual)' : 'Voluntário'}</button>
              ))}
            </div>
            <Campo rotulo="Quem recebe">
              <select value={p.pessoa} onChange={(e) => setP({ ...p, pessoa: e.target.value })} className={inputClass}>
                <option value="">Escolha…</option>{lista.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Devolver até (opcional)"><input type="date" value={p.prevista} onChange={(e) => setP({ ...p, prevista: e.target.value })} className={inputClass} /></Campo>
            <Campo rotulo="Observação"><textarea value={p.observacao} onChange={(e) => setP({ ...p, observacao: e.target.value })} rows={2} maxLength={1000} placeholder="Ex.: com carregador e capa" className={inputClass} /></Campo>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || !p.pessoa} onClick={() => executar(() => entregarBem(bemId, { tipo, ...p }), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Registrar entrega</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function Devolver({ bemId, cautelaId, locais, localAtual }: { bemId: string; cautelaId: string; locais: Opcao[]; localAtual: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState({ estado: 'bom', local_id: localAtual ?? '', observacao: '' })
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><Undo2 className="size-4" />Registrar devolução</Button>
      {aberto && (
        <Dialog titulo="Devolução" onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Em que estado voltou"><select value={p.estado} onChange={(e) => setP({ ...p, estado: e.target.value })} className={inputClass}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="Onde fica agora"><select value={p.local_id} onChange={(e) => setP({ ...p, local_id: e.target.value })} className={inputClass}><option value="">Mesmo lugar</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
            <Campo rotulo="Observação"><textarea value={p.observacao} onChange={(e) => setP({ ...p, observacao: e.target.value })} rows={2} maxLength={1000} placeholder="Ex.: antena quebrada" className={inputClass} /></Campo>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado} onClick={() => executar(() => devolverBem(bemId, cautelaId, p), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar devolução</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function NovaManutencao({ bemId, hoje }: { bemId: string; hoje: string }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState({ tipo: 'preventiva', descricao: '', prevista_para: '', realizada_em: hoje, fornecedor: '', custo: '' })
  const [feita, setFeita] = useState(true)
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} id="nova-manutencao"><Wrench className="size-3.5" />Manutenção</Button>
      {aberto && (
        <Dialog titulo="Manutenção" descricao="Preventiva feita num bem com periodicidade agenda a próxima sozinha." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Tipo"><select value={p.tipo} onChange={(e) => setP({ ...p, tipo: e.target.value })} className={inputClass}>{Object.entries(TIPOS_DE_MANUTENCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="O que foi (ou será) feito"><input value={p.descricao} onChange={(e) => setP({ ...p, descricao: e.target.value })} maxLength={600} placeholder="Ex.: troca da bateria e teste das pás" className={inputClass} /></Campo>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={feita} onChange={() => setFeita(true)} />Já foi feita</label>
              <label className="flex items-center gap-2"><input type="radio" checked={!feita} onChange={() => setFeita(false)} />Agendar</label>
            </div>
            {feita
              ? <Campo rotulo="Feita em"><input type="date" max={hoje} value={p.realizada_em} onChange={(e) => setP({ ...p, realizada_em: e.target.value })} className={inputClass} /></Campo>
              : <Campo rotulo="Prevista para"><input type="date" value={p.prevista_para} onChange={(e) => setP({ ...p, prevista_para: e.target.value })} className={inputClass} /></Campo>}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Quem fez"><input value={p.fornecedor} onChange={(e) => setP({ ...p, fornecedor: e.target.value })} maxLength={160} className={inputClass} /></Campo>
              <Campo rotulo="Custo"><input value={p.custo} onChange={(e) => setP({ ...p, custo: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
            </div>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado} onClick={() => executar(() => registrarManutencao(bemId, { ...p, realizada_em: feita ? p.realizada_em : '', prevista_para: feita ? '' : p.prevista_para }), () => setAberto(false))}>
                {ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

/** Marca uma manutenção agendada como feita hoje, ou cancela. */
export function ManutencaoPendente({ bemId, m, hoje }: { bemId: string; m: { id: string; tipo: string; descricao: string; prevista_para: string | null; fornecedor: string | null }; hoje: string }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex gap-1">
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => registrarManutencao(bemId, { id: m.id, tipo: m.tipo, descricao: m.descricao, prevista_para: m.prevista_para ?? '', realizada_em: hoje, fornecedor: m.fornecedor ?? '', custo: '' }))}>
          <Check className="size-3.5" />Feita hoje</Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => { if (confirm('Cancelar esta manutenção agendada?')) executar(() => excluirManutencao(bemId, m.id)) }}>Cancelar</Button>
      </span>
      <Erro texto={erro} />
    </span>
  )
}

export function Baixar({ bemId, hoje }: { bemId: string; hoje: string }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState({ destino: '', motivo: '', data: hoje })
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAberto(true)}><ArchiveX className="size-4" />Dar baixa</Button>
      {aberto && (
        <Dialog titulo="Baixa do bem" descricao="O bem sai do patrimônio e não volta. Fica no histórico, com o motivo." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Destino"><select value={p.destino} onChange={(e) => setP({ ...p, destino: e.target.value })} className={inputClass}><option value="">Escolha…</option>{Object.entries(DESTINOS_DE_BAIXA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="Motivo"><textarea value={p.motivo} onChange={(e) => setP({ ...p, motivo: e.target.value })} rows={3} maxLength={600} placeholder="Ex.: queimou na enchente; laudo técnico sem conserto" className={inputClass} /></Campo>
            <Campo rotulo="Data"><input type="date" max={hoje} value={p.data} onChange={(e) => setP({ ...p, data: e.target.value })} className={inputClass} /></Campo>
            {p.destino === 'furto_perda' && <p className="text-xs text-muted-foreground">Guarde o boletim de ocorrência: o contador e o financiador vão pedir.</p>}
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button variant="destructive" disabled={ocupado || !p.destino || p.motivo.trim().length < 5} onClick={() => executar(() => baixarBem(bemId, p), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Dar baixa</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

/** No inventário aberto: "está aqui", com lugar e estado encontrados. */
export function Conferir({ bemId, locais, localAtual, estadoAtual, conferido }: { bemId: string; locais: Opcao[]; localAtual: string | null; estadoAtual: string; conferido: boolean }) {
  const [p, setP] = useState({ local_id: localAtual ?? '', estado: estadoAtual, observacao: '' })
  const { erro, ocupado, executar } = useAcao()
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4" id="conferir" data-ajuda="patrimonio.bem-conferir">
      <p className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="size-4 text-primary" />Inventário aberto{conferido ? ' — já conferido' : ''}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={p.local_id} onChange={(e) => setP({ ...p, local_id: e.target.value })} aria-label="Onde foi encontrado" className={inputClass}><option value="">Sem local</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select value={p.estado} onChange={(e) => setP({ ...p, estado: e.target.value })} aria-label="Estado" className={inputClass}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <input value={p.observacao} onChange={(e) => setP({ ...p, observacao: e.target.value })} maxLength={600} placeholder="Observação (opcional)" aria-label="Observação" className={inputClass} />
      <div><Button disabled={ocupado} onClick={() => executar(() => conferirBem(bemId, p))}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{conferido ? 'Conferir de novo' : 'Está aqui'}</Button></div>
      <Erro texto={erro} />
    </div>
  )
}

export function AceitarTermo({ cautelaId }: { cautelaId: string }) {
  const [lido, setLido] = useState(false)
  const { erro, ocupado, executar } = useAcao()
  return (
    <div className="flex flex-col gap-2" data-ajuda="patrimonio.comigo-aceitar">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={lido} onChange={(e) => setLido(e.target.checked)} className="mt-0.5" />Li o termo, conferi o bem e o recebi.</label>
      <div><Button size="sm" disabled={!lido || ocupado} onClick={() => executar(() => aceitarTermo(cautelaId))}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Aceitar o termo</Button></div>
      <Erro texto={erro} />
    </div>
  )
}

export function AbrirInventario() {
  const [nome, setNome] = useState(`Inventário ${new Date().getFullYear()}`)
  const { erro, ocupado, executar } = useAcao()
  return (
    <div className="flex flex-wrap items-center gap-2" data-ajuda="patrimonio.inventario-abrir">
      <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} aria-label="Nome do inventário" className={`${inputClass} !w-64`} />
      <Button disabled={ocupado} onClick={() => executar(() => iniciarInventario(nome))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Abrir inventário</Button>
      <Erro texto={erro} />
    </div>
  )
}

export function ConcluirInventario({ faltam }: { faltam: number }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-start gap-1" data-ajuda="patrimonio.inventario-concluir">
      <Button variant="outline" disabled={ocupado} onClick={() => { if (confirm(faltam ? `${faltam} bens não foram conferidos e ficam como "não encontrados" no resultado. Concluir mesmo assim?` : 'Concluir o inventário?')) executar(() => concluirInventario()) }}>
        {ocupado && <Loader2 className="size-4 animate-spin" />}Concluir inventário</Button>
      <Erro texto={erro} />
    </span>
  )
}

/** Marca bens na lista e imprime as etiquetas (PDF A4, 3×8). */
export function ImprimirEtiquetas({ formId }: { formId: string }) {
  return (
    <Button variant="outline" type="submit" form={formId} formTarget="_blank" data-ajuda="patrimonio.etiquetas"><Printer className="size-4" />Etiquetas dos marcados</Button>
  )
}

export function NivelDeAcesso({ userId, nivel }: { userId: string; nivel: NomeDoNivel | null }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {ocupado && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      <select value={nivel ?? ''} disabled={ocupado} aria-label="Nível no Patrimônio" className={`${inputClass} !w-auto py-1`}
        onChange={(e) => iniciar(async () => { setErro(''); const r = await definirAcessoDoPatrimonio(userId, (e.target.value || null) as NomeDoNivel | null); if (r.erro) setErro(r.erro); else router.refresh() })}>
        <option value="">Sem acesso</option>{Object.entries(NIVEIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
      </select>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}
