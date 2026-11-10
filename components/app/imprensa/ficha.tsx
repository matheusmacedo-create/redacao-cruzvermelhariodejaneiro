'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Mail, MessageCircle, Pencil, Phone, ShieldCheck, Siren, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { excluirContato, verificarEmailDoContato, type ContatoDeImprensa } from '@/app/actions/imprensa'
import { comoEntrou, marcasDoEnvio, resumoDaLeitura, type EnvioNaFicha } from '@/lib/imprensa/ficha'
import {
  comMaiuscula, linkDeLigacao, linkDoWhatsApp, rotuloDaRelevancia, rotuloDoCanal, rotuloDoTipoDeContato, rotuloDoTipoDeVeiculo,
  type Canal, type VeiculoDeImprensa,
} from '@/lib/imprensa/vocabulario'
import { quandoLegivel } from './comum'
import { DialogContato } from './contato-form'
import { BadgeDeStatus, Marca } from './pecas'

/** O botão grande de um canal: abre o e-mail, o WhatsApp ou a ligação. Sem o dado, fica apagado e diz o que falta. */
function BotaoDoCanal({ href, externo, preferido, rotulo, falta, children }: {
  href: string | null
  externo?: boolean
  preferido: boolean
  rotulo: string
  falta: string
  children: React.ReactNode
}) {
  const base = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-sm font-medium'
  if (!href) {
    return (
      <span aria-disabled="true" className={`${base} border-dashed border-border text-muted-foreground`}>
        {children}
        <span className="text-xs font-normal">{falta}</span>
      </span>
    )
  }
  return (
    <a
      href={href}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`${base} transition-colors ${preferido ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}
    >
      {children}
      <span>{rotulo}</span>
      {preferido && <span className="text-[11px] font-normal">prefere este</span>}
    </a>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-sm text-muted-foreground sm:w-44 sm:shrink-0">{rotulo}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * A ficha de um contato: como falar com ele, o que cobre, o que já recebeu e
 * de onde veio o dado. Uma tela só, pensada para o celular: os três botões do
 * topo abrem o e-mail, o WhatsApp e a ligação.
 */
export function FichaDoContato({ contato, veiculo, veiculos, pracasEmUso, envios, listas, cadastradoPor, hunterDisponivel, podeRemover }: {
  contato: ContatoDeImprensa
  veiculo: VeiculoDeImprensa | null
  /** O cadastro de veículos, para o formulário de edição sugerir. */
  veiculos: VeiculoDeImprensa[]
  pracasEmUso: string[]
  envios: EnvioNaFicha[]
  /** As listas em que o contato está hoje (fixas e por filtro). */
  listas: { id: string; nome: string; plantao: boolean }[]
  cadastradoPor: string
  hunterDisponivel: boolean
  podeRemover: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [ocupado, rodar] = useTransition()
  const [erro, setErro] = useState('')

  const whatsapp = linkDoWhatsApp(contato.whatsapp || contato.telefone)
  const ligacao = linkDeLigacao(contato.telefone || contato.whatsapp)
  const prefere = (canal: Canal) => contato.canalPreferido === canal
  const praca = contato.praca || veiculo?.praca || ''
  const nome = contato.nome || contato.email || 'este contato'

  function verificar() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', contato.id)
      const r = await verificarEmailDoContato(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  function remover() {
    if (!confirm(`Remover ${nome} do banco de contatos? O histórico das campanhas fica, sem o nome ligado. Não dá para desfazer.`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', contato.id)
      const r = await excluirContato(form)
      if (r.erro) { setErro(r.erro); return }
      router.push('/imprensa')
      router.refresh()
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/imprensa" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />Voltar aos contatos
      </Link>

      {contato.descadastradoEm && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <span className="font-medium">Saiu da lista em {quandoLegivel.format(new Date(contato.descadastradoEm))}.</span>{' '}
          Não recebe mais campanhas. Ligar ou escrever à mão continua possível.
        </Card>
      )}
      {contato.devolvidoEm && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm">
          <span className="font-medium">O e-mail devolveu em {quandoLegivel.format(new Date(contato.devolvidoEm))}.</span>{' '}
          O endereço não recebe mais campanhas. Se a pessoa mudou de e-mail, edite o contato.
          {contato.motivoDaDevolucao && <span className="mt-1 block text-xs text-muted-foreground">Motivo informado pelo provedor: {contato.motivoDaDevolucao}</span>}
        </Card>
      )}

      <Card data-ajuda="imprensa.ficha" className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-2">
          <BotaoDoCanal href={contato.email ? `mailto:${contato.email}` : null} preferido={prefere('email')} rotulo="E-mail" falta="sem e-mail">
            <Mail className="size-5" />
          </BotaoDoCanal>
          <BotaoDoCanal href={whatsapp} externo preferido={prefere('whatsapp')} rotulo="WhatsApp" falta={contato.whatsapp || contato.telefone ? 'confira o número' : 'sem número'}>
            <MessageCircle className="size-5" />
          </BotaoDoCanal>
          <BotaoDoCanal href={ligacao} preferido={prefere('telefone')} rotulo="Ligar" falta={contato.telefone || contato.whatsapp ? 'confira o número' : 'sem telefone'}>
            <Phone className="size-5" />
          </BotaoDoCanal>
        </div>

        <dl className="flex flex-col gap-3">
          <Linha rotulo="E-mail">
            {contato.email
              ? <span className="flex flex-wrap items-center gap-2"><span className="break-all">{contato.email}</span><BadgeDeStatus status={contato.emailStatus} />{contato.confianca !== null && <span className="text-xs text-muted-foreground">confiança {contato.confianca}%</span>}</span>
              : <span className="text-muted-foreground">Não informado</span>}
          </Linha>
          <Linha rotulo="Telefone">{contato.telefone || <span className="text-muted-foreground">Não informado</span>}</Linha>
          {contato.whatsapp && <Linha rotulo="WhatsApp">{contato.whatsapp}</Linha>}
          <Linha rotulo="Prefere ser procurado por">{rotuloDoCanal(contato.canalPreferido)}</Linha>
          <Linha rotulo="Veículo ou organização">
            {contato.veiculo
              ? <>{contato.veiculo}{veiculo && <span className="block text-xs text-muted-foreground">{[veiculo.tipo ? rotuloDoTipoDeVeiculo(veiculo.tipo) : 'Tipo a classificar', veiculo.praca || null, `relevância ${rotuloDaRelevancia(veiculo.relevancia).toLowerCase()}`].filter(Boolean).join(' · ')}</span>}</>
              : <span className="text-muted-foreground">Não informado</span>}
          </Linha>
          {contato.tipoDeContato !== 'jornalista' && <Linha rotulo="Tipo de contato">{rotuloDoTipoDeContato(contato.tipoDeContato)}</Linha>}
          <Linha rotulo="Editorias que cobre">
            {contato.editorias.length
              ? <span className="flex flex-wrap gap-1">{contato.editorias.map((e) => <Marca key={e} tom="destaque">{comMaiuscula(e)}</Marca>)}</span>
              : <span className="text-muted-foreground">Nenhuma marcada. Sem editoria, o contato não entra nos filtros por assunto.</span>}
          </Linha>
          <Linha rotulo="Praça">{praca ? <>{praca}{!contato.praca && <span className="text-xs text-muted-foreground"> (a do veículo)</span>}</> : <span className="text-muted-foreground">Não informada</span>}</Linha>
          {contato.tags.length > 0 && (
            <Linha rotulo="Etiquetas"><span className="flex flex-wrap gap-1">{contato.tags.map((t) => <Marca key={t}>{t}</Marca>)}</span></Linha>
          )}
          {contato.notas && <Linha rotulo="Notas"><span className="whitespace-pre-line">{contato.notas}</span></Linha>}
        </dl>

        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditando(true)} disabled={ocupado} className="min-h-11 px-4"><Pencil className="size-4" />Editar</Button>
          {hunterDisponivel && contato.email && (
            <Button variant="outline" onClick={verificar} disabled={ocupado} className="min-h-11 px-4">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Verificar e-mail
            </Button>
          )}
          {podeRemover && (
            <Button variant="outline" onClick={remover} disabled={ocupado} className="min-h-11 px-4 text-destructive"><Trash2 className="size-4" />Remover</Button>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold">Listas</h2>
        {listas.length
          ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {listas.map((l) => (
                <li key={l.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${l.plantao ? 'border-destructive/40 text-destructive' : 'border-border'}`}>
                  {l.plantao && <Siren className="size-3.5" />}{l.nome}
                </li>
              ))}
            </ul>
          )
          : <p className="mt-1 text-sm text-muted-foreground">Não está em nenhuma lista.</p>}
      </Card>

      <Card data-ajuda="imprensa.historico" className="p-4 sm:p-6">
        <h2 className="text-base font-semibold">O que já recebeu</h2>
        <p className="mt-1 text-sm text-muted-foreground">{resumoDaLeitura(contato.totalEnvios, contato.totalAberturas)}</p>
        {envios.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {envios.map((e) => (
              <li key={e.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium break-words">{e.assunto || '(sem assunto)'}</p>
                <p className="text-xs text-muted-foreground">
                  {e.agendadaPara && (e.estado === 'na_fila' || e.estado === 'enviando')
                    ? `Sai em ${quandoLegivel.format(new Date(e.agendadaPara))}`
                    : quandoLegivel.format(new Date(e.quando))}
                </p>
                <p className="flex flex-wrap gap-1">{marcasDoEnvio(e).map((m) => <Marca key={m.rotulo} tom={m.tom}>{m.rotulo}</Marca>)}</p>
              </li>
            ))}
          </ul>
        )}
        {contato.totalEnvios > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Abertura é estimativa: alguns programas de e-mail abrem sozinhos, e outros bloqueiam a imagem que conta.</p>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold">Sobre este cadastro</h2>
        <dl className="mt-3 flex flex-col gap-3">
          <Linha rotulo="De onde veio o dado">{contato.origemDoDado || <span className="text-muted-foreground">Não informado. Vale registrar: edite o contato.</span>}</Linha>
          <Linha rotulo="Base legal (LGPD)">{contato.baseLegal === 'consentimento' ? 'Consentimento: a pessoa pediu para receber' : 'Legítimo interesse'}</Linha>
          <Linha rotulo="Como entrou">{comoEntrou(contato.fonte)}{cadastradoPor ? `, por ${cadastradoPor}` : ''}</Linha>
          <Linha rotulo="Última alteração">{quandoLegivel.format(new Date(contato.atualizadoEm))}</Linha>
        </dl>
      </Card>

      {editando && (
        <DialogContato
          editando={contato}
          veiculos={veiculos}
          editoriasEmUso={[]}
          pracasEmUso={pracasEmUso}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); router.refresh() }}
        />
      )}
    </div>
  )
}
