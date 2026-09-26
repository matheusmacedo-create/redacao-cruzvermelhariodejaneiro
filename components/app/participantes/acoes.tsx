'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Eye, Loader2, Send, Trash2, UserX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import {
  adicionarFormacao, anonimizarParticipante, convidarParaAreaDoMembro, definirAcesso, mudarSituacao, recusarCandidato, registrarHoras, removerRegistro, verDadosSensiveis,
} from '@/app/actions/participantes'
import { NIVEIS, type NomeDoNivel } from '@/lib/participantes/regras'

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
  return { erro, ocupado, executar, setErro }
}

const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)

/** Aprovar ou recusar uma inscrição pendente, na lista. */
export function DecidirInscricao({ id }: { id: string }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex gap-1.5">
        <Button size="sm" disabled={ocupado} onClick={() => executar(() => mudarSituacao(id, 'ativo'))}><Check className="size-3.5" />Aprovar</Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => executar(() => recusarCandidato(id))}><X className="size-3.5" />Recusar</Button>
      </span>
      <Erro texto={erro} />
    </span>
  )
}

export function CopiarLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false)
  return (
    <Button variant="outline" data-ajuda="voluntarios.link" onClick={() => navigator.clipboard?.writeText(url).then(() => { setOk(true); setTimeout(() => setOk(false), 1800) }).catch(() => undefined)}>
      {ok ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{ok ? 'Link copiado' : 'Copiar link de inscrição'}
    </Button>
  )
}

/** Quem acessa o cadastro, e em que nível. Só para admin. */
export function NivelDeAcesso({ userId, nivel, ehAdmin }: { userId: string; nivel: NomeDoNivel | null; ehAdmin: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  if (ehAdmin) return <span className="text-xs text-muted-foreground">Tudo (admin)</span>
  return (
    <span className="flex flex-col items-end gap-1">
      <select aria-label="Nível de acesso" defaultValue={nivel ?? ''} disabled={ocupado} className={`${inputClass} !w-44 py-1.5`}
        onChange={(e) => executar(() => definirAcesso(userId, (e.target.value || null) as NomeDoNivel | null))}>
        <option value="">Sem acesso</option>
        {Object.entries(NIVEIS).map(([k, n]) => <option key={k} value={k}>{n.rotulo}</option>)}
      </select>
      <Erro texto={erro} />
    </span>
  )
}

/** CPF e saúde, abertos sob demanda. Cada abertura vai para a auditoria. */
export function DadosSensiveis({ id, temCpf, temSaude }: { id: string; temCpf: boolean; temSaude: boolean }) {
  const [dados, setDados] = useState<{ cpf?: string | null; tipoSanguineo?: string | null; restricoes?: string | null } | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  if (!temCpf && !temSaude) return <p className="text-sm text-muted-foreground">Nenhum dado sensível guardado.</p>
  if (!dados) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="self-start" disabled={ocupado} onClick={() => iniciar(async () => {
          const r = await verDadosSensiveis(id)
          if (r.erro) setErro(r.erro)
          else setDados(r)
        })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}Ver CPF e saúde</Button>
        <p className="text-xs text-muted-foreground">A abertura fica registrada com o seu nome.</p>
        <Erro texto={erro} />
      </div>
    )
  }
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">CPF</dt><dd className="font-mono">{dados.cpf ?? '—'}</dd>
      <dt className="text-muted-foreground">Tipo sanguíneo</dt><dd>{dados.tipoSanguineo ?? '—'}</dd>
      <dt className="text-muted-foreground">Restrições</dt><dd className="whitespace-pre-line">{dados.restricoes ?? '—'}</dd>
    </dl>
  )
}

