'use client'

import { useId, useState, useTransition } from 'react'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { Campo, Dialogo, FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, Rodape, type Resultado } from '@/components/app/transparencia/comum'
import { salvarFichaDoAcervo } from '@/app/actions/acervo'
import { cn } from '@/lib/utils'
import { descricaoDoItem, tituloDoItemNaBusca, type ItemPublico } from '@/lib/acervo/paginas'
import {
  COLECAO, COLECOES, DIREITO, DIREITOS, dataLegivel, faltaParaPublicar, lerItem, slugDoItem, tipoDoArquivo, type Colecao, type Direitos, type Precisao,
} from '@/lib/acervo/regras'
import { Previa, naEntrada, podeIrAoSite, rotuloDoTipo, type ItemNaTela } from './comum'

// ---------------------------------------------------------------- data com precisão

type DataDigitada = { iso: string; completa: string; precisao: Precisao }
type Parte = 'dia' | 'mes' | 'ano'

/** Como a equipe escreve (12/05/1998, 05/1998, 1998) e também AAAA-MM-DD e AAAA-MM. */
const FORMATOS: { re: RegExp; partes: Parte[] }[] = [
  { re: /^(\d{4})$/, partes: ['ano'] },
  { re: /^(\d{1,2})[/.-](\d{4})$/, partes: ['mes', 'ano'] },
  { re: /^(\d{4})-(\d{1,2})$/, partes: ['ano', 'mes'] },
  { re: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, partes: ['dia', 'mes', 'ano'] },
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, partes: ['ano', 'mes', 'dia'] },
]

