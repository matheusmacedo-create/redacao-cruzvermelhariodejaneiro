'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, Pencil, Plus, Send, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { excluirRascunhoDeParceria, publicarParceria, retirarParceria, salvarParceria } from '@/app/actions/transparencia'
import {
  INSTRUMENTOS, ROTULO_DA_SITUACAO, ROTULO_DO_INSTRUMENTO, SITUACOES_DA_PRESTACAO, formatarCnpj, lerParceria, lerValor, reais,
  type Instrumento, type SituacaoDaPrestacao,
} from '@/lib/transparencia/regras'
import {
  Campo, CodigoDaTrilha, Confirmacao, Dialogo, Etiqueta, FALHA_DE_REDE, HashCurto, OCUPADO_SEM_PERDER_FOCO, RetiradaComMotivo, Rodape, SemCodigo, data,
  diaEHora, recadoDe, somarDias, useFocoDepoisDaLista, type Estado, type Recado, type Resultado,
} from './comum'

export type ParceriaNaTela = {
  id: string
  instrumento: Instrumento
  numero: string | null
  orgao: string
  orgaoCnpj: string | null
  objeto: string
  dataAssinatura: string | null
  vigenciaInicio: string | null
  vigenciaFim: string | null
  /** Em reais, com ponto decimal ("150000.00"), como o banco devolve. */
  valorTotal: string | null
  valorLiberado: string | null
  situacao: SituacaoDaPrestacao
  prestacaoFinalEm: string | null
  /** Função e remuneração ("5200.00") — nunca nome. */
  equipe: { funcao: string; remuneracao: string }[]
  observacao: string | null
  publicadoEm: string | null
  retiradoEm: string | null
  motivoRetirada: string | null
  criadoEm: string
  /** Registro mais novo na trilha pública (só depois de publicada). */
  codigo: string | null
  hash: string | null
}

const estadoDa = (p: ParceriaNaTela): Estado => (p.retiradoEm ? 'retirado' : p.publicadoEm ? 'no_ar' : 'rascunho')
const ROTULO_DO_ESTADO: Record<Estado, string> = { rascunho: 'Rascunho', no_ar: 'No ar', retirado: 'Retirada do portal' }
// Rascunho primeiro (é o que espera alguém), depois o que está no ar, por fim as retiradas.
const ORDEM: Record<Estado, number> = { rascunho: 0, no_ar: 1, retirado: 2 }

const tituloDa = (p: Pick<ParceriaNaTela, 'instrumento' | 'numero' | 'orgao'>) =>
  `${ROTULO_DO_INSTRUMENTO[p.instrumento]}${p.numero ? ` nº ${p.numero}` : ''} — ${p.orgao}`

/** Decreto 8.726/2016, art. 80: no portal desde a celebração até 180 dias depois da prestação de contas final. */
const exibirAte = (p: ParceriaNaTela) => (p.prestacaoFinalEm ? somarDias(p.prestacaoFinalEm, 180) : null)

const somaDaEquipe = (equipe: { remuneracao: string }[]) =>
  equipe.reduce((soma, e) => { const v = lerValor(e.remuneracao); return typeof v === 'string' ? soma + Number(v) : soma }, 0)

/** "150000.00" → "150.000,00", o formato que a pessoa digita e lerValor aceita de volta. */
const valorNoCampo = (v: string | null | undefined) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const idDoCartao = (id: string) => `parceria-${id}`

type DialogoAberto =
  | { tipo: 'ficha'; parceria: ParceriaNaTela | null }
  | { tipo: 'publicar'; parceria: ParceriaNaTela }
  | { tipo: 'retirar'; parceria: ParceriaNaTela }
  | { tipo: 'excluir'; parceria: ParceriaNaTela }

/**
 * A aba Parcerias: termos de colaboração e de fomento, acordos e convênios
 * com o poder público, com os campos do art. 11 da Lei 13.019/2014 (MROSC).
 * Da equipe paga pela parceria entram só função e remuneração.
 */
