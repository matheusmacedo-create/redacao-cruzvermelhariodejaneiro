'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { conferirImportacao, importarPacote } from '@/app/actions/importar-pacote'
import { conferirAdvertorial, importarAdvertorial } from '@/app/actions/importar-advertorial'
import { enviarParaBiblioteca } from '@/lib/upload-cliente'

/**
 * "Importar pacote": escolha o JSON e as fotos juntos; o pacote nasce em
 * rascunho, sem preencher a tela campo por campo.
 *
 * Ordem: confere o JSON (e se já foi importado) → sobe as fotos para a
 * Biblioteca como `pending` → cria o rascunho e abre. Qualquer problema para
 * antes de gravar; só a falha de uma foto no meio deixa as anteriores na
 * Biblioteca, onde ficam à vista e sem autorização.
 *
 * O JSON com `"tipo": "advertorial"` segue o mesmo caminho, mas nasce como
 * advertorial da escola (matéria no editor, com o botão rastreado).
 */
/** O arquivo pede advertorial? Só olha o campo: a validação é do servidor. */
function ehAdvertorial(conteudo: string): boolean {
  try { const bruto = JSON.parse(conteudo); return !!bruto && typeof bruto === 'object' && bruto.tipo === 'advertorial' } catch { return false }
}

export function ImportarPacoteBotao({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [andamento, setAndamento] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [existente, setExistente] = useState<{ rota: string; motivo: string } | null>(null)
  const [aviso, setAviso] = useState('')

  async function importar(escolhidos: File[]) {
    setErros([])
    setExistente(null)
    setAviso('')
    const json = escolhidos.find((f) => f.name.toLowerCase().endsWith('.json'))
    if (!json) { setErros(['Escolha o arquivo .json junto com as fotos.']); return }
    const fotos = new Map(escolhidos.filter((f) => f !== json).map((f) => [f.name, f]))

    try {
      setAndamento('Conferindo o arquivo…')
      const conteudo = await json.text()
      const form = new FormData()
      form.set('json', conteudo)
      const advertorial = ehAdvertorial(conteudo)
      const conferencia = advertorial ? await conferirAdvertorial(form) : await conferirImportacao(form)
      if (conferencia.erro) { setErros([conferencia.erro]); return }
      if (conferencia.problemas?.length) {
        setErros(conferencia.problemas.map((p) => `${p.campo}: ${p.mensagem}`))
        return
      }
      const rotaExistente = 'duplicadoRota' in conferencia ? conferencia.duplicadoRota
        : 'duplicadoId' in conferencia && conferencia.duplicadoId ? `/redes/${conferencia.duplicadoId}` : undefined
      if (rotaExistente || conferencia.duplicadoMotivo) {
        setExistente({ rota: rotaExistente ?? '', motivo: conferencia.duplicadoMotivo ?? 'Este pacote já existe.' })
        return
      }

      const midias = conferencia.midias ?? []
      const faltando = midias.filter((m) => !fotos.has(m.arquivo)).map((m) => `${m.ref}: faltou escolher o arquivo "${m.arquivo}".`)
      if (faltando.length) { setErros(faltando); return }

      const ids: Record<string, string> = {}
      for (const [i, m] of midias.entries()) {
        setAndamento(`Enviando a mídia ${i + 1} de ${midias.length}…`)
        const salvo = await enviarParaBiblioteca(fotos.get(m.arquivo)!, {
          workspaceId,
          tags: [advertorial ? 'conteudo' : 'redes', 'importado'],
          // Quem autoriza o uso da imagem é uma pessoa, na Biblioteca.
          autorizacao: 'pending',
        })
        ids[m.ref] = salvo.id
      }

      setAndamento('Criando o rascunho…')
      const envio = new FormData()
      envio.set('json', conteudo)
      envio.set('arquivos', JSON.stringify(ids))
      if (advertorial) {
        const a = await importarAdvertorial(envio)
        if (a.problemas?.length) { setErros(a.problemas.map((p) => `${p.campo}: ${p.mensagem}`)); return }
        if (a.erro) {
          setErros([a.erro])
          if (a.contentId) setExistente({ rota: `/conteudos/${a.contentId}`, motivo: 'O advertorial foi criado.' })
          return
        }
        if (a.aviso && a.contentId) {
          // Fica na tela para ser lido; o link abre a matéria.
          setAviso(a.aviso)
          setExistente({ rota: `/conteudos/${a.contentId}`, motivo: 'Advertorial criado.' })
          return
        }
        if (a.contentId) router.push(`/conteudos/${a.contentId}`)
        return
      }
      const r = await importarPacote(envio)
      if (r.problemas?.length) { setErros(r.problemas.map((p) => `${p.campo}: ${p.mensagem}`)); return }
      if (r.erro) { setErros([r.erro]); return }
      if (r.id) router.push(`/redes/${r.id}`)
    } catch (causa) {
      setErros([causa instanceof Error ? causa.message : 'Não foi possível importar.'])
    } finally {
      setAndamento('')
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <span data-ajuda="publicacoes.importar" className="inline-flex flex-col items-end gap-1">
      <input
        ref={entrada}
        type="file"
        multiple
        accept=".json,application/json,image/*,video/*"
        className="hidden"
        onChange={(e) => { const lista = Array.from(e.target.files ?? []); if (lista.length) void importar(lista) }}
      />
      <Button size="lg" variant="outline" onClick={() => entrada.current?.click()} disabled={Boolean(andamento)}>
        <FileJson className="size-4" />
        {andamento || 'Importar pacote'}
      </Button>
      {existente && (
        <span className="text-xs text-muted-foreground">
          {existente.motivo}{' '}
          {existente.rota && <button type="button" className="underline" onClick={() => router.push(existente.rota)}>Abrir</button>}
        </span>
      )}
      {aviso && <span className="max-w-sm text-xs text-muted-foreground">{aviso}</span>}
      {erros.length > 0 && (
        <ul className="max-w-sm list-disc pl-4 text-left text-xs text-destructive">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </span>
  )
}
