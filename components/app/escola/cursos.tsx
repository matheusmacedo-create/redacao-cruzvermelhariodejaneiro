'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { classificarProduto, salvarCurso } from '@/app/actions/escola-cursos'

type CursoEditavel = { id: string; nome: string; ativo: boolean; pagina_url: string | null; descricao: string | null }

/** Criar ou editar um curso do catálogo: nome, página do curso, situação. */
export function FormularioDoCurso({ curso }: { curso?: CursoEditavel }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <>
      {curso
        ? <Button variant="outline" size="sm" onClick={() => setAberto(true)} data-editar-curso><Pencil className="size-3.5" />Editar curso</Button>
        : <Button onClick={() => setAberto(true)} data-ajuda="escola-cursos.novo" data-novo-curso><Plus className="size-4" />Novo curso</Button>}
      {aberto && (
        <Dialog titulo={curso ? `Editar: ${curso.nome}` : 'Novo curso'} descricao="O nome junta as vendas da Únicopag ao curso: use o nome do produto, sem “Taxa de inscrição”." onFechar={() => !ocupado && setAberto(false)}>
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            iniciar(async () => {
              setErro('')
              const r = await salvarCurso(dados)
              if (r.erro) { setErro(r.erro); return }
              setAberto(false)
              if (!curso && r.id) router.push(`/escola/marketing/cursos/${r.id}`)
              else router.refresh()
            })
          }}>
            {curso && <input type="hidden" name="id" value={curso.id} />}
            <label className="flex flex-col gap-1.5 text-sm font-medium">Nome do curso
              <input name="nome" required minLength={2} maxLength={120} defaultValue={curso?.nome ?? ''} className={inputClass} placeholder="Ex.: Punção Venosa" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Página do curso
              <input name="pagina_url" type="url" maxLength={500} defaultValue={curso?.pagina_url ?? ''} className={inputClass} placeholder="https://…" />
              <span className="text-xs font-normal text-muted-foreground">A página de venda ou de inscrição, onde o aluno se matricula.</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Descrição curta
              <textarea name="descricao" maxLength={500} rows={2} defaultValue={curso?.descricao ?? ''} className={`${inputClass} h-auto py-2`} placeholder="Para quem é, carga horária, certificação…" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Situação
              <select name="ativo" defaultValue={curso && !curso.ativo ? 'nao' : 'sim'} className={inputClass}>
                <option value="sim">Ativo (com turmas e vendas)</option>
                <option value="nao">Inativo (fora de oferta)</option>
              </select>
            </label>
            {curso && <p className="text-xs text-muted-foreground">Mudar o nome muda também o curso gravado nas campanhas dele.</p>}
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

/** Um produto da Únicopag que não bateu sozinho com um curso: associar, ignorar ou voltar ao automático. */
export function ClassificarProduto({ produto, cursos, atual }: { produto: string; cursos: { id: string; nome: string }[]; atual: string }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <select aria-label={`Curso do produto ${produto}`} defaultValue={atual} disabled={ocupado} className={`${inputClass} h-8 max-w-56 py-1 text-xs`} data-classificar-produto
        onChange={(e) => {
          const valor = e.target.value
          iniciar(async () => { const r = await classificarProduto(produto, valor); if (r.erro) setErro(r.erro); else { setErro(''); router.refresh() } })
        }}>
        <option value="">Automático (pelo nome)</option>
        {cursos.map((c) => <option key={c.id} value={c.id}>Conta em: {c.nome}</option>)}
        <option value="ignorar">Ignorar (teste, taxa avulsa…)</option>
      </select>
      {ocupado && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />}
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}
