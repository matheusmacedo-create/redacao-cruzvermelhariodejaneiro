'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { DISPONIBILIDADES, TIPOS_SANGUINEOS, UFS, ehMenor } from '@/lib/participantes/regras'

const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#e32219] focus:ring-2 focus:ring-[#e32219]/20'

function Campo({ rotulo, dica, children, largo }: { rotulo: string; dica?: string; children: React.ReactNode; largo?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium text-neutral-800 ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{dica && <span className="text-xs font-normal text-neutral-500">{dica}</span>}{children}</label>
}

/**
 * A inscrição de voluntários. Envia para /api/participe; a inscrição chega à
 * coordenação do Voluntariado como pendente.
 */
export function FormularioPublico({ hoje, setores }: { hoje: string; setores: string[] }) {
  const [inicio] = useState(() => Date.now())
  const [nascimento, setNascimento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const menor = ehMenor(nascimento || null, hoje)

  if (pronto) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-900">
        <CheckCircle2 className="size-10" />
        <p className="text-lg font-semibold">Inscrição recebida. Obrigado!</p>
        <p className="max-w-md text-sm">A coordenação do Voluntariado vai analisar e entrar em contato pelo e-mail ou telefone informados.</p>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={async (e) => {
      e.preventDefault()
      setErro('')
      setEnviando(true)
      try {
        const f = new FormData(e.currentTarget)
        f.set('_inicio', String(inicio))
        const r = await fetch('/api/participe', { method: 'POST', body: f })
        const j = await r.json().catch(() => ({})) as { ok?: boolean; erro?: string }
        if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não foi possível enviar. Tente de novo.'); return }
        setPronto(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch {
        setErro('Sem conexão. Confira a internet e tente de novo.')
      } finally {
        setEnviando(false)
      }
    }}>
      {/* Armadilha para robôs: pessoas não veem nem preenchem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Site<input name="site" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold text-neutral-900">Sobre você</legend>
        <Campo rotulo="Nome completo" largo><input id="i-nome" name="nome" required minLength={2} maxLength={200} autoComplete="name" className={campo} /></Campo>
        <Campo rotulo="Nome social" dica="Opcional"><input id="i-nome-social" name="nome_social" maxLength={200} className={campo} /></Campo>
        <Campo rotulo="Data de nascimento"><input id="i-nascimento" name="data_nascimento" type="date" required max={hoje} value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={campo} /></Campo>
        <Campo rotulo="E-mail"><input id="i-email" name="email" type="email" required maxLength={254} autoComplete="email" className={campo} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input id="i-telefone" name="telefone" type="tel" required maxLength={40} autoComplete="tel" className={campo} /></Campo>
        <Campo rotulo="CPF" dica="Opcional agora; necessário para o seguro do voluntário."><input id="i-cpf" name="cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" className={campo} /></Campo>
        <Campo rotulo="Como quer participar">
          <select id="i-vinculo" name="vinculo" className={campo}><option value="voluntario">Voluntariado</option><option value="jovem">Juventude (jovens voluntários)</option></select>
        </Campo>
      </fieldset>

      {menor && (
        <fieldset className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold text-amber-900">Menor de 18 anos: dados do responsável</legend>
          <Campo rotulo="Nome do responsável"><input id="i-resp-nome" name="responsavel_nome" required maxLength={200} className={campo} /></Campo>
          <Campo rotulo="Telefone do responsável"><input id="i-resp-tel" name="responsavel_telefone" type="tel" required maxLength={40} className={campo} /></Campo>
        </fieldset>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold text-neutral-900">Onde você está</legend>
        <Campo rotulo="Bairro"><input id="i-bairro" name="bairro" maxLength={120} className={campo} /></Campo>
        <Campo rotulo="Cidade"><input id="i-cidade" name="cidade" maxLength={120} defaultValue="Rio de Janeiro" className={campo} /></Campo>
        <Campo rotulo="UF"><select id="i-uf" name="uf" defaultValue="RJ" className={campo}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-neutral-900">Áreas de interesse</legend>
        <div className="flex flex-wrap gap-2">
          {setores.filter((s) => !['Diretoria', 'Jurídico', 'Tecnologia da Informação'].includes(s)).map((s) => (
            <label key={s} className="flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-sm has-[:checked]:border-[#e32219] has-[:checked]:bg-red-50 has-[:checked]:text-[#b3170f]">
              <input type="checkbox" name="setores" value={s} className="sr-only" />{s}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-neutral-900">Disponibilidade</legend>
        <div className="flex flex-wrap gap-2">
          {DISPONIBILIDADES.map((d) => (
            <label key={d} className="flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-sm has-[:checked]:border-[#e32219] has-[:checked]:bg-red-50 has-[:checked]:text-[#b3170f]">
              <input type="checkbox" name="disponibilidade" value={d} className="sr-only" />{d}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold text-neutral-900">Habilidades e emergência</legend>
        <Campo rotulo="Habilidades e formações" dica="Separadas por vírgula. Ex.: primeiros socorros, Libras, fotografia" largo><input id="i-habilidades" name="habilidades" className={campo} /></Campo>
        <Campo rotulo="Contato de emergência"><input id="i-emerg-nome" name="emergencia_nome" maxLength={200} className={campo} /></Campo>
        <Campo rotulo="Telefone de emergência"><input id="i-emerg-tel" name="emergencia_telefone" type="tel" maxLength={40} className={campo} /></Campo>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold text-neutral-900">Saúde <span className="text-sm font-normal text-neutral-500">(opcional)</span></legend>
        <p className="text-xs text-neutral-600 sm:col-span-2">Ajuda a equipe a cuidar de você em ações de campo. Fica guardado cifrado e só a coordenação vê.</p>
        <Campo rotulo="Tipo sanguíneo"><select id="i-tipo" name="tipo_sanguineo" className={campo}><option value="">Prefiro não informar</option>{TIPOS_SANGUINEOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo rotulo="Alergias ou restrições"><input id="i-restricoes" name="restricoes_saude" maxLength={2000} className={campo} /></Campo>
      </fieldset>

      <details className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
        <summary className="cursor-pointer font-semibold text-neutral-900">Termo de tratamento de dados pessoais (LGPD)</summary>
        <div className="mt-3 flex flex-col gap-2">
          <p>A Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro trata os dados deste formulário para analisar a sua inscrição, organizar as atividades de voluntariado, contratar o seguro de voluntário quando houver, e falar com você e com o seu contato de emergência.</p>
          <p>CPF e dados de saúde ficam guardados cifrados e só são vistos por quem coordena o voluntariado; cada acesso fica registrado. Os dados não são vendidos nem compartilhados para fins comerciais.</p>
          <p>Você pode pedir a qualquer momento acesso, correção ou a exclusão dos seus dados pelos canais oficiais da filial. Dados de menores de 18 anos são tratados com a autorização do responsável.</p>
        </div>
      </details>
      <label className="flex items-start gap-3 text-sm text-neutral-800">
        <input id="i-consentimento" type="checkbox" name="consentimento" value="sim" required className="mt-0.5 size-4 accent-[#e32219]" />
        <span>Li o termo e autorizo o tratamento dos meus dados{menor ? ' (como responsável pelo menor)' : ''} para o voluntariado na Cruz Vermelha.</span>
      </label>

      {erro && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{erro}</p>}
      <button type="submit" disabled={enviando} className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-[#e32219] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c41d15] disabled:opacity-60">
        {enviando && <Loader2 className="size-4 animate-spin" />}Enviar inscrição
      </button>
    </form>
  )
}
