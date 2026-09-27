import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SITUACOES, VINCULOS, ehVinculo, idade, situacaoDaFormacao } from '@/lib/participantes/regras'
import { Retrato } from '@/components/membro/foto'
import { urlDaFotoNaEquipe } from '@/lib/membro/foto'
import { AcoesDeSituacao, ConvidarAreaDoMembro, DadosSensiveis, NovoRegistro, RemoverRegistro } from '@/components/app/participantes/acoes'
import { CancelarDiploma, ConcederDiploma } from '@/components/app/participantes/diplomas'
import { AvaliarFotoDoCracha } from '@/components/app/participantes/foto-do-cracha'
import { situacaoDaFotoDoCracha } from '@/lib/cracha/regras'

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
  const [{ data: p }, { data: formacoes }, { data: horas }, { data: comFoto }, { data: diplomas }, { data: fotoDoCracha }] = await Promise.all([
    supabase.from('participantes').select(COLUNAS).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('participante_formacoes').select('id,titulo,instituicao,concluido_em,valido_ate').eq('participante_id', id).order('valido_ate', { ascending: true, nullsFirst: false }),
    supabase.from('participante_horas').select('id,data,horas,atividade').eq('participante_id', id).order('data', { ascending: false }).limit(200),
    // À parte das COLUNAS: se a coluna ainda não existir no banco, a ficha abre com as iniciais em vez de sumir.
    supabase.from('participantes').select('foto_path').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    // Sem a migração dos diplomas, a consulta falha e o bloco só mostra "nenhum".
    supabase.from('diplomas').select('id,codigo,motivo,marco_horas,texto,emitido_em,revogado_em,motivo_revogacao').eq('participante_id', id).order('emitido_em', { ascending: false }),
    // Sem a migração 20260929050000, a consulta falha e o bloco da foto do crachá não aparece.
    supabase.from('participantes').select('foto_path,foto_cracha_path,foto_cracha_recusada_path,foto_cracha_motivo,foto_cracha_avaliada_em').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
  ])
  if (!p) notFound()
  const foto = p.anonimizado_em ? null : urlDaFotoNaEquipe(id, (comFoto as { foto_path?: string | null } | null)?.foto_path)
  const fc = p.anonimizado_em ? null : fotoDoCracha as { foto_path: string | null; foto_cracha_path: string | null; foto_cracha_recusada_path: string | null; foto_cracha_motivo: string | null; foto_cracha_avaliada_em: string | null } | null
  const situacaoDaFoto = fc ? situacaoDaFotoDoCracha({ foto: fc.foto_path, aprovada: fc.foto_cracha_path, recusada: fc.foto_cracha_recusada_path }) : null
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
        <div className="flex items-start gap-4" data-ajuda="voluntarios.foto">
          <Retrato url={foto} nome={p.nome_social || p.nome} className="size-16 text-xl" alt={foto ? `Foto de ${p.nome_social || p.nome}` : ''} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{p.nome_social || p.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {[VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo, p.funcao, p.setores?.join(', '), anos !== null ? `${anos} anos` : null].filter(Boolean).join(' · ')}
            </p>
            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.situacao === 'ativo' ? 'bg-success/15 text-success' : p.situacao === 'candidato' ? 'bg-warning/20 text-warning-foreground' : p.situacao === 'desligado' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              {SITUACOES[p.situacao as keyof typeof SITUACOES]?.rotulo}
            </span>
          </div>
        </div>
        {nivel >= 2 && !p.anonimizado_em && <Button variant="outline" render={<Link href={`/voluntariado/${id}/editar`} />} data-ajuda="voluntarios.editar"><Pencil className="size-4" />Editar cadastro</Button>}
      </div>
      {!ehVinculo(p.vinculo) && !p.anonimizado_em && (
        <p role="status" className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          Este cadastro tem o vínculo “{p.vinculo}”, que saiu do Voluntariado quando a equipe passou para Recursos humanos. Enquanto ele não mudar, nada neste cadastro pode ser salvo (situação, foto, dados pela Área do Voluntário).
          {nivel >= 2 ? <> Em “Editar cadastro”, escolha Voluntário, Juventude ou Instrutor. Se a pessoa é da equipe, cadastre-a em Recursos humanos.</> : <> Peça a quem gerencia o Voluntariado para corrigir.</>}
        </p>
      )}

      {anos !== null && anos < 18 && !p.anonimizado_em && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm"><AlertTriangle className="size-4" />Menor de idade. Responsável: {p.responsavel_nome ?? 'não informado'}{p.responsavel_telefone ? ` · ${p.responsavel_telefone}` : ''}</p>
      )}
      {p.situacao === 'desligado' && p.motivo_desligamento && <p className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">Desligado{p.desligado_em ? ` em ${new Date(p.desligado_em).toLocaleDateString('pt-BR')}` : ''}: {p.motivo_desligamento}</p>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cadastro</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <Card className="p-5" data-ajuda="voluntarios.formacoes">
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

          {situacaoDaFoto && (
            <Card className="p-5" data-ajuda="voluntarios.foto-do-cracha" id="foto-do-cracha">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Foto do crachá</h2>
              <div className="flex flex-wrap items-start gap-4">
                {foto && <img src={foto} alt={`Foto enviada por ${p.nome_social || p.nome}`} className="h-36 w-28 shrink-0 rounded-lg border border-border object-cover" />}
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                  <p data-situacao-da-foto={situacaoDaFoto} className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${situacaoDaFoto === 'aprovada' ? 'bg-success/15 text-success' : situacaoDaFoto === 'recusada' ? 'bg-destructive/10 text-destructive' : situacaoDaFoto === 'aguardando' ? 'bg-warning/20 text-warning-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {{ aprovada: 'Aprovada', aguardando: 'Aguardando aprovação', recusada: 'Recusada', sem_foto: 'Sem foto' }[situacaoDaFoto]}
                  </p>
                  <p className="text-muted-foreground">
                    {situacaoDaFoto === 'sem_foto' && 'O voluntário ainda não enviou foto. O crachá sai com a silhueta.'}
                    {situacaoDaFoto === 'aguardando' && 'Confira: rosto inteiro, de frente, com boa luz, sem óculos escuros. Só depois de aprovada ela vai para o crachá e para a verificação do QR.'}
                    {situacaoDaFoto === 'aprovada' && `Está no crachá${fc?.foto_cracha_avaliada_em ? ` desde ${new Date(fc.foto_cracha_avaliada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}. Se o voluntário trocar a foto, ela volta para aprovação.`}
                    {situacaoDaFoto === 'recusada' && `Motivo enviado ao voluntário: “${(fc?.foto_cracha_motivo ?? '').replace(/[.!]+$/, '')}”. Ele envia outra pela Área do Voluntário.`}
                  </p>
                  {nivel >= 2 && fc?.foto_path && situacaoDaFoto !== 'aprovada' && <AvaliarFotoDoCracha participanteId={id} fotoPath={fc.foto_path} nome={p.nome_social || p.nome} />}
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5" data-ajuda="voluntarios.diplomas" id="diplomas">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Diplomas de reconhecimento</h2>
              <div className="flex items-center gap-2"><Link href="/voluntariado/diplomas" className="text-xs font-medium text-primary hover:underline">Todos os diplomas</Link>{nivel >= 2 && !p.anonimizado_em && <ConcederDiploma participanteId={id} nome={p.nome_social || p.nome} />}</div>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Saem sozinhos com 100, 500 e 1.000 horas registradas; a coordenação também concede. O voluntário baixa na Área do Voluntário.</p>
            <ul className="divide-y divide-border">
              {(diplomas ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className={`font-medium ${d.revogado_em ? 'text-muted-foreground line-through' : ''}`}>{d.motivo === 'horas' ? `${Number(d.marco_horas).toLocaleString('pt-BR')} horas de voluntariado` : 'Concedido pela coordenação'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(d.emitido_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · código <span className="font-mono">{d.codigo}</span>
                      {d.texto ? ` · ${d.texto}` : ''}{d.revogado_em ? ` · cancelado: ${d.motivo_revogacao ?? ''}` : ''}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <a href={`/api/voluntariado/diplomas/${d.codigo}/pdf`} className="rounded px-1.5 py-1 text-xs font-medium text-primary hover:underline">PDF</a>
                    {nivel >= 2 && !d.revogado_em && <CancelarDiploma id={d.id} participanteId={id} codigo={d.codigo} />}
                  </span>
                </li>
              ))}
              {!diplomas?.length && <li className="py-3 text-sm text-muted-foreground">Nenhum diploma ainda.</li>}
            </ul>
          </Card>

          <Card className="p-5" data-ajuda="voluntarios.horas">
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
            <Card className="p-5" id="area-do-membro" data-ajuda="voluntarios.area">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Área do Voluntário</h2>
              <p className="mb-3 text-sm">
                {p.membro_ultimo_acesso
                  ? <>Último acesso em {new Date(p.membro_ultimo_acesso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.</>
                  : <span className="text-muted-foreground">Ainda não entrou. Ele entra com o e-mail do cadastro e um código.</span>}
              </p>
              {nivel >= 2 && (
                <div className="flex flex-col gap-2">
                  <ConvidarAreaDoMembro id={id} temEmail={Boolean(p.email)} />
                  <Button size="sm" variant="ghost" className="self-start" render={<a href={`/membro/previa?como=${id}`} target="_blank" rel="noopener" />}><Eye className="size-3.5" />Ver como este voluntário</Button>
                  <p className="text-xs text-muted-foreground">Abre a área dele só para leitura; a visualização fica registrada.</p>
                </div>
              )}
            </Card>
          )}
          <Card className="p-5" data-ajuda="voluntarios.sensiveis">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dados sensíveis</h2>
            {nivel >= 3 ? <DadosSensiveis id={id} temCpf={Boolean(p.cpf_mascara)} temSaude={p.tem_dados_de_saude} />
              : <p className="text-sm text-muted-foreground">{p.tem_dados_de_saude || p.cpf_mascara ? 'Há CPF ou dados de saúde guardados. Só quem tem acesso a dados sensíveis pode abrir.' : 'Nenhum dado sensível guardado.'}</p>}
          </Card>
          {nivel >= 2 && !p.anonimizado_em && (
            <Card className="p-5" data-ajuda="voluntarios.situacao">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situação</h2>
              <AcoesDeSituacao id={id} situacao={p.situacao} podeAnonimizar={nivel >= 3} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