export function AcoesDeSituacao({ id, situacao, podeAnonimizar }: { id: string; situacao: string; podeAnonimizar: boolean }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [dialogo, setDialogo] = useState<'desligar' | 'anonimizar' | null>(null)
  const [motivo, setMotivo] = useState('')
  const fechar = () => { if (!ocupado) { setDialogo(null); setMotivo(''); setErro('') } }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {situacao === 'candidato' && <Button size="sm" disabled={ocupado} onClick={() => executar(() => mudarSituacao(id, 'ativo'))}><Check className="size-3.5" />Aprovar inscrição</Button>}
        {situacao === 'ativo' && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => mudarSituacao(id, 'inativo'))}>Marcar como inativo</Button>}
        {(situacao === 'inativo' || situacao === 'desligado') && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => mudarSituacao(id, 'ativo'))}>Reativar</Button>}
        {situacao !== 'desligado' && situacao !== 'candidato' && <Button size="sm" variant="ghost" onClick={() => setDialogo('desligar')}><UserX className="size-3.5" />Desligar</Button>}
        {podeAnonimizar && <Button size="sm" variant="ghost" onClick={() => setDialogo('anonimizar')}><Trash2 className="size-3.5" />Apagar dados (LGPD)</Button>}
      </div>
      {!dialogo && <Erro texto={erro} />}
      {dialogo && (
        <Dialog titulo={dialogo === 'desligar' ? 'Desligar participante' : 'Apagar dados pessoais'} onFechar={fechar} podeFechar={!ocupado}
          descricao={dialogo === 'desligar' ? 'O cadastro fica guardado, marcado como desligado, com o motivo.' : 'Atende ao pedido do titular (LGPD, art. 18). Nome, contatos, documentos, endereço, saúde e formações são apagados; ficam só vínculo, setores e horas, sem identificar ninguém. Não tem volta.'}>
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => {
            e.preventDefault()
            executar(() => (dialogo === 'desligar' ? mudarSituacao(id, 'desligado', motivo) : anonimizarParticipante(id, motivo)), () => { setDialogo(null); setMotivo('') })
          }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo
              <textarea id="p-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} className={inputClass} />
            </label>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}{dialogo === 'desligar' ? 'Desligar' : 'Apagar dados'}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

export function NovoRegistro({ participanteId, tipo, hoje }: { participanteId: string; tipo: 'horas' | 'formacao'; hoje: string }) {
  const { erro, ocupado, executar } = useAcao()
  const [aberto, setAberto] = useState(false)
  if (!aberto) return <Button size="sm" variant="outline" onClick={() => setAberto(true)}>{tipo === 'horas' ? 'Registrar horas' : 'Adicionar formação'}</Button>
  return (
    <form className="flex flex-col gap-2 rounded-lg border border-border p-3" onSubmit={(e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      executar(() => (tipo === 'horas' ? registrarHoras(participanteId, f) : adicionarFormacao(participanteId, f)), () => setAberto(false))
    }}>
      {tipo === 'horas' ? (
        <div className="grid gap-2 sm:grid-cols-[9rem_6rem_1fr]">
          <input aria-label="Data" name="data" type="date" required max={hoje} defaultValue={hoje} className={inputClass} />
          <input aria-label="Horas" name="horas" inputMode="decimal" required placeholder="Horas" className={inputClass} />
          <input aria-label="Atividade" name="atividade" required minLength={2} maxLength={200} placeholder="Atividade (ex.: cobertura do Réveillon)" className={inputClass} />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label="Formação" name="titulo" required minLength={2} maxLength={200} placeholder="Formação (ex.: Primeiros Socorros)" className={inputClass} />
          <input aria-label="Instituição" name="instituicao" maxLength={200} placeholder="Instituição" className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Concluída em<input name="concluido_em" type="date" max={hoje} className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Válida até<input name="valido_ate" type="date" className={inputClass} /></label>
        </div>
      )}
      <Erro texto={erro} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function RemoverRegistro({ tabela, id, participanteId }: { tabela: 'participante_horas' | 'participante_formacoes'; id: string; participanteId: string }) {
  const { ocupado, executar } = useAcao()
  return (
    <button type="button" aria-label="Remover" title="Remover" disabled={ocupado} onClick={() => executar(() => removerRegistro(tabela, id, participanteId))}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40">
      {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  )
}

/** Manda o convite da Área do Voluntário para o e-mail do cadastro. */
export function ConvidarAreaDoMembro({ id, temEmail }: { id: string; temEmail: boolean }) {
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState('')
  const [ocupado, iniciar] = useTransition()
  if (!temEmail) return <p className="text-xs text-muted-foreground">Cadastre um e-mail para poder convidar.</p>
  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" variant="outline" className="self-start" disabled={ocupado} onClick={() => iniciar(async () => {
        setErro(''); setEnviado('')
        const r = await convidarParaAreaDoMembro(id)
        if (r.erro) setErro(r.erro)
        else setEnviado(r.email ?? '')
      })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}Enviar convite por e-mail</Button>
      {enviado && <p className="text-xs text-success">Convite enviado para {enviado}.</p>}
      <Erro texto={erro} />
    </div>
  )
}
