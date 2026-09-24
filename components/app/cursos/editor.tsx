'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, EyeOff, FileText, ImagePlus, Loader2, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import {
  definirCapa, excluirCurso, excluirItem, moverItem, prepararEnvioDeCapa, publicarCurso, salvarAula, salvarCurso, salvarModulo, salvarQuestao,
} from '@/app/actions/cursos'
import { duracaoLegivel, idDoYoutube, miniaturaDoVideo } from '@/lib/cursos/regras'

type R = { erro?: string }

export type CursoNoEditor = {
  id: string; titulo: string; resumo: string | null; descricao: string | null; capa: string | null; carga_horaria: number | null
  nota_minima: number | null; validade_meses: number | null; publicado: boolean
}
export type AulaNoEditor = { id: string; modulo_id: string; titulo: string; youtube_id: string | null; texto: string | null; material_id: string | null; duracao_min: number | null }
export type ModuloNoEditor = { id: string; titulo: string; aulas: AulaNoEditor[] }
export type QuestaoNoEditor = { id: string; enunciado: string; alternativas: string[]; correta: number }
export type ApostilaOpcao = { id: string; titulo: string }

function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<R>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar, setErro }
}

const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)
const Rotulo = ({ t, children, largo }: { t: string; children: React.ReactNode; largo?: boolean }) => (
  <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{t}{children}</label>
)

function Setas({ tabela, id, primeiro, ultimo }: { tabela: 'curso_modulos' | 'curso_aulas' | 'curso_questoes'; id: string; primeiro: boolean; ultimo: boolean }) {
  const { ocupado, executar } = useAcao()
  const classe = 'rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
  return (
    <>
      <button type="button" aria-label="Subir" title="Subir" disabled={ocupado || primeiro} onClick={() => executar(() => moverItem(tabela, id, -1))} className={classe}><ArrowUp className="size-3.5" /></button>
      <button type="button" aria-label="Descer" title="Descer" disabled={ocupado || ultimo} onClick={() => executar(() => moverItem(tabela, id, 1))} className={classe}><ArrowDown className="size-3.5" /></button>
    </>
  )
}

function Excluir({ tabela, id, pergunta }: { tabela: 'curso_modulos' | 'curso_aulas' | 'curso_questoes'; id: string; pergunta: string }) {
  const { ocupado, executar, erro } = useAcao()
  return (
    <>
      <button type="button" aria-label="Excluir" title="Excluir" disabled={ocupado} onClick={() => { if (confirm(pergunta)) executar(() => excluirItem(tabela, id)) }}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40">{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </>
  )
}

// ---------------------------------------------------------------- dados do curso

