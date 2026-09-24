'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Fuel, KeyRound, Loader2, LogIn, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import {
  abastecerVeiculo, excluirDaFrota, registrarServico, retornarVeiculo, sairComVeiculo, salvarCondutor, salvarDocumentoDoVeiculo, salvarPlano, salvarVeiculo, type DadosDoCondutor,
} from '@/app/actions/frota'
import {
  CATEGORIAS_CNH, COMBUSTIVEIS, FINALIDADES_DE_USO, SITUACOES_DO_VEICULO, TIPOS_DE_DOCUMENTO, TIPOS_DE_SERVICO, TIPOS_DE_VEICULO, impedimento, km, type Condutor,
} from '@/lib/patrimonio/frota'
import { lerQuantidade } from '@/lib/patrimonio/estoque'
import { lerValor } from '@/lib/patrimonio/regras'

type R = { erro?: string }
type Opcao = { id: string; nome: string }
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
function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}
function Rodape({ erro, ocupado, onCancelar, onConfirmar, rotulo, desabilitado, perigo }: { erro: string; ocupado: boolean; onCancelar: () => void; onConfirmar: () => void; rotulo: string; desabilitado?: boolean; perigo?: boolean }) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</Button>
        <Button variant={perigo ? 'destructive' : 'default'} disabled={ocupado || desabilitado} onClick={onConfirmar}>{ocupado && <Loader2 className="size-4 animate-spin" />}{rotulo}</Button>
      </div>
    </div>
  )
}
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ---------------------------------------------------------------- veículo

export type Veiculo = {
  id: string; bem_id: string | null; placa: string; apelido: string | null; tipo: string; marca: string | null; modelo: string | null; ano_fabricacao: number | null; ano_modelo: number | null
  cor: string | null; renavam: string | null; chassi: string | null; combustivel: string; tanque_litros: number | null; km_atual: number; local_id: string | null; situacao: string; observacao: string | null
}

