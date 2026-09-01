import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { lerPautas, urlDoCerebro } from '@/lib/cerebro/cliente'
import { DESTINO_POR_CANAL, type PautaDoCerebro } from '@/lib/cerebro/contrato'
import { ImportarBotao } from './importar-botao'

/**
 * O que o Cérebro sugere, dentro de Publicações.
 *
 * Aparece antes dos pacotes porque é de onde eles podem nascer: o Cérebro leu
 * as contas oficiais e já chegou com fato, raciocínio, plano por canal e o
 * que não pode. Importar cria um pacote em rascunho — nada é enviado.
 *
 * Se o Cérebro estiver fora do ar, a seção some com um recado curto. O hub é
 * o trabalho da equipe e não pode depender de outro serviço estar de pé.
 */
export async function PainelDoCerebro() {
  const { pautas, origem, geradoEm, erro } = await lerPautas(6)

  if (erro) {
    return (
      <Card className="mb-6 border-dashed p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Cérebro indisponível.</span> {erro} Os pacotes
        abaixo não são afetados.
      </Card>
    )
  }
  if (pautas.length === 0) return null

  const quando = geradoEm
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(geradoEm))
    : null

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sugerido pelo Cérebro</h2>
          <p className="text-sm text-muted-foreground">
            Leitura das contas oficiais do Rio. Importar cria um pacote em rascunho — nada é enviado.
            {origem === 'seed' && ' Atenção: o Cérebro está servindo o acervo semente, não dado vivo.'}
          </p>
        </div>
        <span className="flex items-center gap-3">
          <Link href="/cerebro" className="text-xs font-medium text-primary hover:underline">
            Ver tudo
          </Link>
          <a
            href={urlDoCerebro()}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs font-medium text-primary hover:underline"
          >
            Abrir o Cérebro{quando ? ` · atualizado ${quando}` : ''}
          </a>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pautas.map((p) => (
          <CartaoDaPauta key={p.id} pauta={p} />
        ))}
      </div>
    </section>
  )
}

function CartaoDaPauta({ pauta: p }: { pauta: PautaDoCerebro }) {
  const liberados = p.canais.filter((c) => c.usar)

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      {p.midia && (
        <div className="relative">
          {/* A capa vem do cache do Cérebro. É referência de triagem: o selo de
              direito fica sobre ela para que ninguém a use sem ver a regra. */}
          <Image
            src={p.midia.url}
            alt=""
            width={640}
            height={360}
            unoptimized
            className="h-40 w-full bg-muted object-contain"
          />
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              p.midia.podePublicar
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-destructive/10 text-destructive'
            }`}
            title={
              p.midia.podePublicar
                ? 'Material autorizado. Pode entrar na peça.'
                : 'Mídia de terceiro. Não entra na peça — use arte própria ou foto autorizada da filial.'
            }
          >
            {p.midia.direito}
          </span>
          <span className="absolute bottom-2 right-2 max-w-[75%] truncate rounded bg-black/60 px-2 py-1 text-[10px] text-white">
            {p.midia.credito}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold uppercase tracking-wide text-primary">
            {p.decisao.modoRotulo}
          </span>
          <span className="tabular-nums">{p.fato.conta ?? p.fato.fonte} · {p.decisao.nota}/100</span>
        </div>

        <h3 className="text-sm font-semibold leading-snug">{p.titulo}</h3>
        <p className="line-clamp-3 text-xs text-muted-foreground">{p.resumo}</p>

        <div className="rounded-lg bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Por que apareceu</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {p.decisao.porque.slice(0, 2).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Canais liberados: </span>
          {liberados.length > 0
            ? liberados.map((c) => DESTINO_POR_CANAL[c.canal]?.rotulo ?? c.canal).join(' · ')
            : 'nenhum — o Cérebro sugere só acompanhar'}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ImportarBotao sinalId={p.id} destinos={liberados.length} />
          <a
            href={p.fato.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Ver na fonte
          </a>
        </div>
      </div>
    </Card>
  )
}
