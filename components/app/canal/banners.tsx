'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import { excluirBanner, ligarBanner, prepararEnvioDeBanner, salvarBanner } from '@/app/actions/banners'
import { situacaoDoBanner, TAMANHO_MAXIMO } from '@/lib/banners/regras'
import { cn } from '@/lib/utils'

export type BannerNaEquipe = {
  id: string
  titulo: string
  texto: string | null
  imagem_caminho: string
  imagem: string | null
  link_url: string | null
  link_rotulo: string | null
  inicio: string | null
  fim: string | null
  ativo: boolean
  ordem: number
  created_at: string
}

const SITUACAO = {
  no_ar: { rotulo: 'No ar', classe: 'bg-success/15 text-success' },
  agendado: { rotulo: 'Agendado', classe: 'bg-info/10 text-info' },
  encerrado: { rotulo: 'Encerrado', classe: 'bg-muted text-muted-foreground' },
  desligado: { rotulo: 'Desligado', classe: 'bg-muted text-muted-foreground' },
} as const

const dataBr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

/** O quadro dos banners: o formulário de um novo em cima, a lista embaixo. */
export function PainelDeBanners({ banners, hoje }: { banners: BannerNaEquipe[]; hoje: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  // Publicado um novo, o formulário volta limpo: uma chave nova o monta de novo.
  const [novo, setNovo] = useState(0)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const rodar = (f: () => Promise<{ erro?: string }>) => iniciar(async () => { setErro(''); const r = await f(); if (r.erro) setErro(r.erro); else router.refresh() })
  return (
    <div className="flex flex-col gap-4">
      <FormularioDeBanner key={novo} b={null} onFim={() => setNovo((n) => n + 1)} />
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      <ul className="flex flex-col gap-3" data-ajuda="voluntarios.banners-lista">
        {banners.map((b) => {
          const s = SITUACAO[situacaoDoBanner(b, hoje)]
          return (
            <li key={b.id} className="rounded-lg border border-border p-3">
              {editando === b.id ? <FormularioDeBanner b={b} onFim={() => setEditando(null)} /> : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="aspect-[21/8] w-full shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:w-48">
                    {b.imagem && <img src={b.imagem} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {b.titulo}
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', s.classe)}>{s.rotulo}</span>
                    </p>
                    {b.texto && <p className="mt-0.5 text-sm text-muted-foreground">{b.texto}</p>}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {b.inicio || b.fim ? `${b.inicio ? `De ${dataBr(b.inicio)}` : 'Desde já'}${b.fim ? ` até ${dataBr(b.fim)}` : ', sem data para sair'}` : 'Sem período: fica no ar enquanto estiver ligado'}
                      {` · ordem ${b.ordem}`}
                      {b.link_url ? ` · botão “${b.link_rotulo}” → ${b.link_url}` : ' · sem botão'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => rodar(() => ligarBanner(b.id, !b.ativo))}>{b.ativo ? 'Desligar' : 'Ligar'}</Button>
                    <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(b.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                    <button type="button" title="Excluir" aria-label="Excluir" disabled={ocupado} onClick={() => { if (confirm('Excluir este banner? A imagem é apagada junto.')) rodar(() => excluirBanner(b.id)) }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {!banners.length && <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum banner ainda. O primeiro que você ligar aparece no Início de todo o voluntariado.</li>}
      </ul>
    </div>
  )
}

function FormularioDeBanner({ b, onFim }: { b: BannerNaEquipe | null; onFim?: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarBanner.bind(null, b?.id ?? null), {})
  const [caminho, setCaminho] = useState(b?.imagem_caminho ?? '')
  const [previa, setPrevia] = useState<string | null>(b?.imagem ?? null)
  const [subindo, setSubindo] = useState(false)
  const [erroDaImagem, setErroDaImagem] = useState('')
  const [comBotao, setComBotao] = useState(Boolean(b?.link_url))
  useEffect(() => { if (estado.ok && !estado.erro) onFim?.() }, [estado.ok, estado.erro, onFim])

  async function escolher(f: File) {
    setErroDaImagem('')
    if (f.size > TAMANHO_MAXIMO) { setErroDaImagem('A imagem pode ter até 5 MB.'); return }
    setSubindo(true)
    try {
      const p = await prepararEnvioDeBanner(f.type, f.size)
      if (p.erro || !p.caminho || !p.token) { setErroDaImagem(p.erro ?? 'Falhou.'); return }
      const { error } = await createClient().storage.from('membro-banners').uploadToSignedUrl(p.caminho, p.token, f, { contentType: f.type })
      if (error) { setErroDaImagem('O envio falhou. Tente de novo.'); return }
      setCaminho(p.caminho)
      setPrevia(URL.createObjectURL(f))
    } finally {
      setSubindo(false)
    }
  }

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-ajuda={b ? undefined : 'voluntarios.banner-novo'}>
      <input type="hidden" name="imagem_caminho" value={caminho} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="flex flex-col gap-2">
          <div className="aspect-[21/8] overflow-hidden rounded-lg border border-border bg-muted">
            {previa ? <img src={previa} alt="Prévia do banner" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center px-4 text-center text-xs text-muted-foreground">Sem imagem</div>}
          </div>
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            {subindo ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}{previa ? 'Trocar imagem' : 'Enviar imagem'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={subindo} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void escolher(f) }} />
          </label>
          <p className="text-xs text-muted-foreground">Foto ou arte larga, 1680×640 (21:8), JPG, PNG ou WEBP, até 5 MB. Deixe o assunto no centro: no celular as bordas são cortadas. Não escreva texto na imagem — o título vai embaixo.</p>
          {erroDaImagem && <p className="text-xs text-destructive" role="alert">{erroDaImagem}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <input name="titulo" required minLength={3} maxLength={80} defaultValue={b?.titulo ?? ''} placeholder="Título (ex.: Setembro Amarelo: cuidar de quem cuida)" aria-label="Título" className={inputClass} />
          <textarea name="texto" rows={2} maxLength={200} defaultValue={b?.texto ?? ''} placeholder="Uma frase de apoio (opcional)" aria-label="Texto" className={inputClass} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={comBotao} onChange={(e) => setComBotao(e.target.checked)} />Com botão</label>
          {comBotao && (
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
              <input name="link_rotulo" required minLength={2} maxLength={30} defaultValue={b?.link_rotulo ?? ''} placeholder="Texto do botão" aria-label="Texto do botão" className={inputClass} />
              <input name="link_url" required maxLength={500} defaultValue={b?.link_url ?? ''} placeholder="/membro/oportunidades ou https://…" aria-label="Endereço do botão" className={inputClass} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">De<input type="date" name="inicio" defaultValue={b?.inicio ?? ''} className={`${inputClass} !w-40 py-1`} /></label>
            <label className="flex items-center gap-2">até<input type="date" name="fim" defaultValue={b?.fim ?? ''} className={`${inputClass} !w-40 py-1`} /></label>
            <label className="flex items-center gap-2" title="Menor aparece primeiro">Ordem<input type="number" name="ordem" min={0} max={99} defaultValue={b?.ordem ?? 0} className={`${inputClass} !w-20 py-1`} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="ativo" value="sim" defaultChecked={b ? b.ativo : true} />Ligado</label>
          </div>
        </div>
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        {b && <Button type="button" size="sm" variant="ghost" onClick={onFim}>Cancelar</Button>}
        <Button type="submit" size="sm" disabled={enviando || subindo || !caminho}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{b ? 'Salvar' : 'Publicar banner'}</Button>
      </div>
    </form>
  )
}
