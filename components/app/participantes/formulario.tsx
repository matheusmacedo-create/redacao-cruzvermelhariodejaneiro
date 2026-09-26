'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarParticipante } from '@/app/actions/participantes'
import { DISPONIBILIDADES, TIPOS_SANGUINEOS, UFS, VINCULOS } from '@/lib/participantes/regras'
import { EnderecoPeloCep } from '@/components/app/apis/endereco-pelo-cep'

export type ParticipanteNoFormulario = {
  id: string
  nome: string
  nome_social: string | null
  vinculo: string
  funcao: string | null
  setores: string[]
  email: string | null
  telefone: string | null
  data_nascimento: string | null
  cpf_mascara: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  emergencia_nome: string | null
  emergencia_telefone: string | null
  emergencia_parentesco: string | null
  tem_dados_de_saude: boolean
  responsavel_nome: string | null
  responsavel_telefone: string | null
  habilidades: string[]
  idiomas: string[]
  disponibilidade: string[]
  observacoes: string | null
}

function Campo({ rotulo, dica, children, largo }: { rotulo: string; dica?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>
      {rotulo}{dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}
      {children}
    </label>
  )
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  )
}

/**
 * O cadastro completo, para a equipe. CPF e saúde nunca voltam preenchidos:
 * o campo fica vazio e só troca o valor guardado se alguém escrever nele
 * (ou marcar para apagar).
 */