export function FormularioDoVeiculo({ v, locais, bens }: { v?: Veiculo; locais: Opcao[]; bens: Opcao[] }) {
  const router = useRouter()
  const [estado, enviar, enviando] = useActionState(salvarVeiculo.bind(null, v?.id ?? null), {})
  useEffect(() => { if (estado.id) router.push(`/patrimonio/frota/${estado.id}`) }, [estado.id, router])
  return (
    <form action={enviar} className="flex flex-col gap-5" id="form-veiculo">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Placa"><input name="placa" required maxLength={8} defaultValue={v?.placa} placeholder="ABC1D23" className={`${inputClass} uppercase`} /></Campo>
        <Campo rotulo="Apelido" ajuda="Como a equipe chama (ex.: UR-01)."><input name="apelido" maxLength={60} defaultValue={v?.apelido ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Tipo"><select name="tipo" defaultValue={v?.tipo ?? 'carro'} className={inputClass}>{Object.entries(TIPOS_DE_VEICULO).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
        <Campo rotulo="Marca"><input name="marca" maxLength={60} defaultValue={v?.marca ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Modelo"><input name="modelo" maxLength={80} defaultValue={v?.modelo ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Cor"><input name="cor" maxLength={30} defaultValue={v?.cor ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Ano de fabricação"><input name="ano_fabricacao" inputMode="numeric" maxLength={4} defaultValue={v?.ano_fabricacao ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Ano do modelo"><input name="ano_modelo" inputMode="numeric" maxLength={4} defaultValue={v?.ano_modelo ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Combustível"><select name="combustivel" defaultValue={v?.combustivel ?? 'flex'} className={inputClass}>{Object.entries(COMBUSTIVEIS).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
        <Campo rotulo="RENAVAM"><input name="renavam" inputMode="numeric" maxLength={11} defaultValue={v?.renavam ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Chassi"><input name="chassi" maxLength={17} defaultValue={v?.chassi ?? ''} className={`${inputClass} uppercase`} /></Campo>
        <Campo rotulo="Tanque (litros)"><input name="tanque_litros" inputMode="decimal" defaultValue={v?.tanque_litros ?? ''} className={inputClass} /></Campo>
        <Campo rotulo={v ? 'Hodômetro (correção)' : 'Hodômetro hoje'} ajuda={v ? 'Só para corrigir: o km sobe sozinho com viagens e abastecimentos.' : undefined}>
          <input name="km_atual" inputMode="numeric" required={!v} defaultValue={v?.km_atual ?? ''} className={inputClass} />
        </Campo>
        <Campo rotulo="Base"><select name="local_id" defaultValue={v?.local_id ?? locais[0]?.id ?? ''} className={inputClass}><option value="">—</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
        <Campo rotulo="Situação"><select name="situacao" defaultValue={v?.situacao ?? 'ativo'} className={inputClass}>{Object.entries(SITUACOES_DO_VEICULO).map(([k, x]) => <option key={k} value={k}>{x.rotulo}</option>)}</select></Campo>
        <Campo rotulo="Bem no patrimônio" ajuda="Liga ao bem (plaqueta, valor e depreciação)." className="sm:col-span-2">
          <select name="bem_id" defaultValue={v?.bem_id ?? ''} className={inputClass}><option value="">— sem vínculo —</option>{bens.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
        </Campo>
        <Campo rotulo="Observação" className="sm:col-span-3"><textarea name="observacao" rows={2} maxLength={2000} defaultValue={v?.observacao ?? ''} className={inputClass} /></Campo>
      </div>
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{v ? 'Salvar' : 'Cadastrar veículo'}</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- viagem

export type CondutorParaUso = Condutor & { id: string }

export function SairComVeiculo({ veiculoId, tipo, kmAtual, condutores, projetos, hoje }: { veiculoId: string; tipo: string; kmAtual: number; condutores: CondutorParaUso[]; projetos: Opcao[]; hoje: string }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState({ condutor_id: '', km_saida: String(kmAtual), destino: '', finalidade: 'atendimento', projeto_id: '' })
  const { erro, ocupado, executar } = useAcao()
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      <Button onClick={() => { setP({ condutor_id: '', km_saida: String(kmAtual), destino: '', finalidade: 'atendimento', projeto_id: '' }); setAberto(true) }} id="botao-sair"><KeyRound className="size-4" />Saída</Button>
      {aberto && (
        <Dialog titulo="Saída do veículo" descricao="Abre a viagem no diário de bordo. Só dirige quem tem CNH válida na categoria certa (e, na ambulância, o curso de veículo de emergência)." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Quem dirige" className="sm:col-span-2">
              <select value={p.condutor_id} onChange={set('condutor_id')} className={inputClass}>
                <option value="">Escolha…</option>
                {condutores.map((c) => { const im = impedimento(c, tipo, hoje); return <option key={c.id} value={c.id} disabled={Boolean(im)}>{c.nome} (CNH {c.cnh_categoria}){im ? ` — ${im}` : ''}</option> })}
              </select>
            </Campo>
            <Campo rotulo="Hodômetro na saída" ajuda={`Último registro: ${km(kmAtual)}.`}><input value={p.km_saida} onChange={set('km_saida')} inputMode="numeric" className={inputClass} /></Campo>
            <Campo rotulo="Finalidade"><select value={p.finalidade} onChange={set('finalidade')} className={inputClass}>{Object.entries(FINALIDADES_DE_USO).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
            <Campo rotulo="Destino" className="sm:col-span-2"><input value={p.destino} onChange={set('destino')} maxLength={200} placeholder="Ex.: Maracanã — posto médico do jogo" className={inputClass} /></Campo>
            {projetos.length > 0 && <Campo rotulo="Projeto"><select value={p.projeto_id} onChange={set('projeto_id')} className={inputClass}><option value="">—</option>{projetos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>}
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Registrar saída" desabilitado={!p.condutor_id || !p.destino.trim()} onConfirmar={() => executar(() => sairComVeiculo(veiculoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

export function RetornarVeiculo({ veiculoId, usoId, kmSaida }: { veiculoId: string; usoId: string; kmSaida: number }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState({ km_retorno: '', observacao: '' })
  const { erro, ocupado, executar } = useAcao()
  const kmNovo = Number(p.km_retorno.replace(/\D/g, ''))
  return (
    <>
      <Button onClick={() => { setP({ km_retorno: '', observacao: '' }); setAberto(true) }} id="botao-retorno"><LogIn className="size-4" />Retorno</Button>
      {aberto && (
        <Dialog titulo="Retorno do veículo" descricao="Encerra a viagem. O km de retorno passa a ser o hodômetro do veículo." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Hodômetro na chegada" ajuda={p.km_retorno && kmNovo >= kmSaida ? `Rodou ${km(kmNovo - kmSaida)}.` : `Saiu com ${km(kmSaida)}.`}><input value={p.km_retorno} onChange={(e) => setP({ ...p, km_retorno: e.target.value })} inputMode="numeric" className={inputClass} autoFocus /></Campo>
            <Campo rotulo="Ocorrências"><textarea value={p.observacao} onChange={(e) => setP({ ...p, observacao: e.target.value })} rows={2} maxLength={1000} placeholder="Ex.: luz do óleo acendeu, pneu dianteiro baixo" className={inputClass} /></Campo>
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Registrar retorno" desabilitado={!p.km_retorno || kmNovo < kmSaida} onConfirmar={() => executar(() => retornarVeiculo(veiculoId, usoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- abastecimento e serviço

export function Abastecer({ veiculoId, combustivel, kmAtual, condutores, hoje }: { veiculoId: string; combustivel: string; kmAtual: number; condutores: Opcao[]; hoje: string }) {
  const padrao = combustivel === 'flex' ? 'gasolina' : combustivel
  const vazio = { data: hoje, km: String(kmAtual), litros: '', valor: '', combustivel: padrao, tanque_cheio: true, posto: '', condutor_id: '' }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const litros = lerQuantidade(p.litros), valor = lerValor(p.valor)
  const precoLitro = litros && valor && !Number.isNaN(litros) && !Number.isNaN(valor) ? valor / litros : null
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      <Button variant="outline" onClick={() => { setP(vazio); setAberto(true) }} id="botao-abastecer"><Fuel className="size-4" />Abastecer</Button>
      {aberto && (
        <Dialog titulo="Abastecimento" descricao="Com o tanque cheio, o Redação calcula o consumo (km por litro)." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Data"><input type="date" value={p.data} max={hoje} onChange={set('data')} className={inputClass} /></Campo>
            <Campo rotulo="Hodômetro"><input value={p.km} onChange={set('km')} inputMode="numeric" className={inputClass} /></Campo>
            <Campo rotulo="Litros"><input value={p.litros} onChange={set('litros')} inputMode="decimal" className={inputClass} /></Campo>
            <Campo rotulo="Valor pago" ajuda={precoLitro ? `${reais(precoLitro)} por litro` : undefined}><input value={p.valor} onChange={set('valor')} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
            <Campo rotulo="Combustível">
              <select value={p.combustivel} onChange={set('combustivel')} className={inputClass}>{Object.entries(COMBUSTIVEIS).filter(([k]) => k !== 'flex').map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select>
            </Campo>
            <Campo rotulo="Posto"><input value={p.posto} onChange={set('posto')} maxLength={120} className={inputClass} /></Campo>
            {condutores.length > 0 && <Campo rotulo="Quem abasteceu"><select value={p.condutor_id} onChange={set('condutor_id')} className={inputClass}><option value="">—</option>{condutores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>}
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={p.tanque_cheio} onChange={(e) => setP({ ...p, tanque_cheio: e.target.checked })} />Encheu o tanque</label>
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Registrar" desabilitado={!p.litros || !p.valor} onConfirmar={() => executar(() => abastecerVeiculo(veiculoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

export function NovoServico({ veiculoId, kmAtual, planos, hoje, planoInicial }: { veiculoId: string; kmAtual: number; planos: Opcao[]; hoje: string; planoInicial?: string }) {
  const vazio = { plano_id: planoInicial ?? '', tipo: 'preventiva', descricao: planos.find((x) => x.id === planoInicial)?.nome ?? '', data: hoje, km: String(kmAtual), custo: '', fornecedor: '' }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      {planoInicial
        ? <Button size="sm" variant="outline" onClick={() => { setP(vazio); setAberto(true) }}>Registrar feito</Button>
        : <Button variant="outline" onClick={() => { setP(vazio); setAberto(true) }} id="botao-servico"><Wrench className="size-4" />Serviço</Button>}
      {aberto && (
        <Dialog titulo="Serviço no veículo" descricao="Se for de um plano de manutenção, o plano volta a contar a partir deste serviço." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            {planos.length > 0 && (
              <Campo rotulo="Plano de manutenção" className="sm:col-span-2">
                <select value={p.plano_id} onChange={(e) => setP({ ...p, plano_id: e.target.value, tipo: e.target.value ? 'preventiva' : p.tipo, descricao: p.descricao || planos.find((x) => x.id === e.target.value)?.nome || '' })} className={inputClass}>
                  <option value="">Nenhum (serviço avulso)</option>{planos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
            )}
            <Campo rotulo="Tipo"><select value={p.tipo} onChange={set('tipo')} className={inputClass}>{Object.entries(TIPOS_DE_SERVICO).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
            <Campo rotulo="Data"><input type="date" value={p.data} max={hoje} onChange={set('data')} className={inputClass} /></Campo>
            <Campo rotulo="O que foi feito" className="sm:col-span-2"><input value={p.descricao} onChange={set('descricao')} maxLength={600} placeholder="Ex.: troca de óleo e filtros" className={inputClass} /></Campo>
            <Campo rotulo="Hodômetro"><input value={p.km} onChange={set('km')} inputMode="numeric" className={inputClass} /></Campo>
            <Campo rotulo="Custo"><input value={p.custo} onChange={set('custo')} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
            <Campo rotulo="Oficina" className="sm:col-span-2"><input value={p.fornecedor} onChange={set('fornecedor')} maxLength={160} className={inputClass} /></Campo>
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Registrar" desabilitado={p.descricao.trim().length < 2} onConfirmar={() => executar(() => registrarServico(veiculoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- planos e documentos

export type PlanoDoVeiculo = { id: string; nome: string; a_cada_km: number | null; a_cada_meses: number | null; ultima_km: number | null; ultima_data: string | null; ativo: boolean }

export function PlanoDeManutencao({ veiculoId, plano, kmAtual, hoje }: { veiculoId: string; plano?: PlanoDoVeiculo; kmAtual: number; hoje: string }) {
  const vazio = {
    id: plano?.id, nome: plano?.nome ?? '', a_cada_km: plano?.a_cada_km ? String(plano.a_cada_km) : '', a_cada_meses: plano?.a_cada_meses ? String(plano.a_cada_meses) : '',
    ultima_km: plano?.ultima_km !== null && plano?.ultima_km !== undefined ? String(plano.ultima_km) : String(kmAtual), ultima_data: plano?.ultima_data ?? hoje, ativo: plano?.ativo ?? true,
  }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const set = (k: 'nome' | 'a_cada_km' | 'a_cada_meses' | 'ultima_km' | 'ultima_data') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      {plano
        ? <button type="button" title="Editar plano" aria-label="Editar plano" onClick={() => { setP(vazio); setAberto(true) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
        : <Button size="sm" variant="outline" onClick={() => { setP(vazio); setAberto(true) }} id="novo-plano"><CalendarClock className="size-3.5" />Plano de manutenção</Button>}
      {aberto && (
        <Dialog titulo={plano ? 'Plano de manutenção' : 'Novo plano de manutenção'} descricao="O que se repete: vence no que chegar primeiro, km ou tempo. Ex.: óleo a cada 10.000 km ou 6 meses." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" className="sm:col-span-2"><input value={p.nome} onChange={set('nome')} maxLength={120} placeholder="Ex.: Troca de óleo" className={inputClass} /></Campo>
            <Campo rotulo="A cada (km)"><input value={p.a_cada_km} onChange={set('a_cada_km')} inputMode="numeric" placeholder="10000" className={inputClass} /></Campo>
            <Campo rotulo="Ou a cada (meses)"><input value={p.a_cada_meses} onChange={set('a_cada_meses')} inputMode="numeric" placeholder="6" className={inputClass} /></Campo>
            <Campo rotulo="Última vez (km)"><input value={p.ultima_km} onChange={set('ultima_km')} inputMode="numeric" className={inputClass} /></Campo>
            <Campo rotulo="Última vez (data)"><input type="date" value={p.ultima_data} max={hoje} onChange={set('ultima_data')} className={inputClass} /></Campo>
            {plano && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.ativo} onChange={(e) => setP({ ...p, ativo: e.target.checked })} />Plano ativo</label>}
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Salvar" desabilitado={p.nome.trim().length < 2 || (!p.a_cada_km && !p.a_cada_meses)} onConfirmar={() => executar(() => salvarPlano(veiculoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

export type DocumentoDoVeiculo = { id: string; tipo: string; descricao: string | null; numero: string | null; vencimento: string | null; valor: number | null; observacao: string | null }

export function DocumentoDoVeiculoDialog({ veiculoId, doc }: { veiculoId: string; doc?: DocumentoDoVeiculo }) {
  const vazio = { id: doc?.id, tipo: doc?.tipo ?? 'licenciamento', descricao: doc?.descricao ?? '', numero: doc?.numero ?? '', vencimento: doc?.vencimento ?? '', valor: doc?.valor !== null && doc?.valor !== undefined ? String(doc.valor).replace('.', ',') : '', observacao: doc?.observacao ?? '' }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const set = (k: 'tipo' | 'descricao' | 'numero' | 'vencimento' | 'valor' | 'observacao') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      {doc
        ? <button type="button" title="Editar documento" aria-label="Editar documento" onClick={() => { setP(vazio); setAberto(true) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
        : <Button size="sm" variant="outline" onClick={() => { setP(vazio); setAberto(true) }} id="novo-documento"><Plus className="size-3.5" />Documento</Button>}
      {aberto && (
        <Dialog titulo={doc ? 'Documento' : 'Novo documento'} descricao="Com vencimento, o Redação avisa 30 e 7 dias antes." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo"><select value={p.tipo} onChange={set('tipo')} className={inputClass}>{Object.entries(TIPOS_DE_DOCUMENTO).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
            <Campo rotulo="Vencimento"><input type="date" value={p.vencimento} onChange={set('vencimento')} className={inputClass} /></Campo>
            <Campo rotulo="Descrição"><input value={p.descricao} onChange={set('descricao')} maxLength={200} placeholder="Ex.: Seguradora X, apólice anual" className={inputClass} /></Campo>
            <Campo rotulo="Número"><input value={p.numero} onChange={set('numero')} maxLength={60} className={inputClass} /></Campo>
            <Campo rotulo="Valor"><input value={p.valor} onChange={set('valor')} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
            <Campo rotulo="Observação"><input value={p.observacao} onChange={set('observacao')} maxLength={600} className={inputClass} /></Campo>
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Salvar" onConfirmar={() => executar(() => salvarDocumentoDoVeiculo(veiculoId, p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

export function ExcluirDaFrota({ veiculoId, tabela, id, rotulo }: { veiculoId: string; tabela: 'documento' | 'plano' | 'abastecimento' | 'servico'; id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false)
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <button type="button" title="Excluir" aria-label="Excluir" onClick={() => setAberto(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
      {aberto && (
        <Dialog titulo="Excluir?" descricao={rotulo} onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <p className="text-sm">O registro some do histórico do veículo. Use só para corrigir um lançamento errado.</p>
          <Rodape erro={erro} ocupado={ocupado} perigo onCancelar={() => setAberto(false)} rotulo="Excluir" onConfirmar={() => executar(() => excluirDaFrota(veiculoId, tabela, id), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- condutores

export type CondutorCadastrado = { id: string; user_id: string | null; participante_id: string | null; nome: string; cnh_numero: string | null; cnh_categoria: string; cnh_validade: string; emergencia_validade: string | null; telefone: string | null; ativo: boolean }

export function CondutorDialog({ c, equipe, voluntarios }: { c?: CondutorCadastrado; equipe: Opcao[]; voluntarios: Opcao[] }) {
  const vazio: DadosDoCondutor = {
    id: c?.id, vinculo: c?.user_id ? 'equipe' : c?.participante_id ? 'voluntario' : c ? 'outro' : 'equipe', pessoa: c?.user_id ?? c?.participante_id ?? '', nome: c?.nome ?? '',
    cnh_numero: c?.cnh_numero ?? '', cnh_categoria: c?.cnh_categoria ?? 'B', cnh_validade: c?.cnh_validade ?? '', emergencia_validade: c?.emergencia_validade ?? '', telefone: c?.telefone ?? '', ativo: c?.ativo ?? true,
  }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const lista = p.vinculo === 'equipe' ? equipe : voluntarios
  const set = (k: 'pessoa' | 'nome' | 'cnh_numero' | 'cnh_categoria' | 'cnh_validade' | 'emergencia_validade' | 'telefone') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      {c
        ? <button type="button" title="Editar condutor" aria-label="Editar condutor" onClick={() => { setP(vazio); setAberto(true) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
        : <Button onClick={() => { setP(vazio); setAberto(true) }} id="novo-condutor"><Plus className="size-4" />Novo condutor</Button>}
      {aberto && (
        <Dialog titulo={c ? 'Condutor' : 'Novo condutor'} descricao="Ambulância exige o curso de condutor de veículo de emergência (CTB, art. 145-A). O Redação avisa quando a CNH ou o curso vão vencer." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2 sm:col-span-2" role="radiogroup">
              {(['equipe', 'voluntario', 'outro'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={p.vinculo === t} onClick={() => setP({ ...p, vinculo: t, pessoa: '' })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${p.vinculo === t ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{t === 'equipe' ? 'Equipe' : t === 'voluntario' ? 'Voluntário' : 'Outro'}</button>
              ))}
            </div>
            {p.vinculo === 'outro'
              ? <Campo rotulo="Nome" className="sm:col-span-2"><input value={p.nome} onChange={set('nome')} maxLength={160} className={inputClass} /></Campo>
              : <Campo rotulo="Pessoa" className="sm:col-span-2"><select value={p.pessoa} onChange={set('pessoa')} className={inputClass}><option value="">Escolha…</option>{lista.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
            <Campo rotulo="Nº de registro da CNH"><input value={p.cnh_numero} onChange={set('cnh_numero')} inputMode="numeric" maxLength={14} className={inputClass} /></Campo>
            <Campo rotulo="Categoria"><select value={p.cnh_categoria} onChange={set('cnh_categoria')} className={inputClass}>{CATEGORIAS_CNH.map((k) => <option key={k} value={k}>{k}</option>)}</select></Campo>
            <Campo rotulo="CNH válida até"><input type="date" value={p.cnh_validade} onChange={set('cnh_validade')} className={inputClass} /></Campo>
            <Campo rotulo="Curso de emergência válido até" ajuda="Vazio: não dirige ambulância."><input type="date" value={p.emergencia_validade} onChange={set('emergencia_validade')} className={inputClass} /></Campo>
            <Campo rotulo="Telefone"><input value={p.telefone} onChange={set('telefone')} maxLength={40} className={inputClass} /></Campo>
            {c && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={p.ativo} onChange={(e) => setP({ ...p, ativo: e.target.checked })} />Pode dirigir</label>}
          </div>
          <Rodape erro={erro} ocupado={ocupado} onCancelar={() => setAberto(false)} rotulo="Salvar" desabilitado={!p.cnh_validade || (p.vinculo === 'outro' ? p.nome.trim().length < 2 : !p.pessoa)} onConfirmar={() => executar(() => salvarCondutor(p), () => setAberto(false))} />
        </Dialog>
      )}
    </>
  )
}