const diasNoMes = (ano: number, mes: number) =>
  mes === 2 ? ((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31

/**
 * A data digitada vira a data e a precisão que o servidor guarda: "1998" é do
 * ano, "05/1998" do mês, "12/05/1998" do dia. Vazio: sem data.
 */
function lerData(texto: string): DataDigitada | null | 'invalida' {
  const t = texto.replace(/\s+/g, '')
  if (!t) return null
  for (const { re, partes } of FORMATOS) {
    const m = re.exec(t)
    if (!m) continue
    const v: Partial<Record<Parte, number>> = {}
    partes.forEach((p, n) => { v[p] = Number(m[n + 1]) })
    const ano = v.ano ?? 0
    const mes = v.mes ?? 1
    const dia = v.dia ?? 1
    if (ano < 1800 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return 'invalida'
    const precisao: Precisao = v.dia ? 'dia' : v.mes ? 'mes' : 'ano'
    const aaaa = String(ano)
    const mm = String(mes).padStart(2, '0')
    const dd = String(dia).padStart(2, '0')
    return { iso: precisao === 'ano' ? aaaa : precisao === 'mes' ? `${aaaa}-${mm}` : `${aaaa}-${mm}-${dd}`, completa: `${aaaa}-${mm}-${dd}`, precisao }
  }
  return 'invalida'
}

/** A data guardada, do jeito que a equipe escreve: "12/05/1998", "05/1998" ou "1998". */
function dataParaCampo(data: string | null, precisao: Precisao): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '')
  if (!m) return ''
  return precisao === 'ano' ? m[1] : precisao === 'mes' ? `${m[2]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`
}

// ---------------------------------------------------------------- o resto da ficha

/** As palavras-chave como o servidor vai guardar (lerItem): minúsculas, sem repetir, de 2 a 40 letras. */
const palavrasDoCampo = (texto: string) =>
  [...new Set(texto.split(',').map((p) => p.trim().replace(/\s+/g, ' ').toLowerCase()).filter((p) => p.length >= 2 && p.length <= 40))]

const MAXIMO_DE_PALAVRAS = 20

/** O campo vazio vai como nulo, com os espaços arrumados — como lerItem faz. */
const limpo = (t: string) => t.trim().replace(/\s+/g, ' ') || null

const AJUDA_DOS_DIREITOS: Record<Direitos, string> = {
  todos_reservados: 'Ninguém reproduz sem pedir autorização à filial.',
  cc_by: 'Qualquer pessoa pode usar, até com fins comerciais, dando o crédito.',
  cc_by_sa: 'Pode usar dando o crédito; o que for feito a partir dele sai com a mesma licença.',
  cc_by_nc: 'Pode usar dando o crédito, sem fins comerciais.',
  cc_by_nc_nd: 'Pode compartilhar como está, com o crédito, sem fins comerciais e sem alterar.',
  dominio_publico: 'Sem direitos autorais (uma obra muito antiga, por exemplo). Não exige crédito.',
}

function Contador({ n, max }: { n: number; max: number }) {
  return <span className={cn('tabular-nums', n > max * 0.9 && 'text-warning-foreground')}>{n.toLocaleString('pt-BR')}/{max.toLocaleString('pt-BR')}</span>
}

/**
 * A ficha do item: o que o catálogo e a página pública mostram. Ao lado, o que
 * ainda falta para ir ao site (a mesma regra do servidor) e como o item
 * aparece numa busca do Google — os dois mudam enquanto a pessoa digita.
 */
export function FichaDoItem({ item, onFechar, onSalvo }: { item: ItemNaTela; onFechar: () => void; onSalvo: (r: Resultado) => void }) {
  const id = useId()
  const [colecao, setColecao] = useState<Colecao>(item.colecao)
  const [titulo, setTitulo] = useState(item.titulo)
  const [descricao, setDescricao] = useState(item.descricao ?? '')
  const [data, setData] = useState(() => dataParaCampo(item.dataItem, item.dataPrecisao))
  const [autoria, setAutoria] = useState(item.autoria ?? '')
  const [local, setLocal] = useState(item.local ?? '')
  const [direitos, setDireitos] = useState<Direitos>(item.direitos)
  const [credito, setCredito] = useState(item.credito ?? '')
  const [alt, setAlt] = useState(item.textoAlternativo ?? '')
  const [palavras, setPalavras] = useState(item.palavrasChave.join(', '))
  const [video, setVideo] = useState(item.urlVideo ?? '')
  const [erros, setErros] = useState<string[]>([])
  const [salvando, iniciar] = useTransition()

  const tipo = tipoDoArquivo(item.tipoMime)
  const imagem = tipo === 'imagem'
  const comVideo = colecao === 'videos' || tipo === 'video'
  // Depois da primeira publicação, a coleção é parte do endereço público (o banco recusa a troca).
  const colecaoFixa = Boolean(item.publicadoEm)
  // Arquivo já guardado numa pasta com trava: trocar a coleção muda a ficha, não o lugar do arquivo.
  const pastaGuardada = item.chave && !naEntrada(item) ? item.chave.slice(0, item.chave.lastIndexOf('/') + 1) : null
  const lida = lerData(data)
  const valida = lida && lida !== 'invalida' ? lida : null
  const chaves = palavrasDoCampo(palavras)

  const valores = {
    colecao, titulo: titulo.trim().replace(/\s+/g, ' '), descricao: descricao.trim() || null,
    data_item: valida?.completa ?? null, data_precisao: valida?.precisao ?? 'dia',
    autoria: limpo(autoria), local: limpo(local), direitos, credito: limpo(credito), texto_alternativo: limpo(alt),
    palavras_chave: chaves.slice(0, MAXIMO_DE_PALAVRAS), url_video: video.trim() || null,
  }
  const falta = faltaParaPublicar({ ...valores, tipo_mime: item.tipoMime, chave_r2: item.chave, tamanho: item.tamanho })
  const vaiAoSite = podeIrAoSite({ tipoMime: item.tipoMime, colecao })

  // A prévia da busca usa as mesmas funções que montam a página pública.
  const slug = item.slug ?? slugDoItem(valores.titulo || item.titulo)
  const comoNoSite: ItemPublico = {
    id: item.id, colecao, slug, titulo: valores.titulo, descricao: valores.descricao, data_item: valores.data_item, data_precisao: valores.data_precisao,
    autoria: valores.autoria, local: valores.local, direitos, credito: valores.credito, texto_alternativo: valores.texto_alternativo,
    palavras_chave: valores.palavras_chave, url_video: valores.url_video, tipo_mime: item.tipoMime, tamanho: item.tamanho,
    publicado_em: item.publicadoEm ?? '', atualizado_no_site_em: item.atualizadoNoSiteEm, arquivos: null,
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (salvando) return
    const f = new FormData(e.currentTarget)
    const { dados, erros: daRegra } = lerItem(f)
    const anoMaximo = new Date().getFullYear() + 1
    const dataRuim = lida === 'invalida' || (valida !== null && Number(valida.completa.slice(0, 4)) > anoMaximo)
    const problemas = [
      ...(dataRuim ? [`A data não vale: escreva 12/05/1998, 05/1998 ou só o ano, de 1800 a ${anoMaximo}.`] : []),
      // A mensagem de data da regra fala em AAAA-MM-DD; a de cima diz do jeito que a pessoa digita.
      ...daRegra.filter((x) => !x.startsWith('Data inválida')),
    ]
    if (problemas.length || !dados) { setErros(problemas.length ? problemas : ['Confira a ficha.']); return }
    setErros([])
    iniciar(async () => {
      try {
        const r = await salvarFichaDoAcervo(item.id, f)
        if (r.erro) { setErros([r.erro]); return }
        onSalvo(r)
      } catch {
        setErros([FALHA_DE_REDE])
      }
    })
  }

  return (
    <Dialogo titulo="Editar ficha" descricao={item.nomeOriginal ? `Arquivo: ${item.nomeOriginal}` : item.titulo} largura="max-w-4xl" onFechar={onFechar} podeFechar={!salvando}>
      <form className="flex flex-col gap-5" onSubmit={enviar}>
        {item.publico && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-pretty">
            Este item está no site: ao salvar, a página dele é refeita com a ficha nova.
          </p>
        )}

        {/* O que a action lê e não é campo visível: a data já convertida e o que fica escondido para este tipo de arquivo. */}
        <input type="hidden" name="data_item" value={valida?.iso ?? ''} />
        <input type="hidden" name="data_precisao" value={valida?.precisao ?? 'dia'} />
        {colecaoFixa && <input type="hidden" name="colecao" value={item.colecao} />}
        {!imagem && <input type="hidden" name="texto_alternativo" value={alt} />}
        {!comVideo && <input type="hidden" name="url_video" value={video} />}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Campo rotulo="Coleção" ajuda={colecaoFixa ? 'Já foi ao site: a coleção faz parte do endereço público e não muda mais.' : `${COLECAO[colecao].ajuda}${pastaGuardada && colecao !== item.colecao ? ` O arquivo continua em ${pastaGuardada} no bucket: muda só a ficha.` : ''}`}>
              {(p) => (
                <select {...p} name={colecaoFixa ? undefined : 'colecao'} value={colecao} disabled={colecaoFixa} onChange={(e) => setColecao(e.target.value as Colecao)} className={cn(inputClass, 'disabled:opacity-70')}>
                  {COLECOES.map((c) => <option key={c} value={c}>{COLECAO[c].nome}</option>)}
                </select>
              )}
            </Campo>

            <Campo rotulo="Título" ajuda={<>Como aparece no catálogo, no site e na busca. <Contador n={titulo.length} max={160} /></>}>
              {(p) => <input {...p} name="titulo" required minLength={3} maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} data-autofocus className={inputClass} />}
            </Campo>

            <Campo rotulo="Descrição" ajuda={<>O que é, quem aparece, onde, quando e por que importa. Pelo menos 40 caracteres para ir ao site; o começo é o que o Google mostra. Linha em branco separa parágrafos. <Contador n={descricao.length} max={5000} /></>}>
              {(p) => <textarea {...p} name="descricao" rows={5} maxLength={5000} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} />}
            </Campo>

            <Campo
              rotulo="Data"
              opcional
              ajuda={(
                <>
                  Do que o item registra, não do envio. Escreva 12/05/1998, 05/1998 ou só 1998.
                  {valida && <> Aparece como: <strong className="font-medium text-foreground">{dataLegivel(valida.completa, valida.precisao)}</strong>.</>}
                  {lida === 'invalida' && <span className="text-destructive"> Essa data não vale.</span>}
                </>
              )}
            >
              {(p) => <input {...p} value={data} onChange={(e) => setData(e.target.value)} autoComplete="off" placeholder="Ex.: 12/05/1998" aria-invalid={lida === 'invalida' || undefined} className={cn(inputClass, 'sm:max-w-56')} />}
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Autoria" ajuda="Quem fotografou, filmou ou escreveu. Para ir ao site, é preciso a autoria ou o crédito.">
                {(p) => <input {...p} name="autoria" maxLength={200} value={autoria} onChange={(e) => setAutoria(e.target.value)} placeholder="Ex.: Maria Silva" className={inputClass} />}
              </Campo>
              <Campo rotulo="Local" opcional ajuda="Onde foi.">
                {(p) => <input {...p} name="local" maxLength={200} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Sede da filial, no Centro do Rio" className={inputClass} />}
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Direitos de uso" ajuda={`${AJUDA_DOS_DIREITOS[direitos]}${direitos !== 'todos_reservados' && direitos !== 'dominio_publico' ? ' Licença aberta, só se a filial tiver os direitos.' : ''}`}>
                {(p) => (
                  <select {...p} name="direitos" value={direitos} onChange={(e) => setDireitos(e.target.value as Direitos)} className={inputClass}>
                    {DIREITOS.map((d) => <option key={d} value={d}>{DIREITO[d].nome}</option>)}
                  </select>
                )}
              </Campo>
              <Campo rotulo="Crédito" ajuda="Como citar. Em domínio público, não é preciso.">
                {(p) => <input {...p} name="credito" maxLength={200} value={credito} onChange={(e) => setCredito(e.target.value)} placeholder="Ex.: Foto: Maria Silva" className={inputClass} />}
              </Campo>
            </div>

            {imagem && (
              <Campo rotulo="Texto alternativo" ajuda={<>Descreva a imagem para quem não enxerga: quem ou o que aparece e o que acontece. Obrigatório para ir ao site. <Contador n={alt.length} max={300} /></>}>
                {(p) => <textarea {...p} name="texto_alternativo" rows={2} maxLength={300} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Ex.: Voluntárias entregam cestas básicas em frente à sede." className={inputClass} />}
              </Campo>
            )}

            <Campo
              rotulo="Palavras-chave"
              opcional
              ajuda={(
                <>
                  Separe por vírgula; até {MAXIMO_DE_PALAVRAS}.
                  {chaves.length > 0 && (
                    <>
                      {' '}Ficam: <span className="sr-only">{chaves.slice(0, MAXIMO_DE_PALAVRAS).join(', ')}.</span>
                      <span aria-hidden className="mt-1 flex flex-wrap gap-1">
                        {chaves.slice(0, MAXIMO_DE_PALAVRAS).map((c) => <span key={c} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-foreground">{c}</span>)}
                      </span>
                    </>
                  )}
                  {chaves.length > MAXIMO_DE_PALAVRAS && <span className="text-warning-foreground"> Só as {MAXIMO_DE_PALAVRAS} primeiras são guardadas.</span>}
                </>
              )}
            >
              {(p) => <input {...p} name="palavras_chave" value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="Ex.: enchente, doação, voluntários" autoComplete="off" className={inputClass} />}
            </Campo>

            {comVideo && (
              <Campo rotulo="Link do vídeo" ajuda="YouTube ou Vimeo. É por ele que o vídeo aparece no site; o arquivo fica só no acervo.">
                {(p) => <input {...p} name="url_video" type="url" inputMode="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={inputClass} />}
              </Campo>
            )}
          </div>

          <aside className="flex flex-col gap-4" aria-label="Conferência da ficha">
            {(item.previa || imagem) && (
              <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
                <Previa url={item.previa} reserva={item.previaReserva} alt="" rotulo={rotuloDoTipo(item)} />
              </div>
            )}

            <section aria-labelledby={`${id}-site`} className="rounded-lg border border-border p-3">
              <h3 id={`${id}-site`} className="text-sm font-semibold">Para ir ao site</h3>
              {!vaiAoSite ? (
                <p className="mt-1 text-xs text-pretty text-muted-foreground">Este formato fica só no acervo interno: no site vão imagem, PDF e vídeo (pelo link do YouTube ou do Vimeo).</p>
              ) : falta.length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                  {falta.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" aria-hidden /><span className="text-pretty">Falta {f}.</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-success">
                  <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />A ficha tem o que o site precisa.
                </p>
              )}
              {item.publico && vaiAoSite && falta.length > 0 && (
                <p className="mt-2 text-[11px] text-pretty text-muted-foreground">O item continua no site, mas a página sai sem o que falta.</p>
              )}
            </section>

            {vaiAoSite && (
              <section aria-labelledby={`${id}-busca`} className="rounded-lg border border-border p-3">
                <h3 id={`${id}-busca`} className="text-sm font-semibold">Como aparece no Google</h3>
                <div className="mt-2 flex flex-col gap-0.5">
                  <p className="truncate text-[11px] text-muted-foreground">cruzvermelhariodejaneiro.org › acervo › {colecao} › {slug}</p>
                  <p className="text-sm leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{tituloDoItemNaBusca(valores.titulo || item.titulo)}</p>
                  <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{descricaoDoItem(comoNoSite)}</p>
                </div>
                {!item.slug && <p className="mt-2 text-[11px] text-pretty text-muted-foreground">O endereço sai do título na primeira publicação e depois não muda mais.</p>}
              </section>
            )}
          </aside>
        </div>

        <Rodape erros={erros} andamento={salvando ? (item.publico ? 'Salvando e refazendo a página no site…' : 'Salvando…') : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando} {...OCUPADO_SEM_PERDER_FOCO}>
            {salvando && <Loader2 className="animate-spin" aria-hidden />}{salvando ? 'Salvando…' : 'Salvar ficha'}
          </Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}
