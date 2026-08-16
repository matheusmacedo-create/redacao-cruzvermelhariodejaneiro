'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UploadCloud, Send, ImageIcon, Video, Music, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { coordenacoes } from '@/lib/data'
import { cn } from '@/lib/utils'
import { createPauta } from '@/app/actions/editorial'

const tipos = ['Ação', 'Evento', 'História', 'Ideia', 'Material', 'Sugestão', 'Outro']

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

export default function RegistrarPage() {
  const [tipo, setTipo] = useState('Ação')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Registrar atividade"
        description="Conte para a Comunicação o que aconteceu. Você não precisa escrever uma matéria."
        breadcrumbs={[
          { label: 'Caixa de Entrada', href: '/caixa-de-entrada' },
          { label: 'Registrar atividade' },
        ]}
      />

      <form action={createPauta} className="flex flex-col gap-6">
        <input type="hidden" name="priority" value="medium" />
        <input type="hidden" name="tags" value={tipo} />
        <Card className="flex flex-col gap-5 p-6">
          <Field label="Tipo do registro">
            <div className="flex flex-wrap gap-2">
              {tipos.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    tipo === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Nome da atividade">
            <input required minLength={3} name="title" className={inputClass} placeholder="Ex.: Ação de primeiros socorros no Centro" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Coordenação responsável">
              <select required name="coordination" className={inputClass} defaultValue="">
                <option value="" disabled>
                  Selecione…
                </option>
                {coordenacoes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Data">
              <input name="dueDate" type="date" className={inputClass} />
            </Field>
          </div>

          <Field label="Local">
            <input className={inputClass} placeholder="Ex.: Centro, Rio de Janeiro" />
          </Field>

          <Field label="O que aconteceu?" hint="Escreva livremente, do seu jeito.">
            <textarea
              rows={4}
              name="description"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              placeholder="Descreva a atividade em poucas linhas…"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Quantas pessoas participaram?">
              <input type="number" min={0} className={inputClass} placeholder="0" />
            </Field>
            <Field label="Quantos voluntários participaram?">
              <input type="number" min={0} className={inputClass} placeholder="0" />
            </Field>
          </div>

          <Field label="Existe alguma história que devemos conhecer?">
            <textarea
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              placeholder="Um relato, um momento marcante, uma pessoa que se destacou…"
            />
          </Field>

          <Field label="Pessoa interessante para entrevista">
            <input className={inputClass} placeholder="Nome e contato (opcional)" />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="text-sm font-semibold">Arquivos</h2>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <ImageIcon className="size-3.5" /> Fotos
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <Video className="size-3.5" /> Vídeos
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <Music className="size-3.5" /> Áudios
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <FileText className="size-3.5" /> Documentos
            </span>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-muted">
            <UploadCloud className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste os arquivos aqui</p>
            <p className="text-xs text-muted-foreground">ou</p>
            <span className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium">
              Selecionar arquivos
            </span>
            <input type="file" multiple className="hidden" />
          </label>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="lg" render={<Link href="/caixa-de-entrada" />}>
            Cancelar
          </Button>
          <Button size="lg" className="h-11" type="submit">
            <Send className="size-4" />
            Enviar para Comunicação
          </Button>
        </div>
      </form>
    </div>
  )
}