export function DadosDoCurso({ c }: { c: CursoNoEditor }) {
  const [estado, enviar, enviando] = useActionState(salvarCurso.bind(null, c.id), {})
  return (
    <form action={enviar} className="flex flex-col gap-3" id="dados-do-curso">
      <Rotulo t="Título"><input id="c-titulo" name="titulo" required minLength={3} maxLength={160} defaultValue={c.titulo} className={inputClass} /></Rotulo>
      <Rotulo t="Resumo (aparece no cartão do curso)"><input id="c-resumo" name="resumo" maxLength={300} defaultValue={c.resumo ?? ''} className={inputClass} /></Rotulo>
      <Rotulo t="Descrição (página do curso)"><textarea id="c-descricao" name="descricao" rows={5} maxLength={6000} defaultValue={c.descricao ?? ''} className={inputClass} /></Rotulo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Rotulo t="Carga horária (h)"><input id="c-carga" name="carga_horaria" inputMode="decimal" maxLength={6} defaultValue={c.carga_horaria ?? ''} placeholder="Ex.: 8" className={inputClass} /></Rotulo>
        <Rotulo t="Nota mínima na prova"><input id="c-nota" name="nota_minima" inputMode="numeric" maxLength={3} defaultValue={c.nota_minima ?? ''} placeholder="Sem prova" className={inputClass} /></Rotulo>
        <Rotulo t="Validade do certificado (meses)"><input id="c-validade" name="validade_meses" inputMode="numeric" maxLength={3} defaultValue={c.validade_meses ?? ''} placeholder="Não vence" className={inputClass} /></Rotulo>
      </div>
      <p className="text-xs text-muted-foreground">Com nota mínima, o certificado só sai depois da prova (de 1 a 100). Em branco, sai ao concluir as aulas.</p>
      {estado.erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex items-center justify-end gap-3">
        {estado.ok && !enviando && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />Salvo</span>}
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function CapaDoCurso({ id, capa }: { id: string; capa: string | null }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  return (
    <div className="flex flex-col gap-2" id="capa">
      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        {capa ? <img src={capa} alt="Capa do curso" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">Sem capa</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}{capa ? 'Trocar capa' : 'Enviar capa'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={ocupado} onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > 5 * 1024 * 1024) { setErro('A capa pode ter até 5 MB.'); return }
            executar(async () => {
              const p = await prepararEnvioDeCapa(id, f.type, f.size)
              if (p.erro || !p.caminho || !p.token) return { erro: p.erro ?? 'Falhou.' }
              const { error } = await createClient().storage.from('cursos-capas').uploadToSignedUrl(p.caminho, p.token, f, { contentType: f.type })
              if (error) return { erro: 'O envio falhou.' }
              return definirCapa(id, p.caminho)
            })
          }} />
        </label>
        {capa && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => executar(() => definirCapa(id, null))}>Remover</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Imagem 16:9 (ex.: 1280×720), JPG, PNG ou WEBP, até 5 MB.</p>
      <Erro texto={erro} />
    </div>
  )
}

export function PublicacaoDoCurso({ id, publicado, podeExcluir }: { id: string; publicado: boolean; podeExcluir: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <div className="flex flex-col gap-2" id="publicacao">
      <p className={`flex items-center gap-2 text-sm font-medium ${publicado ? 'text-success' : 'text-muted-foreground'}`}>
        {publicado ? <Eye className="size-4" /> : <EyeOff className="size-4" />}{publicado ? 'Publicado na Área do Voluntário' : 'Rascunho: só a equipe vê'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={publicado ? 'outline' : 'default'} disabled={ocupado} onClick={() => executar(() => publicarCurso(id, !publicado))}>
          {ocupado && <Loader2 className="size-3.5 animate-spin" />}{publicado ? 'Despublicar' : 'Publicar'}
        </Button>
        {podeExcluir && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => { if (confirm('Excluir este curso, com módulos, aulas e prova?')) executar(() => excluirCurso(id)) }}><Trash2 className="size-3.5" />Excluir curso</Button>}
      </div>
      <Erro texto={erro} />
    </div>
  )
}

// ---------------------------------------------------------------- conteúdo

function FormularioDaAula({ cursoId, moduloId, aula, apostilas, onFim }: { cursoId: string; moduloId: string; aula: AulaNoEditor | null; apostilas: ApostilaOpcao[]; onFim: () => void }) {
  const { erro, ocupado, executar } = useAcao()
  const [video, setVideo] = useState(aula?.youtube_id ? `https://youtu.be/${aula.youtube_id}` : '')
  const id = video ? idDoYoutube(video) : null
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-muted/30 p-4" data-form-aula onSubmit={(e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      executar(() => salvarAula(cursoId, moduloId, aula?.id ?? null, f), onFim)
    }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Rotulo t="Título da aula"><input name="titulo" required minLength={2} maxLength={160} defaultValue={aula?.titulo ?? ''} className={inputClass} /></Rotulo>
        <Rotulo t="Duração (min)"><input name="duracao_min" inputMode="numeric" maxLength={3} defaultValue={aula?.duracao_min ?? ''} className={inputClass} /></Rotulo>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Rotulo t="Vídeo do YouTube (não listado)">
          <input name="video" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" className={inputClass} />
          {video && !id && <span className="text-xs font-normal text-destructive">Link não reconhecido.</span>}
        </Rotulo>
        {id ? <img src={miniaturaDoVideo(id)} alt="Miniatura do vídeo" className="aspect-video w-full rounded-md object-cover" /> : <span />}
      </div>
      <Rotulo t="Texto da aula (opcional)"><textarea name="texto" rows={5} maxLength={20000} defaultValue={aula?.texto ?? ''} placeholder="Resumo, roteiro, links de apoio…" className={inputClass} /></Rotulo>
      <Rotulo t="Apostila da aula (opcional)">
        <select name="material_id" defaultValue={aula?.material_id ?? ''} className={inputClass}>
          <option value="">Nenhuma</option>{apostilas.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
        </select>
      </Rotulo>
      <Erro texto={erro} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onFim} disabled={ocupado}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}{aula ? 'Salvar aula' : 'Adicionar aula'}</Button>
      </div>
    </form>
  )
}

