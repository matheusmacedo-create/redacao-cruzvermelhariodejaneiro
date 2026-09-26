import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Lock, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { contextoDaEquipe, COLUNAS_DO_MEMBRO, COLUNAS_PESSOAIS, type Membro, type Pessoais } from '@/lib/rh/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { idade } from '@/lib/participantes/regras'
import { MOVIMENTACOES, categoriasDoNivel, rotuloDoVinculo, tempoDeCasa } from '@/lib/rh/regras'
import { AcoesDeSituacao, Remuneracoes, VerRestritos } from '@/components/app/equipe/acoes'
import { Situacao, nomeDe } from '@/components/app/equipe/comum'
import { ArquivosDaFicha, type ArquivoDaFicha } from '@/components/app/equipe/arquivos'

export const dynamic = 'force-dynamic'

const DATA = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null)

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="flex flex-col"><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>{acao}</div>
      {children}
    </Card>
  )
}

/**
 * A ficha de uma pessoa da equipe, em camadas: contrato e cargo para quem vê
 * a equipe; dados pessoais e histórico para quem gerencia; documentos e
 * remuneração só para quem tem esses níveis — e abertos sob demanda.
 */
export default async function FichaDaEquipe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDaEquipe()
  if (nivel < 1) notFound()
  const { data } = await supabase.from('equipe_membros').select(COLUNAS_DO_MEMBRO).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  const m = data as Membro | null
  if (!m) notFound()

  const [{ data: gestor }, { data: diretos }, pessoaisR, movR, loginR, arquivosR, membrosR] = await Promise.all([
    m.gestor_id ? supabase.from('equipe_membros').select('id,nome,nome_social').eq('id', m.gestor_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('equipe_membros').select('id,nome,nome_social,cargo').eq('gestor_id', id).neq('situacao', 'desligado').order('nome'),
    nivel >= 2 ? supabase.from('equipe_pessoais').select(COLUNAS_PESSOAIS).eq('membro_id', id).maybeSingle() : Promise.resolve({ data: null }),
    nivel >= 2 ? supabase.from('equipe_movimentacoes').select('id,vigencia,tipo,de,para,observacao,registrado_por,created_at').eq('membro_id', id).order('vigencia', { ascending: false }).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: null }),
    m.user_id ? supabase.from('profiles').select('full_name,username').eq('id', m.user_id).maybeSingle() : Promise.resolve({ data: null }),
    nivel >= 2 ? supabase.from('equipe_arquivos')
      .select('id,categoria,titulo,data_documento,validade,observacao,nome_original,tipo,tamanho,sha256,enviado_por,created_at,excluido_em,excluido_por,motivo_exclusao')
      .eq('membro_id', id).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: null }),
    nivel >= 2 && sp.aba === 'arquivos' ? supabase.from('workspace_members').select('user_id,profiles(full_name)').eq('workspace_id', context.workspace.id) : Promise.resolve({ data: null }),
  ])
  const arquivos = (arquivosR.data ?? []) as ArquivoDaFicha[]
  const nomes = Object.fromEntries(((membrosR.data ?? []) as { user_id: string; profiles: unknown }[])
    .map((x) => [x.user_id, ((Array.isArray(x.profiles) ? x.profiles[0] : x.profiles) as { full_name?: string } | null)?.full_name ?? 'Alguém']))
  const pessoais = pessoaisR.data as Pessoais | null
  const movimentacoes = (movR.data ?? []) as { id: string; vigencia: string; tipo: string; de: string | null; para: string | null; observacao: string | null }[]
  const login = loginR.data as { full_name: string; username: string } | null
  const hoje = hojeEmSaoPaulo()

  const abas = [
    { id: 'contrato', rotulo: 'Contrato e cargo', min: 1 },
    { id: 'pessoal', rotulo: 'Pessoal', min: 2 },
    { id: 'historico', rotulo: `Histórico (${movimentacoes.length})`, min: 2 },
    { id: 'arquivos', rotulo: `Arquivos (${arquivos.filter((a) => !a.excluido_em).length})`, min: 2 },
    { id: 'documentos', rotulo: 'Documentos', min: 3 },
    { id: 'remuneracao', rotulo: 'Remuneração e banco', min: 4 },
  ].filter((a) => nivel >= a.min)
  const aba = abas.find((a) => a.id === sp.aba)?.id ?? 'contrato'
  const anos = idade(pessoais?.data_nascimento ?? null, hoje)
  const endereco = pessoais ? [[pessoais.logradouro, pessoais.numero].filter(Boolean).join(', '), pessoais.complemento, pessoais.bairro, [pessoais.cidade, pessoais.uf].filter(Boolean).join(' – '), pessoais.cep].filter(Boolean).join(' · ') : ''
  const traduzir = (tipo: string, v: string | null) => (v && tipo === 'vinculo' ? rotuloDoVinculo(v) : v && tipo === 'jornada' ? `${v} h` : v)

  return (
    <div className="flex flex-col gap-5">
      <Link href="/equipe" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Recursos humanos</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{nomeDe(m)}</h1>
          <p className="text-sm text-muted-foreground">{[m.cargo, m.setor, rotuloDoVinculo(m.vinculo), tempoDeCasa(m.admissao, hoje) ? `${tempoDeCasa(m.admissao, hoje)} de casa` : null].filter(Boolean).join(' · ')}</p>
          <div className="mt-2"><Situacao s={m.situacao} /></div>
        </div>
        {nivel >= 2 && <Button variant="outline" render={<Link href={`/equipe/${id}/editar`} />} data-ajuda="rh.editar"><Pencil className="size-4" />Editar ficha</Button>}
      </div>
      {m.situacao === 'desligado' && <p className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">Desligado em {DATA(m.desligamento)}{m.motivo_desligamento ? `: ${m.motivo_desligamento}` : ''}</p>}

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas da ficha" data-ajuda="rh.ficha-abas">
        {abas.map((a) => (
          <Link key={a.id} href={`/equipe/${id}${a.id === 'contrato' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>

      {aba === 'contrato' && (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <Bloco titulo="Contrato e cargo">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Item rotulo="Cargo">{m.cargo}</Item>
              <Item rotulo="Setor">{m.setor}</Item>
              <Item rotulo="Vínculo">{rotuloDoVinculo(m.vinculo)}</Item>
              <Item rotulo="Gestor direto">{gestor ? <Link href={`/equipe/${gestor.id}`} className="hover:underline">{nomeDe(gestor)}</Link> : null}</Item>
              <Item rotulo="Admissão">{m.admissao ? `${DATA(m.admissao)} (${tempoDeCasa(m.admissao, hoje) ?? 'futura'})` : null}</Item>
              <Item rotulo="Jornada semanal">{m.jornada_semanal ? `${Number(m.jornada_semanal).toLocaleString('pt-BR')} horas` : null}</Item>
              <Item rotulo="Horário">{m.horario}</Item>
              <Item rotulo="Local de trabalho">{m.local_trabalho}</Item>
              <Item rotulo="E-mail de trabalho">{m.email_trabalho}</Item>
              <Item rotulo="Telefone de trabalho">{m.telefone_trabalho}</Item>
              <Item rotulo="Login no Redação">{login ? `${login.full_name} (${login.username})` : null}</Item>
            </dl>
            {m.observacoes && nivel >= 2 && <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-sm">{m.observacoes}</p>}
          </Bloco>
          <div className="flex flex-col gap-5">
            <Bloco titulo={`Equipe direta (${diretos?.length ?? 0})`}>
              {diretos?.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {diretos.map((d) => <li key={d.id}><Link href={`/equipe/${d.id}`} className="font-medium hover:underline">{nomeDe(d)}</Link>{d.cargo ? <span className="text-muted-foreground"> · {d.cargo}</span> : null}</li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Ninguém responde diretamente a esta pessoa.</p>}
            </Bloco>
            {nivel >= 2 && (
              <Bloco titulo="Situação">
                <AcoesDeSituacao id={id} situacao={m.situacao} hoje={hoje} />
              </Bloco>
            )}
          </div>
        </div>
      )}

      {aba === 'pessoal' && (
        <Bloco titulo="Dados pessoais">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Item rotulo="Nome civil">{m.nome_social ? m.nome : null}</Item>
            <Item rotulo="Nascimento">{pessoais?.data_nascimento ? `${DATA(pessoais.data_nascimento)}${anos !== null ? ` (${anos} anos)` : ''}` : null}</Item>
            <Item rotulo="E-mail pessoal">{pessoais?.email_pessoal}</Item>
            <Item rotulo="Telefone pessoal">{pessoais?.telefone_pessoal}</Item>
            <Item rotulo="Endereço">{endereco}</Item>
            <Item rotulo="Emergência">{[pessoais?.emergencia_nome, pessoais?.emergencia_parentesco, pessoais?.emergencia_telefone].filter(Boolean).join(' · ')}</Item>
            <Item rotulo="CPF">{m.cpf_mascara}</Item>
          </dl>
        </Bloco>
      )}

      {aba === 'historico' && (
        <Bloco titulo="Histórico de movimentações">
          {movimentacoes.length ? (
            <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
              {movimentacoes.map((mv) => (
                <li key={mv.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                  <p className="text-xs text-muted-foreground">{DATA(mv.vigencia)} · {MOVIMENTACOES[mv.tipo] ?? mv.tipo}</p>
                  <p>
                    {mv.tipo === 'admissao' ? (mv.para ?? '').split(' · ').map((x, i, a) => (i === a.length - 1 ? rotuloDoVinculo(x) : x)).join(' · ') || 'Admissão'
                      : <>{traduzir(mv.tipo, mv.de) ?? '—'} <span className="text-muted-foreground">→</span> <span className="font-medium">{traduzir(mv.tipo, mv.para) ?? '—'}</span></>}
                  </p>
                  {mv.observacao && <p className="text-xs text-muted-foreground">{mv.observacao}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">Sem movimentações registradas.</p>}
        </Bloco>
      )}

      {aba === 'arquivos' && (
        <Bloco titulo="Arquivos">
          <ArquivosDaFicha membroId={id} arquivos={arquivos} categorias={categoriasDoNivel(nivel)} hoje={hoje} nomes={nomes} />
        </Bloco>
      )}

      {aba === 'documentos' && (
        <Bloco titulo="Documentos" acao={<Lock className="size-4 text-muted-foreground" />}>
          <VerRestritos id={id} tipo="documentos" guardado={m.tem_documentos} />
        </Bloco>
      )}

      {aba === 'remuneracao' && (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <Bloco titulo="Remuneração" acao={<Lock className="size-4 text-muted-foreground" />}><Remuneracoes id={id} hoje={hoje} /></Bloco>
          <Bloco titulo="Dados bancários" acao={<Lock className="size-4 text-muted-foreground" />}>
            <VerRestritos id={id} tipo="banco" guardado={m.tem_banco} />
          </Bloco>
        </div>
      )}
    </div>
  )
}
