'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarPlus, Check, ClipboardList, FileText, FolderKanban, Link2, Loader2, Plus, Send, SlidersHorizontal, Trash2 } from 'lucide-react'
import { registrarPauta } from '@/app/actions/editorial'
import type { Etiqueta } from '@/app/actions/quadro'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { canaisDePublicacao } from '@/lib/data'
import { LIMITE_DE_PUBLICACOES } from '@/lib/editorial/publicacoes-previstas'
import { CORES_DE_ETIQUETA, PRIORIDADES } from '@/lib/pautas/quadro'
import { cn } from '@/lib/utils'

const tipos = ['Ação', 'Evento', 'História', 'Ideia', 'Material', 'Sugestão', 'Outro'] as const
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const areaClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
type PublicacaoPrevista = { chave: string; data: string; hora: string; canal: string; assunto: string }

/** A prioridade como o quadro mostra: mesma cor, sempre com o nome. */
const COR_DA_PRIORIDADE: Record<string, string> = {
  critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-sky-500', low: 'bg-slate-400',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label>
}

function Secao({ icone: Icone, titulo, descricao, children }: { icone: typeof ClipboardList; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-3">
        <Icone className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

export function RegistrarForm({ projectId, projects, pessoas, etiquetas, eu, coordenacoes, minhaCoordenacao }: {
  projectId?: string
  /** Os setores do espaço (Pessoas → Setores). */
  coordenacoes: string[]
  /** O setor de quem registra: vem escolhido. */
  minhaCoordenacao?: string
  projects: { id: string; name: string }[]
  pessoas: { id: string; nome: string }[]
  etiquetas: Etiqueta[]
  eu: string
}) {
  const [estado, enviar, enviando] = useActionState(registrarPauta, null)
  const [tipo, setTipo] = useState<(typeof tipos)[number]>('Ação')
  const [selectedProject, setSelectedProject] = useState(projectId ?? '')
  const [dataDaAtividade, setDataDaAtividade] = useState('')
  const [inicio, setInicio] = useState('')
  const [prioridade, setPrioridade] = useState('medium')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [publicacoes, setPublicacoes] = useState<PublicacaoPrevista[]>([])
  const prefilledProject = projectId ? projects.find((p) => p.id === projectId) : undefined

  const adicionarPublicacao = () => setPublicacoes((atuais) => [...atuais, {
    chave: crypto.randomUUID(),
    // A primeira herda a data da atividade; as seguintes partem da última
    // marcada, que é o passo mais curto para quem agenda uma sequência.
    data: atuais.at(-1)?.data || dataDaAtividade,
    hora: '',
    canal: canaisDePublicacao[0],
    assunto: '',
  }])
  const alterarPublicacao = (chave: string, campo: keyof Omit<PublicacaoPrevista, 'chave'>, valor: string) =>
    setPublicacoes((atuais) => atuais.map((item) => (item.chave === chave ? { ...item, [campo]: valor } : item)))
  const removerPublicacao = (chave: string) => setPublicacoes((atuais) => atuais.filter((item) => item.chave !== chave))
  const alternarEtiqueta = (id: string) => setMarcadas((atual) => {
    const nova = new Set(atual)
    if (nova.has(id)) nova.delete(id); else nova.add(id)
    return nova
  })

  const nomeDoTitulo = tipo === 'História' ? 'Título da história' : tipo === 'Ideia' ? 'Nome da ideia' : tipo === 'Material' ? 'Nome do material' : 'Nome da atividade'

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Registrar atividade" description="Informe o essencial. A ficha é organizada automaticamente para a Comunicação e entra no quadro de pautas, em Entrada." breadcrumbs={[{ label: 'Pautas', href: '/pautas' }, { label: 'Registrar atividade' }]} />
      <form action={enviar} className="flex flex-col gap-6">
        <input type="hidden" name="recordType" value={tipo} />
        <input type="hidden" name="priority" value={prioridade} />
        <input type="hidden" name="projectId" value={selectedProject} />
        {[...marcadas].map((id) => <input key={id} type="hidden" name="etiquetas" value={id} />)}

        {prefilledProject && selectedProject === projectId && (
          <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
            <FolderKanban className="size-5 shrink-0 text-primary" />
            <p className="text-sm">Esta pauta será criada dentro do projeto <strong className="font-semibold">{prefilledProject.name}</strong>. Você pode trocar abaixo, se não for o projeto certo.</p>
          </Card>
        )}

        <Secao icone={ClipboardList} titulo="O que é">
          <Field label="Tipo do registro">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo do registro">
              {tipos.map((item) => (
                <button key={item} type="button" role="radio" aria-checked={tipo === item} onClick={() => setTipo(item)}
                  className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', tipo === item ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {item}
                </button>
              ))}
            </div>
          </Field>
          <Field label={nomeDoTitulo}><input required minLength={3} name="title" className={inputClass} /></Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Coordenação responsável">
              <select required name="coordination" className={inputClass} defaultValue={minhaCoordenacao && coordenacoes.includes(minhaCoordenacao) ? minhaCoordenacao : ''}>
                <option value="" disabled>Selecione…</option>
                {coordenacoes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Projeto" hint="Opcional. Pode ser trocado depois.">
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className={inputClass}>
                <option value="">Nenhum projeto</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        </Secao>

        <Secao icone={SlidersHorizontal} titulo="Planejamento" descricao="Como a pauta aparece no quadro e na linha do tempo do projeto.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Responsável">
              <select name="responsavel" defaultValue={eu} className={inputClass}>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === eu ? `${p.nome} (eu)` : p.nome}</option>)}
              </select>
            </Field>
            <Field label="Prioridade">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prioridade">
                {PRIORIDADES.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={prioridade === p.id} onClick={() => setPrioridade(p.id)}
                    className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium', prioridade === p.id ? 'border-foreground/60 bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                    <span className={cn('h-1.5 w-4 rounded-full', COR_DA_PRIORIDADE[p.id])} aria-hidden="true" />{p.rotulo}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Início" hint="Opcional. Com início e prazo, a pauta vira uma barra na linha do tempo.">
              <input name="startDate" type="date" value={inicio} max={dataDaAtividade || undefined} onChange={(e) => setInicio(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Data da atividade / prazo" hint="Entra no calendário e é o prazo do cartão no quadro.">
              <input name="dueDate" type="date" value={dataDaAtividade} min={inicio || undefined} onChange={(e) => setDataDaAtividade(e.target.value)} className={inputClass} />
            </Field>
          </div>
          {etiquetas.length > 0 && (
            <Field label="Etiquetas" hint="As mesmas do quadro de pautas.">
              <div className="flex flex-wrap gap-2">
                {etiquetas.map((e) => {
                  const ligada = marcadas.has(e.id)
                  return (
                    <button key={e.id} type="button" aria-pressed={ligada} onClick={() => alternarEtiqueta(e.id)}
                      className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white transition', ligada ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'opacity-60 hover:opacity-100')}
                      style={{ backgroundColor: CORES_DE_ETIQUETA[e.cor]?.hex ?? CORES_DE_ETIQUETA.cinza.hex }}>
                      {ligada && <Check className="size-3" />}{e.nome}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
        </Secao>

        <Secao icone={FileText} titulo="Detalhes">
          {(tipo === 'Ação' || tipo === 'Evento') && <>
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Local"><input name="local" className={inputClass} /></Field><Field label="Horário"><input name="schedule" className={inputClass} placeholder="Ex.: 14h às 17h" /></Field></div>
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Pessoas participantes"><input name="participantsCount" type="number" min={0} className={inputClass} /></Field><Field label="Voluntários"><input name="volunteersCount" type="number" min={0} className={inputClass} /></Field></div>
            <Field label="Público atendido"><input name="audience" className={inputClass} /></Field>
          </>}
          {tipo === 'Evento' && <Field label="Organização ou parceiros"><input name="organizer" className={inputClass} /></Field>}
          {tipo === 'História' && <><Field label="História"><textarea required name="story" rows={5} className={areaClass} /></Field><Field label="Pessoa para entrevista"><input name="contact" className={inputClass} placeholder="Nome e contato" /></Field></>}
          {tipo === 'Ideia' && <Field label="Objetivo da ideia"><textarea required name="ideaGoal" rows={4} className={areaClass} /></Field>}
          {tipo === 'Material' && <><Field label="Tipo de material"><select name="materialType" className={inputClass}><option>Texto</option><option>Foto</option><option>Vídeo</option><option>Arte</option><option>Documento</option></select></Field><Field label="O que precisa ser feito?"><textarea required name="request" rows={4} className={areaClass} /></Field></>}
          {(tipo === 'Sugestão' || tipo === 'Outro') && <Field label="Detalhes"><textarea required name="notes" rows={4} className={areaClass} /></Field>}
          <Field label="Descrição" hint="Contexto adicional para a equipe de Comunicação."><textarea name="description" rows={4} className={areaClass} /></Field>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Objetivo"><input name="objective" className={inputClass} /></Field><Field label="Resultado"><input name="result" className={inputClass} /></Field></div>
        </Secao>

        <Secao icone={CalendarPlus} titulo="Publicações no calendário editorial"
          descricao="Já sabe quando isso precisa sair? Marque aqui. Cada data entra no calendário editorial e nasce com um conteúdo em rascunho, com todo o contexto deste registro dentro.">
          {publicacoes.map((pub, indice) => (
            <div key={pub.chave} className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Publicação {indice + 1}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removerPublicacao(pub.chave)} aria-label={`Remover publicação ${indice + 1}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Data da publicação">
                  <input required name="pubData" type="date" value={pub.data} onChange={(e) => alterarPublicacao(pub.chave, 'data', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Horário" hint="Opcional.">
                  <input name="pubHora" type="time" value={pub.hora} onChange={(e) => alterarPublicacao(pub.chave, 'hora', e.target.value)} className={inputClass} />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Canal">
                  <select name="pubCanal" value={pub.canal} onChange={(e) => alterarPublicacao(pub.chave, 'canal', e.target.value)} className={inputClass}>
                    {canaisDePublicacao.map((canal) => <option key={canal}>{canal}</option>)}
                  </select>
                </Field>
                <Field label="Assunto da publicação" hint="Em branco, usamos o nome da atividade.">
                  <input name="pubAssunto" maxLength={200} value={pub.assunto} onChange={(e) => alterarPublicacao(pub.chave, 'assunto', e.target.value)} className={inputClass} />
                </Field>
              </div>
            </div>
          ))}

          {!publicacoes.length && (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma publicação prevista. Este registro segue só como pauta.
            </p>
          )}

          <div>
            <Button type="button" variant="ghost" onClick={adicionarPublicacao} disabled={publicacoes.length >= LIMITE_DE_PUBLICACOES}>
              <Plus className="size-4" />Adicionar publicação
            </Button>
            {publicacoes.length >= LIMITE_DE_PUBLICACOES && (
              <p className="mt-2 text-xs text-muted-foreground">Máximo de {LIMITE_DE_PUBLICACOES} publicações por registro.</p>
            )}
          </div>
        </Secao>

        <Card className="flex items-start gap-3 p-5"><Link2 className="mt-0.5 size-5 text-primary" /><div><h2 className="text-sm font-semibold">Fotos, vídeos e documentos</h2><p className="mt-1 text-sm text-muted-foreground">Depois de enviar, adicione links do Google Drive ou de outras fontes na aba Arquivos da pauta.</p></div></Card>

        {estado?.erro && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />{estado.erro}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="lg" render={<Link href="/pautas" />}>Cancelar</Button>
          <Button size="lg" type="submit" disabled={enviando}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar para Comunicação
          </Button>
        </div>
      </form>
    </div>
  )
}
