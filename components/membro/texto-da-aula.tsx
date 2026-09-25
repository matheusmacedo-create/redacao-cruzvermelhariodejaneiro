import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { blocosDoTexto } from '@/lib/membro/texto-da-aula'

/**
 * Texto puro da equipe (aula ou descrição do curso) com parágrafos, listas e
 * subtítulos. Nada de HTML vindo do banco: cada bloco vira um elemento React,
 * então não há o que escapar. Sem 'use client': serve ao servidor e ao cliente.
 *
 * `max-w-prose` e `leading-7`: linha curta e espaçada é o que dá para ler
 * no celular sem perder a linha. `nivel` é o do subtítulo, para encaixar na
 * hierarquia da página (H1 é o título da aula; H2, as seções).
 */
export function TextoDaAula({ texto, nivel = 2, className, id }: { texto: string | null | undefined; nivel?: 2 | 3; className?: string; id?: string }) {
  const blocos = blocosDoTexto(texto)
  if (!blocos.length) return null
  const Subtitulo = nivel === 2 ? 'h2' : 'h3'
  return (
    <div id={id} className={cn('flex max-w-prose flex-col gap-4 text-base leading-7 text-foreground wrap-break-word', className)}>
      {blocos.map((b, i) => {
        if (b.tipo === 'subtitulo') return <Subtitulo key={i} className="mt-2 text-base font-semibold first:mt-0">{b.texto}</Subtitulo>
        if (b.tipo === 'lista') {
          const itens = b.itens.map((t, j) => <li key={j} className="pl-1">{t}</li>)
          return b.ordenada
            ? <ol key={i} start={b.inicio} className="flex list-decimal flex-col gap-1.5 pl-6 marker:text-muted-foreground">{itens}</ol>
            : <ul key={i} className="flex list-disc flex-col gap-1.5 pl-6 marker:text-muted-foreground">{itens}</ul>
        }
        return <p key={i}>{b.linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{l}</Fragment>)}</p>
      })}
    </div>
  )
}
