'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Bug, Check, ChevronRight, Loader2, Send } from 'lucide-react'
import { enviarRetorno } from '@/app/actions/beta'
import { cn } from '@/lib/utils'
import { ERRO_VAI_PARA_O_CLAUDE, contextoDoAparelho } from './beta'
import { guardarErro } from './erros-da-aba'

/**
 * "Achei um erro" (docs/AJUDA.md §17): a entrada própria para contar que algo
 * do Palácio não funcionou. Grava um retorno do beta do tipo "problema"
 * (enviarRetorno), com a tela e os filtros do endereço, o aparelho e as
 * últimas mensagens de erro da aba; a administração é avisada no sino e, de hora em hora, o Claude lê os
 * novos, procura a causa e abre um PR com a correção — que só vai ao ar
 * quando a administração mesclar.
 *
 * Dois lugares: no painel "?", acima de "Conte para a equipe"
 * (AcheiUmErroNoPainel), e na tela de erro (AvisarOErro), onde o texto é
 * opcional e vai junto o código do erro (`digest`).
 */

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm'
const botaoPrincipal = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:min-h-9'

/** Quando a pessoa não escreve nada na tela de erro. */
const TEXTO_DA_TELA_DE_ERRO = 'A tela deu erro (“Algo deu errado ao carregar esta página”).'

function FormularioDoErro({ area = null, digest, naTelaDeErro = false }: { area?: string | null; digest?: string; naTelaDeErro?: boolean }) {
  const caminho = usePathname()
  const id = useId()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)
  const [ocupado, iniciar] = useTransition()
  if (feito) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success" role="status" data-erro-enviado>
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Recebido, obrigado! O Claude vai procurar a causa e preparar a correção. Se precisar de resposta, ela chega no sino e fica em “Seus retornos”, na Central de ajuda.
      </p>
    )
  }
  const curto = texto.trim().length < 3
  return (
    <form className="flex flex-col gap-3" data-formulario-erro onSubmit={(e) => {
      e.preventDefault()
      iniciar(async () => {
        setErro('')
        const contexto = { ...contextoDoAparelho({ doErro: true }), ...(digest ? { digest } : {}) }
        const r = await enviarRetorno({ tipo: 'problema', caminho, area, texto: curto && naTelaDeErro ? TEXTO_DA_TELA_DE_ERRO : texto, contexto })
        if (r.erro) { setErro(r.erro); return }
        setFeito(true)
      })
    }}>
      <label htmlFor={`${id}-texto`} className="text-sm font-medium">
        {naTelaDeErro ? <>O que você estava fazendo? <span className="font-normal text-muted-foreground">(opcional)</span></> : 'O que aconteceu?'}
      </label>
      <textarea
        id={`${id}-texto`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={naTelaDeErro ? 2 : 4} maxLength={4000} className={campo}
        placeholder={naTelaDeErro ? 'Ex.: toquei em Salvar na proposta.' : 'O que você fez, o que esperava e o que apareceu. Ex.: “Toquei em Salvar na proposta e a tela ficou em branco.”'}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">{ERRO_VAI_PARA_O_CLAUDE} Vai junto: o endereço da tela ({caminho}, com os filtros), o tamanho da janela, o navegador e, se a tela deu erro, a mensagem técnica dele. Não vai nada do que está digitado na tela.</p>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado || (curto && !naTelaDeErro)} className={cn(botaoPrincipal, 'self-end')}>
        {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {naTelaDeErro ? 'Avisar sobre este erro' : 'Enviar'}
      </button>
    </form>
  )
}

/** No painel "?", acima de "Conte para a equipe": recolhido, abre o formulário do erro. */
export function AcheiUmErroNoPainel({ area }: { area: string | null }) {
  return (
    <details className="group rounded-xl border border-destructive/30 bg-destructive/[0.03]" data-achei-um-erro>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <Bug className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-destructive">Achei um erro</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Algo não funcionou nesta tela? Conte aqui: vai para o Claude, que prepara a correção.</span>
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-destructive/20 px-4 py-4"><FormularioDoErro area={area} /></div>
    </details>
  )
}

/**
 * Na tela de erro: guarda a mensagem (vai junto se a pessoa avisar) e oferece
 * o aviso com um toque — escrever o que estava fazendo é opcional.
 */
export function AvisarOErro({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { guardarErro(error) }, [error])
  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 text-left" data-avisar-o-erro>
      <p className="flex items-center gap-2 text-sm font-semibold"><Bug className="size-4 text-destructive" aria-hidden="true" />Avise sobre este erro</p>
      <div className="mt-3"><FormularioDoErro digest={error.digest} naTelaDeErro /></div>
    </div>
  )
}