export function FormularioDeParticipante({ p, setores }: { p: ParticipanteNoFormulario | null; setores: string[] }) {
  const [estado, enviar, enviando] = useActionState(salvarParticipante.bind(null, p?.id ?? null), {})
  const [trocarSaude, setTrocarSaude] = useState(!p?.tem_dados_de_saude)
  const [cpf, setCpf] = useState('')
  const v = (k: keyof ParticipanteNoFormulario) => (p ? (p[k] as string | null) ?? '' : '')

  return (
    <form action={enviar} className="flex flex-col gap-5">
      <Secao titulo="Quem é">
        <Campo rotulo="Nome completo" largo><input id="p-nome" name="nome" required minLength={2} maxLength={200} defaultValue={v('nome')} className={inputClass} /></Campo>
        <Campo rotulo="Nome social" dica="Opcional. Aparece no lugar do nome."><input id="p-nome-social" name="nome_social" maxLength={200} defaultValue={v('nome_social')} className={inputClass} /></Campo>
        <Campo rotulo="Data de nascimento"><input id="p-nascimento" name="data_nascimento" type="date" defaultValue={v('data_nascimento')} className={inputClass} /></Campo>
        <Campo rotulo="CPF" dica={p?.cpf_mascara ? `Guardado: ${p.cpf_mascara}. Deixe em branco para manter.` : 'Guardado cifrado; aparece mascarado.'}>
          {/* Com CPF guardado, o campo só vai no formulário quando alguém digita: vazio não apaga. */}
          <input id="p-cpf" data-ajuda="voluntarios.cpf" name={cpf || !p?.cpf_mascara ? 'cpf' : 'cpf_novo'} value={cpf} onChange={(e) => setCpf(e.target.value)}
            inputMode="numeric" maxLength={14} placeholder="000.000.000-00" className={inputClass} />
        </Campo>
      </Secao>

      <Secao titulo="Vínculo com a filial">
        <Campo rotulo="Vínculo">
          <select id="p-vinculo" name="vinculo" defaultValue={p?.vinculo ?? 'voluntario'} className={inputClass}>
            {Object.entries(VINCULOS).map(([k, x]) => <option key={k} value={k}>{x.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Função" dica="Ex.: socorrista, instrutor de primeiros socorros"><input id="p-funcao" name="funcao" maxLength={120} defaultValue={v('funcao')} className={inputClass} /></Campo>
        <fieldset className="sm:col-span-2" data-ajuda="voluntarios.setores">
          <legend className="mb-1.5 text-sm font-medium">Setores</legend>
          <div className="flex flex-wrap gap-2">
            {[...setores, ...(p?.setores ?? []).filter((s) => !setores.includes(s))].map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary">
                <input type="checkbox" name="setores" value={s} defaultChecked={p?.setores.includes(s)} className="sr-only" />{s}
              </label>
            ))}
          </div>
          <input type="hidden" name="setores" value="" />
        </fieldset>
      </Secao>

      <Secao titulo="Contato e endereço">
        <Campo rotulo="E-mail"><input id="p-email" name="email" type="email" maxLength={254} defaultValue={v('email')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input id="p-telefone" name="telefone" type="tel" maxLength={40} defaultValue={v('telefone')} className={inputClass} /></Campo>
        <Campo rotulo="CEP"><input id="p-cep" name="cep" inputMode="numeric" maxLength={12} defaultValue={v('cep')} className={inputClass} /></Campo>
        <EnderecoPeloCep />
        <Campo rotulo="Logradouro"><input id="p-logradouro" name="logradouro" maxLength={200} defaultValue={v('logradouro')} className={inputClass} /></Campo>
        <Campo rotulo="Número"><input id="p-numero" name="numero" maxLength={20} defaultValue={v('numero')} className={inputClass} /></Campo>
        <Campo rotulo="Complemento"><input id="p-complemento" name="complemento" maxLength={120} defaultValue={v('complemento')} className={inputClass} /></Campo>
        <Campo rotulo="Bairro"><input id="p-bairro" name="bairro" maxLength={120} defaultValue={v('bairro')} className={inputClass} /></Campo>
        <Campo rotulo="Cidade"><input id="p-cidade" name="cidade" maxLength={120} defaultValue={v('cidade')} className={inputClass} /></Campo>
        <Campo rotulo="UF">
          <select id="p-uf" name="uf" defaultValue={p?.uf ?? 'RJ'} className={inputClass}>
            <option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </Secao>

      <Secao titulo="Emergência e responsável" descricao="Responsável legal é obrigatório para menores de 18 anos.">
        <Campo rotulo="Contato de emergência"><input id="p-emerg-nome" name="emergencia_nome" maxLength={200} defaultValue={v('emergencia_nome')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone de emergência"><input id="p-emerg-tel" name="emergencia_telefone" type="tel" maxLength={40} defaultValue={v('emergencia_telefone')} className={inputClass} /></Campo>
        <Campo rotulo="Parentesco"><input id="p-emerg-par" name="emergencia_parentesco" maxLength={60} defaultValue={v('emergencia_parentesco')} className={inputClass} /></Campo>
        <span className="hidden sm:block" />
        <Campo rotulo="Responsável legal"><input id="p-resp-nome" data-ajuda="voluntarios.responsavel" name="responsavel_nome" maxLength={200} defaultValue={v('responsavel_nome')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone do responsável"><input id="p-resp-tel" name="responsavel_telefone" type="tel" maxLength={40} defaultValue={v('responsavel_telefone')} className={inputClass} /></Campo>
      </Secao>

      <Secao titulo="Saúde" descricao="Dado sensível (LGPD). Guardado cifrado; só quem tem acesso a dados sensíveis vê, e cada abertura fica registrada.">
        {trocarSaude ? (
          <>
            <Campo rotulo="Tipo sanguíneo">
              <select id="p-tipo" data-ajuda="voluntarios.saude" name="tipo_sanguineo" defaultValue="" className={inputClass}>
                <option value="">Não informado</option>{TIPOS_SANGUINEOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Alergias, restrições ou condições" largo>
              <textarea id="p-restricoes" name="restricoes_saude" rows={2} maxLength={2000} className={inputClass} />
            </Campo>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2" data-ajuda="voluntarios.saude">
            <Lock className="size-4" />Há dados de saúde guardados.
            <button type="button" onClick={() => setTrocarSaude(true)} className="font-medium text-primary hover:underline">Substituir</button>
          </p>
        )}
      </Secao>

      <Secao titulo="Perfil de voluntariado">
        <Campo rotulo="Habilidades" dica="Separadas por vírgula" largo><input id="p-habilidades" name="habilidades" defaultValue={p?.habilidades.join(', ') ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Idiomas" dica="Separados por vírgula"><input id="p-idiomas" name="idiomas" defaultValue={p?.idiomas.join(', ') ?? ''} className={inputClass} /></Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Disponibilidade</legend>
          <div className="flex flex-wrap gap-2">
            {DISPONIBILIDADES.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary">
                <input type="checkbox" name="disponibilidade" value={d} defaultChecked={p?.disponibilidade.includes(d)} className="sr-only" />{d}
              </label>
            ))}
          </div>
          <input type="hidden" name="disponibilidade" value="" />
        </fieldset>
        <Campo rotulo="Observações" largo><textarea id="p-obs" name="observacoes" rows={3} maxLength={4000} defaultValue={v('observacoes')} className={inputClass} /></Campo>
      </Secao>

      {estado.erro && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" render={<Link href={p ? `/voluntariado/${p.id}` : '/voluntariado'} />}>Cancelar</Button>
        <Button type="submit" disabled={enviando} data-ajuda="voluntarios.salvar">{enviando && <Loader2 className="size-4 animate-spin" />}{p ? 'Salvar alterações' : 'Cadastrar'}</Button>
      </div>
    </form>
  )
}
