'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CircleCheck, ExternalLink, FileClock, FileText, History, Loader2, Pencil, Plus, Send, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  apagarPdfsDoSite, descartarVersao, excluirRascunhoDeDocumento, linkDoPdf, prepararEnvioDoPdf, publicarVersao, registrarVersaoDoPdf, retirarDocumento,
  salvarDocumento,
} from '@/app/actions/transparencia'
import { CATEGORIAS, ROTULO_DA_CATEGORIA, TAMANHO_MAXIMO, lerDocumento, tamanhoLegivel, type Categoria } from '@/lib/transparencia/regras'
import {
  Campo, CodigoDaTrilha, Confirmacao, Dialogo, Etiqueta, FALHA_DE_REDE, HashCurto, OCUPADO_SEM_PERDER_FOCO, RetiradaComMotivo, Rodape, SemCodigo, dia,
  diaEHora, recadoDe, useFocoDepoisDaLista, type Estado, type Recado, type Resultado,
} from './comum'

export type VersaoNaTela = {
  id: string
  nome: string
  tamanho: number
  sha256: string
  /** Endereço do PDF no site (só depois de publicada). */
  arquivoPublico: string | null
  publicadoEm: string | null
  publicadoPor: string | null
  enviadoEm: string
  enviadoPor: string | null
  /** Código da trilha pública (só das publicadas). */
  codigo: string | null
  /** Quando o PDF foi apagado do site (documento retirado). */
  removidoDoSiteEm: string | null
}

export type DocumentoNaTela = {
  id: string
  categoria: Categoria
  titulo: string
  descricao: string | null
  periodo: string | null
  ordem: number
  retiradoEm: string | null
  retiradoPor: string | null
  motivoRetirada: string | null
  criadoEm: string
  /** A versão publicada mais nova: é a que o portal mostra. */
  atual: VersaoNaTela | null
  /** As publicadas antes dela (o portal lista como substituídas). */
  anteriores: VersaoNaTela[]
  /** Enviadas e ainda não publicadas. */
  pendentes: VersaoNaTela[]
}

// O mesmo bucket de app/actions/transparencia.ts.
const BUCKET = 'transparencia'

const estadoDo = (d: DocumentoNaTela): Estado => (d.retiradoEm ? 'retirado' : d.atual ? 'no_ar' : 'rascunho')
const ROTULO_DO_ESTADO: Record<Estado, string> = { rascunho: 'Rascunho', no_ar: 'No ar', retirado: 'Retirado do portal' }

/** O mínimo do documento que os diálogos usam — também serve para o que acabou de ser criado e ainda não voltou do servidor. */
type Alvo = Pick<DocumentoNaTela, 'id' | 'titulo' | 'categoria' | 'atual' | 'retiradoEm'>
type VersaoParaPublicar = { id: string; nome: string; tamanho: number; sha256: string | null }

type DialogoAberto =
  | { tipo: 'ficha'; documento: DocumentoNaTela | null; categoria?: Categoria }
  | { tipo: 'pdf'; documento: Alvo; recemCriado: boolean }
  | { tipo: 'publicar'; documento: Alvo; versao: VersaoParaPublicar }
  | { tipo: 'descartar'; documento: Alvo; versao: VersaoNaTela }
  | { tipo: 'retirar'; documento: DocumentoNaTela }
  | { tipo: 'excluir'; documento: DocumentoNaTela }

const idDoCartao = (id: string) => `documento-${id}`

/**
 * O que dá para conferir antes de mandar. O servidor confere de novo,
 * inclusive se os bytes são mesmo de PDF. Há sistema que informa PDF sem tipo
 * ou como application/x-pdf: pela extensão, vale — e sobe como application/pdf.
 */
function problemaDoPdf(f: File): string | null {
  const pelaExtensao = /\.pdf$/i.test(f.name) && (!f.type || /pdf/i.test(f.type))
  if (f.type !== 'application/pdf' && !pelaExtensao) return 'Envie o documento em PDF.'
  if (f.size <= 0) return 'O arquivo está vazio.'
  if (f.size > TAMANHO_MAXIMO) return `O arquivo tem ${tamanhoLegivel(f.size)}; o limite é 20 MB.`
  return null
}

