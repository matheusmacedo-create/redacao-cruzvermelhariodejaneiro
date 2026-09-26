import Link from 'next/link'
import {
  Award, BadgeCheck, CalendarCheck2, CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, CircleHelp, Clock, GraduationCap, History, Hourglass, ListChecks,
  MapPin, Megaphone, Pin, Sparkles, type LucideIcon,
} from 'lucide-react'
import type { Atividade, Formacao, Perfil } from '@/lib/membro/dados'
import type { CursoNoCatalogo } from '@/lib/membro/cursos'
import type { OportunidadeDoMembro } from '@/lib/membro/oportunidades'
import type { AvisoDoMembro } from '@/lib/membro/canal'
import type { BannerDoMembro } from '@/lib/membro/banners'
import { duracaoLegivel } from '@/lib/cursos/regras'
import { ehTipo, estado, quando, selo as diaEMes, TIPOS } from '@/lib/oportunidades/regras'
import { dataCurta, horasLegiveis, mesEAno, primeiroNome, saudacao } from '@/lib/membro/regras'
import {
  cursoParaContinuar, etapaDoCurso, instituicaoVisivel, linhaDoPerfil, listaLegivel, numerosDoInicio, oportunidadesAbertas, primeirosPassos,
  provasPendentes, proximaAtividade, temInscricao, type PrimeiroPasso,
} from '@/lib/membro/inicio'
import { cn } from '@/lib/utils'
import { BannersDoMembro } from './banners'
import { BarraDeProgresso } from './cursos'
import { botaoDoMembro, botaoFantasma, botaoSecundario } from './marca'
import { CabecalhoDaPagina, EstadoVazio, Recado, Secao, Selo, SeloDeValidade } from './pecas'

/**
 * A vista do Início, na ordem do que a pessoa precisa fazer: pendências,
 * saudação, os banners da coordenação, primeiros passos (só para quem acabou de chegar), próxima
 * atividade, curso, números, avisos, certificados e últimas atividades.
 * Vermelho sólido só num único botão principal (e nos selos de "Novo"); o
 * resto é neutro, inclusive o bloco da data, igual ao de Oportunidades.
 */
