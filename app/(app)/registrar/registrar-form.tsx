'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Link2, Send } from 'lucide-react'
import { createPauta } from '@/app/actions/editorial'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { coordenacoes } from '@/lib/data'
import { cn } from '@/lib/utils'

const tipos = ['Ação', 'Evento', 'História', 'Ideia', 'Material', 'Sugestão', 'Outro'] as const
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const areaClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label> }

export function RegistrarForm({ projectId, projectName }: { projectId?: string; projectName?: string }) {
  const [tipo, setTipo] = useState<(typeof tipos)[number]>('Ação')
  return <div className="mx-auto max-w-3xl"><PageHeader title="Registrar atividade" description="Informe o essencial. A ficha será organizada automaticamente para a Comunicação." breadcrumbs={[{ label: 'Caixa de Entrada', href: '/caixa-de-entrada' }, { label: 'Registrar atividade' }]} />
    <form action={createPauta} className="flex flex-col gap-6"><input type="hidden" name="recordType" value={tipo} /><input type="hidden" name="priority" value="medium" />{projectId && <input type="hidden" name="projectId" value={projectId} />}
      {projectId && (
        <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
          <FolderKanban className="size-5 shrink-0 text-primary" />
          <p className="text-sm">Esta pauta será criada dentro do projeto <strong className="font-semibold">{projectName || 'selecionado'}</strong>.</p>
        </Card>
      )}
      <Card className="flex flex-col gap-5 p-6"><Field label="Tipo do registro"><div className="flex flex-wrap gap-2">{tipos.map((item) => <button key={item} type="button" onClick={() => setTipo(item)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', tipo === item ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{item}</button>)}</div></Field>
        <Field label={tipo === 'História' ? 'Título da história' : tipo === 'Ideia' ? 'Nome da ideia' : tipo === 'Material' ? 'Nome do material' : 'Nome da atividade'}><input required minLength={3} name="title" className={inputClass} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Coordenação responsável"><select required name="coordination" className={inputClass} defaultValue=""><option value="" disabled>Selecione…</option>{coordenacoes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Data"><input name="dueDate" type="date" className={inputClass} /></Field></div>
        {(tipo === 'Ação' || tipo === 'Evento') && <><div className="grid gap-5 sm:grid-cols-2"><Field label="Local"><input name="local" className={inputClass} /></Field><Field label="Horário"><input name="schedule" className={inputClass} placeholder="Ex.: 14h às 17h" /></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Pessoas participantes"><input name="participantsCount" type="number" min={0} className={inputClass} /></Field><Field label="Voluntários"><input name="volunteersCount" type="number" min={0} className={inputClass} /></Field></div><Field label="Público atendido"><input name="audience" className={inputClass} /></Field></>}
        {tipo === 'Evento' && <Field label="Organização ou parceiros"><input name="organizer" className={inputClass} /></Field>}
        {tipo === 'História' && <><Field label="História"><textarea required name="story" rows={5} className={areaClass} /></Field><Field label="Pessoa para entrevista"><input name="contact" className={inputClass} placeholder="Nome e contato" /></Field></>}
        {tipo === 'Ideia' && <Field label="Objetivo da ideia"><textarea required name="ideaGoal" rows={4} className={areaClass} /></Field>}
        {tipo === 'Material' && <><Field label="Tipo de material"><select name="materialType" className={inputClass}><option>Texto</option><option>Foto</option><option>Vídeo</option><option>Arte</option><option>Documento</option></select></Field><Field label="O que precisa ser feito?"><textarea required name="request" rows={4} className={areaClass} /></Field></>}
        {(tipo === 'Sugestão' || tipo === 'Outro') && <Field label="Detalhes"><textarea required name="notes" rows={4} className={areaClass} /></Field>}
        <Field label="Descrição" hint="Contexto adicional para a equipe de Comunicação."><textarea name="description" rows={4} className={areaClass} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Objetivo"><input name="objective" className={inputClass} /></Field><Field label="Resultado"><input name="result" className={inputClass} /></Field></div>
      </Card>
      <Card className="flex items-start gap-3 p-5"><Link2 className="mt-0.5 size-5 text-primary" /><div><h2 className="text-sm font-semibold">Fotos, vídeos e documentos</h2><p className="mt-1 text-sm text-muted-foreground">Após enviar, adicione links do Google Drive ou de outras fontes na aba Arquivos da pauta.</p></div></Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" size="lg" render={<Link href="/caixa-de-entrada" />}>Cancelar</Button><Button size="lg" type="submit"><Send className="size-4" />Enviar para Comunicação</Button></div>
    </form></div>
}
