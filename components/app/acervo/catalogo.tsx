'use client'

import { useId, useMemo, useState } from 'react'
import { ExternalLink, Search, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass, selectClass } from '@/components/app/imprensa/comum'
import { cn } from '@/lib/utils'
import { normalizar } from '@/lib/navegacao'
import { COLECAO, COLECOES, dataLegivel, type Colecao } from '@/lib/acervo/regras'
import { ENDERECO_DO_ACERVO, Previa, SelosDoItem, idDoCartao, naEntrada, quantidadeDeItens, rotuloDoTipo, type DialogoAberto, type ItemNaTela } from './comum'

/** Cartões por vez: imagem é pesada, e a lista pode ter milhares de itens. */
const POR_VEZ = 48

type Situacao = 'todos' | 'site' | 'privados' | 'entrada'
const SITUACOES: { id: Situacao; rotulo: string }[] = [
  { id: 'todos', rotulo: 'No site e privados' },
  { id: 'site', rotulo: 'Só os que estão no site' },
  { id: 'privados', rotulo: 'Só os privados' },
  { id: 'entrada', rotulo: 'Na caixa de entrada' },
]

/**
 * A aba Catálogo: a contagem, os botões do acervo, os filtros e a grade de
 * cartões. O cartão abre a ficha completa do item, onde ficam as ações.
 */
