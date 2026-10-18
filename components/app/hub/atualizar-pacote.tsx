'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { aplicarAtualizacao, conferirAtualizacao, type ResultadoDaConferenciaDeAtualizacao } from '@/app/actions/atualizar-pacote'
import { enviarParaBiblioteca } from '@/lib/upload-cliente'

type Pendente = { conteudo: string; fotos: Map<string, File>; conferencia: ResultadoDaConferenciaDeAtualizacao }

/**
 * O modo "atualizar" do botão "Importar pacote" (arquivo com
 * `"modo": "atualizar"`): confere, mostra o que vai mudar e só grava depois
 * de a pessoa confirmar — corrigir uma matéria no ar é mais sério do que criar
 * um rascunho, e a pessoa precisa ver o endereço antes.
 *
 * Fica fora de importar-pacote.tsx para a criação seguir intacta; o botão só
 * desvia para cá quando o arquivo pede.
 */
export function useAtualizacaoPorArquivo(
  workspaceId: string,
  avisos: { setAndamento: (texto: string) => void; setErros: (erros: string[]) => void },
): { conferir: (conteudo: string, fotos: Map<string, File>) => Promise<void>; limpar: () => void; painel: ReactNode } {
  const router = useRouter()
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [feito, setFeito] = useState<{ id: string; texto: string } | null>(null)
  const { setAndamento, setErros } = avisos

  function limpar() { setPendente(null); setFeito(null) }

  async function conferir(conteudo: string, fotos: Map<string, File>) {
    limpar()
    const form = new FormData()
    form.set('json', conteudo)
    const conferencia = await conferirAtualizacao(form)
    if (conferencia.erro) { setErros([conferencia.erro]); return }
    if (conferencia.problemas?.length) { setErros(conferencia.problemas.map((p) => `${p.campo}: ${p.mensagem}`)); return }
    const faltando = (conferencia.midias ?? []).filter((m) => !fotos.has(m.arquivo)).map((m) => `${m.ref}: faltou escolher o arquivo "${m.arquivo}".`)
    if (faltando.length) { setErros(faltando); return }
    setPendente({ conteudo, fotos, conferencia })
  }

  async function confirmar() {
    if (!pendente) return
    const { conteudo, fotos, conferencia } = pendente
    setErros([])
    try {
      const midias = conferencia.midias ?? []
      const ids: Record<string, string> = {}
      for (const [i, m] of midias.entries()) {
        setAndamento(`Enviando a mídia ${i + 1} de ${midias.length}…`)
        const salvo = await enviarParaBiblioteca(fotos.get(m.arquivo)!, {
          workspaceId,
          tags: ['redes', 'importado'],
          // Quem autoriza o uso da imagem é uma pessoa, na Biblioteca.
          autorizacao: 'pending',
        })
        ids[m.ref] = salvo.id
      }

      setAndamento(conferencia.publicada ? 'Atualizando a matéria no site…' : 'Atualizando o rascunho…')
      const envio = new FormData()
      envio.set('json', conteudo)
      envio.set('arquivos', JSON.stringify(ids))
      envio.set('pacoteId', conferencia.pacoteId ?? '')
      const r = await aplicarAtualizacao(envio)
      setPendente(null)
      if (r.problemas?.length) { setErros(r.problemas.map((p) => `${p.campo}: ${p.mensagem}`)); return }
      // Erro com id: o pacote mudou, mas a página não acompanhou.
      if (r.erro) { setErros([r.erro]); if (r.id) setFeito({ id: r.id, texto: 'O rascunho foi corrigido.' }); return }
      if (!r.id) return
      const texto = r.republicada
        ? `Matéria atualizada no site${r.endereco ? ` em ${r.endereco}` : ''}, no mesmo endereço.${r.aviso ? ` Aviso: ${r.aviso}` : ''}`
        : 'Rascunho atualizado. Nada foi publicado.'
      setFeito({ id: r.id, texto })
      router.refresh()
    } catch (causa) {
      setErros([causa instanceof Error ? causa.message : 'Não foi possível atualizar.'])
    } finally {
      setAndamento('')
    }
  }

  let painel: ReactNode = null
  if (pendente) {
    const c = pendente.conferencia
    const fotosNovas = (c.midias ?? []).length
    painel = (
      <div className="max-w-sm rounded-md border bg-card p-3 text-left text-xs">
        <p className="font-medium">
          {c.publicada
            ? <>Isto vai atualizar a matéria publicada em <span className="break-all">{c.endereco ?? 'no site'}</span>.</>
            : <>Isto vai atualizar o rascunho “{c.tituloAtual}”. Nada será publicado.</>}
        </p>
        {c.publicada && <p className="mt-1 text-muted-foreground">O endereço e a data de publicação continuam os mesmos, não volta para aprovação, e o que já saiu nas redes não muda.</p>}
        {c.publicada && c.descolada && <p className="mt-1 text-warning-foreground">A página tem texto próprio, escrito à mão: o texto do pacote muda, mas o da página fica. Fotos e legendas mudam.</p>}
        <ul className="mt-2 list-disc pl-4">
          {(c.mudancas ?? []).map((m) => <li key={m}>{m}</li>)}
        </ul>
        {fotosNovas > 0 && <p className="mt-1 text-muted-foreground">As fotos novas entram na Biblioteca sem autorização de uso.</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => void confirmar()}>{c.publicada ? 'Atualizar no site' : 'Atualizar o rascunho'}</Button>
          <Button size="sm" variant="outline" onClick={() => setPendente(null)}>Cancelar</Button>
        </div>
      </div>
    )
  } else if (feito) {
    painel = (
      <span className="max-w-sm text-xs text-muted-foreground">
        {feito.texto}{' '}
        <button type="button" className="underline" onClick={() => router.push(`/redes/${feito.id}`)}>Abrir o pacote</button>
      </span>
    )
  }

  return { conferir, limpar, painel }
}