export function InicioView({ nome, perfil, hoje, hora, agora, formacoes, atividades, cursos, oportunidades, avisos, banners = [], termosPendentes }: {
  nome: string; perfil: Perfil; hoje: string; hora: number; agora: Date; formacoes: Formacao[]; atividades: Atividade[]
  cursos: CursoNoCatalogo[]; oportunidades: OportunidadeDoMembro[]; avisos: AvisoDoMembro[]; banners?: BannerDoMembro[]; termosPendentes: number
}) {
  const provas = provasPendentes(cursos)
  const continuar = cursoParaContinuar(cursos)
  const proxima = proximaAtividade(oportunidades, agora)
  const abertas = proxima ? [] : oportunidadesAbertas(oportunidades, agora)
  const numeros = numerosDoInicio(atividades, formacoes, hoje)
  const passos = primeirosPassos({
    horas: numeros.horasTotal, formacoes: formacoes.length, inscrito: temInscricao(oportunidades),
    emergencia: { nome: perfil.emergencia_nome, telefone: perfil.emergencia_telefone }, cursos,
  })
  // Um botão principal por tela: o do próximo passo, para quem está chegando;
  // senão o do curso, a menos que haja pendência no alto (a faixa de aviso já chama a atenção).
  const cursoEhPrincipal = !passos && termosPendentes === 0 && provas.length === 0
  const linha = linhaDoPerfil(perfil)
  const ano = hoje.slice(0, 4)

  return (
    <div className="flex flex-col gap-6">
      {(termosPendentes > 0 || provas.length > 0) && (
        <div className="flex flex-col gap-3" data-ajuda="membro.pendencias">
          {termosPendentes > 0 && (
            <Recado tipo="aviso" id="termos-pendentes" titulo={termosPendentes === 1 ? 'Um bem da filial foi entregue a você.' : `${termosPendentes} bens da filial foram entregues a você.`}
              acao={<Link href="/membro/perfil#bens" className={botaoSecundario}>Conferir e aceitar</Link>}>
              <p>Confira e aceite o termo de responsabilidade.</p>
            </Recado>
          )}
          {provas.length > 0 && (
            <Recado tipo="aviso" id="prova-pendente" titulo={provas.length === 1 ? `Falta a prova final de ${provas[0].titulo}` : `Falta a prova final de ${provas.length} cursos`}
              acao={<Link href={provas.length === 1 ? `/membro/cursos/${provas[0].id}/prova` : '/membro/cursos'} className={botaoSecundario}>{provas.length === 1 ? 'Fazer a prova' : 'Ver cursos'}</Link>}>
              <p>{provas.length === 1 ? 'Você já concluiu todas as aulas.' : `Você já concluiu as aulas de ${listaLegivel(provas.map((c) => c.titulo))}.`} Com a aprovação, o certificado sai na hora.</p>
            </Recado>
          )}
        </div>
      )}

      <div id="boas-vindas">
        <CabecalhoDaPagina sobretitulo={`${saudacao(hora)},`} titulo={primeiroNome(nome)} descricao={linha || undefined}>
          <p className="text-sm text-muted-foreground">No voluntariado da Cruz Vermelha RJ desde {mesEAno(perfil.aprovado_em ?? perfil.created_at)}</p>
        </CabecalhoDaPagina>
      </div>

      <BannersDoMembro banners={banners} />

      {passos && <PrimeirosPassos passos={passos} />}

      {proxima ? <ProximaAtividade o={proxima} agora={agora} /> : <Abertas abertas={abertas} />}

      {continuar && <ContinueSeuCurso c={continuar} principal={cursoEhPrincipal} />}

      {!numeros.vazio && (
        <section aria-labelledby="numeros-titulo" id="numeros" data-ajuda="membro.numeros">
          <h2 id="numeros-titulo" className="sr-only">Seus números</h2>
          <ul className="grid grid-cols-3 gap-3">
            <Numero icone={Clock} valor={horasLegiveis(numeros.horasNoAno)} rotulo={`em ${ano}`} detalhe={`${horasLegiveis(numeros.horasTotal)} no total`} />
            <Numero icone={CalendarCheck2} valor={numeros.acoesNoAno} rotulo={`${numeros.acoesNoAno === 1 ? 'ação' : 'ações'} em ${ano}`} />
            <Numero icone={BadgeCheck} valor={numeros.formacoesEmDia} rotulo={numeros.formacoesEmDia === 1 ? 'formação em dia' : 'formações em dia'} />
          </ul>
        </section>
      )}

      {avisos.length > 0 && (
        <Secao titulo="Avisos" icone={Megaphone} verTodos="/membro/avisos" id="mural">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {avisos.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link href={`/membro/avisos#aviso-${a.id}`} className="flex min-h-12 items-start gap-3 px-4 py-3 hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    {/* Selos depois do título, na mesma ordem da página de Avisos (Fixado, Novo): o alfinete sozinho quebrava a linha. */}
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium wrap-break-word">{a.titulo}</span>
                      {a.fixado && <Selo icone={Pin}>Fixado</Selo>}
                      {!a.visto && <Selo tom="destaque" icone={Sparkles}>Novo</Selo>}
                    </span>
                    <span className="block text-sm text-muted-foreground">{dataCurta(a.created_at)}</span>
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* `grid-cols-1` explícito e `min-w-0` nas seções: sem isso a coluna implícita crescia com o texto e a tela transbordava até 480px. */}
      {(formacoes.length > 0 || atividades.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Secao titulo="Certificados e formações" icone={Award} verTodos="/membro/certificados" id="certificados">
            {formacoes.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {formacoes.slice(0, 3).map((f) => {
                  const detalhe = [instituicaoVisivel(f.instituicao), f.concluido_em ? `Concluída em ${dataCurta(f.concluido_em)}` : null].filter(Boolean).join(' · ')
                  return (
                    <li key={f.id} className="flex flex-col items-start gap-1.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="font-medium wrap-break-word">{f.titulo}</p>
                        {detalhe && <p className="text-sm text-muted-foreground">{detalhe}</p>}
                      </div>
                      <SeloDeValidade validoAte={f.valido_ate} hoje={hoje} className="shrink-0" />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EstadoVazio icone={Award} titulo="Nenhum certificado ainda" texto="Seu primeiro certificado sai quando você concluir um curso." className="p-6"
                acao={<Link href="/membro/cursos" className={botaoSecundario}>Ver cursos</Link>} />
            )}
          </Secao>

          <Secao titulo="Últimas atividades" icone={History} id="atividades">
            {atividades.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {atividades.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block wrap-break-word">{a.atividade}</span>
                      <span className="text-muted-foreground">{dataCurta(a.data)}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{horasLegiveis(a.horas)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EstadoVazio icone={History} titulo="Nenhuma atividade registrada ainda" texto="Com a presença confirmada numa ação, as horas entram aqui." className="p-6" />
            )}
          </Secao>
        </div>
      )}

      {/* Discreto, no fim: o mesmo caminho do menu da conta ("Ajuda"). */}
      <p className="flex justify-center">
        <Link href="/membro/ajuda" data-ajuda="membro.ajuda-link" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" />Ajuda: passo a passo e perguntas frequentes
        </Link>
      </p>
    </div>
  )
}

/** Para quem acabou de chegar: o que já fez leva o check; o próximo, o botão. */
function PrimeirosPassos({ passos }: { passos: PrimeiroPasso[] }) {
  const proximo = passos.find((p) => !p.feito)
  const feitos = passos.filter((p) => p.feito).length
  return (
    <Secao titulo="Primeiros passos" icone={ListChecks} id="primeiros-passos"
      acao={<span className="text-sm text-muted-foreground">{feitos} de {passos.length}<span className="sr-only"> feitos</span></span>}>
      <ol className="divide-y divide-border rounded-xl border border-border bg-card" data-ajuda="membro.primeiros-passos">
        {passos.map((p, i) => (
          <li key={p.chave} className="flex gap-3 px-4 py-4">
            {p.feito
              ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              : <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-input text-xs font-semibold text-muted-foreground">{i + 1}</span>}
            <div className="min-w-0 flex-1">
              {p.feito ? (
                <p className="text-muted-foreground"><span className="sr-only">Feito: </span>{p.rotulo}</p>
              ) : p === proximo ? (
                <p className="font-medium">{p.rotulo}</p>
              ) : (
                // Os passos seguintes também levam aonde precisam, mas sem competir com o botão do próximo.
                <Link href={p.href} className="-my-2.5 inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">{p.rotulo}</Link>
              )}
              {!p.feito && <p className="mt-0.5 text-sm text-muted-foreground">{p.texto}</p>}
              {p === proximo && <Link href={p.href} className={cn(botaoDoMembro, 'mt-3 w-full sm:w-auto')}>{p.botao}</Link>}
            </div>
          </li>
        ))}
      </ol>
    </Secao>
  )
}

/** A próxima atividade da pessoa: cartão neutro, com o bloco da data igual ao de Oportunidades. */
function ProximaAtividade({ o, agora }: { o: OportunidadeDoMembro; agora: Date }) {
  const { dia, mes } = diaEMes(o.inicio)
  const acontecendo = estado(o, o.ocupadas, agora) === 'andamento'
  return (
    <Secao titulo="Sua próxima atividade" icone={CalendarDays} id="proxima-atividade">
      <article className="rounded-xl border border-border bg-card p-4 sm:p-5" data-ajuda="membro.atividade">
        <div className="flex gap-4">
          {/* A data já vai por extenso no texto abaixo; o bloco é só visual. */}
          <div aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-lg bg-muted py-2">
            <span className="text-2xl font-bold leading-none tabular-nums">{dia}</span>
            <span className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground">{mes}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {ehTipo(o.tipo) && <p className="text-sm text-muted-foreground">{TIPOS[o.tipo].rotulo}</p>}
            <h3 className="font-semibold wrap-break-word">{o.titulo}</h3>
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{acontecendo ? `Acontecendo agora · ${quando(o.inicio, o.fim)}` : quando(o.inicio, o.fim)}</p>
            {o.local && <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 wrap-break-word">{o.local}</span></p>}
            <div className="mt-1">
              {o.minha === 'espera'
                ? <Selo tom="aviso" icone={Hourglass}>Na lista de espera</Selo>
                : <Selo tom="sucesso" icone={CheckCircle2}>Inscrição confirmada</Selo>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* <a> e não <Link>: é um arquivo .ics para baixar, não uma página. */}
          <a href={`/membro/oportunidades/${o.id}/agenda`} className={cn(botaoSecundario, 'flex-1 sm:flex-none')}><CalendarPlus className="size-4" aria-hidden="true" />Adicionar à agenda</a>
          <Link href={`/membro/oportunidades#o-${o.id}`} className={cn(botaoFantasma, 'flex-1 sm:flex-none')}>Ver detalhes</Link>
        </div>
      </article>
    </Secao>
  )
}

/** Sem próxima atividade: as oportunidades abertas mais próximas, ou o recado de que não há nenhuma. */
function Abertas({ abertas }: { abertas: OportunidadeDoMembro[] }) {
  if (!abertas.length) {
    return (
      <Secao titulo="Oportunidades" icone={CalendarDays} id="oportunidades-abertas">
        <EstadoVazio icone={CalendarDays} titulo="Nenhuma ação aberta agora" texto="Quando a coordenação publicar novas ações, plantões ou eventos, eles aparecem aqui." className="p-6" data-ajuda="membro.atividade" />
      </Secao>
    )
  }
  return (
    <Secao titulo={abertas.length === 1 ? '1 oportunidade aberta' : `${abertas.length} oportunidades abertas`} icone={CalendarDays}
      verTodos={{ href: '/membro/oportunidades', rotulo: 'Ver todas' }} id="oportunidades-abertas">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-ajuda="membro.atividade">
        {abertas.slice(0, 2).map((o) => {
          const { dia, mes } = diaEMes(o.inicio)
          const lotada = o.vagas !== null && o.ocupadas >= o.vagas
          return (
            <li key={o.id}>
              <Link href={`/membro/oportunidades#o-${o.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-muted">
                <span aria-hidden="true" className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5">
                  <span className="text-lg font-bold leading-none tabular-nums">{dia}</span>
                  <span className="mt-0.5 text-xs font-medium text-muted-foreground">{mes}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium wrap-break-word">{o.titulo}</span>
                  <span className="block text-sm text-muted-foreground">{quando(o.inicio, o.fim)}</span>
                  {lotada && <Selo icone={Hourglass} className="mt-1">Só lista de espera</Selo>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Secao>
  )
}

/** O curso para retomar (ou começar), com um botão que leva direto à próxima aula. */
function ContinueSeuCurso({ c, principal }: { c: CursoNoCatalogo; principal: boolean }) {
  const andamento = etapaDoCurso(c) === 'andamento'
  const aulas = `${c.aulas} ${c.aulas === 1 ? 'aula' : 'aulas'}`
  // Em andamento, "Continuar" pula a página do curso e abre a próxima aula; para começar, a página do curso apresenta o conteúdo antes.
  const destino = andamento && c.progresso.proxima ? `/membro/cursos/${c.id}/aulas/${c.progresso.proxima}` : `/membro/cursos/${c.id}`
  return (
    <Secao titulo={andamento ? 'Continue seu curso' : 'Comece um curso'} icone={GraduationCap} verTodos={{ href: '/membro/cursos', rotulo: 'Ver cursos' }} id="continuar">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5" data-ajuda="membro.curso">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold wrap-break-word"><Link href={`/membro/cursos/${c.id}`} className="underline-offset-4 hover:underline">{c.titulo}</Link></h3>
          {andamento ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{c.progresso.feitas} de {c.progresso.total} aulas</p>
              <div className="mt-2 max-w-sm"><BarraDeProgresso pct={c.progresso.pct} rotulo={`Progresso em ${c.titulo}`} /></div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{[aulas, c.duracao ? duracaoLegivel(c.duracao) : null, c.temProva ? 'prova final' : null].filter(Boolean).join(' · ')}</p>
              {c.resumo && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.resumo}</p>}
            </>
          )}
        </div>
        <Link href={destino} className={cn(principal ? botaoDoMembro : botaoSecundario, 'w-full shrink-0 sm:w-auto')}>{andamento ? 'Continuar' : 'Começar o curso'}</Link>
      </div>
    </Secao>
  )
}

/** Um número da faixa: ícone neutro, valor e o que ele conta. */
function Numero({ icone: Icone, valor, rotulo, detalhe }: { icone: LucideIcon; valor: string | number; rotulo: string; detalhe?: string }) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-3 sm:p-4">
      <Icone className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
      <span className="text-lg font-bold tabular-nums tracking-tight wrap-break-word sm:text-2xl">{valor}</span>
      <span className="text-xs text-muted-foreground sm:text-sm">{rotulo}</span>
      {detalhe && <span className="mt-1 text-xs text-muted-foreground">{detalhe}</span>}
    </li>
  )
}
