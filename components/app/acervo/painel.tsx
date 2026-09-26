'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FolderTree, Images } from 'lucide-react'
import { RegiaoDeRecados, recadoDe, useFocoDepoisDaLista, useRecado, FALHA_DE_REDE, type Recado } from '@/components/app/transparencia/comum'
import { atualizarPaginasDoAcervo, linkDoItemDoAcervo } from '@/app/actions/acervo'
import { COLECAO } from '@/lib/acervo/regras'
import { ExcluirItem, GuardarNaColecao, PublicarNoSite, TirarDoSite } from './acoes'
import { PastasDoAcervo } from './bucket'
import { Catalogo } from './catalogo'
import { DetalheDoItem, ItemACaminho } from './detalhe'
import { EnvioAoAcervo } from './envio'
import { FichaDoItem } from './ficha'
import {
  BotaoDeAtualizarPaginas, ENDERECO_DO_ACERVO, idDoCartao, pastaDaColecao, quantidadeDeItens, useAbrirLink, type DialogoAberto, type ItemNaTela,
  type Progresso,
} from './comum'

export type Aba = 'catalogo' | 'pastas'

const ABAS: { id: Aba; rotulo: string; Icone: typeof Images }[] = [
  { id: 'catalogo', rotulo: 'Catálogo', Icone: Images },
  { id: 'pastas', rotulo: 'Pastas do acervo', Icone: FolderTree },
]

/**
 * A tela /acervo: o catálogo (as fichas) e as pastas do bucket, os diálogos
 * de cada item e os recados. A aba vai para o endereço (?aba=pastas), como na
 * Transparência. Sem o R2 configurado, só o catálogo, para consulta.
 */
