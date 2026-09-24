'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ListChecks, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { Campo, Confirmacao, Rodape, type Resultado } from '@/components/app/transparencia/comum'
import { publicarCanais } from '@/app/actions/transparencia'
import { cn } from '@/lib/utils'
import { ROTULO_DO_CANAL, TIPOS_DE_CANAL, lerCanais, type Canal, type TipoDeCanal } from '@/lib/transparencia/regras'
import { ListaDeCanais, type VersaoDosCanais } from './lista'

type Linha = { chave: string; tipo: TipoDeCanal; rotulo: string; valor: string; url: string; nova: boolean }

/** O que a pessoa costuma digitar em cada tipo — só de exemplo, no placeholder. */
const EXEMPLO: Record<TipoDeCanal, { valor: string; url: string }> = {
  site: { valor: 'cruzvermelhariodejaneiro.org', url: 'https://cruzvermelhariodejaneiro.org/' },
  email: { valor: 'nome@cruzvermelhariodejaneiro.org', url: 'sem link' },
  telefone: { valor: '(21) 0000-0000', url: 'sem link' },
  whatsapp: { valor: '(21) 90000-0000', url: 'https://wa.me/5521900000000' },
  instagram: { valor: '@perfil', url: 'https://www.instagram.com/perfil' },
  facebook: { valor: 'facebook.com/pagina', url: 'https://www.facebook.com/pagina' },
  linkedin: { valor: 'linkedin.com/company/pagina', url: 'https://www.linkedin.com/company/pagina' },
  youtube: { valor: '@canal', url: 'https://www.youtube.com/@canal' },
  tiktok: { valor: '@perfil', url: 'https://www.tiktok.com/@perfil' },
  x: { valor: '@perfil', url: 'https://x.com/perfil' },
  endereco: { valor: 'Rua, número — bairro, cidade/UF', url: 'https:// (mapa, opcional)' },
  cnpj: { valor: '00.000.000/0000-00', url: 'sem link' },
  pix: { valor: 'a chave PIX', url: 'sem link' },
  outro: { valor: '', url: 'https://…' },
}

// O rótulo igual ao padrão do tipo vira campo vazio: trocar o tipo troca o rótulo junto.
const paraLinhas = (canais: Canal[], prefixo: string): Linha[] =>
  canais.map((c, i) => ({ chave: `${prefixo}${i}`, tipo: c.tipo, rotulo: c.rotulo === ROTULO_DO_CANAL[c.tipo] ? '' : c.rotulo, valor: c.valor, url: c.url ?? '', nova: false }))

const linhaVazia = (chave: string, tipo: TipoDeCanal = 'site', nova = false): Linha => ({ chave, tipo, rotulo: '', valor: '', url: '', nova })

/** A forma que vai ao banco, para comparar a lista da tela com a publicada. */
const normal = (c: { tipo: TipoDeCanal; rotulo: string; valor: string; url: string | null }) =>
  ({ tipo: c.tipo, rotulo: c.rotulo.trim() || ROTULO_DO_CANAL[c.tipo], valor: c.valor.trim(), url: c.url?.trim() || null })

const chaveDoCanal = (c: Canal) => `${c.tipo}|${c.valor.trim().toLowerCase()}`
const nomeDoCanal = (c: Pick<Canal, 'rotulo' | 'valor'>) => `${c.rotulo}: ${c.valor}`

type CampoDaLinha = 'tipo' | 'rotulo' | 'valor' | 'url'

// O campo apontado pelo erro fica com a borda vermelha, além do aria-invalid.
const CAMPO_DA_LINHA = `${inputClass} aria-invalid:border-destructive`

/** "Linha 3: o link precisa começar com https://." → linha 3, campo do link (as mensagens são as de lerCanais). */
function ondeEsta(erro: string): { linha: number; campo: CampoDaLinha } | null {
  const m = /^Linha (\d+): (.*)$/.exec(erro)
  if (!m) return null
  const campo: CampoDaLinha = /\blink\b/.test(m[2]) ? 'url' : /\btipo\b/.test(m[2]) ? 'tipo' : /rótulo/.test(m[2]) ? 'rotulo' : 'valor'
  return { linha: Number(m[1]), campo }
}

/**
 * A lista inteira, pronta para virar a próxima versão. Cada publicação é
 * uma versão nova e completa (a anterior fica na trilha como substituída), e
 * a página só mostra os canais atuais: perfil antigo sai da lista, não ganha
 * aviso de "desativado".
 */
