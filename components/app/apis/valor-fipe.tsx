'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Car, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { consultarValorFipe, opcoesFipe } from '@/app/actions/apis-publicas'
import { registrarFipe } from '@/app/actions/frota'
import { TIPOS_FIPE, tipoFipeDoVeiculo, type OpcaoFipe, type TipoFipe, type ValorFipe } from '@/lib/apis-publicas/regras'

const campo = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50'
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type FipeGuardada = { valor: number | null; codigo: string | null; descricao: string | null; referencia: string | null; consultadoEm: string | null }

/**
 * O valor de referência da Tabela FIPE do veículo: mostra o guardado e, para
 * a gestão, a consulta passo a passo (marca → modelo → ano) com o valor do
 * mês, pronto para guardar. Base para seguro, doação e baixa patrimonial.
 */
export function ValorFipe({ veiculoId, tipoDoVeiculo, marcaSugerida, guardada, podeEditar }: {
  veiculoId: string; tipoDoVeiculo: string; marcaSugerida: string | null; guardada: FipeGuardada; podeEditar: boolean
}) {
  const router = useRouter()
  const tipoPadrao = tipoFipeDoVeiculo(tipoDoVeiculo) ?? 'carros'
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoFipe>(tipoPadrao)
  const [marcas, setMarcas] = useState<OpcaoFipe[]>([])
  const [modelos, setModelos] = useState<OpcaoFipe[]>([])
  const [anos, setAnos] = useState<OpcaoFipe[]>([])
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [ano, setAno] = useState('')
  const [consulta, setConsulta] = useState<ValorFipe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const escolherMarca = (codigo: string, t: TipoFipe = tipo) => {
    setMarca(codigo); setModelo(''); setAno(''); setModelos([]); setAnos([]); setConsulta(null)
    if (codigo) iniciar(async () => setModelos(await opcoesFipe(t, codigo)))
  }
  // Marcas da tabela; já seleciona a marca cadastrada no veículo, se a FIPE tiver.
  const carregarMarcas = (t: TipoFipe) => {
    setMarcas([]); setMarca(''); setModelos([]); setAnos([]); setConsulta(null); setErro(null)
    iniciar(async () => {
      const lista = await opcoesFipe(t)
      if (!lista.length) { setErro('A Tabela FIPE não respondeu agora.'); return }
      setMarcas(lista)
      const achada = marcaSugerida ? lista.find((m) => m.nome.toLowerCase().startsWith(marcaSugerida.toLowerCase().split(' ')[0])) : undefined
      if (achada) escolherMarca(achada.codigo, t)
    })
  }
  const escolherModelo = (codigo: string) => {
    setModelo(codigo); setAno(''); setAnos([]); setConsulta(null)
    if (codigo) iniciar(async () => setAnos(await opcoesFipe(tipo, marca, codigo)))
  }
  const escolherAno = (codigo: string) => {
    setAno(codigo); setConsulta(null); setErro(null)
    if (codigo) iniciar(async () => {
      const r = await consultarValorFipe(tipo, marca, modelo, codigo)
      if (r.erro) setErro(r.erro); else setConsulta(r.valor ?? null)
    })
  }
  const guardar = () => iniciar(async () => {
    const r = await registrarFipe(veiculoId, { tipo, marca, modelo, ano })
    if (r.erro) { setErro(r.erro); return }
    setAberto(false); router.refresh()
  })

  return (
    <Card className="p-5" id="fipe">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold"><Car className="size-4" />Valor de referência (Tabela FIPE)</h2>
        {podeEditar && !aberto && <Button size="sm" variant="outline" onClick={() => { setAberto(true); carregarMarcas(tipo) }}><RefreshCw className="size-3.5" />{guardada.valor != null ? 'Atualizar' : 'Consultar'}</Button>}
      </div>
      {guardada.valor != null ? (
        <div>
          <p className="text-2xl font-bold tabular-nums">{reais(guardada.valor)}</p>
          <p className="text-xs text-muted-foreground">{[guardada.descricao, guardada.codigo && `FIPE ${guardada.codigo}`, guardada.referencia && `referência ${guardada.referencia}`].filter(Boolean).join(' · ')}</p>
        </div>
      ) : !aberto && <p className="text-sm text-muted-foreground">Sem valor guardado. {podeEditar ? 'Consulte a FIPE para ter a referência de seguro, doação ou baixa.' : ''}</p>}

      {aberto && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <select aria-label="Tabela" value={tipo} onChange={(e) => { const t = e.target.value as TipoFipe; setTipo(t); carregarMarcas(t) }} className={campo}>
              {(Object.keys(TIPOS_FIPE) as TipoFipe[]).map((t) => <option key={t} value={t}>{TIPOS_FIPE[t]}</option>)}
            </select>
            <select aria-label="Marca" value={marca} onChange={(e) => escolherMarca(e.target.value)} disabled={!marcas.length} className={campo}>
              <option value="">{marcas.length ? 'Marca…' : 'Carregando…'}</option>
              {marcas.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
            </select>
            <select aria-label="Modelo" value={modelo} onChange={(e) => escolherModelo(e.target.value)} disabled={!modelos.length} className={campo}>
              <option value="">Modelo…</option>
              {modelos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
            </select>
            <select aria-label="Ano" value={ano} onChange={(e) => escolherAno(e.target.value)} disabled={!anos.length} className={campo}>
              <option value="">Ano…</option>
              {anos.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
            </select>
          </div>
          {ocupado && !consulta && <p className="text-xs text-muted-foreground">Consultando a FIPE…</p>}
          {consulta && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <p className="text-lg font-bold tabular-nums">{reais(consulta.valor)}</p>
                <p className="text-xs text-muted-foreground">{consulta.modelo} · {consulta.anoModelo} · FIPE {consulta.codigoFipe} · referência {consulta.referencia}</p>
              </div>
              <Button size="sm" disabled={ocupado} onClick={guardar}>Guardar no veículo</Button>
            </div>
          )}
          <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button></div>
        </div>
      )}
      {erro && <p role="alert" className="mt-2 text-sm text-destructive">{erro}</p>}
    </Card>
  )
}
