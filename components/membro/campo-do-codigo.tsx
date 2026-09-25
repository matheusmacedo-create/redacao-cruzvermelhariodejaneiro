'use client'

import { useState } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'
import { TAMANHO_DO_CODIGO, digitosDoCodigo } from '@/lib/membro/entrada'

/**
 * O campo do código de 6 dígitos: um `<input>` de verdade, transparente e
 * esticado por cima de 6 caixas que só desenham (`aria-hidden`). Por ser um
 * campo só, continuam funcionando o preenchimento automático do iPhone e a
 * sugestão do teclado do Android (`one-time-code`), o colar, o desfazer e o
 * leitor de tela — que lê o campo, não as caixas.
 *
 * Sem `pattern` nem `maxLength` de propósito: `maxLength` cortava um código
 * colado como "123 456", e a validação nativa falava uma mensagem genérica
 * (às vezes em inglês). O que não é dígito sai no `onChange`.
 *
 * Ao completar os 6 dígitos, envia o formulário sozinho — uma vez por código
 * completo: só quando o valor vira um código de 6 dígitos diferente do que
 * estava ali. Depois de um erro, os dígitos ficam na tela e nada é reenviado
 * até a pessoa mudar algum (ou colar outro código por cima).
 */
export function CampoDoCodigo({ valor, aoMudar, erro = false, somenteLeitura = false, enviarAoCompletar = true, descritoPor, ref }: {
  valor: string
  aoMudar: (digitos: string) => void
  erro?: boolean
  /** Enquanto confere o código: não edita, mas continua com o foco (desativar jogaria o foco para o nada). */
  somenteLeitura?: boolean
  enviarAoCompletar?: boolean
  descritoPor?: string
  ref?: React.Ref<HTMLInputElement>
}) {
  const [focado, setFocado] = useState(false)
  const [selecao, setSelecao] = useState<[number, number]>([0, 0])

  const lerSelecao = (el: HTMLInputElement) => setSelecao([el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length])

  // A caixa "atual" segue o cursor do campo de verdade; com texto selecionado
  // (ex.: depois de um erro, tudo selecionado), acendem as caixas selecionadas.
  const inicio = Math.min(selecao[0], valor.length)
  const fim = Math.min(selecao[1], valor.length)
  const temSelecao = fim > inicio
  const atual = Math.min(inicio, TAMANHO_DO_CODIGO - 1)
  const acesa = (i: number) => focado && (temSelecao ? i >= inicio && i < fim : i === atual)

  return (
    <div className="relative">
      <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: TAMANHO_DO_CODIGO }, (_, i) => {
          const digito = valor[i]
          return (
            <div key={i} className={cn(
              'flex h-14 items-center justify-center rounded-xl border-2 bg-background font-mono text-2xl font-semibold text-foreground motion-safe:transition-colors',
              erro ? 'border-destructive' : 'border-input',
              acesa(i) && (erro ? 'ring-3 ring-destructive/20' : 'border-primary ring-3 ring-ring/20'),
              // Alto contraste (Windows): o anel some e a borda vira a de todas; a caixa atual ganha a cor de destaque do sistema.
              acesa(i) && 'forced-colors:border-[Highlight]',
              somenteLeitura && 'bg-muted',
            )}>
              {digito ?? (acesa(i) && !temSelecao && !somenteLeitura ? <span className="h-7 w-0.5 rounded-full bg-foreground motion-safe:animate-pulse forced-colors:bg-[CanvasText]" /> : null)}
            </div>
          )
        })}
      </div>
      <input
        ref={ref}
        id="m-codigo"
        name="codigo"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        value={valor}
        readOnly={somenteLeitura}
        aria-invalid={erro || undefined}
        aria-describedby={descritoPor}
        onFocus={(e) => { setFocado(true); lerSelecao(e.currentTarget) }}
        onBlur={() => setFocado(false)}
        onSelect={(e) => lerSelecao(e.currentTarget)}
        onChange={(e) => {
          const digitos = digitosDoCodigo(e.target.value)
          const form = e.currentTarget.form
          if (enviarAoCompletar && digitos.length === TAMANHO_DO_CODIGO && digitos !== valor) {
            // O envio lê o campo do DOM: primeiro o valor limpo chega à tela,
            // depois o formulário sai (sem isso iria "123 456" em vez de "123456").
            flushSync(() => aoMudar(digitos))
            form?.requestSubmit()
          } else {
            aoMudar(digitos)
          }
        }}
        // 16px (text-base): abaixo disso o Safari do iPhone dá zoom ao tocar.
        // Letras transparentes e cursor escondido: quem aparece são as caixas.
        // `forced-color-adjust: none`: no alto contraste do Windows, o sistema
        // pintaria as letras e os 6 dígitos apareceriam espremidos por cima das caixas.
        className="absolute inset-0 size-full cursor-text rounded-xl border-0 bg-transparent font-mono text-base tracking-[-0.5em] text-transparent caret-transparent outline-none selection:bg-transparent forced-colors:[forced-color-adjust:none]"
      />
    </div>
  )
}
