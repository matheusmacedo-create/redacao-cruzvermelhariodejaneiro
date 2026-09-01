'use client'

import { useEffect, useState } from 'react'

/**
 * Depois da confirmação, o leitor não fica num beco: a página anuncia e o
 * leva para a central de notícias — o melhor lugar para quem acabou de dizer
 * que quer receber notícias. O aviso com contagem existe porque redirecionar
 * sem dizer é o navegador "fazendo algo sozinho"; com o link junto, quem tem
 * pressa vai no clique e quem usa leitor de tela sabe o que vai acontecer.
 */
export function RedirecionarParaNoticias({ url, segundos = 6 }: { url: string; segundos?: number }) {
  const [restam, setRestam] = useState(segundos)

  useEffect(() => {
    if (restam <= 0) {
      window.location.assign(url)
      return
    }
    const relogio = setTimeout(() => setRestam((r) => r - 1), 1000)
    return () => clearTimeout(relogio)
  }, [restam, url])

  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      Levando você para as nossas notícias em {restam}s…{' '}
      <a href={url} className="font-semibold text-primary hover:underline">
        ir agora
      </a>
    </p>
  )
}
