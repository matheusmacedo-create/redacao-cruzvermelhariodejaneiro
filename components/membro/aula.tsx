'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, XCircle } from 'lucide-react'
import { concluirAula } from '@/app/actions/membro'
import { cn } from '@/lib/utils'
import { barraFixa, botaoDoMembro, botaoFantasma, botaoSecundario } from './marca'

/**
 * O rodapé da aula: "‹ Anterior" e "Concluir e seguir", numa barra que gruda
 * embaixo (no celular, acima das abas, ao alcance do polegar). Concluir marca
 * a aula e leva à próxima; na última, leva à prova ou mostra o certificado
 * que acabou de sair.
 *
 * Devolve irmãos (fragmento), não um invólucro: a barra é `sticky` e só gruda
 * dentro do pai — que precisa ser a coluna inteira da aula, não uma caixa do
 * tamanho da própria barra.
 */
export function ConcluirAula({ cursoId, aulaId, feita, anterior, seguinte, fim }: {
  cursoId: string; aulaId: string; feita: boolean; anterior: string | null; seguinte: string | null
  /** Para onde vai quem já fez a última aula: a prova, se falta; senão, o curso. */
  fim: { href: string; rotulo: string }
}) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [certificado, setCertificado] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const tituloDoCertificado = useRef<HTMLHeadingElement>(null)
  const destino = seguinte ? `/membro/cursos/${cursoId}/aulas/${seguinte}` : fim.href

  // O cartão do certificado entra no lugar da barra: o foco vai para ele, senão
  // quem usa leitor de tela ou teclado fica num botão que sumiu.
  useEffect(() => { if (certificado) tituloDoCertificado.current?.focus() }, [certificado])

  if (certificado) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-5 sm:p-6" id="certificado-emitido" aria-labelledby="certificado-emitido-titulo">
        <h2 ref={tituloDoCertificado} tabIndex={-1} id="certificado-emitido-titulo" className="flex items-center gap-2 text-lg font-semibold text-(--success-texto) outline-none">
          <Award className="size-5 shrink-0 text-success" aria-hidden="true" />Parabéns! Curso concluído.
        </h2>
        <p className="text-sm text-foreground">Seu certificado já está pronto e entrou no seu cadastro de formações.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/membro/certificados/${certificado}/pdf`} className={botaoDoMembro}><Download className="size-4" aria-hidden="true" />Baixar certificado</a>
          <Link href="/membro/certificados" className={botaoSecundario}>Ver meus certificados</Link>
        </div>
      </section>
    )
  }

  const rotulo = feita ? (seguinte ? 'Próxima aula' : fim.rotulo) : seguinte ? 'Concluir e seguir' : 'Concluir aula'
  return (
    <div className={barraFixa}>
      {erro && <p className="mb-2 flex items-start gap-2 px-1 text-sm text-destructive" role="alert"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{erro}</p>}
      <div className="flex items-center justify-between gap-2">
        {anterior
          ? <Link href={`/membro/cursos/${cursoId}/aulas/${anterior}`} className={cn(botaoFantasma, 'px-3')} aria-label="Aula anterior"><ChevronLeft className="size-4" aria-hidden="true" />Anterior</Link>
          : <span />}
        {/* `aria-disabled` e não `disabled`: desativar o botão focado jogaria o foco no `<body>`, e no erro nada o devolvia. */}
        <button type="button" aria-disabled={ocupado || undefined} className={cn(botaoDoMembro, 'flex-1 sm:flex-none aria-disabled:opacity-60')} id="concluir-aula" onClick={() => {
          if (ocupado) return
          iniciar(async () => {
            setErro('')
            if (feita) { router.push(destino); return }
            const r = await concluirAula(cursoId, aulaId)
            if (r.erro) { setErro(r.erro); return }
            if (r.certificado) { setCertificado(r.certificado); return }
            if (r.prova) { router.push(`/membro/cursos/${cursoId}/prova`); return }
            router.push(seguinte ? destino : `/membro/cursos/${cursoId}`)
          })
        }}>
          {ocupado ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : feita ? <ChevronRight className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {ocupado ? (feita ? 'Abrindo…' : 'Concluindo…') : rotulo}
        </button>
      </div>
    </div>
  )
}

/**
 * Texto que começa recolhido (umas quatro linhas) com "Ler mais". Serve à
 * descrição do curso: no celular, o painel com o botão vem antes dela, e o
 * conteúdo do curso logo depois. O botão só aparece se o texto passa mesmo
 * do limite — quem mede é o navegador; `longo` é o palpite do servidor, para
 * o botão já vir no HTML. O leitor de tela lê o texto inteiro de todo jeito.
 */
export function Recolhivel({ id, longo, children }: { id: string; longo: boolean; children: React.ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(false)
  const [sobra, setSobra] = useState(longo)

  useEffect(() => {
    const el = caixa.current
    if (!el || aberto || typeof ResizeObserver === 'undefined') return
    // O observador avisa logo ao começar e de novo a cada mudança de largura (girar o celular).
    const observador = new ResizeObserver(() => setSobra(el.scrollHeight > el.clientHeight + 1))
    observador.observe(el)
    return () => observador.disconnect()
  }, [aberto])

  const recolhido = sobra && !aberto
  return (
    <div>
      <div ref={caixa} id={id} className={cn(!aberto && 'max-h-28 overflow-hidden', recolhido && '[mask-image:linear-gradient(to_bottom,black_55%,transparent)]')}>
        {children}
      </div>
      {(sobra || aberto) && (
        <button type="button" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((a) => !a)}
          className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline">
          {aberto ? 'Ler menos' : 'Ler mais'}<ChevronDown className={cn('size-4 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
