'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, CheckCircle2, FileText, Image as ImageIcon, Loader2, MapPin, Mic, Paperclip, RotateCcw, Video, X } from 'lucide-react'
import { areaDoMembro, botaoDoMembro, botaoFantasma, botaoSecundario, campoDoMembro } from '@/components/membro/marca'
import { Recado } from '@/components/membro/pecas'
import { cn } from '@/lib/utils'
import { ACEITOS, AUTORIZACOES, TEMPO_MINIMO_MS, categoriaDoArquivo, tamanhoLegivel, type Autorizacao, type Categoria } from '@/lib/envios/regras'
import { Gravador } from './gravador'
import { acaoDoEnvio, enviarTodos, enviarUm, type Par, type Progresso } from './envio'

type Escolhido = { chave: string; arquivo: File; gravadoNaHora: boolean; categoria: Categoria; previa: string | null }
type Quem = { nome: string; setor: string; whatsapp: string; email: string }
const MEMORIA = 'cvrj_envio_quem'
const PASSOS = ['Você', 'A ação', 'Conte e mande', 'Imagem'] as const

const ICONE: Record<Categoria, typeof ImageIcon> = { foto: ImageIcon, video: Video, audio: Mic, documento: FileText }

function Campo({ id, rotulo, dica, obrigatorio, children }: { id: string; rotulo: string; dica?: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{rotulo}{obrigatorio && <span aria-hidden="true" className="text-primary"> *</span>}</label>
      {dica && <p className="text-sm text-muted-foreground">{dica}</p>}
      {children}
    </div>
  )
}

/**
 * "Mandar uma ação" (docs/envio-de-acoes.md): quatro telas curtas, pensadas
 * para o celular na rua. Os arquivos sobem direto ao armazenamento, com
 * progresso, e o envio chega à Redação como "novo" para a comunicação avaliar.
 */
