'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ESTADO_DA_SITUACAO, ORDEM_DAS_SITUACOES, ROTULO_DA_SITUACAO, type ItemDoMapa, type PendenciaDoMapa } from '@/lib/mapa/modelo'
import { montarMapaDoEcossistema, type Instancia } from '@/lib/mapa/ui'
import { marcarPendenciaDoMapa, mudarEstadoDoItemDoMapa } from '@/app/actions/mapa'
import './mapa.css'

type Props = { itens: ItemDoMapa[]; pendencias: PendenciaDoMapa[]; podeEditar: boolean }

/**
 * A moldura do mapa: o React desenha os controles fixos (barra, palco, painel)
 * uma vez e entrega para o motor em lib/mapa/ui.ts, que preenche e navega.
 * Quando alguém marca uma pendência ou muda um estado, a action grava, o
 * `router.refresh()` traz as linhas novas do servidor e o motor redesenha com
 * `atualizar` — sem recarregar a página nem perder o foco atual.
 */
export function MapaDoEcossistema({ itens, pendencias, podeEditar }: Props) {
  const moldura = useRef<HTMLDivElement>(null)
  const instancia = useRef<Instancia | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!moldura.current) return
    instancia.current = montarMapaDoEcossistema(moldura.current, { itens, pendencias }, {
      podeEditar,
      aoMarcarPendencia: async (id, situacao) => {
        const r = await marcarPendenciaDoMapa(id, situacao)
        if (r.erro) return r.erro
        router.refresh()
        return null
      },
      aoMudarEstado: async (id, estado) => {
        const r = await mudarEstadoDoItemDoMapa(id, estado)
        if (r.erro) return r.erro
        router.refresh()
        return null
      },
    })
    return () => { instancia.current?.destruir(); instancia.current = null }
    // Monta uma vez; os dados novos entram por `atualizar`, abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { instancia.current?.atualizar({ itens, pendencias }) }, [itens, pendencias])

  return (
    <div ref={moldura} className="mapa-eco" data-ajuda="mapa.moldura">
      <div className="topo">
        <div className="linha">
          <button type="button" className="busca" data-papel="abrir-busca" data-ajuda="mapa.busca" aria-label="Buscar no mapa (Ctrl K)">
            <span>Buscar sistema, área ou módulo…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="seg" role="group" aria-label="Modo de visualização" data-ajuda="mapa.modo">
            <button type="button" data-papel="modo-mapa" aria-pressed="true">Mapa</button>
            <button type="button" data-papel="modo-lista" aria-pressed="false">Lista</button>
          </div>
          <button type="button" className="btn ghost" data-papel="ir-inicio">Início</button>
          <span className="espaco" />
          <div className="menu" data-papel="menu-opcoes">
            <button type="button" className="btn" data-papel="mais-opcoes" aria-haspopup="menu" aria-expanded="false" data-ajuda="mapa.mais">Mais ⋯</button>
            <div className="pop" data-papel="pop-opcoes" role="menu" hidden>
              <h4>Visualização</h4>
              <button type="button" role="menuitem" data-papel="op-completa">Visualização completa (todos os nós)</button>
              <div className="aviso">Mostra as três árvores inteiras de uma vez. Aproxime para ler os nomes; Esc volta ao modo normal.</div>
              <h4>Atalhos</h4>
              <div className="aviso">Ctrl K busca · Esc volta um nível · Home vai ao início · + e − aproximam e afastam · arraste para mover a tela.</div>
            </div>
          </div>
        </div>
        <div className="linha" data-ajuda="mapa.filtros">
          <span className="chips" data-papel="chips-status" aria-label="Filtrar por estado" />
          <span className="sep" aria-hidden="true" />
          <span className="chips" data-papel="chips-sistema" aria-label="Filtrar por sistema" />
          <span className="sep" aria-hidden="true" />
          <button type="button" className="chip" data-papel="so-pend" aria-pressed="false">⚠ Só com pendência</button>
          <span className="ativos" data-papel="ativos" hidden />
        </div>
      </div>
      <div className="corpo">
        <nav className="trilha" data-papel="trilha" aria-label="Onde você está" />
        <section className="geral ativa" data-papel="geral" aria-label="Visão geral" data-ajuda="mapa.sistemas" />
        <div className="palco" data-papel="palco" hidden>
          <svg data-papel="svg" role="img" aria-label="Mapa do ecossistema"><g className="mundo" /></svg>
        </div>
        <section className="lista" data-papel="lista" aria-label="Lista" />
        <div className="aviso-vazio" data-papel="aviso-vazio" />
        <aside className="drawer" data-papel="painel" aria-label="Detalhes" data-ajuda="mapa.painel" />
        <div className="controles" data-papel="controles" style={{ display: 'none' }}>
          <div className="grupo">
            <button type="button" data-papel="z-mais" aria-label="Aproximar">+</button>
            <button type="button" data-papel="z-menos" aria-label="Afastar">−</button>
            <button type="button" data-papel="z-centro" aria-label="Centralizar">⌖</button>
            <button type="button" data-papel="z-inicio" aria-label="Voltar ao início">⌂</button>
          </div>
        </div>
        <div className="minimap" data-papel="minimap" aria-hidden="true" hidden><svg viewBox="0 0 180 120" /></div>
        <div className="legenda" data-papel="legenda">
          <button type="button" className="btn ghost" data-papel="btn-legenda" aria-expanded="false">Legenda</button>
          <div className="pop" data-papel="pop-legenda" hidden>
            <h4>Estados</h4>
            {ORDEM_DAS_SITUACOES.map((s) => (
              <div className="l" key={s}><span className={`dot ${s}`} />{ROTULO_DA_SITUACAO[s]} <small>({ESTADO_DA_SITUACAO[s]})</small></div>
            ))}
            <h4>Sistemas</h4>
            <div className="l"><span className="sq" style={{ background: 'var(--mapa-palacio)' }} />Palácio Virtual</div>
            <div className="l"><span className="sq" style={{ background: 'var(--mapa-site)' }} />Site institucional</div>
            <div className="l"><span className="sq" style={{ background: 'var(--mapa-escola)' }} />Plataforma da Escola</div>
            <h4>Sinais</h4>
            <div className="l">⚠ n — pendências abertas naquele ramo</div>
            <div className="l">barra verde — proporção do que já está no ar</div>
          </div>
        </div>
        <div className="tip" data-papel="tip" role="tooltip" hidden />
        <div className="paleta" data-papel="paleta" role="dialog" aria-modal="true" aria-label="Buscar no mapa">
          <div className="caixa">
            <input data-papel="paleta-input" type="search" placeholder="Digite o nome de um sistema, área, módulo ou pendência…" aria-label="Buscar" autoComplete="off" />
            <div className="res" data-papel="paleta-res" role="listbox" />
            <div className="rodape"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
