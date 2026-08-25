'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, FolderKanban, Link2, Plus, Send, Trash2 } from 'lucide-react'
import { createPauta } from '@/app/actions/editorial'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { canaisDePublicacao, coordenacoes } from '@/lib/data'
import { LIMITE_DE_PUBLICACOES } from '@/lib/editorial/publicacoes-previstas'
import { cn } from '@/lib/utils'

const tipos = ['Ação', 'Evento', 'História', 'Ideia', 'Material', 'Sugestão', 'Outro'] as const
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const areaClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
type PublicacaoPrevista = { chave: string; data: string; hora: string; canal: string; assunto: string }

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label> }

export function RegistrarForm({ projectId, projects }: { projectId?: string; projects: { id: string; name: string }[] }) {
  const [tipo, setTipo] = useState<(typeof tipos)[number]>('Ação')
  const [selectedProject, setSelectedProject] = useState(projectId ?? '')
  const [dataDaAtividade, setDataDaAtividade] = useState('')
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
  return <div className="mx-auto max-w-3xl"><PageHeader title="Registrar atividade" description="Informe o essencial. A ficha será organizada automaticamente para a Comunicação." breadcrumbs={[{ label: 'Caixa de Entrada', href: '/caixa-de-entrada' }, { label: 'Registrar atividade' }]} />
    <form action={createPauta} className="flex flex-col gap-6"><input type="hidden" name="recordType" value={tipo} /><input type="hidden" name="priority" value="medium" /><input type="hidden" name="projectId" value={selectedProject} />
      {prefilledProject && selectedProject === projectId && (
        <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
          <FolderKanban className="size-5 shrink-0 text-primary" />
          <p className="text-sm">Esta pauta será criada dentro do projeto <strong className="font-semibold">{prefilledProject.name}</strong>. Você pode trocar abaixo, se não for o projeto certo.</p>
        </Card>
      )}
      <Card className="flex flex-col gap-5 p-6">
        <Field label="Projeto" hint="Selecione se esta pauta pertence a um projeto. Pode ser alterado depois, a qualquer momento.">
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className={inputClass}>
            <option value="">Nenhum projeto</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo do registro"><div className="flex flex-wrap gap-2">{tipos.map((item) => <button key={item} type="button" onClick={() => setTipo(item)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', tipo === item ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{item}</button>)}</div></Field>
        <Field label={tipo === 'História' ? 'Título da história' : tipo === 'Ideia' ? 'Nome da ideia' : tipo === 'Material' ? 'Nome do material' : 'Nome da atividade'}><input required minLength={3} name="title" className={inputClass} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Coordenação responsável"><select required name="coordination" className={inputClass} defaultValue=""><option value="" disabled>Selecione…</option>{coordenacoes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Data"><input name="dueDate" type="date" value={dataDaAtividade} onChange={(e) => setDataDaAtividade(e.target.value)} className={inputClass} /></Field></div>
        {(tipo === 'Ação' || tipo === 'Evento') && <><div className="grid gap-5 sm:grid-cols-2"><Field label="Local"><input name="local" className={inputClass} /></Field><Field label="Horário"><input name="schedule" className={inputClass} placeholder="Ex.: 14h às 17h" /></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Pessoas participantes"><input name="participantsCount" type="number" min={0} className={inputClass} /></Field><Field label="Voluntários"><input name="volunteersCount" type="number" min={0} className={inputClass} /></Field></div><Field label="Público atendido"><input name="audience" className={inputClass} /></Field></>}
        {tipo === 'Evento' && <Field label="Organização ou parceiros"><input name="organizer" className={inputClass} /></Field>}
        {tipo === 'História' && <><Field label="História"><textarea required name="story" rows={5} className={areaClass} /></Field><Field label="Pessoa para entrevista"><input name="contact" className={inputClass} placeholder="Nome e contato" /></Field></>}
        {tipo === 'Ideia' && <Field label="Objetivo da ideia"><textarea required name="ideaGoal" rows={4} className={areaClass} /></Field>}
        {tipo === 'Material' && <><Field label="Tipo de material"><select name="materialType" className={inputClass}><option>Texto</option><option>Foto</option><option>Vídeo</option><option>Arte</option><option>Documento</option></select></Field><Field label="O que precisa ser feito?"><textarea required name="request" rows={4} className={areaClass} /></Field></>}
        {(tipo === 'Sugestão' || tipo === 'Outro') && <Field label="Detalhes"><textarea required name="notes" rows={4} className={areaClass} /></Field>}
        <Field label="Descrição" hint="Contexto adicional para a equipe de Comunicação."><textarea name="description" rows={4} className={areaClass} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Objetivo"><input name="objective" className={inputClass} /></Field><Field label="Resultado"><input name="result" className={inputClass} /></Field></div>
      </Card>
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-3">
          <CalendarPlus className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Publicações no calendário editorial</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Já sabe quando isso precisa sair? Marque aqui. Cada data entra no calendário editorial e nasce com um
              conteúdo em rascunho, com todo o contexto deste registro dentro — é o que a Comunicação abre para produzir e o
              Marketing abre para aprovar.
            </p>
          </div>
        </div>

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
      </Card>
      <Card className="flex items-start gap-3 p-5"><Link2 className="mt-0.5 size-5 text-primary" /><div><h2 className="text-sm font-semibold">Fotos, vídeos e documentos</h2><p className="mt-1 text-sm text-muted-foreground">Após enviar, adicione links do Google Drive ou de outras fontes na aba Arquivos da pauta.</p></div></Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" size="lg" render={<Link href="/caixa-de-entrada" />}>Cancelar</Button><Button size="lg" type="submit"><Send className="size-4" />Enviar para Comunicação</Button></div>
    </form></div>
}