/**
 * A aba Documentos: um lugar por documento do portal (o estatuto, o balanço
 * de 2025…), agrupados pelas seções do portal na ordem em que ele as mostra.
 * Cada lugar recebe PDFs; publicado, o arquivo nunca muda — arquivo novo é
 * versão nova, e a anterior continua listada como substituída.
 */
export function Documentos({ documentos, trilhaDisponivel, aberto, aoRecado, painelId }: {
  documentos: DocumentoNaTela[]
  trilhaDisponivel: boolean
  aberto: boolean
  aoRecado: (r: Recado) => void
  painelId: string
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<DialogoAberto | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [apagando, setApagando] = useState<string | null>(null)
  const focarDepois = useFocoDepoisDaLista(documentos, painelId)

  const fechar = () => setDialogo(null)
  function concluir(r: Resultado, ok: string, foco: string) {
    setDialogo(null)
    focarDepois(foco)
    aoRecado(recadoDe(r, ok))
    router.refresh()
  }

  /**
   * O PDF guardado (ainda não publicado, ou para conferir) abre por um link
   * de um minuto. A aba é aberta já no clique: aberta só depois da resposta
   * do servidor, o navegador a trataria como pop-up e bloquearia.
   */
  async function verPdf(versaoId: string) {
    const aba = window.open('', '_blank')
    if (aba) {
      aba.opener = null
      try { aba.document.title = 'Abrindo o PDF…'; aba.document.body.textContent = 'Abrindo o PDF…' } catch { /* a aba já saiu da origem */ }
    }
    setAbrindo(versaoId)
    try {
      const r = await linkDoPdf(versaoId)
      if (r.erro || !r.url) { aba?.close(); aoRecado({ tipo: 'erro', texto: r.erro ?? 'Não foi possível abrir o arquivo.' }); return }
      if (aba && !aba.closed) aba.location.href = r.url
      else aoRecado({ tipo: 'aviso', texto: 'O navegador bloqueou a nova aba.', link: { href: r.url, rotulo: 'Abrir o PDF (o link vale por 1 minuto)' } })
    } catch {
      aba?.close()
      aoRecado({ tipo: 'erro', texto: FALHA_DE_REDE })
    } finally {
      setAbrindo(null)
    }
  }

  /** Documento retirado com PDF ainda no site (o site não respondeu na retirada): tenta apagar de novo. */
  async function apagarDoSite(documentoId: string) {
    setApagando(documentoId)
    try {
      const r = await apagarPdfsDoSite(documentoId)
      if (r.erro) aoRecado(recadoDe(r, ''))
      else concluir(r, 'PDFs apagados do site.', idDoCartao(documentoId))
    } catch {
      aoRecado({ tipo: 'erro', texto: FALHA_DE_REDE })
    } finally {
      setApagando(null)
    }
  }

  const secoes = CATEGORIAS.map((c) => ({ c, docs: documentos.filter((d) => d.categoria === c) }))
  const vazias = secoes.filter((s) => !s.docs.length).map((s) => s.c)
  const quantos = (e: Estado) => documentos.filter((d) => estadoDo(d) === e).length
  const aguardando = documentos.reduce((n, d) => n + d.pendentes.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {documentos.length
            ? [`${quantos('no_ar')} no ar`, `${quantos('rascunho')} ${quantos('rascunho') === 1 ? 'rascunho' : 'rascunhos'}`, quantos('retirado') ? `${quantos('retirado')} retirado${quantos('retirado') === 1 ? '' : 's'}` : null, aguardando ? `${aguardando} PDF${aguardando === 1 ? '' : 's'} aguardando publicação` : null].filter(Boolean).join(' · ')
            : 'Nenhum documento ainda.'}
        </p>
        <Button className="self-start sm:self-auto" onClick={() => setDialogo({ tipo: 'ficha', documento: null })} data-ajuda="transparencia.novo-documento"><Plus className="size-4" aria-hidden />Novo documento</Button>
      </div>

      {!documentos.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Comece pelo estatuto: crie a ficha, envie o PDF e publique. Cada documento publicado ganha uma impressão digital (SHA-256) e um código de verificação na trilha pública.
        </Card>
      )}

      {secoes.filter((s) => s.docs.length).map(({ c, docs }) => (
        <section key={c} aria-labelledby={`secao-${c}`} className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`secao-${c}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{ROTULO_DA_CATEGORIA[c].nome}</h2>
              <p className="text-xs text-muted-foreground">{ROTULO_DA_CATEGORIA[c].ajuda}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDialogo({ tipo: 'ficha', documento: null, categoria: c })}>
              <Plus className="size-3.5" aria-hidden />Adicionar<span className="sr-only"> documento em {ROTULO_DA_CATEGORIA[c].nome}</span>
            </Button>
          </div>
          <ul className="flex flex-col gap-3">
            {docs.map((d) => (
              <li key={d.id}>
                <CartaoDoDocumento d={d} trilhaDisponivel={trilhaDisponivel} abrindo={abrindo} verPdf={verPdf} apagando={apagando} apagarDoSite={apagarDoSite} abrir={setDialogo} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {documentos.length > 0 && vazias.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">Seções do portal ainda sem documento</p>
          <p className="text-xs text-muted-foreground">O portal só mostra as seções que têm documento publicado.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {vazias.map((c) => (
              <li key={c}>
                <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'ficha', documento: null, categoria: c })}>
                  <Plus className="size-3.5" aria-hidden />{ROTULO_DA_CATEGORIA[c].nome}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialogo?.tipo === 'ficha' && (
        <FichaDoDocumento
          key={`ficha-${dialogo.documento?.id ?? 'novo'}`}
          documento={dialogo.documento}
          categoriaInicial={dialogo.categoria}
          onFechar={fechar}
          onSalvo={(salvo, r) => {
            if (dialogo.documento) { concluir(r, 'Ficha salva.', idDoCartao(salvo.id)); return }
            // Documento novo: o passo seguinte é o PDF, no mesmo fôlego.
            router.refresh()
            setDialogo({ tipo: 'pdf', documento: { id: salvo.id, titulo: salvo.titulo, categoria: salvo.categoria, atual: null, retiradoEm: null }, recemCriado: true })
          }}
        />
      )}
      {dialogo?.tipo === 'pdf' && (
        <EnvioDoPdf
          key={`pdf-${dialogo.documento.id}`}
          documento={dialogo.documento}
          recemCriado={dialogo.recemCriado}
          abrindo={abrindo}
          verPdf={verPdf}
          onFechar={fechar}
          onEnviado={() => router.refresh()}
          onPublicar={(versao) => setDialogo({ tipo: 'publicar', documento: dialogo.documento, versao })}
        />
      )}
      {dialogo?.tipo === 'publicar' && (
        <Confirmacao
          key={`publicar-${dialogo.versao.id}`}
          titulo="Publicar no portal de transparência"
          descricao={dialogo.documento.titulo}
          confirmar={{ rotulo: 'Publicar', icone: <Send className="size-4" aria-hidden /> }}
          andamento="Publicando: enviando o PDF ao site e refazendo a página…"
          executar={() => publicarVersao(dialogo.versao.id)}
          onFeito={(r) => concluir(r, 'Publicado no portal. O código de verificação já aparece na versão.', idDoCartao(dialogo.documento.id))}
          onFechar={fechar}
        >
          <p>O PDF <strong className="break-all">{dialogo.versao.nome}</strong> ({tamanhoLegivel(dialogo.versao.tamanho)}) vai para a página de transparência do site, na seção {ROTULO_DA_CATEGORIA[dialogo.documento.categoria].nome}.</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>O arquivo é copiado para o site com um nome que carrega a impressão digital dele (SHA-256), e a página do portal é refeita.</li>
            <li>A publicação entra na <strong className="text-foreground">trilha pública de auditoria</strong>, com data, hora e quem publicou, e ganha um código de verificação.</li>
            <li><strong className="text-foreground">Não dá para desfazer nem trocar o arquivo.</strong> Para corrigir, envie um PDF novo: ele vira uma versão nova, e esta continua listada no portal como versão anterior.</li>
            {dialogo.documento.atual?.publicadoEm && !dialogo.documento.retiradoEm && <li>A versão no ar hoje ({dialogo.documento.atual.nome}, publicada em {dia(dialogo.documento.atual.publicadoEm)}) passa a aparecer como versão anterior, substituída.</li>}
            {dialogo.documento.retiradoEm && <li>O documento está retirado do portal: publicar esta versão o traz de volta, e as versões publicadas antes aparecem como anteriores.</li>}
            {!aberto && <li>No lançamento oculto a página sai sem indexação e sem links, mas o PDF abre para quem tiver o endereço.</li>}
          </ul>
          {dialogo.versao.sha256 && <p className="text-xs text-muted-foreground">SHA-256 do arquivo: <HashCurto hash={dialogo.versao.sha256} /></p>}
        </Confirmacao>
      )}
      {dialogo?.tipo === 'descartar' && (
        <Confirmacao
          key={`descartar-${dialogo.versao.id}`}
          titulo="Descartar o PDF enviado?"
          descricao={dialogo.documento.titulo}
          destrutivo
          confirmar={{ rotulo: 'Descartar', icone: <Trash2 className="size-4" aria-hidden /> }}
          andamento="Descartando…"
          executar={() => descartarVersao(dialogo.versao.id)}
          onFeito={(r) => concluir(r, 'PDF descartado.', idDoCartao(dialogo.documento.id))}
          onFechar={fechar}
        >
          <p>O arquivo <strong className="break-all">{dialogo.versao.nome}</strong>, enviado em {diaEHora(dialogo.versao.enviadoEm)}, não foi publicado. Ele é apagado do armazenamento e sai desta lista; nada muda no portal nem na trilha.</p>
        </Confirmacao>
      )}
      {dialogo?.tipo === 'retirar' && (
        <RetiradaComMotivo
          key={`retirar-${dialogo.documento.id}`}
          titulo="Retirar do portal"
          descricao={dialogo.documento.titulo}
          executar={(motivo) => retirarDocumento(dialogo.documento.id, motivo)}
          onFeito={(r) => concluir(r, 'Documento retirado do portal.', idDoCartao(dialogo.documento.id))}
          onFechar={fechar}
        >
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>O documento sai da página de transparência, que é refeita no site.</li>
            <li>A retirada entra na <strong className="text-foreground">trilha pública de auditoria</strong>, com data e hora: quem conferir o código de verificação verá “retirado”. O que já foi publicado não se apaga da trilha.</li>
            <li>Os PDFs deste documento são <strong className="text-foreground">apagados do servidor do site</strong> (todas as versões publicadas): quem tiver o endereço antigo não baixa mais. A trilha guarda só a impressão digital e a ficha, nunca o arquivo.</li>
            <li>Ele volta ao portal quando uma versão nova do PDF for publicada.</li>
          </ul>
        </RetiradaComMotivo>
      )}
      {dialogo?.tipo === 'excluir' && (
        <Confirmacao
          key={`excluir-${dialogo.documento.id}`}
          titulo="Excluir o rascunho?"
          descricao={dialogo.documento.titulo}
          destrutivo
          confirmar={{ rotulo: 'Excluir rascunho', icone: <Trash2 className="size-4" aria-hidden /> }}
          andamento="Excluindo…"
          executar={() => excluirRascunhoDeDocumento(dialogo.documento.id)}
          onFeito={(r) => concluir(r, 'Rascunho excluído.', painelId)}
          onFechar={fechar}
        >
          <p>
            Nada deste documento foi publicado, então não há o que registrar na trilha. A ficha
            {dialogo.documento.pendentes.length ? ` e ${dialogo.documento.pendentes.length === 1 ? 'o PDF enviado são apagados' : `os ${dialogo.documento.pendentes.length} PDFs enviados são apagados`}` : ' é apagada'}.
          </p>
        </Confirmacao>
      )}
    </div>
  )
}

function CartaoDoDocumento({ d, trilhaDisponivel, abrindo, verPdf, apagando, apagarDoSite, abrir }: {
  d: DocumentoNaTela
  trilhaDisponivel: boolean
  abrindo: string | null
  verPdf: (versaoId: string) => void
  apagando: string | null
  apagarDoSite: (documentoId: string) => void
  abrir: (dialogo: DialogoAberto) => void
}) {
  const estado = estadoDo(d)
  const nadaPublicado = !d.atual && !d.anteriores.length
  // Retirado, mas o site não respondeu na hora: o PDF pode continuar no endereço público.
  const pdfsNoSite = d.retiradoEm ? [d.atual, ...d.anteriores].filter((v) => v?.arquivoPublico && !v.removidoDoSiteEm).length : 0
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={idDoCartao(d.id)} tabIndex={-1} className="font-semibold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {d.titulo}{d.periodo && <span className="font-normal text-muted-foreground"> · {d.periodo}</span>}
          </h3>
          {d.descricao && <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{d.descricao}</p>}
        </div>
        <Etiqueta estado={estado}>{ROTULO_DO_ESTADO[estado]}</Etiqueta>
      </div>

      {d.retiradoEm && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-semibold">Retirado em {diaEHora(d.retiradoEm)}{d.retiradoPor ? ` por ${d.retiradoPor}` : ''}.</span> Motivo: {d.motivoRetirada}
        </p>
      )}

      {pdfsNoSite > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{pdfsNoSite === 1 ? 'O PDF deste documento pode continuar' : `${pdfsNoSite} PDFs deste documento podem continuar`} no endereço público: o site não respondeu na hora da retirada.</p>
          <div className="shrink-0">
            <Button size="sm" variant="outline" onClick={() => apagarDoSite(d.id)} disabled={apagando === d.id} {...OCUPADO_SEM_PERDER_FOCO}>
              {apagando === d.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
              {apagando === d.id ? 'Apagando…' : 'Apagar os PDFs do site'}<span className="sr-only"> de {d.titulo}</span>
            </Button>
          </div>
        </div>
      )}

      {d.atual && <VersaoPublicada v={d.atual} rotulo={d.retiradoEm ? 'Última versão publicada' : 'Versão no portal'} trilhaDisponivel={trilhaDisponivel} />}

      {d.pendentes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aguardando publicação</p>
          <ul className="flex flex-col gap-2">
            {d.pendentes.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2.5 text-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="flex items-start gap-2 font-medium"><FileClock className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden /><span className="break-all">{v.nome}</span></p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{tamanhoLegivel(v.tamanho)} · enviado em {diaEHora(v.enviadoEm)}{v.enviadoPor ? ` por ${v.enviadoPor}` : ''} ·</span>
                    <HashCurto hash={v.sha256} rotulo="SHA-256 do arquivo" />
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => abrir({ tipo: 'publicar', documento: d, versao: { id: v.id, nome: v.nome, tamanho: v.tamanho, sha256: v.sha256 } })}>
                    <Send className="size-3.5" aria-hidden />Publicar<span className="sr-only"> {v.nome}</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => verPdf(v.id)} disabled={abrindo === v.id} {...OCUPADO_SEM_PERDER_FOCO}>
                    {abrindo === v.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />}Ver PDF<span className="sr-only"> {v.nome} (abre em outra aba)</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => abrir({ tipo: 'descartar', documento: d, versao: v })}>
                    <Trash2 className="size-3.5" aria-hidden />Descartar<span className="sr-only"> {v.nome}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!d.atual && !d.pendentes.length && <p className="text-xs text-muted-foreground">Falta o PDF: envie o arquivo para poder publicar.</p>}

      {d.anteriores.length > 0 && (
        <details className="group rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <History className="size-3.5" aria-hidden />Versões anteriores ({d.anteriores.length}) — substituídas, continuam listadas no portal
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {d.anteriores.map((v) => <li key={v.id}><VersaoPublicada v={v} trilhaDisponivel={trilhaDisponivel} compacta /></li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={() => abrir({ tipo: 'pdf', documento: d, recemCriado: false })}>
          <Upload className="size-3.5" aria-hidden />{d.atual ? 'Enviar versão nova' : 'Enviar PDF'}<span className="sr-only"> de {d.titulo}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => abrir({ tipo: 'ficha', documento: d })}>
          <Pencil className="size-3.5" aria-hidden />Editar ficha<span className="sr-only"> de {d.titulo}</span>
        </Button>
        {estado === 'no_ar' && (
          <Button size="sm" variant="ghost" onClick={() => abrir({ tipo: 'retirar', documento: d })}>
            <Ban className="size-3.5" aria-hidden />Retirar do portal<span className="sr-only"> {d.titulo}</span>
          </Button>
        )}
        {nadaPublicado && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => abrir({ tipo: 'excluir', documento: d })}>
            <Trash2 className="size-3.5" aria-hidden />Excluir rascunho<span className="sr-only"> {d.titulo}</span>
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Uma versão publicada: o arquivo no site, a impressão digital e o código da trilha. */
function VersaoPublicada({ v, rotulo, trilhaDisponivel, compacta }: { v: VersaoNaTela; rotulo?: string; trilhaDisponivel: boolean; compacta?: boolean }) {
  return (
    <div className={cn('text-sm', !compacta && 'rounded-lg border border-border bg-muted/30 px-3 py-2.5')} data-ajuda="transparencia.versao">
      {rotulo && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {v.arquivoPublico && !v.removidoDoSiteEm
          ? <a href={v.arquivoPublico} target="_blank" rel="noopener noreferrer" className="break-all font-medium hover:text-primary hover:underline">{v.nome}<span className="sr-only"> (abre o PDF publicado no site, em outra aba)</span></a>
          : <span className="break-all font-medium">{v.nome}</span>}
        <span className="text-xs text-muted-foreground">
          {tamanhoLegivel(v.tamanho)}{v.publicadoEm ? ` · publicada em ${diaEHora(v.publicadoEm)}` : ''}{v.publicadoPor ? ` por ${v.publicadoPor}` : ''}
          {v.removidoDoSiteEm ? ` · apagada do site em ${diaEHora(v.removidoDoSiteEm)}` : ''}
        </span>
      </p>
      <dl className="mt-1.5 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <dt className="text-muted-foreground">SHA-256 do arquivo</dt>
        <dd><HashCurto hash={v.sha256} rotulo="SHA-256 do arquivo" /></dd>
        <dt className="text-muted-foreground">Código de verificação</dt>
        <dd>{v.codigo ? <CodigoDaTrilha codigo={v.codigo} /> : <SemCodigo trilhaDisponivel={trilhaDisponivel} />}</dd>
      </dl>
    </div>
  )
}

/** A ficha do documento: o que o portal mostra além do PDF. */
function FichaDoDocumento({ documento, categoriaInicial, onFechar, onSalvo }: {
  documento: DocumentoNaTela | null
  categoriaInicial?: Categoria
  onFechar: () => void
  onSalvo: (salvo: { id: string; titulo: string; categoria: Categoria }, r: Resultado) => void
}) {
  const [categoria, setCategoria] = useState<Categoria>(documento?.categoria ?? categoriaInicial ?? CATEGORIAS[0])
  const [erros, setErros] = useState<string[]>([])
  const [salvando, iniciar] = useTransition()
  const noAr = Boolean(documento?.atual) && !documento?.retiradoEm

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (salvando) return
    const f = new FormData(e.currentTarget)
    const { dados, erros: problemas } = lerDocumento(f)
    if (!dados) { setErros(problemas); return }
    setErros([])
    iniciar(async () => {
      try {
        const r = await salvarDocumento(documento?.id ?? null, f)
        if (r.erro || !r.id) { setErros([r.erro ?? 'Não foi possível salvar o documento.']); return }
        onSalvo({ id: r.id, titulo: dados.titulo, categoria: dados.categoria }, r)
      } catch {
        setErros([FALHA_DE_REDE])
      }
    })
  }

  return (
    <Dialogo titulo={documento ? 'Editar ficha do documento' : 'Novo documento'} descricao={documento ? documento.titulo : 'Primeiro a ficha; o PDF vem no passo seguinte.'} largura="max-w-xl" onFechar={onFechar} podeFechar={!salvando}>
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        {noAr && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
            Este documento está no portal. Mudar a seção, o título, o período ou a descrição refaz a página do site e registra uma
            versão nova na trilha pública; a anterior continua lá, como substituída. A ordem não entra na trilha.
          </p>
        )}
        {documento?.retiradoEm && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Este documento está retirado do portal: a ficha muda só aqui. Ele volta ao site quando uma versão nova do PDF for publicada.</p>
        )}
        <Campo rotulo="Seção do portal" ajuda={ROTULO_DA_CATEGORIA[categoria].ajuda}>
          {(p) => (
            <select {...p} name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={inputClass}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO_DA_CATEGORIA[c].nome}</option>)}
            </select>
          )}
        </Campo>
        <Campo rotulo="Título" ajuda="Como aparece no portal, de 3 a 200 caracteres.">
          {(p) => <input {...p} name="titulo" required minLength={3} maxLength={200} defaultValue={documento?.titulo ?? ''} placeholder="Ex.: Estatuto social" data-autofocus className={inputClass} />}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Campo rotulo="Período" opcional ajuda="O ano, o exercício ou o mandato a que o documento se refere.">
            {(p) => <input {...p} name="periodo" maxLength={60} defaultValue={documento?.periodo ?? ''} placeholder="Ex.: 2025 ou mandato 2024–2027" className={inputClass} />}
          </Campo>
          <Campo rotulo="Ordem" ajuda="Na seção, o menor vem primeiro.">
            {(p) => <input {...p} name="ordem" type="number" inputMode="numeric" min={-1000} max={1000} step={1} defaultValue={documento?.ordem ?? 0} className={inputClass} />}
          </Campo>
        </div>
        <Campo rotulo="Descrição" opcional ajuda="Uma ou duas frases sobre o que é o documento (até 1.000 caracteres).">
          {(p) => <textarea {...p} name="descricao" rows={3} maxLength={1000} defaultValue={documento?.descricao ?? ''} className={inputClass} />}
        </Campo>
        <Rodape erros={erros} andamento={salvando ? 'Salvando…' : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando} {...OCUPADO_SEM_PERDER_FOCO}>{salvando && <Loader2 className="size-4 animate-spin" aria-hidden />}{documento ? 'Salvar ficha' : 'Criar e enviar o PDF'}</Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}

/**
 * O envio do PDF, em dois passos como na ficha da equipe: o servidor dá um
 * link de uso único, o navegador manda o arquivo direto ao Storage (a função
 * da Vercel corta corpo acima de 4,5 MB) e o servidor confere que é PDF,
 * calcula o SHA-256 e registra a versão. Publicar é outro passo, confirmado.
 */
function EnvioDoPdf({ documento, recemCriado, abrindo, verPdf, onFechar, onEnviado, onPublicar }: {
  documento: Alvo
  recemCriado: boolean
  abrindo: string | null
  verPdf: (versaoId: string) => void
  onFechar: () => void
  onEnviado: () => void
  onPublicar: (versao: VersaoParaPublicar) => void
}) {
  const id = useId()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState<VersaoParaPublicar | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [ocupado, iniciar] = useTransition()

  // O formulário some quando o arquivo chega: o foco passa para "Publicar agora".
  useEffect(() => {
    if (enviado) document.getElementById(`${id}-publicar`)?.focus()
  }, [enviado, id])

  function escolher(f: File | null | undefined) {
    setErro('')
    if (!f) { setArquivo(null); return }
    const problema = problemaDoPdf(f)
    setArquivo(problema ? null : f)
    if (problema) setErro(problema)
  }

  const enviar = () => iniciar(async () => {
    if (!arquivo) { setErro('Escolha o PDF.'); return }
    const problema = problemaDoPdf(arquivo)
    if (problema) { setErro(problema); return }
    // Sem tipo, ou com outro nome para ele (application/x-pdf), o Storage recusaria: o bucket só aceita application/pdf.
    const pdf = arquivo.type === 'application/pdf' ? arquivo : new File([arquivo], arquivo.name, { type: 'application/pdf' })
    setErro('')
    try {
      setEtapa('Preparando…')
      const p = await prepararEnvioDoPdf(documento.id, pdf.type, pdf.size)
      if (p.erro || !p.caminho || !p.token) { setErro(p.erro ?? 'Não foi possível preparar o envio.'); return }
      setEtapa('Enviando…')
      const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(p.caminho, p.token, pdf, { contentType: pdf.type })
      if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); return }
      setEtapa('Conferindo…')
      const r = await registrarVersaoDoPdf(documento.id, p.caminho, pdf.name)
      if (r.erro || !r.versaoId) { setErro(r.erro ?? 'Não foi possível registrar o arquivo.'); return }
      setEnviado({ id: r.versaoId, nome: pdf.name, tamanho: pdf.size, sha256: null })
      onEnviado()
    } catch {
      setErro('Não foi possível enviar. Confira a conexão e tente de novo.')
    } finally {
      setEtapa('')
    }
  })

  if (enviado) {
    return (
      <Dialogo titulo="PDF recebido" descricao={documento.titulo} onFechar={onFechar}>
        <div className="rounded-lg border border-success/40 bg-success/5 px-3 py-3 text-sm">
          <p className="flex items-start gap-2 font-medium">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span className="break-all">{enviado.nome} <span className="font-normal text-muted-foreground">({tamanhoLegivel(enviado.tamanho)})</span></span>
          </p>
          <p className="mt-1 text-muted-foreground">
            O servidor conferiu que é um PDF e registrou a impressão digital dele (SHA-256). <strong className="text-foreground">Ainda não está no portal</strong>: confira o arquivo e publique quando estiver certo. Ele fica em “Aguardando publicação” no documento.
          </p>
        </div>
        <Rodape erros={[]}>
          <Button type="button" variant="ghost" onClick={onFechar}>Publicar depois</Button>
          <Button type="button" variant="outline" onClick={() => verPdf(enviado.id)} disabled={abrindo === enviado.id} {...OCUPADO_SEM_PERDER_FOCO}>
            {abrindo === enviado.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}Ver PDF<span className="sr-only"> (abre em outra aba)</span>
          </Button>
          <Button type="button" id={`${id}-publicar`} onClick={() => onPublicar(enviado)}><Send className="size-4" aria-hidden />Publicar agora…</Button>
        </Rodape>
      </Dialogo>
    )
  }

  return (
    <Dialogo titulo={documento.atual ? 'Enviar versão nova do PDF' : 'Enviar PDF'} descricao={documento.titulo} onFechar={onFechar} podeFechar={!ocupado}>
      {recemCriado && (
        <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />Ficha criada. Agora o PDF: ele fica guardado aqui até você publicar.
        </p>
      )}
      <label
        htmlFor={`${id}-arquivo`}
        onDragOver={(e) => { e.preventDefault(); if (!arrastando) setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!ocupado) escolher(e.dataTransfer.files?.[0]) }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm hover:border-primary/60 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
          arrastando ? 'border-primary bg-primary/5' : 'border-border',
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        {arquivo
          ? <span className="break-all font-medium">{arquivo.name} <span className="font-normal text-muted-foreground">({tamanhoLegivel(arquivo.size)})</span></span>
          : <span className="font-medium">Escolher o PDF</span>}
        <span className="text-xs text-muted-foreground">ou arraste o arquivo para cá · PDF até 20 MB</span>
        <input
          id={`${id}-arquivo`} type="file" accept="application/pdf,.pdf" className="sr-only" data-autofocus disabled={ocupado}
          aria-describedby={`${id}-regras`}
          onChange={(e) => escolher(e.target.files?.[0])}
        />
      </label>
      <ul id={`${id}-regras`} className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Envie o PDF original, do jeito que vai ao público. Publicado, o arquivo não se troca: corrigir é enviar outro, que vira versão nova.</li>
        <li>Nada vai ao site agora: o arquivo fica guardado aqui até você publicar.</li>
        {documento.atual && !documento.retiradoEm && <li>A versão no ar hoje ({documento.atual.nome}) continua no ar até você publicar esta.</li>}
        {documento.retiradoEm && <li>O documento está retirado do portal: ele volta quando esta versão for publicada.</li>}
      </ul>
      <Rodape erros={erro ? [erro] : []} andamento={etapa}>
        <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button type="button" onClick={enviar} disabled={ocupado || !arquivo} {...OCUPADO_SEM_PERDER_FOCO}>
          {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}{ocupado ? etapa || 'Enviando…' : 'Enviar'}
        </Button>
      </Rodape>
    </Dialogo>
  )
}