export function Parcerias({ parcerias, trilhaDisponivel, hoje, aoRecado, painelId }: {
  parcerias: ParceriaNaTela[]
  trilhaDisponivel: boolean
  hoje: string
  aoRecado: (r: Recado) => void
  painelId: string
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<DialogoAberto | null>(null)
  const focarDepois = useFocoDepoisDaLista(parcerias, painelId)

  const fechar = () => setDialogo(null)
  function concluir(r: Resultado, ok: string, foco: string) {
    setDialogo(null)
    focarDepois(foco)
    aoRecado(recadoDe(r, ok))
    router.refresh()
  }

  const lista = [...parcerias].sort((a, b) =>
    ORDEM[estadoDa(a)] - ORDEM[estadoDa(b)] || (b.dataAssinatura ?? '').localeCompare(a.dataAssinatura ?? '') || b.criadoEm.localeCompare(a.criadoEm))
  const quantas = (e: Estado) => parcerias.filter((p) => estadoDa(p) === e).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl text-sm text-muted-foreground">
          <h2 className="sr-only">Parcerias com o poder público</h2>
          <p className="text-pretty">
            Termos de colaboração e de fomento, acordos de cooperação e convênios com o poder público, com os dados que a Lei 13.019/2014
            (art. 11) manda divulgar. Cada parceria fica no portal desde a celebração até 180 dias depois da prestação de contas final
            (Decreto 8.726/2016, art. 80).
          </p>
          {parcerias.length > 0 && (
            <p className="mt-1">{[`${quantas('no_ar')} no ar`, `${quantas('rascunho')} ${quantas('rascunho') === 1 ? 'rascunho' : 'rascunhos'}`, quantas('retirado') ? `${quantas('retirado')} retirada${quantas('retirado') === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <Button className="self-start" onClick={() => setDialogo({ tipo: 'ficha', parceria: null })}><Plus className="size-4" aria-hidden />Nova parceria</Button>
      </div>

      {!parcerias.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma parceria cadastrada. Cadastre cada termo ou convênio com o poder público: ela nasce como rascunho e só vai ao portal quando você publicar.
        </Card>
      )}

      {lista.length > 0 && (
        <ul className="flex flex-col gap-3">
          {lista.map((p) => <li key={p.id}><CartaoDaParceria p={p} trilhaDisponivel={trilhaDisponivel} hoje={hoje} abrir={setDialogo} /></li>)}
        </ul>
      )}

      {dialogo?.tipo === 'ficha' && (
        <FichaDaParceria
          key={`ficha-${dialogo.parceria?.id ?? 'nova'}`}
          parceria={dialogo.parceria}
          onFechar={fechar}
          onSalvo={(id, r) => concluir(r, dialogo.parceria ? 'Parceria salva.' : 'Parceria salva como rascunho. Confira e publique quando estiver pronta.', idDoCartao(id))}
        />
      )}
      {dialogo?.tipo === 'publicar' && (
        <Confirmacao
          key={`publicar-${dialogo.parceria.id}`}
          titulo="Publicar a parceria no portal"
          descricao={tituloDa(dialogo.parceria)}
          largura="max-w-xl"
          confirmar={{ rotulo: 'Publicar', icone: <Send className="size-4" aria-hidden /> }}
          andamento="Publicando e refazendo a página do portal…"
          executar={() => publicarParceria(dialogo.parceria.id)}
          onFeito={(r) => concluir(r, 'Parceria publicada no portal. O código de verificação já aparece nela.', idDoCartao(dialogo.parceria.id))}
          onFechar={fechar}
        >
          <p>Os dados desta parceria vão para a seção “Parcerias com o poder público” da página de transparência do site.</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>A publicação entra na <strong className="text-foreground">trilha pública de auditoria</strong>, com data, hora e quem publicou, e ganha um código de verificação.</li>
            <li><strong className="text-foreground">Não dá para desfazer.</strong> Depois de publicada, cada mudança salva vira uma versão nova na trilha (a anterior fica como substituída), e retirar do portal também fica registrado.</li>
            <li>A lei manda mantê-la no portal até 180 dias depois da prestação de contas final.</li>
          </ul>
          <div className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
            <p className="font-medium">Confira a equipe antes: só função e valor, nenhum nome.</p>
            {dialogo.parceria.equipe.length
              ? <ul className="mt-1 list-disc pl-5">{dialogo.parceria.equipe.map((e, i) => <li key={i}>{e.funcao}: {reais(e.remuneracao)}</li>)}</ul>
              : <p className="mt-1">Nenhuma função informada.</p>}
          </div>
        </Confirmacao>
      )}
      {dialogo?.tipo === 'retirar' && (
        <RetiradaComMotivo
          key={`retirar-${dialogo.parceria.id}`}
          titulo="Retirar a parceria do portal"
          descricao={tituloDa(dialogo.parceria)}
          executar={(motivo) => retirarParceria(dialogo.parceria.id, motivo)}
          onFeito={(r) => concluir(r, 'Parceria retirada do portal.', idDoCartao(dialogo.parceria.id))}
          onFechar={fechar}
        >
          <AvisoDoPrazo p={dialogo.parceria} hoje={hoje} />
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>A parceria sai da página de transparência, que é refeita no site.</li>
            <li>A retirada entra na <strong className="text-foreground">trilha pública de auditoria</strong>, com data e hora: quem conferir o código de verificação verá “retirado”.</li>
            <li>Parceria retirada não volta ao portal nem se edita. Se foi engano, cadastre de novo.</li>
          </ul>
        </RetiradaComMotivo>
      )}
      {dialogo?.tipo === 'excluir' && (
        <Confirmacao
          key={`excluir-${dialogo.parceria.id}`}
          titulo="Excluir o rascunho?"
          descricao={tituloDa(dialogo.parceria)}
          destrutivo
          confirmar={{ rotulo: 'Excluir rascunho', icone: <Trash2 className="size-4" aria-hidden /> }}
          andamento="Excluindo…"
          executar={() => excluirRascunhoDeParceria(dialogo.parceria.id)}
          onFeito={(r) => concluir(r, 'Rascunho excluído.', painelId)}
          onFechar={fechar}
        >
          <p>Esta parceria nunca foi publicada, então não há o que registrar na trilha. A ficha é apagada.</p>
        </Confirmacao>
      )}
    </div>
  )
}

/** Retirar antes do prazo do decreto é possível (um erro, por exemplo), mas não sem aviso. */
function AvisoDoPrazo({ p, hoje }: { p: ParceriaNaTela; hoje: string }) {
  const ate = exibirAte(p)
  if (ate && hoje > ate) return null
  return (
    <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
      Pelo Decreto 8.726/2016 (art. 80), esta parceria deveria ficar no portal {ate ? `até ${data(ate)}` : 'até 180 dias depois da prestação de contas final, que ainda não foi informada'}.
      Retire antes só se houver motivo — um erro nos dados, por exemplo.
    </p>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function CartaoDaParceria({ p, trilhaDisponivel, hoje, abrir }: {
  p: ParceriaNaTela
  trilhaDisponivel: boolean
  hoje: string
  abrir: (dialogo: DialogoAberto) => void
}) {
  const estado = estadoDa(p)
  const ate = exibirAte(p)
  const titulo = tituloDa(p)
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={idDoCartao(p.id)} tabIndex={-1} className="font-semibold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/50">{titulo}</h3>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{p.objeto}</p>
        </div>
        <Etiqueta estado={estado}>{ROTULO_DO_ESTADO[estado]}</Etiqueta>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:gap-x-6 xl:grid-cols-3">
        <Dado rotulo="CNPJ do órgão">{p.orgaoCnpj ? formatarCnpj(p.orgaoCnpj) : '—'}</Dado>
        <Dado rotulo="Assinatura">{data(p.dataAssinatura)}</Dado>
        <Dado rotulo="Vigência">{p.vigenciaInicio || p.vigenciaFim ? `${data(p.vigenciaInicio)} a ${data(p.vigenciaFim)}` : '—'}</Dado>
        <Dado rotulo="Valor total">{reais(p.valorTotal)}</Dado>
        <Dado rotulo="Valor liberado">{reais(p.valorLiberado)}</Dado>
        <Dado rotulo="Prestação de contas">{ROTULO_DA_SITUACAO[p.situacao]}{p.prestacaoFinalEm ? ` (final em ${data(p.prestacaoFinalEm)})` : ''}</Dado>
      </dl>

      {p.equipe.length > 0 ? (
        <details className="rounded-lg border border-border px-3 py-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
            <Users className="size-3.5" aria-hidden />Equipe paga pela parceria: {p.equipe.length} {p.equipe.length === 1 ? 'função' : 'funções'} · {reais(somaDaEquipe(p.equipe))}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {p.equipe.map((e, i) => <li key={i} className="flex justify-between gap-3"><span className="min-w-0">{e.funcao}</span><span className="shrink-0 tabular-nums">{reais(e.remuneracao)}</span></li>)}
          </ul>
        </details>
      ) : <p className="text-xs text-muted-foreground">Nenhuma função da equipe informada.</p>}

      {p.observacao && <p className="whitespace-pre-line text-xs text-muted-foreground"><span className="font-medium text-foreground">Observação:</span> {p.observacao}</p>}

      {p.retiradoEm && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-semibold">Retirada em {diaEHora(p.retiradoEm)}.</span> Motivo: {p.motivoRetirada}
        </p>
      )}

      {p.publicadoEm && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
          <p className="text-muted-foreground">
            Publicada em {diaEHora(p.publicadoEm)}.
            {estado === 'no_ar' && (ate
              ? hoje <= ate ? ` Precisa ficar no portal ao menos até ${data(ate)}.` : ` O prazo mínimo no portal terminou em ${data(ate)}.`
              : ' Precisa ficar no portal até 180 dias depois da prestação de contas final, ainda não informada.')}
          </p>
          <dl className="mt-1.5 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <dt className="text-muted-foreground">SHA-256 do registro</dt>
            <dd>{p.hash ? <HashCurto hash={p.hash} rotulo="SHA-256 do registro" /> : '—'}</dd>
            <dt className="text-muted-foreground">Código de verificação</dt>
            <dd>{p.codigo ? <CodigoDaTrilha codigo={p.codigo} /> : <SemCodigo trilhaDisponivel={trilhaDisponivel} />}</dd>
          </dl>
        </div>
      )}

      {estado !== 'retirado' && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {estado === 'rascunho' && (
            <Button size="sm" onClick={() => abrir({ tipo: 'publicar', parceria: p })}><Send className="size-3.5" aria-hidden />Publicar<span className="sr-only"> {titulo}</span></Button>
          )}
          <Button size="sm" variant={estado === 'rascunho' ? 'outline' : 'ghost'} onClick={() => abrir({ tipo: 'ficha', parceria: p })}>
            <Pencil className="size-3.5" aria-hidden />Editar<span className="sr-only"> {titulo}</span>
          </Button>
          {estado === 'no_ar' && (
            <Button size="sm" variant="ghost" onClick={() => abrir({ tipo: 'retirar', parceria: p })}><Ban className="size-3.5" aria-hidden />Retirar do portal<span className="sr-only"> {titulo}</span></Button>
          )}
          {estado === 'rascunho' && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => abrir({ tipo: 'excluir', parceria: p })}>
              <Trash2 className="size-3.5" aria-hidden />Excluir rascunho<span className="sr-only"> {titulo}</span>
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

type LinhaDaEquipe = { chave: string; funcao: string; remuneracao: string; nova: boolean }

/** O formulário da parceria, com os nomes de campo que lerParceria (lib/transparencia/regras.ts) lê. */
function FichaDaParceria({ parceria, onFechar, onSalvo }: {
  parceria: ParceriaNaTela | null
  onFechar: () => void
  onSalvo: (id: string, r: Resultado) => void
}) {
  const id = useId()
  const [equipe, setEquipe] = useState<LinhaDaEquipe[]>(() =>
    (parceria?.equipe ?? []).map((e, i) => ({ chave: `i${i}`, funcao: e.funcao, remuneracao: valorNoCampo(e.remuneracao), nova: false })))
  const contador = useRef(0)
  const [erros, setErros] = useState<string[]>([])
  const [salvando, iniciar] = useTransition()
  const noAr = Boolean(parceria?.publicadoEm) && !parceria?.retiradoEm

  function adicionar() {
    contador.current += 1
    setEquipe((l) => [...l, { chave: `n${contador.current}`, funcao: '', remuneracao: '', nova: true }])
  }
  function remover(chave: string) {
    setEquipe((l) => l.filter((x) => x.chave !== chave))
    // A linha (e o botão que tinha o foco) some: o foco vai para "Adicionar função".
    requestAnimationFrame(() => document.getElementById(`${id}-adicionar`)?.focus())
  }
  const mudar = (chave: string, campo: 'funcao' | 'remuneracao', valor: string) =>
    setEquipe((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: valor } : x)))

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (salvando) return
    const f = new FormData(e.currentTarget)
    const { dados, erros: problemas } = lerParceria(f)
    if (!dados) { setErros(problemas); return }
    setErros([])
    iniciar(async () => {
      try {
        const r = await salvarParceria(parceria?.id ?? null, f)
        if (r.erro || !r.id) { setErros([r.erro ?? 'Não foi possível salvar a parceria.']); return }
        onSalvo(r.id, r)
      } catch {
        setErros([FALHA_DE_REDE])
      }
    })
  }

  const soma = somaDaEquipe(equipe)
  const grupo = 'grid gap-4 rounded-lg border border-border p-4'
  const legenda = 'px-1 text-sm font-semibold'

  return (
    <Dialogo
      titulo={parceria ? 'Editar parceria' : 'Nova parceria'}
      descricao={parceria ? tituloDa(parceria) : 'Nasce como rascunho: só vai ao portal quando você publicar.'}
      largura="max-w-3xl"
      onFechar={onFechar}
      podeFechar={!salvando}
    >
      <form className="flex flex-col gap-5" onSubmit={enviar}>
        {noAr && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
            Esta parceria está no portal. Salvar refaz a página do site e registra uma versão nova na trilha pública; a anterior continua lá, como substituída.
          </p>
        )}

        <fieldset className={`${grupo} sm:grid-cols-3`}>
          <legend className={legenda}>Instrumento</legend>
          <Campo rotulo="Tipo">
            {(p) => (
              <select {...p} name="instrumento" defaultValue={parceria?.instrumento ?? 'termo_de_colaboracao'} data-autofocus className={inputClass}>
                {INSTRUMENTOS.map((i) => <option key={i} value={i}>{ROTULO_DO_INSTRUMENTO[i]}</option>)}
              </select>
            )}
          </Campo>
          <Campo rotulo="Número" opcional>
            {(p) => <input {...p} name="numero" maxLength={80} defaultValue={parceria?.numero ?? ''} placeholder="Ex.: 012/2026" className={inputClass} />}
          </Campo>
          <Campo rotulo="Data de assinatura" opcional>
            {(p) => <input {...p} name="data_assinatura" type="date" defaultValue={parceria?.dataAssinatura ?? ''} className={inputClass} />}
          </Campo>
        </fieldset>

        <fieldset className={`${grupo} sm:grid-cols-[minmax(0,1fr)_13rem]`}>
          <legend className={legenda}>Órgão e objeto</legend>
          <Campo rotulo="Órgão ou entidade da administração pública">
            {(p) => <input {...p} name="orgao" required minLength={3} maxLength={200} defaultValue={parceria?.orgao ?? ''} placeholder="Ex.: Secretaria Municipal de Saúde do Rio de Janeiro" className={inputClass} />}
          </Campo>
          <Campo rotulo="CNPJ do órgão" opcional>
            {(p) => <input {...p} name="orgao_cnpj" inputMode="numeric" maxLength={18} defaultValue={parceria?.orgaoCnpj ? formatarCnpj(parceria.orgaoCnpj) : ''} placeholder="00.000.000/0000-00" className={inputClass} />}
          </Campo>
          <Campo rotulo="Objeto" className="sm:col-span-2" ajuda="O que a parceria faz, como está no instrumento (de 5 a 2.000 caracteres).">
            {(p) => <textarea {...p} name="objeto" required minLength={5} maxLength={2000} rows={3} defaultValue={parceria?.objeto ?? ''} className={inputClass} />}
          </Campo>
        </fieldset>

        <fieldset className={`${grupo} sm:grid-cols-2`}>
          <legend className={legenda}>Vigência e valores</legend>
          <Campo rotulo="Início da vigência" opcional>
            {(p) => <input {...p} name="vigencia_inicio" type="date" defaultValue={parceria?.vigenciaInicio ?? ''} className={inputClass} />}
          </Campo>
          <Campo rotulo="Fim da vigência" opcional>
            {(p) => <input {...p} name="vigencia_fim" type="date" defaultValue={parceria?.vigenciaFim ?? ''} className={inputClass} />}
          </Campo>
          <Campo rotulo="Valor total" opcional ajuda="Em reais: 150.000 ou 150.000,00.">
            {(p) => <input {...p} name="valor_total" inputMode="decimal" defaultValue={valorNoCampo(parceria?.valorTotal)} placeholder="0,00" className={inputClass} />}
          </Campo>
          <Campo rotulo="Valor liberado até agora" opcional ajuda="O que já foi repassado à filial, em reais.">
            {(p) => <input {...p} name="valor_liberado" inputMode="decimal" defaultValue={valorNoCampo(parceria?.valorLiberado)} placeholder="0,00" className={inputClass} />}
          </Campo>
        </fieldset>

        <fieldset className={`${grupo} sm:grid-cols-2`}>
          <legend className={legenda}>Prestação de contas</legend>
          <Campo rotulo="Situação">
            {(p) => (
              <select {...p} name="situacao_prestacao" defaultValue={parceria?.situacao ?? 'em_execucao'} className={inputClass}>
                {SITUACOES_DA_PRESTACAO.map((s) => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>)}
              </select>
            )}
          </Campo>
          <Campo rotulo="Prestação de contas final apresentada em" opcional ajuda="A parceria precisa ficar no portal até 180 dias depois desta data (Decreto 8.726/2016, art. 80).">
            {(p) => <input {...p} name="prestacao_final_em" type="date" defaultValue={parceria?.prestacaoFinalEm ?? ''} className={inputClass} />}
          </Campo>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-describedby={`${id}-sem-nomes`}>
          <legend className={legenda}>Equipe paga com recursos da parceria</legend>
          <p id={`${id}-sem-nomes`} className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
            <strong>Nunca escreva nomes.</strong> Só a função e a remuneração prevista: é o que a Lei 13.019/2014 (art. 11, parágrafo único, VI) manda divulgar, e o portal é público.
          </p>
          {equipe.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {equipe.map((l, i) => (
                <li key={l.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                  <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                    <label htmlFor={`${id}-funcao-${l.chave}`} className="text-xs font-medium">Função {i + 1}</label>
                    <input
                      id={`${id}-funcao-${l.chave}`} name={`funcao_${i}`} value={l.funcao} onChange={(e) => mudar(l.chave, 'funcao', e.target.value)}
                      maxLength={120} placeholder="Ex.: Coordenação técnica" autoFocus={l.nova} autoComplete="off" className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-remuneracao-${l.chave}`} className="text-xs font-medium">Remuneração (R$)<span className="sr-only"> da função {i + 1}</span></label>
                    <input
                      id={`${id}-remuneracao-${l.chave}`} name={`remuneracao_${i}`} value={l.remuneracao} onChange={(e) => mudar(l.chave, 'remuneracao', e.target.value)}
                      inputMode="decimal" placeholder="0,00" autoComplete="off" className={inputClass}
                    />
                  </div>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remover a função ${i + 1}${l.funcao ? ` (${l.funcao})` : ''}`} onClick={() => remover(l.chave)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          ) : <p className="text-xs text-muted-foreground">Nenhuma função informada. Se a parceria paga equipe, liste cada função com a remuneração prevista.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button id={`${id}-adicionar`} type="button" size="sm" variant="outline" onClick={adicionar} disabled={equipe.length >= 50}>
              <Plus className="size-3.5" aria-hidden />Adicionar função
            </Button>
            {equipe.length > 0 && <p className="text-xs text-muted-foreground">Soma das remunerações: <span className="font-medium tabular-nums text-foreground">{reais(soma)}</span></p>}
          </div>
        </fieldset>

        <Campo rotulo="Observação" opcional ajuda="Ex.: a data prevista para a prestação de contas, o prazo de análise e o resultado — o que a lei pede e não coube acima (até 1.000 caracteres).">
          {(p) => <textarea {...p} name="observacao" rows={3} maxLength={1000} defaultValue={parceria?.observacao ?? ''} className={inputClass} />}
        </Campo>

        <Rodape erros={erros} andamento={salvando ? 'Salvando…' : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando} {...OCUPADO_SEM_PERDER_FOCO}>{salvando && <Loader2 className="size-4 animate-spin" aria-hidden />}{parceria ? 'Salvar' : 'Salvar rascunho'}</Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}