export function FormularioDeEnvio({ hoje, setores }: { hoje: string; setores: string[] }) {
  const [passo, setPasso] = useState(0)
  const [quem, setQuem] = useState<Quem>({ nome: '', setor: '', whatsapp: '', email: '' })
  const [avisar, setAvisar] = useState(true)
  const [acao, setAcao] = useState({ titulo: '', data: hoje, local: '', pessoas: '', parceiros: '' })
  const [coordenadas, setCoordenadas] = useState<{ latitude: number; longitude: number; precisao: number } | null>(null)
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [relato, setRelato] = useState('')
  const [escolhidos, setEscolhidos] = useState<Escolhido[]>([])
  const [autorizacao, setAutorizacao] = useState<Autorizacao | ''>('')
  const [erro, setErro] = useState('')
  const [fase, setFase] = useState<'preenchendo' | 'enviando' | 'pronto'>('preenchendo')
  const [progresso, setProgresso] = useState<Record<string, Progresso>>({})
  const [enviado, setEnviado] = useState<{ id: string; token: string; protocolo: string; pares: Par[] } | null>(null)
  const [maisOcupado, setMaisOcupado] = useState(false)
  const inicio = useRef(0)
  const topo = useRef<HTMLDivElement>(null)

  // Quem já mandou antes não digita o nome de novo (fica só neste aparelho).
  useEffect(() => {
    inicio.current = Date.now()
    try {
      const guardado = JSON.parse(localStorage.getItem(MEMORIA) ?? 'null') as Quem | null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado?.nome) setQuem({ nome: guardado.nome ?? '', setor: guardado.setor ?? '', whatsapp: guardado.whatsapp ?? '', email: guardado.email ?? '' })
    } catch { /* sem memória: preenche de novo */ }
  }, [])
  // As prévias das fotos são liberadas ao sair da tela (e uma a uma, ao tirar da lista).
  const previas = useRef<string[]>([])
  useEffect(() => () => previas.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const temMidia = escolhidos.some((e) => e.categoria === 'foto' || e.categoria === 'video')
  const totalBytes = useMemo(() => escolhidos.reduce((s, e) => s + e.arquivo.size, 0), [escolhidos])

  function irPara(n: number) {
    setErro('')
    setPasso(n)
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function conferir(n: number): string | null {
    if (n === 0 && quem.nome.trim().length < 2) return 'Diga seu nome.'
    if (n === 1 && acao.titulo.trim().length < 3) return 'Dê um título curto para a ação.'
    if (n === 2 && !relato.trim() && !escolhidos.length) return 'Conte o que aconteceu (escrevendo ou gravando) ou mande ao menos um arquivo.'
    if (n === 3 && !autorizacao) return 'Responda sobre a imagem das pessoas.'
    return null
  }
  function avancar() {
    const problema = conferir(passo)
    if (problema) { setErro(problema); return }
    irPara(passo + 1)
  }

  function adicionar(lista: FileList | File[] | null, gravadoNaHora = false) {
    if (!lista) return
    const novos: Escolhido[] = []
    const recusados: string[] = []
    for (const arquivo of Array.from(lista)) {
      const categoria = categoriaDoArquivo(arquivo.name, arquivo.type)
      if (!categoria) { recusados.push(arquivo.name); continue }
      novos.push({
        chave: `${arquivo.name}-${arquivo.size}-${arquivo.lastModified}-${Math.random()}`, arquivo, gravadoNaHora, categoria,
        previa: categoria === 'foto' && arquivo.type !== 'image/heic' ? URL.createObjectURL(arquivo) : null,
      })
      if (novos.at(-1)?.previa) previas.current.push(novos.at(-1)!.previa!)
    }
    setEscolhidos((atual) => [...atual, ...novos].slice(0, 60))
    setErro(recusados.length ? `Não aceitamos: ${recusados.join(', ')}. Mande fotos, vídeos, áudios, PDF ou documentos do Office.` : '')
  }
  function remover(chave: string) {
    const saindo = escolhidos.find((e) => e.chave === chave)
    if (saindo?.previa) URL.revokeObjectURL(saindo.previa)
    setEscolhidos((atual) => atual.filter((e) => e.chave !== chave))
  }

  function usarLocalizacao() {
    if (!navigator.geolocation) { setErro('Este aparelho não informa a localização. Escreva o local.'); return }
    setBuscandoLocal(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoordenadas({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }); setBuscandoLocal(false) },
      () => { setErro('Não deu para pegar a localização. Escreva o local.'); setBuscandoLocal(false) },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  async function enviar() {
    const problema = conferir(3)
    if (problema) { setErro(problema); return }
    setErro('')
    try { localStorage.setItem(MEMORIA, JSON.stringify(quem)) } catch { /* sem memória */ }
    // O servidor descarta, fingindo sucesso, o que chega em menos de 4 s: espera o resto aqui.
    const falta = TEMPO_MINIMO_MS + 500 - (Date.now() - inicio.current)
    if (falta > 0) await new Promise((r) => setTimeout(r, falta))
    setFase('enviando')
    try {
      const r = await fetch('/api/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _inicio: inicio.current, site: (document.getElementById('envio-site') as HTMLInputElement | null)?.value ?? '',
          nome: quem.nome, setor: quem.setor, whatsapp: quem.whatsapp, email: quem.email, avisar_quando_publicar: avisar,
          titulo: acao.titulo, data_da_acao: acao.data, local: acao.local, pessoas_atendidas: acao.pessoas, parceiros: acao.parceiros,
          latitude: coordenadas?.latitude, longitude: coordenadas?.longitude,
          relato, autorizacao_imagem: autorizacao,
          arquivos: escolhidos.map((e) => ({ nome: e.arquivo.name, tipo: e.arquivo.type, tamanho: e.arquivo.size, gravadoNaHora: e.gravadoNaHora })),
        }),
      })
      const j = await r.json().catch(() => ({})) as { erro?: string; id?: string; token?: string; protocolo?: string; uploads?: { id: string; url: string }[]; concluido?: boolean }
      if (!r.ok || !j.protocolo) throw new Error(j.erro ?? 'Não foi possível enviar agora. Tente de novo.')
      if (!j.id || !j.token) { setFase('pronto'); setEnviado({ id: '', token: '', protocolo: j.protocolo, pares: [] }); return }
      const pares: Par[] = (j.uploads ?? []).map((u, i) => ({ upload: u, arquivo: escolhidos[i].arquivo }))
      setEnviado({ id: j.id, token: j.token, protocolo: j.protocolo, pares })
      setProgresso(Object.fromEntries(pares.map((p) => [p.upload.id, { enviado: 0, total: p.arquivo.size, estado: 'esperando' as const }])))
      if (pares.length) {
        await enviarTodos(j.id, j.token, pares, (id, p) => setProgresso((atual) => ({ ...atual, [id]: { ...atual[id], ...p } })))
        await acaoDoEnvio(j.id, { token: j.token, acao: 'concluir' }).catch(() => undefined)
      }
      setFase('pronto')
    } catch (causa) {
      setFase('preenchendo')
      setErro(causa instanceof Error ? causa.message : 'Não foi possível enviar agora.')
    }
  }

  async function tentarDeNovo(par: Par) {
    if (!enviado) return
    await enviarUm(enviado.id, enviado.token, par, (p) => setProgresso((atual) => ({ ...atual, [par.upload.id]: { ...atual[par.upload.id], ...p } })))
    await acaoDoEnvio(enviado.id, { token: enviado.token, acao: 'concluir' }).catch(() => undefined)
  }

  async function mandarMais(lista: FileList | null) {
    if (!enviado?.id || !lista?.length) return
    const arquivos = Array.from(lista).filter((a) => categoriaDoArquivo(a.name, a.type))
    if (!arquivos.length) { setErro('Esses arquivos não são aceitos.'); return }
    setErro(''); setMaisOcupado(true)
    try {
      const j = await acaoDoEnvio(enviado.id, { token: enviado.token, acao: 'arquivos', arquivos: arquivos.map((a) => ({ nome: a.name, tipo: a.type, tamanho: a.size })) })
      const pares: Par[] = ((j.uploads ?? []) as { id: string; url: string }[]).map((u, i) => ({ upload: u, arquivo: arquivos[i] }))
      setEnviado((atual) => atual ? { ...atual, pares: [...atual.pares, ...pares] } : atual)
      setProgresso((atual) => ({ ...atual, ...Object.fromEntries(pares.map((p) => [p.upload.id, { enviado: 0, total: p.arquivo.size, estado: 'esperando' as const }])) }))
      await enviarTodos(enviado.id, enviado.token, pares, (id, p) => setProgresso((atual) => ({ ...atual, [id]: { ...atual[id], ...p } })))
      await acaoDoEnvio(enviado.id, { token: enviado.token, acao: 'concluir' })
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível mandar mais arquivos.')
    } finally { setMaisOcupado(false) }
  }

  function novoEnvio() {
    setPasso(1); setAcao({ titulo: '', data: hoje, local: '', pessoas: '', parceiros: '' }); setCoordenadas(null); setRelato('')
    setEscolhidos([]); setAutorizacao(''); setErro(''); setFase('preenchendo'); setProgresso({}); setEnviado(null)
    inicio.current = Date.now()
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ------------------------------------------------------------ telas de envio e de pronto

  if (fase !== 'preenchendo' && enviado !== null || fase === 'enviando') {
    const lista = enviado?.pares ?? []
    const prontos = lista.filter((p) => progresso[p.upload.id]?.estado === 'pronto').length
    const falhas = lista.filter((p) => progresso[p.upload.id]?.estado === 'falhou')
    const enviando = fase === 'enviando' || maisOcupado
    return (
      <div ref={topo} className="flex flex-col gap-5">
        {fase === 'pronto' && !maisOcupado ? (
          <Recado tipo={falhas.length ? 'aviso' : 'sucesso'} titulo={falhas.length ? `Recebemos quase tudo — ${enviado?.protocolo}` : `Recebemos! Protocolo ${enviado?.protocolo}`}>
            {falhas.length
              ? <p>{falhas.length} arquivo{falhas.length > 1 ? 's não chegaram' : ' não chegou'}. Tente de novo abaixo quando a rede melhorar.</p>
              : <p>A comunicação vai avaliar e transformar em post ou matéria.{avisar && (quem.whatsapp || quem.email) ? ' Avisamos você quando publicar.' : ''} Obrigado por compartilhar!</p>}
          </Recado>
        ) : (
          <Recado tipo="info" titulo={lista.length ? `Enviando ${prontos} de ${lista.length} arquivos…` : 'Enviando…'}>
            <p>Deixe esta tela aberta até terminar. Com rede fraca, vídeos grandes demoram — e, se a conexão cair, tentamos de novo sozinhos.</p>
          </Recado>
        )}

        {lista.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lista.map((par) => {
              const p = progresso[par.upload.id] ?? { enviado: 0, total: par.arquivo.size, estado: 'esperando' }
              const pct = Math.min(100, Math.round((p.enviado / Math.max(1, p.total)) * 100))
              return (
                <li key={par.upload.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2 text-sm">
                    {p.estado === 'pronto' ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                      : p.estado === 'falhou' ? <X className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                        : <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{par.arquivo.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{p.estado === 'pronto' ? tamanhoLegivel(par.arquivo.size) : p.estado === 'conferindo' ? 'conferindo…' : `${pct}%`}</span>
                    {p.estado === 'falhou' && (
                      <button type="button" onClick={() => tentarDeNovo(par)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted">
                        <RotateCcw className="size-3.5" aria-hidden="true" />Tentar de novo
                      </button>
                    )}
                  </div>
                  {p.estado !== 'pronto' && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Enviando ${par.arquivo.name}`}>
                      <div className={cn('h-full rounded-full transition-[width]', p.estado === 'falhou' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {p.erro && p.estado !== 'pronto' && <p className="mt-1 text-xs text-muted-foreground">{p.erro}</p>}
                </li>
              )
            })}
          </ul>
        )}

        {erro && <Recado tipo="erro">{erro}</Recado>}

        {fase === 'pronto' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {enviado?.id && (
              <label className={cn(botaoSecundario, 'cursor-pointer', maisOcupado && 'pointer-events-none opacity-60')}>
                <Paperclip className="size-4" aria-hidden="true" />Mandar mais arquivos para este envio
                <input type="file" multiple accept={ACEITOS} className="sr-only" onChange={(e) => { mandarMais(e.target.files); e.target.value = '' }} />
              </label>
            )}
            <button type="button" onClick={novoEnvio} disabled={enviando} className={botaoDoMembro}>Mandar outra ação</button>
          </div>
        )}
      </div>
    )
  }

  // ------------------------------------------------------------ o formulário

  return (
    <div ref={topo} className="flex scroll-mt-4 flex-col gap-5">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapas">
        {PASSOS.map((nome, i) => (
          <li key={nome} aria-current={i === passo ? 'step' : undefined} className="flex flex-col gap-1">
            <span className={cn('h-1.5 rounded-full', i <= passo ? 'bg-primary' : 'bg-muted')} />
            <span className={cn('text-[11px] leading-tight', i === passo ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{nome}</span>
          </li>
        ))}
      </ol>

      {/* Armadilha para robôs: pessoa não vê nem preenche. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="envio-site">Site</label><input id="envio-site" name="site" tabIndex={-1} autoComplete="off" />
      </div>

      {passo === 0 && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">Quem está mandando?</legend>
          <Campo id="envio-nome" rotulo="Seu nome" obrigatorio>
            <input id="envio-nome" autoComplete="name" value={quem.nome} onChange={(e) => setQuem({ ...quem, nome: e.target.value })} className={campoDoMembro} />
          </Campo>
          <Campo id="envio-setor" rotulo="Coordenação ou setor">
            <input id="envio-setor" list="envio-setores" value={quem.setor} onChange={(e) => setQuem({ ...quem, setor: e.target.value })} className={campoDoMembro} placeholder="Ex.: Socorro, Escola, Voluntariado" />
            <datalist id="envio-setores">{setores.map((s) => <option key={s} value={s} />)}</datalist>
          </Campo>
          <Campo id="envio-whatsapp" rotulo="WhatsApp" dica="Para a comunicação tirar uma dúvida sobre a ação, se precisar.">
            <input id="envio-whatsapp" type="tel" inputMode="tel" autoComplete="tel" value={quem.whatsapp} onChange={(e) => setQuem({ ...quem, whatsapp: e.target.value })} className={campoDoMembro} placeholder="(21) 99999-0000" />
          </Campo>
          <Campo id="envio-email" rotulo="E-mail (opcional)">
            <input id="envio-email" type="email" inputMode="email" autoComplete="email" value={quem.email} onChange={(e) => setQuem({ ...quem, email: e.target.value })} className={campoDoMembro} />
          </Campo>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
            <span>Me avise quando a ação virar post ou matéria.</span>
          </label>
        </fieldset>
      )}

      {passo === 1 && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">O que aconteceu?</legend>
          <Campo id="envio-titulo" rotulo="Título curto" obrigatorio dica='Ex.: "Ação de prevenção na Central do Brasil".'>
            <input id="envio-titulo" value={acao.titulo} onChange={(e) => setAcao({ ...acao, titulo: e.target.value })} maxLength={200} className={campoDoMembro} />
          </Campo>
          <Campo id="envio-data" rotulo="Quando">
            <input id="envio-data" type="date" max={hoje} value={acao.data} onChange={(e) => setAcao({ ...acao, data: e.target.value })} className={campoDoMembro} />
          </Campo>
          <Campo id="envio-local" rotulo="Onde">
            <input id="envio-local" value={acao.local} onChange={(e) => setAcao({ ...acao, local: e.target.value })} className={campoDoMembro} placeholder="Ex.: Central do Brasil, Centro" />
            <button type="button" onClick={usarLocalizacao} disabled={buscandoLocal} className={cn(botaoFantasma, 'w-fit px-2')}>
              {buscandoLocal ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : coordenadas ? <Check className="size-4 text-success" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
              {coordenadas ? `Localização anotada (±${coordenadas.precisao} m)` : 'Usar minha localização'}
            </button>
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="envio-pessoas" rotulo="Pessoas atendidas (se souber)">
              <input id="envio-pessoas" type="number" inputMode="numeric" min={0} value={acao.pessoas} onChange={(e) => setAcao({ ...acao, pessoas: e.target.value })} className={campoDoMembro} />
            </Campo>
            <Campo id="envio-parceiros" rotulo="Parceiros presentes">
              <input id="envio-parceiros" value={acao.parceiros} onChange={(e) => setAcao({ ...acao, parceiros: e.target.value })} className={campoDoMembro} placeholder="Ex.: Prefeitura, SAMU" />
            </Campo>
          </div>
        </fieldset>
      )}

      {passo === 2 && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">Conte e mande o material</legend>
          <Campo id="envio-relato" rotulo="Conte do seu jeito" dica="Escreva ou grave um áudio — os dois valem. O que foi feito, quem estava, algo marcante.">
            <textarea id="envio-relato" rows={5} value={relato} onChange={(e) => setRelato(e.target.value)} maxLength={20000} className={areaDoMembro} />
          </Campo>
          <Gravador aoGravar={(arquivo) => adicionar([arquivo], true)} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className={cn(botaoDoMembro, 'min-h-14 flex-1 cursor-pointer text-base')}>
              <Paperclip className="size-5" aria-hidden="true" />Escolher fotos, vídeos e arquivos
              <input type="file" multiple accept={ACEITOS} className="sr-only" onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} />
            </label>
            <label className={cn(botaoSecundario, 'min-h-14 cursor-pointer text-base sm:hidden')}>
              <Camera className="size-5" aria-hidden="true" />Tirar foto agora
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} />
            </label>
          </div>

          {escolhidos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{escolhidos.length} arquivo{escolhidos.length > 1 ? 's' : ''} · {tamanhoLegivel(totalBytes)}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {escolhidos.map((e) => {
                  const Icone = ICONE[e.categoria]
                  return (
                    <li key={e.chave} className="relative overflow-hidden rounded-lg border border-border bg-muted">
                      {e.previa
                        ? <img src={e.previa} alt="" className="aspect-square w-full object-cover" />
                        : (
                          <div className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
                            <Icone className="size-6 text-muted-foreground" aria-hidden="true" />
                            <span className="line-clamp-2 break-all text-[10px] leading-tight text-muted-foreground">{e.gravadoNaHora ? 'Áudio gravado' : e.arquivo.name}</span>
                          </div>
                        )}
                      <button type="button" onClick={() => remover(e.chave)} aria-label={`Tirar ${e.arquivo.name}`}
                        className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </fieldset>
      )}

      {passo === 3 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-semibold">As pessoas que aparecem autorizaram o uso da imagem?</legend>
          {!temMidia && <p className="text-sm text-muted-foreground">Você não mandou foto nem vídeo — pode marcar “Não aparece ninguém de frente”.</p>}
          {(Object.keys(AUTORIZACOES) as Autorizacao[]).map((chave) => (
            <label key={chave} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-input bg-background p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
              <input type="radio" name="autorizacao" value={chave} checked={autorizacao === chave} onChange={() => setAutorizacao(chave)} className="mt-1 size-4 accent-[var(--primary)]" />
              <span><span className="block text-sm font-semibold">{AUTORIZACOES[chave].rotulo}</span><span className="block text-sm text-muted-foreground">{AUTORIZACOES[chave].detalhe}</span></span>
            </label>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">
            O que você manda fica guardado pela Cruz Vermelha Brasileira – Filial RJ e só é usado na comunicação da instituição, depois da avaliação da equipe de comunicação.
          </p>
        </fieldset>
      )}

      {erro && <Recado tipo="erro">{erro}</Recado>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {passo > 0 ? <button type="button" onClick={() => irPara(passo - 1)} className={botaoFantasma}>Voltar</button> : <span />}
        {passo < 3
          ? <button type="button" onClick={avancar} className={cn(botaoDoMembro, 'min-h-12 text-base sm:min-w-40')}>Continuar</button>
          : <button type="button" onClick={enviar} className={cn(botaoDoMembro, 'min-h-12 text-base sm:min-w-40')}>Enviar para a comunicação</button>}
      </div>
    </div>
  )
}
