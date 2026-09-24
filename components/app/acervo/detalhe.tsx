'use client'

import { useState } from 'react'
import { Ban, Download, FolderInput, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialogo, HashCurto, OCUPADO_SEM_PERDER_FOCO, Rodape, dia, diaEHora, type Recado } from '@/components/app/transparencia/comum'
import { COLECAO, DIREITO, dataLegivel, tipoDoArquivo } from '@/lib/acervo/regras'
import {
  Previa, RecadoNoDialogo, SelosDoItem, naEntrada, podeIrAoSite, rotuloDoTipo, tamanhoLegivel, type DialogoAberto, type ItemNaTela,
} from './comum'

const semProtocolo = (url: string) => url.replace(/^https?:\/\//, '')

function Vazio() {
  return <span className="text-muted-foreground"><span aria-hidden>—</span><span className="sr-only">não informado</span></span>
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/** Onde o item está: no site (desde quando, e o endereço) ou só aqui dentro. */
function Situacao({ item, gerenciar }: { item: ItemNaTela; gerenciar: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-1"><SelosDoItem item={item} comLink={false} /></div>
      {item.publico ? (
        <p className="text-pretty text-muted-foreground">
          No site desde {item.publicadoEm ? dia(item.publicadoEm) : '—'}{item.atualizadoNoSiteEm ? `, atualizado em ${diaEHora(item.atualizadoNoSiteEm)}` : ''}.
          {item.endereco && (
            <> <a href={item.endereco} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary underline underline-offset-2">{semProtocolo(item.endereco)}<span className="sr-only"> (abre em outra aba)</span></a></>
          )}
        </p>
      ) : (
        <p className="text-pretty text-muted-foreground">
          Privado: só a equipe vê.
          {item.publicadoEm && item.endereco && ` Já esteve no site; se voltar, volta no mesmo endereço (${semProtocolo(item.endereco)}).`}
        </p>
      )}
      {naEntrada(item) && (
        <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-pretty">
          O arquivo está na caixa de entrada do bucket, ainda sem a trava do acervo. Quando a ficha estiver certa, use “Guardar na coleção”.
        </p>
      )}
      {gerenciar && !podeIrAoSite(item) && (
        <p className="text-xs text-pretty text-muted-foreground">Este formato fica só no acervo interno: no site vão imagem, PDF e vídeo (pelo link do YouTube ou do Vimeo).</p>
      )}
    </div>
  )
}

/**
 * A ficha completa do item: a imagem, tudo o que foi catalogado, o arquivo e
 * as ações que a pessoa pode fazer nele.
 */
export function DetalheDoItem({ item, recado, podeGerenciar, configurado, abrir, onFechar, baixando, baixar, acaoDoAviso }: {
  item: ItemNaTela
  /** O que acabou de acontecer com o item (ficha salva, publicado…). */
  recado: Recado | null
  podeGerenciar: boolean
  configurado: boolean
  abrir: (d: DialogoAberto) => void
  onFechar: () => void
  baixando: boolean
  baixar: (avisar: (r: Recado) => void) => void
  acaoDoAviso?: React.ReactNode
}) {
  const [aviso, setAviso] = useState<Recado | null>(recado)
  const rotulo = rotuloDoTipo(item)
  const imagem = tipoDoArquivo(item.tipoMime) === 'imagem'
  const data = dataLegivel(item.dataItem, item.dataPrecisao)
  const direitos = DIREITO[item.direitos]
  // Sem o R2, o catálogo é só consulta; tirar do site continua possível (não depende do bucket).
  const gerenciar = podeGerenciar && configurado
  const formato = /\.([a-z0-9]{1,10})$/i.exec(item.nomeOriginal ?? item.chave ?? '')?.[1]?.toUpperCase() ?? rotulo

  return (
    <Dialogo titulo={item.titulo} descricao={`${COLECAO[item.colecao].singular} · ${item.publico ? 'no site' : 'privado'}`} largura="max-w-4xl" onFechar={onFechar}>
      <RecadoNoDialogo recado={aviso} focar={Boolean(recado)} acaoDoAviso={acaoDoAviso} />

      {/* O foco começa aqui, no topo do conteúdo (ou no recado, quando há um). */}
      <div data-autofocus={recado ? undefined : ''} tabIndex={-1} className="grid gap-5 outline-none md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-3">
          <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
            <Previa url={item.previaGrande} reserva={item.previaReserva} alt={item.textoAlternativo ?? ''} rotulo={rotulo} grande className="object-contain" />
          </div>
          <Situacao item={item} gerenciar={gerenciar} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <Linha rotulo="Coleção">{COLECAO[item.colecao].nome}</Linha>
            <Linha rotulo="Data">{data ?? <Vazio />}</Linha>
            <Linha rotulo="Autoria">{item.autoria ?? <Vazio />}</Linha>
            <Linha rotulo="Local">{item.local ?? <Vazio />}</Linha>
            <Linha rotulo="Direitos">
              {direitos.licenca
                ? <a href={direitos.licenca} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{direitos.nome}<span className="sr-only"> (abre a licença em outra aba)</span></a>
                : direitos.nome}
            </Linha>
            <Linha rotulo="Crédito">{item.credito ?? <Vazio />}</Linha>
            {imagem && <Linha rotulo="Texto alternativo">{item.textoAlternativo ?? <Vazio />}</Linha>}
            {(item.urlVideo || item.colecao === 'videos' || rotulo === 'Vídeo') && (
              <Linha rotulo="Link do vídeo">
                {item.urlVideo
                  ? <a href={item.urlVideo} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{semProtocolo(item.urlVideo)}<span className="sr-only"> (abre em outra aba)</span></a>
                  : <Vazio />}
              </Linha>
            )}
            <Linha rotulo="Palavras-chave">
              {item.palavrasChave.length
                ? <ul className="flex flex-wrap gap-1">{item.palavrasChave.map((p) => <li key={p} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">{p}</li>)}</ul>
                : <Vazio />}
            </Linha>
          </dl>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3>
            {item.descricao
              ? <p className="mt-1 whitespace-pre-line text-sm text-pretty">{item.descricao}</p>
              : <p className="mt-1 text-sm text-muted-foreground">Sem descrição ainda.</p>}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arquivo</h3>
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
              <Linha rotulo="Nome original"><span className="break-all">{item.nomeOriginal ?? '—'}</span></Linha>
              <Linha rotulo="Formato">{formato} · {tamanhoLegivel(item.tamanho)}{item.largura && item.altura ? ` · ${item.largura} × ${item.altura} px` : ''}</Linha>
              <Linha rotulo="No bucket"><span className="break-all font-mono text-[11px]">{item.chave ?? '—'}</span></Linha>
              {item.sha256 && <Linha rotulo="SHA-256"><HashCurto hash={item.sha256} /></Linha>}
              <Linha rotulo="Entrou no acervo">{diaEHora(item.criadoEm)}{item.criadoPor ? ` por ${item.criadoPor}` : ''}</Linha>
              <Linha rotulo="Última mudança">{diaEHora(item.atualizadoEm)}{item.atualizadoPor ? ` por ${item.atualizadoPor}` : ''}</Linha>
            </dl>
          </div>
        </div>
      </div>

      <Rodape erros={[]} andamento={baixando ? 'Preparando o download…' : ''}>
        <Button type="button" variant="outline" onClick={onFechar}>Fechar</Button>
        {configurado && item.chave && (
          <Button type="button" variant="outline" onClick={() => baixar(setAviso)} disabled={baixando} {...OCUPADO_SEM_PERDER_FOCO}>
            {baixando ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar original
          </Button>
        )}
        {gerenciar && !item.publico && (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => abrir({ tipo: 'excluir', id: item.id })}>
            <Trash2 aria-hidden />Excluir
          </Button>
        )}
        {podeGerenciar && item.publico && (
          <Button type="button" variant="outline" onClick={() => abrir({ tipo: 'tirar', id: item.id })}><Ban aria-hidden />Tirar do site</Button>
        )}
        {gerenciar && naEntrada(item) && (
          <Button type="button" variant="outline" onClick={() => abrir({ tipo: 'guardar', id: item.id })}><FolderInput aria-hidden />Guardar na coleção</Button>
        )}
        {gerenciar && (
          <Button type="button" variant="outline" onClick={() => abrir({ tipo: 'ficha', id: item.id })}><Pencil aria-hidden />Editar ficha</Button>
        )}
        {gerenciar && podeIrAoSite(item) && (
          <Button type="button" onClick={() => abrir({ tipo: 'publicar', id: item.id })}><Send aria-hidden />{item.publico ? 'Atualizar no site' : 'Publicar no site'}</Button>
        )}
      </Rodape>
    </Dialogo>
  )
}

/** O item acabou de ser criado (envio, catálogo do bucket) e a lista ainda não voltou do servidor. */
export function ItemACaminho({ onFechar }: { onFechar: () => void }) {
  return (
    <Dialogo titulo="Abrindo a ficha…" onFechar={onFechar}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />Buscando o item no catálogo…
      </p>
      <p className="text-xs text-pretty text-muted-foreground">Se ele não aparecer em alguns segundos, feche e recarregue a página: o item pode ter sido excluído.</p>
      <Rodape erros={[]}>
        <Button type="button" variant="outline" onClick={onFechar}>Fechar</Button>
      </Rodape>
    </Dialogo>
  )
}
