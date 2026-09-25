'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, TriangleAlert, XCircle } from 'lucide-react'
import { DISPONIBILIDADES, TIPOS_SANGUINEOS, UFS, cpfValido, ehMenor, somenteDigitos } from '@/lib/participantes/regras'
import { botaoDoMembro, campoDoMembro } from '@/components/membro/marca'
import { Recado } from '@/components/membro/pecas'
import { cn } from '@/lib/utils'

// O servidor descarta, fingindo sucesso, o envio feito em menos de 4 s (armadilha
// para robôs). Quem preenche rápido com o preenchimento automático espera o resto
// aqui, em vez de ver "Inscrição recebida" sem a inscrição ter sido gravada.
const TEMPO_MINIMO_MS = 4500

/**
 * Rótulo, dica e campo. O `*` é só visual: o `required` do campo já diz
 * "obrigatório" ao leitor de tela. A dica tem id `${id}-dica`, e o erro,
 * `${id}-erro`, para o campo apontar com `aria-describedby`.
 */
function Campo({ id, rotulo, dica, erro, obrigatorio, largo, children }: {
  id: string; rotulo: string; dica?: string; erro?: string; obrigatorio?: boolean; largo?: boolean; children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', largo && 'sm:col-span-2')}>
      <label htmlFor={id} className="text-sm font-medium">{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      {dica && <p id={`${id}-dica`} className="text-sm text-muted-foreground">{dica}</p>}
      {children}
      {erro && <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm text-destructive"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{erro}</p>}
    </div>
  )
}

/** Chip de múltipla escolha: alvo de 44px, foco visível e check no marcado, como no Perfil da área. */
function Chip({ name, valor }: { name: string; valor: string }) {
  return (
    <label className="group inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:hover:bg-primary/90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
      <input type="checkbox" name={name} value={valor} className="sr-only" />
      <Check className="hidden size-4 shrink-0 group-has-[:checked]:block" aria-hidden="true" />{valor}
    </label>
  )
}

const legenda = 'mb-3 text-base font-semibold'

/**
 * A inscrição de voluntários. Envia para /api/participe; a inscrição chega à
 * coordenação do Voluntariado como pendente.
 */
export function FormularioPublico({ hoje, setores }: { hoje: string; setores: string[] }) {
  const [inicio] = useState(() => Date.now())
  const [nascimento, setNascimento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroDoCpf, setErroDoCpf] = useState('')
  // O e-mail informado: a tela de sucesso mostra por inteiro, para a pessoa notar erro de digitação.
  const [pronto, setPronto] = useState<{ email: string } | null>(null)
  const menor = ehMenor(nascimento || null, hoje)
  const refDoErro = useRef<HTMLDivElement>(null)
  const refDoSucesso = useRef<HTMLDivElement>(null)
  const refDoCpf = useRef<HTMLInputElement>(null)

  // Erro do envio: o foco vai para o recado, que fica logo acima do botão, e o leitor de tela lê.
  useEffect(() => { if (erro) refDoErro.current?.focus() }, [erro])

  // Sucesso: o formulário some; o foco vai para o recado e a página volta ao topo.
  useEffect(() => {
    if (!pronto) return
    refDoSucesso.current?.focus({ preventScroll: true })
    const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: semAnimacao ? 'auto' : 'smooth' })
  }, [pronto])

  if (pronto) {
    const email = <strong className="font-semibold text-foreground wrap-anywhere">{pronto.email}</strong>
    return (
      <div className="flex flex-col gap-6">
        <Recado ref={refDoSucesso} tabIndex={-1} tipo="sucesso" titulo="Inscrição recebida. Obrigado!">
          <p>A coordenação do Voluntariado já recebeu os seus dados.</p>
        </Recado>
        <section aria-labelledby="proximos-passos" className="flex flex-col gap-4">
          <h2 id="proximos-passos" className="text-base font-semibold">Próximos passos</h2>
          <ol className="flex flex-col gap-4">
            {[
              { titulo: 'A coordenação analisa a sua inscrição', texto: <>Se precisar de alguma informação, entra em contato pelo e-mail ou pelo telefone que você informou.</> },
              { titulo: 'Chega um e-mail de boas-vindas', texto: <>Quando a inscrição for aprovada, enviamos para {email}. Se não aparecer na caixa de entrada, procure no Spam ou em Promoções.</> },
              { titulo: 'Você entra sem senha', texto: <>Na Área do Voluntário, informe {email} e digite o código que chega por e-mail a cada acesso.</> },
            ].map((passo, i) => (
              <li key={passo.titulo} className="flex gap-3">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{i + 1}</span>
                <div className="min-w-0 pt-0.5">
                  <p className="font-semibold">{passo.titulo}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{passo.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-8" aria-busy={enviando} onSubmit={async (e) => {
      e.preventDefault()
      setErro('')
      const f = new FormData(e.currentTarget)
      // A mesma conferência do servidor (lerFormulario): CPF é opcional, mas, se vier, tem de ser válido.
      const cpf = somenteDigitos(String(f.get('cpf') ?? ''))
      if (cpf && !cpfValido(cpf)) {
        setErroDoCpf('CPF inválido. Confira os 11 números ou deixe em branco para informar depois.')
        refDoCpf.current?.focus()
        return
      }
      setEnviando(true)
      try {
        f.set('_inicio', String(inicio))
        const falta = inicio + TEMPO_MINIMO_MS - Date.now()
        if (falta > 0) await new Promise((r) => setTimeout(r, falta))
        const r = await fetch('/api/participe', { method: 'POST', body: f })
        const j = await r.json().catch(() => ({})) as { ok?: boolean; erro?: string }
        if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não foi possível enviar. Tente de novo.'); return }
        setPronto({ email: String(f.get('email') ?? '').trim() })
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

      <p className="-mb-2 text-sm text-muted-foreground">Campos com * são obrigatórios.</p>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className={legenda}>Sobre você</legend>
        <Campo id="i-nome" rotulo="Nome completo" obrigatorio largo><input id="i-nome" name="nome" required minLength={2} maxLength={200} autoComplete="name" className={campoDoMembro} /></Campo>
        <Campo id="i-nome-social" rotulo="Nome social"><input id="i-nome-social" name="nome_social" maxLength={200} className={campoDoMembro} /></Campo>
        <Campo id="i-nascimento" rotulo="Data de nascimento" obrigatorio>
          {/* Sem `text-left`, o Safari do iPhone centraliza a data. */}
          <input id="i-nascimento" name="data_nascimento" type="date" required min="1900-01-01" max={hoje} autoComplete="bday" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={cn(campoDoMembro, 'min-w-0 [&::-webkit-date-and-time-value]:text-left')} />
        </Campo>
        <Campo id="i-email" rotulo="E-mail" obrigatorio><input id="i-email" name="email" type="email" required maxLength={254} autoComplete="email" className={campoDoMembro} /></Campo>
        <Campo id="i-telefone" rotulo="Telefone / WhatsApp" obrigatorio><input id="i-telefone" name="telefone" type="tel" required maxLength={40} autoComplete="tel" className={campoDoMembro} /></Campo>
        <Campo id="i-cpf" rotulo="CPF" dica="Opcional agora; necessário para o seguro do voluntário." erro={erroDoCpf}>
          <input id="i-cpf" ref={refDoCpf} name="cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" aria-invalid={erroDoCpf ? true : undefined} aria-describedby={erroDoCpf ? 'i-cpf-dica i-cpf-erro' : 'i-cpf-dica'} onChange={() => { if (erroDoCpf) setErroDoCpf('') }} className={campoDoMembro} />
        </Campo>
        <Campo id="i-vinculo" rotulo="Como quer participar">
          <select id="i-vinculo" name="vinculo" className={campoDoMembro}><option value="voluntario">Voluntariado</option><option value="jovem">Juventude (jovens voluntários)</option></select>
        </Campo>
      </fieldset>

      {/* A caixa fica num div, e não no fieldset: com borda, a legenda do fieldset corta a linha de cima. */}
      {menor && (
        <div className="rounded-xl border border-warning/50 bg-warning/15 p-4">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold text-warning-foreground">
              <span className="flex items-center gap-2"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />Menor de 18 anos: dados do responsável</span>
            </legend>
            <Campo id="i-resp-nome" rotulo="Nome do responsável" obrigatorio><input id="i-resp-nome" name="responsavel_nome" required maxLength={200} className={campoDoMembro} /></Campo>
            <Campo id="i-resp-tel" rotulo="Telefone do responsável" obrigatorio><input id="i-resp-tel" name="responsavel_telefone" type="tel" required maxLength={40} className={campoDoMembro} /></Campo>
          </fieldset>
        </div>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className={legenda}>Onde você está</legend>
        <Campo id="i-bairro" rotulo="Bairro"><input id="i-bairro" name="bairro" maxLength={120} className={campoDoMembro} /></Campo>
        <Campo id="i-cidade" rotulo="Cidade"><input id="i-cidade" name="cidade" maxLength={120} defaultValue="Rio de Janeiro" autoComplete="address-level2" className={campoDoMembro} /></Campo>
        <Campo id="i-uf" rotulo="UF"><select id="i-uf" name="uf" defaultValue="RJ" autoComplete="address-level1" className={campoDoMembro}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
      </fieldset>

      <fieldset aria-describedby="i-setores-dica">
        <legend className="mb-1 text-base font-semibold">Áreas de interesse</legend>
        <p id="i-setores-dica" className="mb-3 text-sm text-muted-foreground">Marque quantas quiser.</p>
        <div className="flex flex-wrap gap-2">
          {setores.filter((s) => !['Diretoria', 'Jurídico', 'Tecnologia da Informação'].includes(s)).map((s) => <Chip key={s} name="setores" valor={s} />)}
        </div>
      </fieldset>

      <fieldset aria-describedby="i-disponibilidade-dica">
        <legend className="mb-1 text-base font-semibold">Disponibilidade</legend>
        <p id="i-disponibilidade-dica" className="mb-3 text-sm text-muted-foreground">Marque quantas quiser.</p>
        <div className="flex flex-wrap gap-2">
          {DISPONIBILIDADES.map((d) => <Chip key={d} name="disponibilidade" valor={d} />)}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className={legenda}>Habilidades e emergência</legend>
        <Campo id="i-habilidades" rotulo="Habilidades e formações" dica="Separe por vírgula. Ex.: primeiros socorros, Libras, fotografia" largo><input id="i-habilidades" name="habilidades" aria-describedby="i-habilidades-dica" className={campoDoMembro} /></Campo>
        <Campo id="i-emerg-nome" rotulo="Contato de emergência"><input id="i-emerg-nome" name="emergencia_nome" maxLength={200} className={campoDoMembro} /></Campo>
        <Campo id="i-emerg-tel" rotulo="Telefone de emergência"><input id="i-emerg-tel" name="emergencia_telefone" type="tel" maxLength={40} className={campoDoMembro} /></Campo>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" aria-describedby="i-saude-dica">
        <legend className="mb-1 text-base font-semibold">Saúde <span className="text-sm font-normal text-muted-foreground">(opcional)</span></legend>
        <p id="i-saude-dica" className="text-sm text-muted-foreground sm:col-span-2">Ajuda a equipe a cuidar de você em ações de campo. Fica guardado cifrado e só a coordenação vê.</p>
        <Campo id="i-tipo" rotulo="Tipo sanguíneo"><select id="i-tipo" name="tipo_sanguineo" className={campoDoMembro}><option value="">Prefiro não informar</option>{TIPOS_SANGUINEOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo id="i-restricoes" rotulo="Alergias ou restrições"><input id="i-restricoes" name="restricoes_saude" maxLength={2000} className={campoDoMembro} /></Campo>
      </fieldset>

      <div className="flex flex-col gap-3">
        <details className="group rounded-xl border border-border bg-muted/50 text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
            Termo de tratamento de dados pessoais (LGPD)
            <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <p>A Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro trata os dados deste formulário para analisar a sua inscrição, organizar as atividades de voluntariado, contratar o seguro de voluntário quando houver, e falar com você e com o seu contato de emergência.</p>
            <p>CPF e dados de saúde ficam guardados cifrados e só são vistos por quem coordena o voluntariado; cada acesso fica registrado. Os dados não são vendidos nem compartilhados para fins comerciais.</p>
            <p>Você pode pedir a qualquer momento acesso, correção ou a exclusão dos seus dados pelos canais oficiais da filial. Dados de menores de 18 anos são tratados com a autorização do responsável.</p>
          </div>
        </details>
        {/* O rótulo inteiro é clicável: o alvo passa dos 44px mesmo com a caixa de 20px. */}
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
          <input id="i-consentimento" type="checkbox" name="consentimento" value="sim" required className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary" />
          <span>Li o termo e autorizo o tratamento dos meus dados{menor ? ' (como responsável pelo menor)' : ''} para o voluntariado na Cruz Vermelha.<span aria-hidden="true"> *</span></span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {erro && <Recado ref={refDoErro} tabIndex={-1} tipo="erro">{erro}</Recado>}
        {/* Os dois textos ocupam a mesma célula: o botão não muda de largura ao virar "Enviando…". */}
        <button type="submit" disabled={enviando} className={cn(botaoDoMembro, 'w-full sm:w-auto sm:self-start')}>
          <span className="grid">
            <span className={cn('col-start-1 row-start-1', enviando && 'invisible')}>Enviar inscrição</span>
            <span className={cn('col-start-1 row-start-1 inline-flex items-center justify-center gap-2', !enviando && 'invisible')}>
              <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />Enviando…
            </span>
          </span>
        </button>
      </div>
    </form>
  )
}
