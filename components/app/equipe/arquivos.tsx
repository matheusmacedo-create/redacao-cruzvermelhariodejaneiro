'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ExternalLink, FileText, Image as Imagem, Loader2, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import { excluirArquivo, prepararEnvioDeArquivo, registrarArquivo } from '@/app/actions/equipe'
import {
  CATEGORIAS_DE_ARQUIVO, TAMANHO_MAXIMO, ehTipoAceito, lerArquivo, situacaoDaValidade, tamanhoLegivel, type CategoriaDeArquivo,
} from '@/lib/rh/regras'

export type ArquivoDaFicha = {
  id: string; categoria: CategoriaDeArquivo; titulo: string; data_documento: string | null; validade: string | null; observacao: string | null
  nome_original: string; tipo: string; tamanho: number; sha256: string | null; enviado_por: string | null; created_at: string
  excluido_em: string | null; excluido_por: string | null; motivo_exclusao: string | null
}

const DATA = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const QUANDO = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function Validade({ validade, hoje }: { validade: string | null; hoje: string }) {
  if (!validade) return null
  const s = situacaoDaValidade(validade, hoje)
  const classe = s === 'vencida' ? 'bg-destructive/10 text-destructive' : s === 'vence_logo' ? 'bg-warning/20 text-warning-foreground' : 'bg-success/15 text-success'
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${classe}`}>{s === 'vencida' ? 'Vencido' : 'Válido'} até {DATA(validade)}</span>
}

/**
 * O dossiê da pessoa. O envio tem dois passos: o servidor dá um link de uso
 * único, o navegador manda o arquivo direto ao Storage, e o servidor registra
 * e confere o conteúdo. Abrir passa pelo servidor, que registra quem abriu.
 */
export function ArquivosDaFicha({ membroId, arquivos, categorias, hoje, nomes }: {
  membroId: string; arquivos: ArquivoDaFicha[]; categorias: CategoriaDeArquivo[]; hoje: string; nomes: Record<string, string>
}) {
  const router = useRouter()
  const [novo, setNovo] = useState(false)
  const [categoria, setCategoria] = useState<CategoriaDeArquivo>(categorias[0])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const [excluindo, setExcluindo] = useState<ArquivoDaFicha | null>(null)
  const [motivo, setMotivo] = useState('')
  const formulario = useRef<HTMLFormElement>(null)

  const ativos = arquivos.filter((a) => !a.excluido_em)
  const excluidos = arquivos.filter((a) => a.excluido_em)
  const grupos = categorias.map((c) => ({ c, lista: ativos.filter((a) => a.categoria === c) })).filter((g) => g.lista.length)

  const enviar = (f: FormData) => iniciar(async () => {
    setErro('')
    if (!arquivo) { setErro('Escolha o arquivo.'); return }
    if (!ehTipoAceito(arquivo.type)) { setErro('Envie PDF, JPG, PNG ou WEBP.'); return }
    if (arquivo.size > TAMANHO_MAXIMO) { setErro(`O arquivo tem ${tamanhoLegivel(arquivo.size)}; o limite é 20 MB.`); return }
    const { erros } = lerArquivo(f, hoje)
    if (erros.length) { setErro(erros.join(' ')); return }
    setEtapa('Preparando…')
    const p = await prepararEnvioDeArquivo(membroId, categoria, arquivo.type, arquivo.size)
    if (p.erro || !p.caminho || !p.token) { setErro(p.erro ?? 'Não foi possível preparar o envio.'); setEtapa(''); return }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('equipe-arquivos').uploadToSignedUrl(p.caminho, p.token, arquivo, { contentType: arquivo.type })
    if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); setEtapa(''); return }
    setEtapa('Conferindo…')
    const r = await registrarArquivo(membroId, p.caminho, arquivo.name, f)
    setEtapa('')
    if (r.erro) { setErro(r.erro); return }
    setNovo(false); setArquivo(null)
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-4">
      {!grupos.length && !novo && <p className="text-sm text-muted-foreground">Nenhum arquivo guardado ainda.</p>}
      {grupos.map(({ c, lista }) => (
        <div key={c}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORIAS_DE_ARQUIVO[c].rotulo}</p>
          <ul className="divide-y divide-border rounded-lg border border-border" data-grupo={c}>
            {lista.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  {a.tipo === 'application/pdf' ? <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <Imagem className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <a href={`/api/equipe/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary hover:underline">{a.titulo}</a>
                    <span className="block text-xs text-muted-foreground">
                      {[a.data_documento ? `de ${DATA(a.data_documento)}` : null, tamanhoLegivel(a.tamanho), `enviado por ${nomes[a.enviado_por ?? ''] ?? 'alguém'} em ${QUANDO(a.created_at)}`].filter(Boolean).join(' · ')}
                    </span>
                    {a.observacao && <span className="block text-xs text-muted-foreground">{a.observacao}</span>}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Validade validade={a.validade} hoje={hoje} />
                  {a.sha256 && <span title={`SHA-256 ${a.sha256}`} className="text-muted-foreground"><ShieldCheck className="size-4" aria-label="Impressão digital registrada" /></span>}
                  <a href={`/api/equipe/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir" title="Abrir" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></a>
                  <a href={`/api/equipe/arquivos/${a.id}?baixar=1`} aria-label="Baixar" title="Baixar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="size-3.5" /></a>
                  <button type="button" aria-label="Excluir" title="Excluir" onClick={() => { setExcluindo(a); setMotivo(''); setErro('') }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {novo ? (
        <form ref={formulario} id="novo-arquivo" className="flex flex-col gap-3 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)) }}>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm hover:border-primary/60">
            <Upload className="size-5 text-muted-foreground" />
            {arquivo ? <span className="font-medium">{arquivo.name} <span className="font-normal text-muted-foreground">({tamanhoLegivel(arquivo.size)})</span></span> : <span>Escolher arquivo</span>}
            <span className="text-xs text-muted-foreground">PDF, JPG, PNG ou WEBP, até 20 MB</span>
            <input id="a-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setArquivo(f)
              const t = formulario.current?.querySelector<HTMLInputElement>('#a-titulo')
              if (f && t && !t.value) t.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200)
            }} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Categoria
              <select id="a-categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDeArquivo)} className={inputClass}>
                {categorias.map((c) => <option key={c} value={c}>{CATEGORIAS_DE_ARQUIVO[c].rotulo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Título<input id="a-titulo" name="titulo" required minLength={2} maxLength={200} placeholder="Ex.: Contrato de trabalho" className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Data do documento<input id="a-data" name="data_documento" type="date" max={hoje} className={inputClass} /></label>
            {CATEGORIAS_DE_ARQUIVO[categoria].validade && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Válido até <span className="sr-only">(opcional)</span><input id="a-validade" name="validade" type="date" className={inputClass} /></label>
            )}
          </div>
          <input name="observacao" maxLength={600} placeholder="Observação (opcional)" aria-label="Observação" className={inputClass} />
          {CATEGORIAS_DE_ARQUIVO[categoria].nivel >= 3 && <p className="text-xs text-muted-foreground">Dado sensível: só quem tem acesso a documentos vê este arquivo.</p>}
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
          <div className="flex items-center justify-end gap-2">
            {etapa && <span className="text-xs text-muted-foreground">{etapa}</span>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setNovo(false); setArquivo(null); setErro('') }} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={ocupado || !arquivo}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Guardar</Button>
          </div>
        </form>
      ) : categorias.length > 0 && <Button size="sm" variant="outline" className="self-start" onClick={() => setNovo(true)}><Plus className="size-3.5" />Adicionar arquivo</Button>}

      {excluidos.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{excluidos.length} {excluidos.length === 1 ? 'arquivo excluído' : 'arquivos excluídos'}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {excluidos.map((a) => (
              <li key={a.id}><span className="line-through">{a.titulo}</span> — excluído por {nomes[a.excluido_por ?? ''] ?? 'alguém'} em {QUANDO(a.excluido_em!)}: {a.motivo_exclusao}</li>
            ))}
          </ul>
        </details>
      )}

      {excluindo && (
        <Dialog titulo="Excluir arquivo" onFechar={() => !ocupado && setExcluindo(null)} podeFechar={!ocupado}
          descricao={`"${excluindo.titulo}" sai do armazenamento. Fica registrado quem excluiu, quando e por quê.`}>
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => {
            e.preventDefault()
            iniciar(async () => {
              const r = await excluirArquivo(membroId, excluindo.id, motivo)
              if (r.erro) { setErro(r.erro); return }
              setExcluindo(null); router.refresh()
            })
          }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo
              <textarea id="a-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} placeholder="Ex.: enviado na ficha errada" className={inputClass} />
            </label>
            {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExcluindo(null)} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}Excluir</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
