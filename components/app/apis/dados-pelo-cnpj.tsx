'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BadgeCheck, LoaderCircle } from 'lucide-react'
import { consultarCnpj } from '@/app/actions/apis-publicas'
import { cnpjFormatado, cnpjValido, type Empresa } from '@/lib/apis-publicas/regras'

type Destino = 'razaoSocial' | 'nomeFantasia' | 'email' | 'telefone'

const data = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : null)

/**
 * Ponha dentro do formulário, perto do campo de CNPJ. Quando o CNPJ digitado
 * é válido, consulta a Receita (BrasilAPI) e:
 *  - mostra a razão social e a situação cadastral — com aviso em destaque se
 *    a empresa não estiver ATIVA (baixada, inapta, suspensa);
 *  - preenche os campos indicados em `preencher`, só os que estão vazios:
 *    o que a pessoa já escreveu não é trocado.
 *
 * `campo` pode receber CPF também (favorecidos): com 11 dígitos, não faz nada.
 */
export function DadosPeloCnpj({ campo, preencher = {} }: { campo: string; preencher?: Partial<Record<Destino, string>> }) {
  const ancora = useRef<HTMLSpanElement>(null)
  const [estado, setEstado] = useState<{ tipo: 'buscando' } | { tipo: 'ok'; empresa: Empresa } | { tipo: 'erro'; texto: string } | null>(null)
  const destinos = JSON.stringify(preencher)

  useEffect(() => {
    const form = ancora.current?.closest('form')
    const entrada = form?.elements.namedItem(campo) as HTMLInputElement | null
    if (!form || !entrada) return
    const mapa = JSON.parse(destinos) as Partial<Record<Destino, string>>
    const preencherVazio = (nome: string | undefined, valor: string) => {
      const el = nome ? form.elements.namedItem(nome) as HTMLInputElement | null : null
      if (!el || !valor || el.value.trim()) return
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, valor)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    let ultimo = cnpjValido(entrada.value)
    let vivo = true
    const aoMudar = async () => {
      const cnpj = cnpjValido(entrada.value)
      if (!cnpj) { if (entrada.value.replace(/\D/g, '').length === 14) setEstado({ tipo: 'erro', texto: 'CNPJ inválido: confira os dígitos.' }); return }
      if (cnpj === ultimo) return
      ultimo = cnpj
      setEstado({ tipo: 'buscando' })
      const r = await consultarCnpj(cnpj)
      if (!vivo || cnpjValido(entrada.value) !== cnpj) return
      if (!r.empresa) { setEstado({ tipo: 'erro', texto: r.erro ?? 'CNPJ não encontrado.' }); return }
      const e = r.empresa
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(entrada, cnpjFormatado(e.cnpj))
      entrada.dispatchEvent(new Event('input', { bubbles: true }))
      preencherVazio(mapa.razaoSocial, e.razaoSocial)
      preencherVazio(mapa.nomeFantasia, e.nomeFantasia || e.razaoSocial)
      preencherVazio(mapa.email, e.email)
      preencherVazio(mapa.telefone, e.telefone)
      setEstado({ tipo: 'ok', empresa: e })
    }
    entrada.addEventListener('input', aoMudar)
    entrada.addEventListener('blur', aoMudar)
    return () => { vivo = false; entrada.removeEventListener('input', aoMudar); entrada.removeEventListener('blur', aoMudar) }
  }, [campo, destinos])

  return (
    <span ref={ancora} className="contents">
      {estado && (
        <span role="status" className="col-span-full -mt-1 block text-xs">
          {estado.tipo === 'buscando' && <span className="flex items-center gap-1.5 text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Consultando a Receita Federal…</span>}
          {estado.tipo === 'erro' && <span className="text-warning-foreground">{estado.texto}</span>}
          {estado.tipo === 'ok' && (estado.empresa.ativa
            ? <span className="flex items-start gap-1.5 text-muted-foreground"><BadgeCheck className="mt-px size-3.5 shrink-0 text-success" /><span><strong className="text-foreground">{estado.empresa.razaoSocial}</strong> · situação ATIVA{data(estado.empresa.dataSituacao) ? ` desde ${data(estado.empresa.dataSituacao)}` : ''}{estado.empresa.municipio ? ` · ${estado.empresa.municipio}/${estado.empresa.uf}` : ''}</span></span>
            : <span className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive"><AlertTriangle className="mt-px size-3.5 shrink-0" /><span><strong>{estado.empresa.razaoSocial}</strong>: situação <strong>{estado.empresa.situacao}</strong> na Receita{data(estado.empresa.dataSituacao) ? ` desde ${data(estado.empresa.dataSituacao)}` : ''}. Confira antes de registrar pagamento ou parceria.</span></span>)}
        </span>
      )}
    </span>
  )
}
