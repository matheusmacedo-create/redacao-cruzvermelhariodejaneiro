import type { Metadata } from 'next'
import { CabecalhoDaPagina, Recado } from '@/components/membro/pecas'
import { AssinaturaDesenhada } from '@/components/autorizacao/assinatura-desenhada'
import { comprovante } from '@/lib/imagem/servidor'
import { USOS, VINCULOS, ehUso, ehVinculo } from '@/lib/imagem/regras'
import { Moldura } from '../../moldura'
import { Revogar } from './revogar'
import { ProximaPessoa } from './proxima-pessoa'

export const metadata: Metadata = {
  title: 'Comprovante de autorização de imagem — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-border py-2 last:border-0 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  )
}

/** O comprovante de quem assinou. Abre com o código e a chave (?c=) que só essa pessoa recebeu. */
export default async function Comprovante({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ c?: string; novo?: string }> }) {
  const [{ codigo }, { c, novo }] = await Promise.all([params, searchParams])
  const a = await comprovante(codigo, c ?? '')
  if (!a) {
    return (
      <Moldura>
        <CabecalhoDaPagina titulo="Comprovante não encontrado" />
        <Recado tipo="aviso">Confira o link completo do comprovante. Se o perdeu, fale com a filial pelo e-mail contato@cruzvermelhariodejaneiro.org e informe o código.</Recado>
      </Moldura>
    )
  }
  return (
    <Moldura>
      <CabecalhoDaPagina sobretitulo="Comprovante de autorização de imagem" titulo={a.codigo} descricao={a.titulo} />
      {novo && !a.revogadaEm && (
        <Recado tipo="sucesso" titulo="Autorização registrada. Obrigado!">
          Guarde este comprovante: mande para o seu WhatsApp, salve o link ou tire um print. É por ele que você pode revogar a autorização quando quiser.
        </Recado>
      )}
      {novo && !a.revogadaEm && <ProximaPessoa codigo={a.codigo} chave={c ?? ''} link={a.linkDaColeta} />}
      {a.revogadaEm && <Recado tipo="aviso" titulo="Autorização revogada">Revogada em {quando(a.revogadaEm)}{a.revogadaPor === 'equipe' ? ' pela equipe da filial' : ''}. As fotos não serão usadas em publicações novas.</Recado>}
      <dl className="rounded-xl border border-border bg-card px-4 py-2">
        <Linha rotulo="Nome">{a.nome}</Linha>
        <Linha rotulo="Relação">{ehVinculo(a.vinculo) ? VINCULOS[a.vinculo] : a.vinculo}</Linha>
        {a.menor && <Linha rotulo="Responsável que assinou">{a.responsavelNome} ({a.responsavelParentesco})</Linha>}
        <Linha rotulo="Usos autorizados"><ul className="list-disc pl-4">{a.usos.map((u) => <li key={u}>{ehUso(u) ? USOS[u].rotulo : u}</li>)}</ul></Linha>
        <Linha rotulo="Fotos">{a.fotos}</Linha>
        <Linha rotulo="Assinado em">{quando(a.assinadoEm)}</Linha>
        <Linha rotulo="Aparelho">{a.aparelho}</Linha>
        {a.ip && <Linha rotulo="Endereço de internet (IP)">{a.ip}</Linha>}
        <Linha rotulo="Versão do termo">{a.termoVersao}</Linha>
        <Linha rotulo="Impressão digital do documento"><code className="break-all text-xs">{a.documentoHash}</code></Linha>
      </dl>
      <section aria-labelledby="assinatura" className="flex flex-col gap-2">
        <h2 id="assinatura" className="text-base font-semibold">Assinatura</h2>
        <AssinaturaDesenhada tracos={a.assinatura} rotulo={`Assinatura de ${a.menor ? a.responsavelNome : a.nome}`} />
      </section>
      {!a.revogadaEm && <Revogar codigo={a.codigo} chave={c ?? ''} />}
    </Moldura>
  )
}