export function PainelDoAcervo({ itens, podeGerenciar, configurado, abaInicial, truncado }: {
  itens: ItemNaTela[]
  podeGerenciar: boolean
  configurado: boolean
  abaInicial: Aba
  /** O catálogo passou do limite da tela e veio cortado. */
  truncado: boolean
}) {
  const id = useId()
  const router = useRouter()
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [dialogo, setDialogo] = useState<DialogoAberto | null>(null)
  const [recado, setRecado] = useRecado()
  const [atualizando, iniciarAtualizacao] = useTransition()
  const [progresso, setProgresso] = useState<Progresso>(null)
  const botoes = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({})
  const painelDoCatalogo = `${id}-painel-catalogo`
  const focarDepois = useFocoDepoisDaLista(itens, painelDoCatalogo)
  const { abrindo, abrir: abrirLink } = useAbrirLink()
  // O diálogo aberto agora, para quem termina depois de um await decidir onde dar o recado.
  const dialogoAtual = useRef<DialogoAberto | null>(null)
  useEffect(() => { dialogoAtual.current = dialogo })

  function trocar(nova: Aba, focar: boolean) {
    setAba(nova)
    if (focar) botoes.current[nova]?.focus()
    const url = new URL(window.location.href)
    if (nova === 'catalogo') url.searchParams.delete('aba')
    else url.searchParams.set('aba', nova)
    window.history.replaceState(null, '', url)
  }

  // Setas, Home e End entre as abas, como pede o padrão de abas da WAI-ARIA.
  function teclado(e: React.KeyboardEvent) {
    const i = ABAS.findIndex((a) => a.id === aba)
    const destino = e.key === 'ArrowRight' ? ABAS[(i + 1) % ABAS.length]
      : e.key === 'ArrowLeft' ? ABAS[(i - 1 + ABAS.length) % ABAS.length]
        : e.key === 'Home' ? ABAS[0] : e.key === 'End' ? ABAS[ABAS.length - 1] : null
    if (!destino) return
    e.preventDefault()
    trocar(destino.id, true)
  }

  /**
   * O resultado de "Atualizar as páginas": dentro da ficha do item, se ela
   * estiver aberta (o botão também aparece no aviso dela); senão, no pé da tela.
   */
  function avisarDaAtualizacao(r: Recado) {
    const d = dialogoAtual.current
    if (d?.tipo === 'detalhe') setDialogo({ ...d, recado: r, vez: (d.vez ?? 0) + 1 })
    else setRecado(r)
  }

  /**
   * Refaz as páginas do acervo no site. Com muitos itens o servidor para perto
   * do limite de tempo e diz de onde continuar: a tela chama de novo até acabar.
   */
  const atualizarPaginas = () => iniciarAtualizacao(async () => {
    setProgresso(null)
    try {
      let aPartirDe = 0
      let semAvanco = 0
      for (;;) {
        const r = await atualizarPaginasDoAcervo(aPartirDe)
        if (r.erro) { avisarDaAtualizacao({ tipo: 'erro', texto: r.erro }); return }
        if (r.proximo === undefined) {
          avisarDaAtualizacao({ tipo: 'ok', texto: `Páginas do acervo refeitas no site (${quantidadeDeItens(r.itens ?? 0)} no ar).`, link: { href: ENDERECO_DO_ACERVO, rotulo: 'Ver o acervo no site' } })
          return
        }
        // Rodada que não andou (o servidor gastou o tempo limpando o que saiu do ar): tenta mais duas vezes.
        semAvanco = r.proximo > aPartirDe ? 0 : semAvanco + 1
        if (semAvanco >= 3) { avisarDaAtualizacao({ tipo: 'erro', texto: 'O site parou de avançar no meio da atualização. Tente de novo em alguns minutos.' }); return }
        aPartirDe = r.proximo
        setProgresso({ feitas: r.proximo, total: r.itens ?? r.proximo })
      }
    } catch {
      avisarDaAtualizacao({ tipo: 'erro', texto: FALHA_DE_REDE })
    } finally {
      setProgresso(null)
      router.refresh()
    }
  })

  /** No topo do catálogo, ou pequeno, dentro de um recado de página que o site não refez. */
  const botaoDeAtualizar = (noRecado: boolean) => podeGerenciar
    ? <BotaoDeAtualizarPaginas size={noRecado ? 'sm' : 'default'} className={noRecado ? 'self-start' : undefined} atualizando={atualizando} progresso={progresso} onAtualizar={atualizarPaginas} />
    : undefined

  // ---------------------------------------------------------------- diálogos

  const item = dialogo && dialogo.tipo !== 'envio' ? itens.find((i) => i.id === dialogo.id) ?? null : null

  /** Volta para a ficha completa do item, com o recado do que acabou de acontecer. */
  function voltar(itemId: string, r?: Recado) {
    setDialogo({ tipo: 'detalhe', id: itemId, recado: r })
    if (r) router.refresh()
  }

  function fecharTudo(itemId: string | null, r?: Recado) {
    setDialogo(null)
    focarDepois(itemId ? idDoCartao(itemId) : painelDoCatalogo)
    if (r) {
      setRecado(r)
      router.refresh()
    }
  }

  /** "Ver ficha" na aba das pastas: o item abre por cima do catálogo. */
  function abrirDoBucket(itemId: string) {
    trocar('catalogo', false)
    setDialogo({ tipo: 'detalhe', id: itemId })
  }

  function dialogoAberto() {
    if (!dialogo) return null
    if (dialogo.tipo === 'envio') {
      return (
        <EnvioAoAcervo
          colecaoInicial={dialogo.colecao}
          onFechar={() => setDialogo(null)}
          onEnviados={() => router.refresh()}
          onAbrirFicha={(novo) => setDialogo({ tipo: 'ficha', id: novo })}
        />
      )
    }
    // Recém-criado (envio, catálogo do bucket) e a lista ainda não voltou do servidor.
    if (!item) return <ItemACaminho onFechar={() => fecharTudo(null)} />

    switch (dialogo.tipo) {
      case 'detalhe':
        return (
          <DetalheDoItem
            key={`detalhe-${item.id}-${dialogo.vez ?? 0}`}
            item={item}
            recado={dialogo.recado ?? null}
            podeGerenciar={podeGerenciar}
            configurado={configurado}
            abrir={setDialogo}
            onFechar={() => fecharTudo(item.id)}
            baixando={abrindo === item.id}
            baixar={(avisar) => abrirLink(item.id, () => linkDoItemDoAcervo(item.id), avisar)}
            acaoDoAviso={botaoDeAtualizar(true)}
          />
        )
      case 'ficha':
        return (
          <FichaDoItem
            key={`ficha-${item.id}`}
            item={item}
            onFechar={() => (dialogo.depois === 'publicar' ? setDialogo({ tipo: 'publicar', id: item.id }) : voltar(item.id))}
            onSalvo={(r) => {
              const ok = item.publico ? 'Ficha salva, e a página do item no site foi refeita.' : 'Ficha salva.'
              if (dialogo.depois === 'publicar') {
                setDialogo({ tipo: 'publicar', id: item.id, recado: recadoDe(r, ok) })
                router.refresh()
              } else {
                voltar(item.id, recadoDe(r, ok))
              }
            }}
          />
        )
      case 'publicar':
        return (
          <PublicarNoSite
            key={`publicar-${item.id}`}
            item={item}
            recado={dialogo.recado ?? null}
            onFechar={() => voltar(item.id)}
            onCorrigir={() => setDialogo({ tipo: 'ficha', id: item.id, depois: 'publicar' })}
            onFeito={(r) => {
              const link = r.url ? { href: r.url, rotulo: 'Ver a página do item' } : undefined
              voltar(item.id, r.aviso
                ? { tipo: 'aviso', texto: r.aviso, oferecerAtualizacao: true, link }
                : { tipo: 'ok', texto: item.publico ? 'Item atualizado no site.' : 'Item publicado no site.', link })
            }}
          />
        )
      case 'guardar':
        return (
          <GuardarNaColecao
            key={`guardar-${item.id}`}
            item={item}
            onFechar={() => voltar(item.id)}
            onFeito={(r) => voltar(item.id, recadoDe(r, `Arquivo guardado em ${pastaDaColecao(item)}, na coleção ${COLECAO[item.colecao].nome}. A trava de 30 dias já vale para ele.`))}
          />
        )
      case 'tirar':
        return (
          <TirarDoSite
            key={`tirar-${item.id}`}
            item={item}
            onFechar={() => voltar(item.id)}
            onFeito={(r) => voltar(item.id, recadoDe(r, 'Item tirado do site. A ficha e o arquivo continuam no acervo, como privados.'))}
          />
        )
      case 'excluir':
        return (
          <ExcluirItem
            key={`excluir-${item.id}`}
            item={item}
            onFechar={() => voltar(item.id)}
            // O aviso da exclusão é sobre o arquivo no bucket, não sobre o site: sem o botão de atualizar.
            onFeito={(r) => fecharTudo(null, r.aviso ? { tipo: 'aviso', texto: r.aviso } : { tipo: 'ok', texto: 'Item excluído do catálogo.' })}
          />
        )
    }
  }

  const catalogo = (
    <Catalogo
      itens={itens}
      podeGerenciar={podeGerenciar}
      configurado={configurado}
      truncado={truncado}
      abrir={setDialogo}
      botaoDeAtualizar={botaoDeAtualizar(false)}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      {configurado ? (
        <>
          <div data-ajuda="acervo.abas" className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Acervo" onKeyDown={teclado}>
            {ABAS.map(({ id: a, rotulo, Icone }) => (
              <button
                key={a}
                ref={(el) => { botoes.current[a] = el }}
                type="button"
                role="tab"
                id={`${id}-aba-${a}`}
                aria-selected={aba === a}
                aria-controls={a === 'catalogo' ? painelDoCatalogo : `${id}-painel-pastas`}
                tabIndex={aba === a ? 0 : -1}
                onClick={() => trocar(a, false)}
                className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === a ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Icone className="size-4" aria-hidden />{rotulo}
                {a === 'catalogo' && <span className="text-xs tabular-nums text-muted-foreground">({itens.length.toLocaleString('pt-BR')})</span>}
              </button>
            ))}
          </div>

          {/* As duas abas ficam montadas: trocar de aba não perde a pasta aberta nem os filtros. */}
          <div role="tabpanel" id={painelDoCatalogo} aria-labelledby={`${id}-aba-catalogo`} hidden={aba !== 'catalogo'} tabIndex={-1} className="outline-none">
            {catalogo}
          </div>
          <div role="tabpanel" id={`${id}-painel-pastas`} aria-labelledby={`${id}-aba-pastas`} hidden={aba !== 'pastas'} tabIndex={-1} className="outline-none">
            <PastasDoAcervo ativa={aba === 'pastas'} podeGerenciar={podeGerenciar} aoRecado={setRecado} abrirFicha={abrirDoBucket} painelId={`${id}-painel-pastas`} />
          </div>
        </>
      ) : (
        <div id={painelDoCatalogo} tabIndex={-1} className="outline-none">{catalogo}</div>
      )}

      {dialogoAberto()}

      <p className="sr-only" aria-live="polite">
        {atualizando ? (progresso ? `Atualizando as páginas do acervo: ${progresso.feitas} de ${progresso.total}.` : 'Atualizando as páginas do acervo.') : ''}
      </p>
      <RegiaoDeRecados recado={recado} onFechar={() => setRecado(null)} acaoDoAviso={botaoDeAtualizar(true)} />
    </div>
  )
}
