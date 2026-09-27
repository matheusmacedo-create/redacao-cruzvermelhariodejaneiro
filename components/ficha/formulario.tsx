'use client'

import { useState, useTransition } from 'react'
import { CircleCheck, Send } from 'lucide-react'
import { enviarFicha } from '@/app/actions/ficha'
import { botaoDoMembro, campoDoMembro } from '@/components/membro/marca'
import { Recado, Secao } from '@/components/membro/pecas'
import { RotuloDeEnvio } from '@/components/membro/perfil'

type Campo = { campo: string; rotulo: string; tipo: string; max: number; preenchido: boolean }

const cartao = 'rounded-xl border border-border bg-card p-4 sm:p-5'
const GRUPOS: { titulo: string; campos: string[] }[] = [
  { titulo: 'Contato e nascimento', campos: ['telefone_pessoal', 'email_pessoal', 'data_nascimento'] },
  { titulo: 'Endereço', campos: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] },
  { titulo: 'Contato de emergência', campos: ['emergencia_nome', 'emergencia_parentesco', 'emergencia_telefone'] },
]

/**
 * A ficha que a própria pessoa completa. Nenhum valor já guardado aparece
 * aqui (quem tiver o link não lê nada): o campo só diz "já preenchido", e
 * deixar em branco mantém o que o RH tem. Envia por onSubmit + transição:
 * o formulário não se apaga quando o servidor recusa.
 */
export function FormularioDaFicha({ token, campos, documentos, temDocumentos }: {
  token: string; campos: Campo[]; documentos: { campo: string; rotulo: string }[]; temDocumentos: boolean
}) {
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [ocupado, iniciar] = useTransition()
  if (pronto) {
    return (
      <Recado tipo="sucesso" titulo="Pronto, obrigado!">
        Os seus dados chegaram ao RH. Este link não vale mais; se precisar corrigir algo, fale com o RH.
      </Recado>
    )
  }
  const porCampo = new Map(campos.map((c) => [c.campo, c]))
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => {
      e.preventDefault()
      const dados = new FormData(e.currentTarget)
      iniciar(async () => {
        setErro('')
        const r = await enviarFicha(token, dados)
        if (r.erro) setErro(r.erro)
        else setPronto(true)
      })
    }}>
      <p className="text-sm text-muted-foreground">Preencha o que falta. O que já estiver preenchido pode ficar em branco: nada é apagado. O link vale uma vez só.</p>
      {GRUPOS.map((g) => (
        <Secao key={g.titulo} titulo={g.titulo} className={cartao}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.campos.map((nome) => {
              const c = porCampo.get(nome)
              if (!c) return null
              return (
                <label key={c.campo} className="flex flex-col gap-1 text-sm font-medium" htmlFor={`ficha-${c.campo}`}>
                  <span>{c.rotulo}{c.preenchido && <span className="ml-1.5 inline-flex items-center gap-1 font-normal text-(--success-texto)"><CircleCheck className="size-3.5" aria-hidden="true" />já preenchido</span>}</span>
                  <input id={`ficha-${c.campo}`} name={c.campo} type={c.tipo} maxLength={c.max} className={campoDoMembro}
                    autoComplete={c.campo === 'email_pessoal' ? 'email' : c.campo === 'telefone_pessoal' ? 'tel' : c.campo === 'cep' ? 'postal-code' : 'off'}
                    placeholder={c.preenchido ? 'Deixe em branco para manter' : undefined} />
                </label>
              )
            })}
          </div>
        </Secao>
      ))}
      {documentos.length > 0 && (
        <Secao titulo="Documentos" className={cartao}>
          <p className="mb-3 text-sm text-muted-foreground">{temDocumentos ? 'O RH já tem parte dos seus documentos. Preencha só o que falta ou mudou.' : 'Os números dos seus documentos. Ficam guardados cifrados.'}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {documentos.map((d) => (
              <label key={d.campo} className="flex flex-col gap-1 text-sm font-medium" htmlFor={`ficha-doc-${d.campo}`}>
                {d.rotulo}
                <input id={`ficha-doc-${d.campo}`} name={`doc_${d.campo}`} maxLength={60} autoComplete="off" className={campoDoMembro} />
              </label>
            ))}
          </div>
        </Secao>
      )}
      {erro && <Recado tipo="erro">{erro}</Recado>}
      <div>
        <button type="submit" disabled={ocupado} className={botaoDoMembro}><RotuloDeEnvio ocupado={ocupado} icone={Send} rotulo="Enviar ao RH" andamento="Enviando…" /></button>
      </div>
    </form>
  )
}
