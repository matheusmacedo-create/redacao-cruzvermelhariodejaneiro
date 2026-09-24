'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { concluirAula } from '@/app/actions/membro'
import { botaoDoMembro } from './marca'

/**
 * Concluir e seguir: marca a aula e leva à próxima. Na última, leva à prova
 * ou mostra o certificado que acabou de sair.
 */
export function ConcluirAula({ cursoId, aulaId, feita, seguinte }: { cursoId: string; aulaId: string; feita: boolean; seguinte: string | null }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [certificado, setCertificado] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const ir = (destino: string) => router.push(destino)

  if (certificado) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-5 text-success" role="status" id="certificado-emitido">
        <p className="flex items-center gap-2 text-lg font-semibold"><Award className="size-5" />Parabéns! Curso concluído.</p>
        <p className="text-sm">Seu certificado já está pronto e entrou no seu cadastro de formações.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/membro/certificados/${certificado}/pdf`} className={botaoDoMembro}>Baixar certificado</a>
          <Link href={`/membro/cursos/${cursoId}`} className="rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-success/15">Voltar ao curso</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" disabled={ocupado} className={botaoDoMembro} id="concluir-aula" onClick={() => iniciar(async () => {
        setErro('')
        if (feita) { ir(seguinte ? `/membro/cursos/${cursoId}/aulas/${seguinte}` : `/membro/cursos/${cursoId}`); return }
        const r = await concluirAula(cursoId, aulaId)
        if (r.erro) { setErro(r.erro); return }
        if (r.certificado) { setCertificado(r.certificado); return }
        if (r.prova) { ir(`/membro/cursos/${cursoId}/prova`); return }
        ir(seguinte ? `/membro/cursos/${cursoId}/aulas/${seguinte}` : `/membro/cursos/${cursoId}`)
      })}>
        {ocupado ? <Loader2 className="size-4 animate-spin" /> : feita ? <ChevronRight className="size-4" /> : <CheckCircle2 className="size-4" />}
        {feita ? (seguinte ? 'Próxima aula' : 'Voltar ao curso') : seguinte ? 'Concluir e seguir' : 'Concluir aula'}
      </button>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
    </div>
  )
}
