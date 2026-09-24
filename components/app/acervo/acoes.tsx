'use client'

import { useState, useTransition } from 'react'
import { Ban, FolderInput, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confirmacao, Dialogo, FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, Rodape, type Recado, type Resultado } from '@/components/app/transparencia/comum'
import { excluirItemDoAcervo, guardarNaColecaoDoAcervo, publicarItemDoAcervo, tirarItemDoSite } from '@/app/actions/acervo'
import { COLECAO, slugDoItem, tipoDoArquivo } from '@/lib/acervo/regras'
import { ENDERECO_DO_ACERVO, RecadoNoDialogo, faltaDoItem, naEntrada, pastaDaColecao, type ItemNaTela } from './comum'

const semProtocolo = (url: string) => url.replace(/^https?:\/\//, '')

/**
 * Publicar (ou atualizar) no site. Antes de mandar, a tela diz o que muda —
 * público, na busca, endereço para sempre, uso de imagem — e confere a ficha
 * com a mesma regra do servidor: com algo faltando, o botão fica parado e a
 * ficha abre para corrigir.
 */
export function PublicarNoSite({ item, recado, onFechar, onCorrigir, onFeito }: {
  item: ItemNaTela
  /** Vindo da ficha, aberta daqui para corrigir o que faltava. */
  recado: Recado | null
  onFechar: () => void
  onCorrigir: () => void
  onFeito: (r: { aviso?: string; url?: string }) => void
}) {
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const falta = faltaDoItem(item)
  const tipo = tipoDoArquivo(item.tipoMime)
  const video = tipo === 'video' || item.colecao === 'videos'
  // Antes da primeira publicação o endereço sai do título; se já houver um igual na coleção, o servidor põe um número no fim.
  const endereco = item.endereco ?? `${ENDERECO_DO_ACERVO}${item.colecao}/${slugDoItem(item.titulo)}/`

  const publicar = () => iniciar(async () => {
    setErro('')
    try {
      const r = await publicarItemDoAcervo(item.id)
      if (r.erro) { setErro(r.erro); return }
      onFeito(r)
    } catch {
      setErro(FALHA_DE_REDE)
    }
  })

  return (
    <Dialogo papel="alertdialog" titulo={item.publico ? 'Atualizar no site' : 'Publicar no site'} descricao={item.titulo} largura="max-w-xl" onFechar={onFechar} podeFechar={!ocupado}>
      <RecadoNoDialogo recado={recado} focar={Boolean(recado)} />
      <div className="flex flex-col gap-3 text-sm">
        {item.publico ? (
          <p className="text-pretty">
            A página e os arquivos do item no site são refeitos com a ficha e o arquivo de agora. O endereço continua o mesmo:{' '}
            <a href={endereco} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary underline underline-offset-2">{semProtocolo(endereco)}<span className="sr-only"> (abre em outra aba)</span></a>.
          </p>
        ) : (
          <>
            <p className="text-pretty">
              O item vai para <strong className="break-all">{semProtocolo(endereco)}</strong>{item.slug ? '' : ' (endereço provável)'}.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li><strong className="text-foreground">Fica público</strong>: qualquer pessoa abre, e o Google encontra e mostra na busca.</li>
              <li>
                <strong className="text-foreground">O endereço é para sempre</strong>: a coleção e o endereço não mudam mais, nem se o item sair do site e voltar.
                {!item.slug && ' Se outro item da coleção já tiver esse nome, o endereço ganha um número no fim.'}
              </li>
              {video && <li>O vídeo aparece pelo link do YouTube ou do Vimeo; o arquivo fica só no acervo.</li>}
              {!video && tipo === 'imagem' && <li>A imagem vai em versões para a web, sem os dados da câmera (como o lugar onde foi tirada). O original fica só no acervo.</li>}
              {!video && tipo === 'pdf' && <li>O PDF vai inteiro, para qualquer pessoa baixar. Confira se não há dado pessoal nele (CPF, RG, endereço, saúde).</li>}
              {/* Como em publicarNoSite: só a coleção Vídeos deixa o arquivo onde está. */}
              {item.colecao !== 'videos' && naEntrada(item) && <li>O arquivo sai da caixa de entrada e vai para a pasta da coleção, onde vale a trava de 30 dias.</li>}
            </ul>
          </>
        )}
        {!item.publico && (tipo === 'imagem' || video) && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-pretty">
            <strong>Aparece alguém?</strong> Só publique com a autorização de uso de imagem de quem aparece (LGPD). Criança ou adolescente, só com a autorização dos responsáveis.
          </p>
        )}
        {falta.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            <p className="font-medium">Para ir ao site, falta:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{falta.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </div>
      <Rodape erros={erro ? [erro] : []} andamento={ocupado ? 'Publicando: preparando os arquivos e refazendo as páginas do acervo. Pode levar um minuto.' : ''}>
        {/* O foco começa em "Voltar": Enter por engano não publica nada. */}
        <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado} data-autofocus={recado ? undefined : ''}>Voltar</Button>
        {falta.length > 0 && (
          <Button type="button" variant="outline" onClick={onCorrigir} disabled={ocupado}><Pencil aria-hidden />Corrigir na ficha</Button>
        )}
        <Button type="button" onClick={publicar} disabled={ocupado || falta.length > 0} {...OCUPADO_SEM_PERDER_FOCO}>
          {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {ocupado ? 'Publicando…' : item.publico ? 'Atualizar no site' : 'Publicar no site'}
        </Button>
      </Rodape>
    </Dialogo>
  )
}

/** Da caixa de entrada para a pasta da coleção, onde o bucket trava o arquivo por 30 dias. */
export function GuardarNaColecao({ item, onFechar, onFeito }: { item: ItemNaTela; onFechar: () => void; onFeito: (r: Resultado) => void }) {
  return (
    <Confirmacao
      titulo="Guardar na coleção"
      descricao={item.titulo}
      confirmar={{ rotulo: 'Guardar na coleção', icone: <FolderInput className="size-4" aria-hidden /> }}
      andamento="Guardando: copiando o arquivo para a pasta da coleção…"
      executar={() => guardarNaColecaoDoAcervo(item.id)}
      onFeito={onFeito}
      onFechar={onFechar}
    >
      <p className="text-pretty">
        O arquivo sai da caixa de entrada e vai para a pasta <strong className="font-mono text-xs">{pastaDaColecao(item)}</strong> do acervo, na coleção {COLECAO[item.colecao].nome}.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>Lá vale a <strong className="text-foreground">trava do acervo</strong>: por 30 dias, ninguém apaga nem troca o arquivo — nem por engano, nem com um acesso indevido.</li>
        <li>Confira antes a coleção e a data da ficha: a pasta usa o ano da data do item (ou o do envio, se a data estiver em branco). Depois, mudar a coleção na ficha não move o arquivo.</li>
        <li>O item continua privado, e a ficha continua podendo ser editada.</li>
      </ul>
    </Confirmacao>
  )
}

export function TirarDoSite({ item, onFechar, onFeito }: { item: ItemNaTela; onFechar: () => void; onFeito: (r: Resultado) => void }) {
  return (
    <Confirmacao
      titulo="Tirar do site?"
      descricao={item.titulo}
      destrutivo
      confirmar={{ rotulo: 'Tirar do site', icone: <Ban className="size-4" aria-hidden /> }}
      andamento="Tirando do site e refazendo as páginas do acervo…"
      executar={() => tirarItemDoSite(item.id)}
      onFeito={onFeito}
      onFechar={onFechar}
    >
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>A página do item e os arquivos dele saem de cruzvermelhariodejaneiro.org/acervo/, e as páginas da coleção e do início do acervo são refeitas.</li>
        <li>A ficha e o arquivo original <strong className="text-foreground">continuam aqui</strong>, como privados.</li>
        <li>O endereço fica guardado: se o item voltar ao site, volta{item.endereco ? <> em <span className="break-all">{semProtocolo(item.endereco)}</span></> : ' no mesmo endereço'}.</li>
        <li>O Google pode levar alguns dias para tirar o item da busca.</li>
      </ul>
    </Confirmacao>
  )
}

/** Só item privado. O arquivo sai junto se ainda está na caixa de entrada; numa coleção, a trava o mantém. */
export function ExcluirItem({ item, onFechar, onFeito }: { item: ItemNaTela; onFechar: () => void; onFeito: (r: Resultado) => void }) {
  const pasta = item.chave ? item.chave.slice(0, item.chave.lastIndexOf('/') + 1) : null
  return (
    <Confirmacao
      titulo="Excluir do catálogo?"
      descricao={item.titulo}
      destrutivo
      confirmar={{ rotulo: 'Excluir', icone: <Trash2 className="size-4" aria-hidden /> }}
      andamento="Excluindo…"
      executar={() => excluirItemDoAcervo(item.id)}
      onFeito={onFeito}
      onFechar={onFechar}
    >
      <p>A ficha é apagada do catálogo. Não dá para desfazer.</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        {naEntrada(item)
          ? <li>O arquivo está na caixa de entrada (sem trava) e é apagado junto.</li>
          : pasta !== null && <li>O arquivo continua na pasta <span className="break-all font-mono text-xs">{pasta || '(raiz)'}</span> do bucket — lá nada se apaga antes de 30 dias — e pode ganhar ficha de novo pela aba “Pastas do acervo”.</li>}
        {item.endereco && <li>O endereço que ele teve no site (<span className="break-all">{semProtocolo(item.endereco)}</span>) fica livre para outro item.</li>}
      </ul>
    </Confirmacao>
  )
}
