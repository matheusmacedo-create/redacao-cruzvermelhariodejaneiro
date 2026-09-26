'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { salvarPerfilSocial } from '@/app/actions/perfil-social'
import {
  CANAIS, CAPAS, LIMITES, lerHabilidades, TIPOS_DE_CONTATO, VISIBILIDADES,
  type Canal, type Capa, type Contato, type TipoDeContato, type Visibilidade,
} from '@/lib/pessoas/perfil'
import { cn } from '@/lib/utils'

export type PerfilEditavel = {
  id: string
  bio: string
  pronomes: string
  capa: Capa
  disponibilidade: string
  habilidades: string[]
  contatos: Contato[]
  mostrarMetricas: boolean
}

type Linha = { chave: number; tipo: TipoDeContato; canal: Canal; valor: string; rotulo: string; visibilidade: Visibilidade }

const campo = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const rotuloDoCampo = 'mb-1 block text-sm font-medium'

let proxima = 1

export function EditorDePerfil({ inicial }: { inicial: PerfilEditavel }) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()
  const [bio, setBio] = useState(inicial.bio)
  const [pronomes, setPronomes] = useState(inicial.pronomes)
  const [capa, setCapa] = useState<Capa>(inicial.capa)
  const [disponibilidade, setDisponibilidade] = useState(inicial.disponibilidade)
  const [habilidades, setHabilidades] = useState(inicial.habilidades.join(', '))
  const [mostrar, setMostrar] = useState(inicial.mostrarMetricas)
  const [linhas, setLinhas] = useState<Linha[]>(() => inicial.contatos.map((c) => ({ ...c, chave: proxima++ })))
  const [erros, setErros] = useState<Record<number, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const mudar = (chave: number, campos: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)))
  const adicionar = (tipo: TipoDeContato) => setLinhas((ls) => ls.length >= LIMITES.contatos ? ls : [...ls, {
    chave: proxima++, tipo, canal: tipo === 'institucional' ? 'email' : 'whatsapp', valor: '', rotulo: '',
    // Contato pessoal nasce restrito: quem quiser abrir para a equipe abre.
    visibilidade: tipo === 'institucional' ? 'equipe' : 'admins',
  }])

  const salvar = () => iniciar(async () => {
    setErro(null); setErros({})
    const r = await salvarPerfilSocial({
      bio, pronomes, capa, disponibilidade, habilidades: lerHabilidades(habilidades), mostrarMetricas: mostrar,
      contatos: linhas.map(({ tipo, canal, valor, rotulo, visibilidade }) => ({ tipo, canal, valor, rotulo, visibilidade })),
    })
    if (r.erro) {
      setErro(r.erro)
      // O servidor devolve o erro pela posição na lista enviada.
      if (r.erros) setErros(Object.fromEntries(Object.entries(r.erros).map(([i, m]) => [linhas[Number(i)]?.chave ?? -1, m])))
      return
    }
    router.push(`/pessoas/${inicial.id}`)
    router.refresh()
  })

  const grupo = (tipo: TipoDeContato) => linhas.filter((l) => l.tipo === tipo)

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5" data-ajuda="diretorio.editor-apresentacao">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Apresentação</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="bio" className={rotuloDoCampo}>Sobre você</label>
            <textarea id="bio" value={bio} maxLength={LIMITES.bio} rows={4} onChange={(e) => setBio(e.target.value)}
              placeholder="O que você faz na Cruz Vermelha, em que projetos está, como prefere ser procurado…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/{LIMITES.bio}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pronomes" className={rotuloDoCampo}>Pronomes <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input id="pronomes" value={pronomes} maxLength={LIMITES.pronomes} onChange={(e) => setPronomes(e.target.value)} placeholder="ela/dela, ele/dele…" className={campo} />
            </div>
            <div>
              <label htmlFor="disponibilidade" className={rotuloDoCampo}>Disponibilidade</label>
              <input id="disponibilidade" value={disponibilidade} maxLength={LIMITES.disponibilidade} onChange={(e) => setDisponibilidade(e.target.value)} placeholder="Seg a sex, 9h às 17h" className={campo} />
            </div>
          </div>
          <div>
            <label htmlFor="habilidades" className={rotuloDoCampo}>Pode ajudar com</label>
            <input id="habilidades" value={habilidades} onChange={(e) => setHabilidades(e.target.value)} placeholder="Fotografia, primeiros socorros, planilhas…" className={campo} />
            <p className="mt-1 text-xs text-muted-foreground">Separe por vírgula. Até {LIMITES.habilidades}.</p>
          </div>
          <div>
            <span className={rotuloDoCampo}>Capa</span>
            <div role="radiogroup" aria-label="Cor da capa" className="flex flex-wrap gap-2">
              {(Object.keys(CAPAS) as Capa[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={capa === c} aria-label={CAPAS[c].rotulo} title={CAPAS[c].rotulo} onClick={() => setCapa(c)}
                  className={cn('h-10 w-16 rounded-lg bg-gradient-to-br ring-offset-2 ring-offset-background', CAPAS[c].classe, capa === c ? 'ring-2 ring-foreground' : 'hover:ring-2 hover:ring-border')} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {(['institucional', 'pessoal'] as TipoDeContato[]).map((tipo) => (
        <Card key={tipo} className="p-5" data-ajuda={tipo === 'institucional' ? 'diretorio.editor-institucionais' : 'diretorio.editor-pessoais'}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {tipo === 'institucional' ? <Building2 className="size-4" /> : <Users className="size-4" />}{TIPOS_DE_CONTATO[tipo]}
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={() => adicionar(tipo)} disabled={linhas.length >= LIMITES.contatos}><Plus className="size-3.5" />Adicionar</Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {tipo === 'institucional'
              ? 'Ramal, e-mail do setor, WhatsApp de trabalho. O e-mail e o telefone da sua ficha na Equipe já aparecem sozinhos.'
              : 'Seus contatos particulares. Cada um nasce visível só para administradores: abra para o setor ou para a equipe se quiser.'}
          </p>
          {grupo(tipo).length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">Nenhum contato {tipo === 'institucional' ? 'institucional' : 'pessoal'}.</p>}
          <ul className="flex flex-col gap-3">
            {grupo(tipo).map((l) => (
              <li key={l.chave} className={cn('rounded-lg border p-3', erros[l.chave] ? 'border-destructive/60' : 'border-border')}>
                <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <select aria-label="Canal" value={l.canal} onChange={(e) => mudar(l.chave, { canal: e.target.value as Canal })} className={campo}>
                    {(Object.keys(CANAIS) as Canal[]).map((c) => <option key={c} value={c}>{CANAIS[c].rotulo}</option>)}
                  </select>
                  <input aria-label="Contato" value={l.valor} maxLength={LIMITES.valor} onChange={(e) => mudar(l.chave, { valor: e.target.value })} placeholder={CANAIS[l.canal].exemplo} className={campo} />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                  <input aria-label="Descrição (opcional)" value={l.rotulo} maxLength={LIMITES.rotulo} onChange={(e) => mudar(l.chave, { rotulo: e.target.value })} placeholder="Descrição (opcional): Recepção, Celular…" className={campo} />
                  <select aria-label="Quem vê" value={l.visibilidade} onChange={(e) => mudar(l.chave, { visibilidade: e.target.value as Visibilidade })} className={campo} title={VISIBILIDADES[l.visibilidade].ajuda}>
                    {(Object.keys(VISIBILIDADES) as Visibilidade[]).map((v) => <option key={v} value={v}>{VISIBILIDADES[v].rotulo}</option>)}
                  </select>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label="Remover contato" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}><Trash2 className="size-4" /></Button>
                </div>
                {erros[l.chave] && <p role="alert" className="mt-2 text-xs text-destructive">{erros[l.chave]}</p>}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="p-5" data-ajuda="diretorio.editor-metricas">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            <span className="font-medium">Mostrar minhas métricas no perfil</span>
            <span className="block text-muted-foreground">Tempo de resposta no chat e nas aprovações, chamados e produção. Desligado, só você e administradores veem.</span>
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <p role="alert" className="mr-auto text-sm text-destructive">{erro}</p>}
        <Button variant="outline" render={<Link href={`/pessoas/${inicial.id}`} />}>Cancelar</Button>
        <Button size="lg" disabled={salvando} onClick={salvar} data-ajuda="diretorio.editor-salvar">{salvando ? 'Salvando…' : 'Salvar perfil'}</Button>
      </div>
    </div>
  )
}