function Modulo({ cursoId, m, i, total, apostilas }: { cursoId: string; m: ModuloNoEditor; i: number; total: number; apostilas: ApostilaOpcao[] }) {
  const { erro, ocupado, executar } = useAcao()
  const [editando, setEditando] = useState<string | null>(null)
  const [nome, setNome] = useState<string | null>(null)
  return (
    <Card className="overflow-hidden p-0" data-modulo={m.id}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        {nome === null ? (
          <p className="flex-1 text-sm font-semibold">Módulo {i + 1} · {m.titulo}</p>
        ) : (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); executar(() => salvarModulo(cursoId, m.id, nome), () => setNome(null)) }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} autoFocus aria-label="Nome do módulo" className={`${inputClass} py-1`} />
            <Button type="submit" size="sm" disabled={ocupado}>Salvar</Button>
          </form>
        )}
        <button type="button" aria-label="Renomear módulo" title="Renomear" onClick={() => setNome(m.titulo)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
        <Setas tabela="curso_modulos" id={m.id} primeiro={i === 0} ultimo={i === total - 1} />
        <Excluir tabela="curso_modulos" id={m.id} pergunta={`Excluir o módulo "${m.titulo}" e as ${m.aulas.length} aulas dele?`} />
      </div>
      <Erro texto={erro} />
      <ul className="divide-y divide-border">
        {m.aulas.map((a, j) => (
          <li key={a.id} className="px-4 py-2.5">
            {editando === a.id ? (
              <FormularioDaAula cursoId={cursoId} moduloId={m.id} aula={a} apostilas={apostilas} onFim={() => setEditando(null)} />
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {a.youtube_id ? <PlayCircle className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{[a.duracao_min ? duracaoLegivel(a.duracao_min) : null, a.material_id ? 'apostila' : null].filter(Boolean).join(' · ')}</span>
                <button type="button" aria-label="Editar aula" title="Editar" onClick={() => setEditando(a.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                <Setas tabela="curso_aulas" id={a.id} primeiro={j === 0} ultimo={j === m.aulas.length - 1} />
                <Excluir tabela="curso_aulas" id={a.id} pergunta={`Excluir a aula "${a.titulo}"?`} />
              </div>
            )}
          </li>
        ))}
        <li className="px-4 py-2.5">
          {editando === 'nova' ? <FormularioDaAula cursoId={cursoId} moduloId={m.id} aula={null} apostilas={apostilas} onFim={() => setEditando(null)} />
            : <Button size="sm" variant="ghost" onClick={() => setEditando('nova')}><Plus className="size-3.5" />Nova aula</Button>}
        </li>
      </ul>
    </Card>
  )
}

export function ConteudoDoCurso({ cursoId, modulos, apostilas }: { cursoId: string; modulos: ModuloNoEditor[]; apostilas: ApostilaOpcao[] }) {
  const { erro, ocupado, executar } = useAcao()
  const [novo, setNovo] = useState('')
  return (
    <div className="flex flex-col gap-3" id="conteudo">
      {modulos.map((m, i) => <Modulo key={m.id} cursoId={cursoId} m={m} i={i} total={modulos.length} apostilas={apostilas} />)}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); executar(() => salvarModulo(cursoId, null, novo), () => setNovo('')) }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={160} placeholder={modulos.length ? 'Nome do próximo módulo' : 'Nome do primeiro módulo (ex.: Introdução)'} aria-label="Novo módulo" className={inputClass} />
        <Button type="submit" variant="outline" disabled={ocupado || novo.trim().length < 2}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Módulo</Button>
      </form>
      <Erro texto={erro} />
    </div>
  )
}

// ---------------------------------------------------------------- prova

function FormularioDaQuestao({ cursoId, q, onFim }: { cursoId: string; q: QuestaoNoEditor | null; onFim: () => void }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <form className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-muted/30 p-4" data-form-questao onSubmit={(e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      executar(() => salvarQuestao(cursoId, q?.id ?? null, f), onFim)
    }}>
      <Rotulo t="Pergunta"><textarea name="enunciado" required rows={2} maxLength={1000} defaultValue={q?.enunciado ?? ''} className={inputClass} /></Rotulo>
      <p className="text-xs text-muted-foreground">Alternativas (de 2 a 6). Marque a certa.</p>
      {Array.from({ length: 6 }, (_, i) => (
        <label key={i} className="flex items-center gap-2">
          <input type="radio" name="correta" value={i} defaultChecked={q ? q.correta === i : i === 0} aria-label={`Alternativa ${i + 1} é a certa`} className="accent-[var(--primary)]" />
          <input name={`alt_${i}`} maxLength={300} defaultValue={q?.alternativas[i] ?? ''} placeholder={`Alternativa ${i + 1}${i < 2 ? '' : ' (opcional)'}`} className={`${inputClass} py-1.5`} />
        </label>
      ))}
      <Erro texto={erro} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onFim} disabled={ocupado}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}{q ? 'Salvar questão' : 'Adicionar questão'}</Button>
      </div>
    </form>
  )
}

export function ProvaDoCurso({ cursoId, questoes, notaMinima }: { cursoId: string; questoes: QuestaoNoEditor[]; notaMinima: number | null }) {
  const [editando, setEditando] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3" id="prova">
      {!notaMinima && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Sem nota mínima, o curso não tem prova: o certificado sai ao concluir as aulas. Defina a nota mínima nos dados do curso para usar estas questões.</p>}
      <ol className="flex flex-col gap-2">
        {questoes.map((q, i) => (
          <li key={q.id}>
            {editando === q.id ? <FormularioDaQuestao cursoId={cursoId} q={q} onFim={() => setEditando(null)} /> : (
              <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{q.enunciado}</span>
                  <span className="block text-xs text-muted-foreground">Certa: {q.alternativas[q.correta]} · {q.alternativas.length} alternativas</span>
                </span>
                <button type="button" aria-label="Editar questão" title="Editar" onClick={() => setEditando(q.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                <Setas tabela="curso_questoes" id={q.id} primeiro={i === 0} ultimo={i === questoes.length - 1} />
                <Excluir tabela="curso_questoes" id={q.id} pergunta="Excluir esta questão?" />
              </div>
            )}
          </li>
        ))}
      </ol>
      {editando === 'nova' ? <FormularioDaQuestao cursoId={cursoId} q={null} onFim={() => setEditando(null)} />
        : <Button size="sm" variant="outline" className="self-start" onClick={() => setEditando('nova')}><Plus className="size-3.5" />Nova questão</Button>}
    </div>
  )
}
