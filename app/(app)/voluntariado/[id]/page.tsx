import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SITUACOES, VINCULOS, idade, situacaoDaFormacao } from '@/lib/participantes/regras'
import { AcoesDeSituacao, ConvidarAreaDoMembro, DadosSensiveis, NovoRegistro, RemoverRegistro } from '@/components/app/participantes/acoes'

export const dynamic = 'force-dynamic'

// As colunas cifradas não são liberadas para a API: a lista é explícita.
const COLUNAS = 'id,nome,nome_social,vinculo,situacao,setores,funcao,email,telefone,data_nascimento,cpf_mascara,cep,logradouro,numero,complemento,bairro,cidade,uf,emergencia_nome,emergencia_telefone,emergencia_parentesco,tem_dados_de_saude,responsavel_nome,responsavel_telefone,habilidades,idiomas,disponibilidade,observacoes,origem,consentimento_em,consentimento_versao,desligado_em,motivo_desligamento,anonimizado_em,created_at,membro_ultimo_acesso'

const DATA = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="flex flex-col"><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

export default async function Participante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 1) notFound()
  const [{ data: p }, { data: formacoes }, { data: horas }] = await Promise.all([
    supabase.from('participantes').select(COLUNAS).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('participante_formacoes').select('id,titulo,instituicao,concluido_em,valido_ate').eq('participante_id', id).order('valido_ate', { ascending: true, nullsFirst: false }),
    supabase.from('participante_horas').select('id,data,horas,atividade').eq('participante_id', id).order('data', { ascending: false }).limit(200),
  ])
  if (!p) notFound()
  const hoje = hojeEmSaoPaulo()
  const anos = idade(p.data_nascimento, hoje)
  const total = (horas ?? []).reduce((s, h) => s + Number(h.horas), 0)
  const anoAtual = hoje.slice(0, 4)
  const noAno = (horas ?? []).filter((h) => String(h.data).startsWith(anoAtual)).reduce((s, h) => s + Number(h.horas), 0)
  const endereco = [[p.logradouro, p.numero].filter(Boolean).join(', '), p.complemento, p.bairro, [p.cidade, p.uf].filter(Boolean).join(' – '), p.cep].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-5">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntários</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{p.nome_social || p.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {[VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo, p.funcao, p.setores?.join(', '), anos !== null ? `${anos} anos` : null].filter(Boolean).join(' · ')}
          </p>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.situacao === 'ativo' ? 'bg-success/15 text-success' : p.situacao === 'candidato' ? 'bg-warning/20 text-warning-foreground' : p.situacao === 'desligado' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
            {SITUACOES[p.situacao as keyof typeof SITUACOES]?.rotulo}
          </span>
        </div>
        {nivel >= 2 && !p.anonimizado_em && <Button variant="outline" render={<Link href={`/voluntariado/${id}/editar`} />}><Pencil className="size-4" />Editar cadastro</Button>}
      </div>

      {anos !== null && anos < 18 && !p.anonimizado_em && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm"><AlertTriangle className="size-4" />Menor de idade. Responsável: {p.responsavel_nome ?? 'não informado'}{p.responsavel_telefone ? ` · ${p.responsavel_telefone}` : ''}</p>
      )}
      {p.situacao === 'desligado' && p.motivo_desligamento && <p className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">Desligado{p.desligado_em ? ` em ${new Date(p.desligado_em).toLocaleDateString('pt-BR')}` : ''}: {p.motivo_desligamento}</p>}

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cadastro</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Item rotulo="Nome civil">{p.nome_social ? p.nome : null}</Item>
              <Item rotulo="Nascimento">{p.data_nascimento ? DATA(p.data_nascimento) : null}</Item>
              <Item rotulo="E-mail">{p.email}</Item>
              <Item rotulo="Telefone">{p.telefone}</Item>
              <Item rotulo="CPF">{p.cpf_mascara}</Item>
              <Item rotulo="Endereço">{endereco}</Item>
              <Item rotulo="Emergência">{[p.emergencia_nome, p.emergencia_parentesco, p.emergencia_telefone].filter(Boolean).join(' · ')}</Item>
              <Item rotulo="Disponibilidade">{p.disponibilidade?.join(', ')}</Item>
              <Item rotulo="Habilidades">{p.habilidades?.join(', ')}</Item>
              <Item rotulo="Idiomas">{p.idiomas?.join(', ')}</Item>
            </dl>
            {p.observacoes && <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-sm">{p.observacoes}</p>}
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {p.origem === 'formulario' ? 'Inscrito pelo formulário público' : 'Cadastrado pela equipe'} em {new Date(p.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              {p.consentimento_em ? ` · aceitou o termo de dados (${p.consentimento_versao}) em ${new Date(p.consentimento_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
            </p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Formações e certificados</h2>
              {nivel >= 2 && !p.anonimizado_em && <NovoRegistro participanteId={id} tipo="formacao" hoje={hoje} />}
            </div>
            <ul className="divide-y divide-border">
              {(formacoes ?? []).map((f) => {
                const s = situacaoDaFormacao(f.valido_ate, hoje)
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div><p className="font-medium">{f.titulo}</p><p className="text-xs text-muted-foreground">{[f.instituicao, f.concluido_em ? `concluída em ${DATA(f.concluido_em)}` : null].filter(Boolean).join(' · ')}</p></div>
                    <div className="flex items-center gap-2">
                      {f.valido_ate && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === 'vencida' ? 'bg-destructive/10 text-destructive' : s === 'vence_logo' ? 'bg-warning/20 text-warning-foreground' : 'bg-success/15 text-success'}`}>{s === 'vencida' ? 'Vencida' : 'Válida'} até {DATA(f.valido_ate)}</span>}
                      {nivel >= 2 && <RemoverRegistro tabela="participante_formacoes" id={f.id} participanteId={id} />}
                    </div>
                  </li>
                )
              })}
              {!formacoes?.length && <li className="py-3 text-sm text-muted-foreground">Nenhuma formação registrada.</li>}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Horas de voluntariado</h2>
              {nivel >= 2 && !p.anonimizado_em && <NovoRegistro participanteId={id} tipo="horas" hoje={hoje} />}
            </div>
            <p className="mb-2 text-sm"><span className="text-2xl font-bold tabular-nums">{noAno.toLocaleString('pt-BR')}</span> h em {anoAtual} · {total.toLocaleString('pt-BR')} h no total</p>
            <ul className="divide-y divide-border">
              {(horas ?? []).slice(0, 30).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span><span className="tabular-nums text-muted-foreground">{DATA(h.data)}</span> · {h.atividade}</span>
                  <span className="flex items-center gap-2"><span className="font-medium tabular-nums">{Number(h.horas).toLocaleString('pt-BR')} h</span>{nivel >= 2 && <RemoverRegistro tabela="participante_horas" id={h.id} participanteId={id} />}</span>
                </li>
              ))}
              {!horas?.length && <li className="py-3 text-sm text-muted-foreground">Nenhuma hora registrada.</li>}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {p.situacao === 'ativo' && !p.anonimizado_em && (
            <Card className="p-5" id="area-do-membro">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Área do Voluntário</h2>
              <p className="mb-3 text-sm">
                {p.membro_ultimo_acesso
                  ? <>Último acesso em {new Date(p.membro_ultimo_acesso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.</>
                  : <span className="text-muted-foreground">Ainda não entrou. Ele entra com o e-mail do cadastro e um código.</span>}
              </p>
              {nivel >= 2 && <ConvidarAreaDoMembro id={id} temEmail={Boolean(p.email)} />}
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dados sensíveis</h2>
            {nivel >= 3 ? <DadosSensiveis id={id} temCpf={Boolean(p.cpf_mascara)} temSaude={p.tem_dados_de_saude} />
              : <p className="text-sm text-muted-foreground">{p.tem_dados_de_saude || p.cpf_mascara ? 'Há CPF ou dados de saúde guardados. Só quem tem acesso a dados sensíveis pode abrir.' : 'Nenhum dado sensível guardado.'}</p>}
          </Card>
          {nivel >= 2 && !p.anonimizado_em && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situação</h2>
              <AcoesDeSituacao id={id} situacao={p.situacao} podeAnonimizar={nivel >= 3} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
