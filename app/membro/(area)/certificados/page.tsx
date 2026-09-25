import type { Metadata } from 'next'
import Link from 'next/link'
import { Award, Download, GraduationCap, Share2, ShieldCheck } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { certificadosDoMembro, linkDoLinkedin, type CertificadoDoMembro } from '@/lib/membro/cursos'
import { historicoDoMembro } from '@/lib/membro/dados'
import { dataCurta, validadeLegivel } from '@/lib/membro/regras'
import { urlBase } from '@/lib/newsletter/contexto'
import { cn } from '@/lib/utils'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { CopiarLink } from '@/components/membro/certificados'
import { CabecalhoDaPagina, EstadoVazio, LinkExterno, Secao, SeloDeValidade } from '@/components/membro/pecas'
import { botaoDoMembro, botaoFantasma, botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Certificados · Área do Voluntário".
export const metadata: Metadata = { title: 'Certificados' }

/**
 * Os certificados emitidos aqui (com PDF e código de verificação) e as
 * demais formações que a coordenação registrou no cadastro. O que o banco
 * registrou junto com um certificado (`formacao_id`) não se repete embaixo.
 */
export default async function Certificados() {
  const m = await exigirMembro()
  const [certificados, { formacoes }] = await Promise.all([certificadosDoMembro(m), historicoDoMembro(m)])
  const hoje = hojeEmSaoPaulo()
  const jaListadas = new Set(certificados.map((c) => c.formacao_id).filter(Boolean))
  const outras = formacoes.filter((f) => !jaListadas.has(f.id))
  // O endereço público da Redação, o mesmo do e-mail do certificado (não o do deploy, que muda a cada publicação).
  const base = urlBase()
  return (
    <div className="flex flex-col gap-8">
      <CabecalhoDaPagina titulo="Certificados" descricao="Tudo o que você concluiu. Cada certificado tem um código que qualquer pessoa pode conferir." />
      <Secao titulo="Certificados emitidos" icone={Award} id="emitidos">
        {certificados.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certificados.map((c) => <li key={c.codigo} className="min-w-0"><CartaoDoCertificado c={c} hoje={hoje} verificacao={`${base}/certificado/${c.codigo}`} /></li>)}
          </ul>
        ) : (
          <EstadoVazio icone={Award} titulo="Seu primeiro certificado sai quando você concluir um curso." texto="Os cursos ficam aqui na área. Com a aprovação, o certificado sai na hora, com um código que qualquer pessoa confere."
            acao={<Link href="/membro/cursos" className={botaoDoMembro}><GraduationCap className="size-4" aria-hidden="true" />Ver cursos</Link>} />
        )}
      </Secao>
      {outras.length > 0 && (
        <Secao titulo="Outras formações no seu cadastro" icone={GraduationCap} id="outras">
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {outras.map((f) => {
              const detalhe = [f.instituicao, f.concluido_em ? `Concluída em ${dataCurta(f.concluido_em)}` : null].filter(Boolean).join(' · ')
              return (
                <li key={f.id} className="flex min-h-12 flex-col items-start gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-medium wrap-break-word">{f.titulo}</p>
                    {detalhe && <p className="text-sm text-muted-foreground">{detalhe}</p>}
                  </div>
                  <SeloDeValidade validoAte={f.valido_ate} hoje={hoje} className="shrink-0" />
                </li>
              )
            })}
          </ul>
        </Secao>
      )}
    </div>
  )
}

/**
 * Um certificado: título, emissão, código, validade e o que dá para fazer com
 * ele — baixar, mandar o link de verificação, pôr no LinkedIn, conferir.
 */
function CartaoDoCertificado({ c, hoje, verificacao }: { c: CertificadoDoMembro; hoje: string; verificacao: string }) {
  const vencido = validadeLegivel(c.valido_ate, hoje)?.tom === 'perigo'
  const idDoTitulo = `certificado-${c.codigo}`
  // Os de ação secundária: fantasma, alinhados à esquerda, com alvo de 44px.
  const acao = cn(botaoFantasma, 'w-full justify-start px-2 text-left font-medium')
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby={idDoTitulo}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10"><Award className="size-5 text-success" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 id={idDoTitulo} className="font-semibold leading-snug wrap-break-word">{c.curso_titulo}</h3>
          <p className="text-sm text-muted-foreground">Emitido em {dataCurta(c.emitido_em)}{c.carga_horaria ? ` · ${c.carga_horaria.toLocaleString('pt-BR')} h` : ''}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Código <code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{c.codigo}</code></p>
      <SeloDeValidade validoAte={c.valido_ate} hoje={hoje} className="w-fit" />
      {vencido && (
        // O banco guarda um certificado ativo por curso: renovar depende da coordenação, não de refazer sozinho.
        <p className="text-sm text-foreground">
          Para renovar, <Link href="/membro/mensagens?nova=documentos" className="font-medium underline underline-offset-4 hover:no-underline">fale com a coordenação</Link>
          {c.curso_id && <> ou <Link href={`/membro/cursos/${c.curso_id}`} className="font-medium underline underline-offset-4 hover:no-underline">reveja o curso</Link></>}.
        </p>
      )}
      <div className="mt-auto flex flex-col gap-1 pt-1">
        <a href={`/membro/certificados/${c.codigo}/pdf`} className={cn(botaoSecundario, 'mb-1 w-full')}><Download className="size-4" aria-hidden="true" />Baixar PDF</a>
        <CopiarLink url={verificacao} className={acao} />
        <LinkExterno href={linkDoLinkedin(c, verificacao)} className={acao}><Share2 className="size-4 shrink-0" aria-hidden="true" />Adicionar ao LinkedIn</LinkExterno>
        <LinkExterno href={`/certificado/${c.codigo}`} className={acao}><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Página de verificação</LinkExterno>
      </div>
    </article>
  )
}
