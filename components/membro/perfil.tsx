'use client'

import { useActionState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { salvarPerfil } from '@/app/actions/membro'
import { DISPONIBILIDADES, UFS } from '@/lib/participantes/regras'
import type { Perfil } from '@/lib/membro/dados'
import { botaoDoMembro, campoDoMembro } from './marca'

function Campo({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium text-neutral-800 ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{children}</label>
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 font-semibold">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/** O que o voluntário pode mudar sozinho. O banco confere a lista de novo. */
export function FormularioDoPerfil({ p }: { p: Perfil }) {
  const [estado, enviar, enviando] = useActionState(salvarPerfil, {})
  const v = (k: keyof Perfil) => String(p[k] ?? '')
  return (
    <form action={enviar} className="flex flex-col gap-4" id="form-perfil">
      <Bloco titulo="Contato">
        <Campo rotulo="Como prefere ser chamado (nome social)"><input id="m-nome-social" name="nome_social" maxLength={200} defaultValue={v('nome_social')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input id="m-telefone" name="telefone" type="tel" maxLength={40} defaultValue={v('telefone')} className={campoDoMembro} /></Campo>
      </Bloco>
      <Bloco titulo="Endereço">
        <Campo rotulo="CEP"><input id="m-cep" name="cep" inputMode="numeric" maxLength={12} defaultValue={v('cep')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Logradouro"><input id="m-logradouro" name="logradouro" maxLength={200} defaultValue={v('logradouro')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Número"><input id="m-numero" name="numero" maxLength={20} defaultValue={v('numero')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Complemento"><input id="m-complemento" name="complemento" maxLength={120} defaultValue={v('complemento')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Bairro"><input id="m-bairro" name="bairro" maxLength={120} defaultValue={v('bairro')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Cidade"><input id="m-cidade" name="cidade" maxLength={120} defaultValue={v('cidade')} className={campoDoMembro} /></Campo>
        <Campo rotulo="UF">
          <select id="m-uf" name="uf" defaultValue={p.uf ?? 'RJ'} className={campoDoMembro}><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </Campo>
      </Bloco>
      <Bloco titulo="Contato de emergência">
        <Campo rotulo="Nome"><input id="m-emerg-nome" name="emergencia_nome" maxLength={200} defaultValue={v('emergencia_nome')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Telefone"><input id="m-emerg-tel" name="emergencia_telefone" type="tel" maxLength={40} defaultValue={v('emergencia_telefone')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Parentesco"><input id="m-emerg-par" name="emergencia_parentesco" maxLength={60} defaultValue={v('emergencia_parentesco')} className={campoDoMembro} /></Campo>
      </Bloco>
      <Bloco titulo="Perfil de voluntariado">
        <Campo rotulo="Habilidades (separadas por vírgula)" largo><input id="m-habilidades" name="habilidades" defaultValue={p.habilidades.join(', ')} className={campoDoMembro} /></Campo>
        <Campo rotulo="Idiomas (separados por vírgula)" largo><input id="m-idiomas" name="idiomas" defaultValue={p.idiomas.join(', ')} className={campoDoMembro} /></Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-neutral-800">Quando posso atuar</legend>
          <div className="flex flex-wrap gap-2">
            {DISPONIBILIDADES.map((d) => (
              <label key={d} className="flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs has-[:checked]:border-[#e32219] has-[:checked]:bg-red-50 has-[:checked]:text-[#e32219]">
                <input type="checkbox" name="disponibilidade" value={d} defaultChecked={p.disponibilidade.includes(d)} className="sr-only" />{d}
              </label>
            ))}
          </div>
          <input type="hidden" name="disponibilidade" value="" />
        </fieldset>
      </Bloco>
      {estado.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{estado.erro}</p>}
      {estado.ok && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status"><CheckCircle2 className="size-4" />Cadastro atualizado.</p>}
      <div className="flex justify-end"><button type="submit" disabled={enviando} className={botaoDoMembro}>{enviando && <Loader2 className="size-4 animate-spin" />}Salvar</button></div>
    </form>
  )
}
