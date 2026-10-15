import { AlertTriangle } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { CriarContaDoGoogle } from '@/components/email-provisorio/criar-conta'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashDoToken } from '@/lib/contas/servidor'
import { problemaDoConvite } from '@/lib/google/contas-regras'

export const metadata = { title: 'Criar meu e-mail — Cruz Vermelha RJ' }
export const dynamic = 'force-dynamic'

/**
 * A página do link de criação de e-mail (email.cruzvermelhariodejaneiro.org
 * /email/criar/<código>). Pública: quem abre ainda não tem conta nenhuma.
 * Lê o convite pelo hash do código; a validade é conferida de novo na
 * action, na hora de criar. Nada do convite além do setor vai para a tela.
 */
export default async function CriarContaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valido = /^[A-Za-z0-9_-]{20,64}$/.test(token)
  const admin = createAdminClient()
  const { data: convite } = valido
    ? await admin.from('google_convites').select('workspace_id,setor_id,expira_em,max_usos,usos,revogado_em').eq('token_hash', hashDoToken(token)).maybeSingle()
    : { data: null }
  const problema = !convite
    ? 'Este link não existe. Confira se copiou inteiro, ou peça um novo a quem o mandou.'
    : problemaDoConvite({ expiraEm: convite.expira_em, usos: convite.usos, maxUsos: convite.max_usos, revogadoEm: convite.revogado_em })

  let setorFixo: string | null = null
  let setores: { id: string; nome: string }[] = []
  if (convite && !problema) {
    if (convite.setor_id) {
      const { data: s } = await admin.from('setores').select('nome').eq('id', convite.setor_id).maybeSingle()
      setorFixo = s ? String(s.nome) : null
    }
    if (!setorFixo) {
      const { data } = await admin.from('setores').select('id,nome').eq('workspace_id', convite.workspace_id).eq('ativo', true).order('ordem', { nullsFirst: false }).order('nome')
      setores = (data ?? []).map((s) => ({ id: s.id as string, nome: String(s.nome) }))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <BrandMark rotulo="E-mail dos setores" className="w-72" />
        <h1 className="mt-10 text-2xl font-bold tracking-tight text-balance">Criar meu e-mail</h1>
        {problema ? (
          <p className="mt-6 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{problema}</p>
        ) : (
          <>
            <p className="mt-3 leading-relaxed text-muted-foreground">Preencha e o seu e-mail @cruzvermelhariodejaneiro.org é criado na hora, no Google. Você entra pelo Gmail, no computador ou no celular.</p>
            <ol className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground" aria-label="Como funciona">
              <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span><span>Preencha seu nome, escolha o e-mail e diga o seu setor.</span></li>
              <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span><span>A conta é criada no Google e você recebe no seu e-mail pessoal o endereço, a senha provisória e o passo a passo.</span></li>
              <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span><span>Entre em mail.google.com com a senha provisória. O Google pede uma senha nova na hora, e pronto.</span></li>
            </ol>
            <div className="mt-6 rounded-xl border border-border bg-card p-6">
              <CriarContaDoGoogle token={token} setorFixo={setorFixo} setores={setores} />
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Dúvida ou link que não funciona? Fale com o responsável do seu setor.</p>
          </>
        )}
      </div>
    </main>
  )
}
