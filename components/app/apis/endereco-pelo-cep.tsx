'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, MapPin } from 'lucide-react'
import { consultarCep, listarMunicipiosDoRio } from '@/app/actions/apis-publicas'
import { cepFormatado, cepValido, municipioOficial } from '@/lib/apis-publicas/regras'

/**
 * Ponha dentro de um formulário que tenha campos com os nomes cep,
 * logradouro, bairro, cidade e uf. Ao digitar um CEP completo, o endereço
 * se preenche sozinho (BrasilAPI, com o ViaCEP de reserva) e o cursor vai
 * para o número. O campo cidade passa a sugerir os municípios do RJ com a
 * grafia oficial do IBGE.
 *
 * Funciona sobre campos não controlados (defaultValue), que é como os
 * formulários de cadastro daqui são feitos, e avisa o React de cada mudança
 * — assim "há alterações não salvas" continua valendo.
 */
const NOMES = { cep: 'cep', logradouro: 'logradouro', bairro: 'bairro', cidade: 'cidade', uf: 'uf', numero: 'numero' } as const

export function EnderecoPeloCep({ nomes = NOMES }: { nomes?: typeof NOMES }) {
  const ancora = useRef<HTMLSpanElement>(null)
  const idDaLista = `municipios-rj-${useId().replace(/:/g, '')}`
  const [municipios, setMunicipios] = useState<string[]>([])
  const [estado, setEstado] = useState<{ tipo: 'buscando' | 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    const form = ancora.current?.closest('form')
    if (!form) return
    const campo = (nome: string) => form.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement | null
    const cep = campo(nomes.cep) as HTMLInputElement | null
    const cidade = campo(nomes.cidade) as HTMLInputElement | null
    if (!cep) return

    const definir = (el: HTMLInputElement | HTMLSelectElement | null, valor: string) => {
      if (!el || !valor || el.value === valor) return
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    }

    let ultimo = cepValido(cep.value)
    let vivo = true
    const aoMudar = async () => {
      const digitado = cepValido(cep.value)
      if (!digitado || digitado === ultimo) return
      ultimo = digitado
      setEstado({ tipo: 'buscando', texto: 'Buscando o endereço…' })
      const r = await consultarCep(digitado)
      if (!vivo || cepValido(cep.value) !== digitado) return
      if (!r.endereco) { setEstado({ tipo: 'erro', texto: r.erro ?? 'CEP não encontrado.' }); return }
      const e = r.endereco
      definir(cep, cepFormatado(e.cep))
      definir(campo(nomes.logradouro), e.logradouro)
      definir(campo(nomes.bairro), e.bairro)
      definir(cidade, e.cidade)
      definir(campo(nomes.uf), e.uf)
      setEstado({ tipo: 'ok', texto: `${[e.logradouro, e.bairro, `${e.cidade}/${e.uf}`].filter(Boolean).join(' · ')}. Confira e complete o número.` })
      const numero = campo(nomes.numero) as HTMLInputElement | null
      if (numero && !numero.value) numero.focus()
    }
    // Grafia oficial ao sair do campo cidade ("niteroi" → "Niterói").
    const aoSairDaCidade = () => {
      const uf = campo(nomes.uf)?.value
      if (!cidade || (uf && uf !== 'RJ')) return
      const oficial = municipioOficial(cidade.value, municipiosRef.current)
      if (oficial) definir(cidade, oficial)
    }
    cep.addEventListener('input', aoMudar)
    cep.addEventListener('blur', aoMudar)
    cidade?.addEventListener('blur', aoSairDaCidade)
    if (cidade) cidade.setAttribute('list', idDaLista)
    return () => {
      vivo = false
      cep.removeEventListener('input', aoMudar)
      cep.removeEventListener('blur', aoMudar)
      cidade?.removeEventListener('blur', aoSairDaCidade)
    }
  }, [idDaLista, nomes])

  const municipiosRef = useRef<string[]>([])
  useEffect(() => {
    let vivo = true
    listarMunicipiosDoRio().then((lista) => { if (vivo) { municipiosRef.current = lista; setMunicipios(lista) } }).catch(() => undefined)
    return () => { vivo = false }
  }, [])

  return (
    <span ref={ancora} className="contents">
      <datalist id={idDaLista}>{municipios.map((m) => <option key={m} value={m} />)}</datalist>
      {estado && (
        <span role="status" className={`col-span-full -mt-1 flex items-center gap-1.5 text-xs ${estado.tipo === 'erro' ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
          {estado.tipo === 'buscando' ? <LoaderCircle className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}{estado.texto}
        </span>
      )}
    </span>
  )
}