export function Catalogo({ itens, podeGerenciar, configurado, truncado, abrir, botaoDeAtualizar }: {
  itens: ItemNaTela[]
  podeGerenciar: boolean
  configurado: boolean
  truncado: boolean
  abrir: (d: DialogoAberto) => void
  botaoDeAtualizar?: React.ReactNode
}) {
  const id = useId()
  const [busca, setBusca] = useState('')
  const [colecao, setColecao] = useState<Colecao | 'todas'>('todas')
  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [limite, setLimite] = useState(POR_VEZ)

  // A busca ignora acento e caixa; o texto de cada item é montado uma vez por lista, não a cada tecla.
  const indice = useMemo(() => itens.map((i) => ({
    i, texto: normalizar([i.titulo, i.descricao, i.palavrasChave.join(' '), i.autoria, i.local, i.credito, i.nomeOriginal].filter(Boolean).join(' ')),
  })), [itens])

  const termos = normalizar(busca).split(/\s+/).filter(Boolean)
  const filtrados = indice.filter(({ i, texto }) =>
    (colecao === 'todas' || i.colecao === colecao)
    && (situacao === 'todos' || (situacao === 'site' ? i.publico : situacao === 'privados' ? !i.publico : naEntrada(i)))
    && termos.every((t) => texto.includes(t))).map(({ i }) => i)
  const visiveis = filtrados.slice(0, limite)
  const filtrando = termos.length > 0 || colecao !== 'todas' || situacao !== 'todos'

  const noSite = itens.filter((i) => i.publico).length
  const privados = itens.length - noSite
  const naCaixa = itens.filter(naEntrada).length

  function mostrarMais() {
    const primeiroNovo = filtrados[limite]
    setLimite((l) => l + POR_VEZ)
    // O botão some quando acabam os itens: o foco vai para o primeiro cartão novo.
    if (primeiroNovo) requestAnimationFrame(() => document.getElementById(idDoCartao(primeiroNovo.id))?.focus())
  }

  function limpar() {
    setBusca('')
    setColecao('todas')
    setSituacao('todos')
    setLimite(POR_VEZ)
    document.getElementById(`${id}-busca`)?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div data-ajuda="acervo.resumo" className="min-w-0 text-sm text-muted-foreground">
          <h2 className="sr-only">Catálogo</h2>
          <p>
            {itens.length
              ? [quantidadeDeItens(itens.length), `${noSite.toLocaleString('pt-BR')} no site`, `${privados.toLocaleString('pt-BR')} ${privados === 1 ? 'privado' : 'privados'}`, naCaixa ? `${naCaixa.toLocaleString('pt-BR')} na caixa de entrada` : null].filter(Boolean).join(' · ')
              : 'Nenhum item no catálogo ainda.'}
          </p>
          {truncado && <p className="mt-0.5 text-xs">A tela mostra os 10.000 itens mais recentes.</p>}
          {!podeGerenciar && configurado && <p className="mt-0.5 text-xs">Você pode ver e baixar tudo. Para enviar, catalogar ou publicar, fale com um editor ou um administrador.</p>}
        </div>
        <div data-ajuda="acervo.acoes" className="flex flex-wrap items-center gap-2">
          {podeGerenciar && configurado && (
            <Button type="button" onClick={() => abrir({ tipo: 'envio', colecao: colecao === 'todas' ? undefined : colecao })}>
              <Upload aria-hidden />Enviar arquivos
            </Button>
          )}
          {botaoDeAtualizar}
          <Button variant="ghost" render={<a href={ENDERECO_DO_ACERVO} target="_blank" rel="noopener noreferrer" />}>
            <ExternalLink aria-hidden />Ver o acervo no site<span className="sr-only"> (abre em outra aba)</span>
          </Button>
        </div>
      </div>

      {itens.length > 0 && (
        <div data-ajuda="acervo.filtros" className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={`${id}-busca`} className="sr-only">Buscar no catálogo</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id={`${id}-busca`}
                type="search"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setLimite(POR_VEZ) }}
                placeholder="Buscar por título, descrição ou palavra-chave"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <label htmlFor={`${id}-colecao`} className="sr-only">Coleção</label>
              <select id={`${id}-colecao`} value={colecao} onChange={(e) => { setColecao(e.target.value as Colecao | 'todas'); setLimite(POR_VEZ) }} className={selectClass}>
                <option value="todas">Todas as coleções</option>
                {COLECOES.map((c) => <option key={c} value={c}>{COLECAO[c].nome} ({itens.filter((i) => i.colecao === c).length})</option>)}
              </select>
              <label htmlFor={`${id}-situacao`} className="sr-only">Situação</label>
              <select id={`${id}-situacao`} value={situacao} onChange={(e) => { setSituacao(e.target.value as Situacao); setLimite(POR_VEZ) }} className={selectClass}>
                {SITUACOES.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
              </select>
            </div>
          </div>
          {/* Sempre na página (vazia sem filtro): o leitor de tela só anuncia mudança em região que já existia. */}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtrando ? (filtrados.length ? `${filtrados.length.toLocaleString('pt-BR')} de ${quantidadeDeItens(itens.length)}` : 'Nenhum item com esses filtros.') : ''}
          </p>
        </div>
      )}

      {!itens.length ? (
        <Card className="p-8 text-center text-sm text-pretty text-muted-foreground">
          {podeGerenciar && configurado
            ? 'O catálogo ainda está vazio. Envie os primeiros arquivos em “Enviar arquivos”, ou catalogue os que já estão no bucket pela aba “Pastas do acervo”.'
            : 'O catálogo ainda está vazio.'}
        </Card>
      ) : !filtrados.length ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <p>Nada encontrado com esses filtros.</p>
          <Button type="button" variant="outline" size="sm" onClick={limpar}><X aria-hidden />Limpar os filtros</Button>
        </Card>
      ) : (
        <ul data-ajuda="acervo.lista" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visiveis.map((i) => <li key={i.id}><CartaoDoItem item={i} abrir={abrir} /></li>)}
        </ul>
      )}

      {filtrados.length > limite && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={mostrarMais}>
            Mostrar mais{' '}<span className="text-muted-foreground">({(filtrados.length - limite).toLocaleString('pt-BR')} ainda não aparecem)</span>
          </Button>
        </div>
      )}
    </div>
  )
}

/** O cartão inteiro abre a ficha: o botão do título se estende por cima dele. */
function CartaoDoItem({ item, abrir }: { item: ItemNaTela; abrir: (d: DialogoAberto) => void }) {
  const data = dataLegivel(item.dataItem, item.dataPrecisao)
  return (
    <Card className="relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/50">
      <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted">
        <Previa url={item.previa} reserva={item.previaReserva} alt="" rotulo={rotuloDoTipo(item)} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-sm font-semibold leading-snug">
          <button
            type="button"
            id={idDoCartao(item.id)}
            onClick={() => abrir({ tipo: 'detalhe', id: item.id })}
            className="text-left outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary"
          >
            <span className="line-clamp-2 break-words">{item.titulo}</span>
          </button>
        </h3>
        <p className="text-xs text-muted-foreground">{COLECAO[item.colecao].singular}{data ? ` · ${data}` : ''}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-2"><SelosDoItem item={item} /></div>
      </div>
    </Card>
  )
}