export function EditorDosCanais({ atual, sugestao, endereco, aoPublicar }: {
  atual: VersaoDosCanais | null
  sugestao: Canal[]
  endereco: string
  aoPublicar: (r: Resultado) => void
}) {
  const id = useId()
  const [linhas, setLinhas] = useState<Linha[]>(() => (atual ? paraLinhas(atual.canais, 'v') : [linhaVazia('v0')]))
  const [observacao, setObservacao] = useState(atual?.observacao ?? '')
  const [erros, setErros] = useState<string[]>([])
  const [confirmar, setConfirmar] = useState<Canal[] | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const contador = useRef(0)

  const proxima = (atual?.versao ?? 0) + 1
  const mudou = !atual
    || JSON.stringify(linhas.map(normal)) !== JSON.stringify(atual.canais.map(normal))
    || observacao.trim() !== (atual.observacao ?? '')
  const problemas = erros.map(ondeEsta).filter((x): x is NonNullable<typeof x> => x !== null)
  const comErro = (linha: number, campo?: CampoDaLinha) => problemas.some((p) => p.linha === linha && (!campo || p.campo === campo))
  // Sem versão no ar, "mexida" é ter qualquer coisa digitada.
  const sujo = atual ? mudou : linhas.some((l) => l.rotulo.trim() || l.valor.trim() || l.url.trim()) || Boolean(observacao.trim())

  // Lista mexida e não publicada: o navegador pergunta antes de sair da página.
  useEffect(() => {
    if (!sujo) return
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', segurar)
    return () => window.removeEventListener('beforeunload', segurar)
  }, [sujo])

  const novaChave = () => { contador.current += 1; return `n${contador.current}` }
  const rotuloDa = (l: Linha) => (l.rotulo.trim() || ROTULO_DO_CANAL[l.tipo])
  const focarNaLinha = (chave: string, seletor: string) =>
    requestAnimationFrame(() => document.getElementById(`${id}-linha-${chave}`)?.querySelector<HTMLElement>(seletor)?.focus())

  const mudar = (chave: string, campo: 'tipo' | 'rotulo' | 'valor' | 'url', valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)))

  function adicionar() {
    setLinhas((ls) => [...ls, linhaVazia(novaChave(), 'site', true)])
    setAnuncio(`Linha ${linhas.length + 1} acrescentada.`)
  }

  function mover(i: number, passo: -1 | 1) {
    const j = i + passo
    if (j < 0 || j >= linhas.length) return
    const l = linhas[i]
    setLinhas((ls) => { const n = [...ls]; [n[i], n[j]] = [n[j], n[i]]; return n })
    setAnuncio(`${rotuloDa(l)} foi para a posição ${j + 1} de ${linhas.length}.`)
    // A linha muda de lugar no DOM e o botão perde o foco: devolve ao mesmo botão (ou ao outro, se este ficou desativado).
    const mesmo = passo < 0 ? 'subir' : 'descer'
    const outro = passo < 0 ? 'descer' : 'subir'
    const chegouNaPonta = passo < 0 ? j === 0 : j === linhas.length - 1
    focarNaLinha(l.chave, `[data-acao="${chegouNaPonta ? outro : mesmo}"]`)
  }

  function remover(i: number) {
    const l = linhas[i]
    const vizinha = linhas[i + 1] ?? linhas[i - 1]
    setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))
    setAnuncio(`Linha ${i + 1} (${rotuloDa(l)}) removida.`)
    if (vizinha) focarNaLinha(vizinha.chave, 'select')
    else requestAnimationFrame(() => document.getElementById(`${id}-adicionar`)?.focus())
  }

  function descartar() {
    setLinhas(atual ? paraLinhas(atual.canais, `${novaChave()}-`) : [linhaVazia(novaChave())])
    setObservacao(atual?.observacao ?? '')
    setErros([])
    setAnuncio(atual ? `Mudanças descartadas: a lista voltou à versão ${atual.versao}.` : 'Lista limpa.')
  }

  function usarSugestao() {
    const prefixo = `${novaChave()}-`
    setLinhas(paraLinhas(sugestao, prefixo))
    setErros([])
    setAnuncio(`${sugestao.length} canais do rodapé do site na lista. Confira cada um antes de publicar.`)
    focarNaLinha(`${prefixo}0`, 'select')
  }

  function revisar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { canais, erros: problemas } = lerCanais(linhas.map(({ tipo, rotulo, valor, url }) => ({ tipo, rotulo, valor, url })))
    const todos = [...problemas, ...(observacao.trim().length > 1000 ? ['A observação pode ter até 1.000 caracteres.'] : [])]
    if (!canais || todos.length) {
      setErros(todos)
      // Leva ao campo do primeiro problema; o resumo acima dos botões é anunciado.
      const primeiro = ondeEsta(todos[0] ?? '')
      const linha = primeiro ? linhas[primeiro.linha - 1] : null
      if (primeiro && linha) focarNaLinha(linha.chave, `[data-campo="${primeiro.campo}"]`)
      return
    }
    setErros([])
    setConfirmar(canais)
  }

  // O que muda em relação à versão no ar, para a confirmação.
  const antes = new Map((atual?.canais ?? []).map((c) => [chaveDoCanal(c), c]))
  const depois = new Map((confirmar ?? []).map((c) => [chaveDoCanal(c), c]))
  const entram = (confirmar ?? []).filter((c) => !antes.has(chaveDoCanal(c)))
  const saem = (atual?.canais ?? []).filter((c) => !depois.has(chaveDoCanal(c)))
  const mudam = (confirmar ?? []).filter((c) => { const a = antes.get(chaveDoCanal(c)); return a && (a.rotulo !== c.rotulo || (a.url ?? null) !== (c.url ?? null)) })

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">{atual ? `Nova versão (${proxima})` : 'Primeira versão'}</h2>
        <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
          {atual ? `Parte da versão ${atual.versao}, que está no ar. ` : ''}Liste só os canais <strong className="font-medium text-foreground">atuais</strong>, na ordem em que devem aparecer.
          Perfil antigo ou abandonado não entra: basta não listá-lo. Link de perfil precisa ser do domínio da rede (instagram.com, facebook.com…) — a página existe para desmentir golpe.
        </p>
      </div>

      {!atual && sugestao.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">Para não começar do zero: site, e-mail, telefone, endereço e CNPJ que já estão no rodapé do site.</p>
          <Button type="button" size="sm" variant="outline" className="self-start sm:self-auto" onClick={usarSugestao}><ListChecks className="size-3.5" aria-hidden />Usar os dados do rodapé</Button>
        </div>
      )}

      <form noValidate className="flex flex-col gap-4" onSubmit={revisar}>
        {linhas.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {linhas.map((l, i) => (
              <li key={l.chave}>
                <fieldset id={`${id}-linha-${l.chave}`} className={cn('rounded-lg border p-3', comErro(i + 1) ? 'border-destructive/60 bg-destructive/5' : 'border-border')}>
                  <legend className="sr-only">Linha {i + 1}: {ROTULO_DO_CANAL[l.tipo]}</legend>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground" aria-hidden>Linha {i + 1} · {ROTULO_DO_CANAL[l.tipo]}</span>
                    <div className="flex gap-0.5">
                      <Button type="button" size="icon-sm" variant="ghost" data-acao="subir" aria-label={`Subir a linha ${i + 1} (${rotuloDa(l)})`} disabled={i === 0} onClick={() => mover(i, -1)}>
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" data-acao="descer" aria-label={`Descer a linha ${i + 1} (${rotuloDa(l)})`} disabled={i === linhas.length - 1} onClick={() => mover(i, 1)}>
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remover a linha ${i + 1} (${rotuloDa(l)})`} onClick={() => remover(i)} className="hover:text-destructive">
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-[10rem_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                    <Campo rotulo="Tipo" complemento={`da linha ${i + 1}`}>
                      {(p) => (
                        <select {...p} data-campo="tipo" aria-invalid={comErro(i + 1, 'tipo') || undefined} value={l.tipo} autoFocus={l.nova} onChange={(e) => mudar(l.chave, 'tipo', e.target.value)} className={CAMPO_DA_LINHA}>
                          {TIPOS_DE_CANAL.map((t) => <option key={t} value={t}>{ROTULO_DO_CANAL[t]}</option>)}
                        </select>
                      )}
                    </Campo>
                    <Campo rotulo="Rótulo" complemento={`da linha ${i + 1}`} opcional>
                      {(p) => <input {...p} data-campo="rotulo" aria-invalid={comErro(i + 1, 'rotulo') || undefined} value={l.rotulo} onChange={(e) => mudar(l.chave, 'rotulo', e.target.value)} maxLength={80} placeholder={ROTULO_DO_CANAL[l.tipo]} autoComplete="off" className={CAMPO_DA_LINHA} />}
                    </Campo>
                    <Campo rotulo="Endereço, número ou perfil" complemento={`da linha ${i + 1}`}>
                      {(p) => <input {...p} data-campo="valor" aria-invalid={comErro(i + 1, 'valor') || undefined} value={l.valor} onChange={(e) => mudar(l.chave, 'valor', e.target.value)} maxLength={200} placeholder={EXEMPLO[l.tipo].valor} autoComplete="off" className={CAMPO_DA_LINHA} />}
                    </Campo>
                    <Campo rotulo="Link" complemento={`da linha ${i + 1}`} opcional>
                      {(p) => <input {...p} data-campo="url" aria-invalid={comErro(i + 1, 'url') || undefined} type="url" inputMode="url" value={l.url} onChange={(e) => mudar(l.chave, 'url', e.target.value)} maxLength={300} placeholder={EXEMPLO[l.tipo].url} autoComplete="off" className={CAMPO_DA_LINHA} />}
                    </Campo>
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">A lista está vazia. Acrescente ao menos um canal.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button id={`${id}-adicionar`} type="button" size="sm" variant="outline" onClick={adicionar} disabled={linhas.length >= 60}><Plus className="size-3.5" aria-hidden />Adicionar canal</Button>
          <span className="text-xs text-muted-foreground">{linhas.length} de no máximo 60 · e-mail e telefone não levam link</span>
        </div>
        <p className="sr-only" aria-live="polite">{anuncio}</p>

        <Campo rotulo="Observação" opcional ajuda="Um recado curto que aparece abaixo da lista, na página (até 1.000 caracteres).">
          {(p) => <textarea {...p} value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={1000} className={inputClass} />}
        </Campo>

        <Rodape erros={erros}>
          {atual && mudou && <Button type="button" variant="ghost" onClick={descartar}><RotateCcw className="size-4" aria-hidden />Descartar mudanças</Button>}
          <Button type="submit" disabled={!mudou}><Send className="size-4" aria-hidden />{atual ? 'Publicar nova versão…' : 'Publicar a primeira versão…'}</Button>
        </Rodape>
        {atual && !mudou && <p className="-mt-2 text-xs text-muted-foreground sm:text-right">Nada mudou em relação à versão {atual.versao}, que está no ar.</p>}
      </form>

      {confirmar && (
        <Confirmacao
          titulo={`Publicar a versão ${proxima} da lista`}
          descricao="Canais oficiais"
          largura="max-w-xl"
          confirmar={{ rotulo: `Publicar a versão ${proxima}`, icone: <Send className="size-4" aria-hidden /> }}
          andamento="Publicando e refazendo a página no site…"
          executar={() => publicarCanais(confirmar, observacao.trim())}
          onFeito={(r) => { setConfirmar(null); aoPublicar(r) }}
          onFechar={() => setConfirmar(null)}
        >
          <p>A página <strong className="break-all">{endereco.replace(/^https?:\/\//, '')}</strong> passa a mostrar exatamente esta lista, com {confirmar.length} {confirmar.length === 1 ? 'canal' : 'canais'}.</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            {atual && <li>A versão {atual.versao} continua na <strong className="text-foreground">trilha pública de auditoria</strong>, marcada como substituída: não some e não muda.</li>}
            <li>A versão {proxima} entra na trilha com data, hora e quem publicou, e ganha um código de verificação. Não dá para desfazer: corrigir é publicar outra versão.</li>
            <li>A página lista só os canais atuais. O que sai da lista some da página, sem menção.</li>
          </ul>
          {atual && (entram.length || saem.length || mudam.length ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              {entram.length > 0 && <Mudanca titulo={`Entram (${entram.length})`} classe="text-success" canais={entram} />}
              {saem.length > 0 && <Mudanca titulo={`Saem (${saem.length})`} classe="text-destructive" canais={saem} />}
              {mudam.length > 0 && <Mudanca titulo={`Mudam o rótulo ou o link (${mudam.length})`} classe="text-foreground" canais={mudam} />}
            </div>
          ) : <p className="text-xs text-muted-foreground">Os canais são os mesmos da versão {atual.versao}; muda a ordem ou a observação.</p>)}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Ver a lista completa ({confirmar.length})</summary>
            <div className="mt-2"><ListaDeCanais canais={confirmar} /></div>
          </details>
        </Confirmacao>
      )}
    </Card>
  )
}

function Mudanca({ titulo, classe, canais }: { titulo: string; classe: string; canais: Canal[] }) {
  return (
    <div>
      <p className={cn('font-semibold', classe)}>{titulo}</p>
      <ul className="mt-0.5 list-disc pl-5 text-muted-foreground">{canais.map((c, i) => <li key={i} className="break-words">{nomeDoCanal(c)}</li>)}</ul>
    </div>
  )
}
