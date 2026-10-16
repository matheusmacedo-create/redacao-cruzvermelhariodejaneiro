'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, FolderCog, Loader2, PlugZap, TriangleAlert, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Campo, Confirmacao, Erros, diaEHora } from '@/components/app/transparencia/comum'
import { definirPastaDaFilial, desconectarDrive } from '@/app/actions/arquivos-do-setor'

export type ConexaoNaTela = { email: string; expirada: boolean; raizNome: string | null; conectadaEm: string } | null

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * A ligação dos Arquivos do setor com o Google Drive, para quem tem
 * arquivos.configurar: conectar a conta Google que guarda os arquivos,
 * escolher a pasta da filial e desconectar. As actions conferem a permissão
 * de novo.
 */
export function LigacaoDoDrive({ conexao, volta }: { conexao: ConexaoNaTela; volta: { tipo: 'ok' | 'erro'; texto: string } | null }) {
  const router = useRouter()
  const [estado, escolher, escolhendo] = useActionState(definirPastaDaFilial, null)
  const [desligar, setDesligar] = useState(false)
  const [desligado, setDesligado] = useState<string | null>(null)
  const pronta = conexao && !conexao.expirada && conexao.raizNome

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5" data-ajuda="arquivos.ligacao">
      <div className="flex items-start gap-3">
        <FolderCog className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Ligação com o Google Drive</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">Só administradores veem este quadro. Os arquivos ficam no Google Drive da conta conectada, dentro da pasta da filial; cada setor ganha uma pasta lá dentro, e o Palácio decide quem abre o quê.</p>
        </div>
      </div>

      {volta && (
        <p role={volta.tipo === 'erro' ? 'alert' : 'status'} className={volta.tipo === 'erro' ? 'rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive' : 'flex items-start gap-2 rounded-lg border border-success/50 px-3 py-2 text-sm'}>
          {volta.tipo === 'ok' && <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}{volta.texto}
        </p>
      )}
      {desligado && <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">{desligado}</p>}

      {!conexao ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>Conecte a conta Google que vai guardar os arquivos. Use a conta da filial que é dona das pastas (por exemplo, contato@): os arquivos ficam no Drive dela, e não no de quem clicou.</p>
          <Button className="self-start" render={<a href="/api/google/conectar-drive" />}><PlugZap aria-hidden />Conectar o Google Drive</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Conta conectada</dt>
            <dd className="break-all font-medium">{conexao.email}{conexao.expirada && <span className="ml-2 text-destructive">(autorização expirada)</span>}</dd>
            <dt className="text-muted-foreground">Desde</dt>
            <dd>{diaEHora(conexao.conectadaEm)}</dd>
            <dt className="text-muted-foreground">Pasta da filial</dt>
            <dd className="break-all">{conexao.raizNome ?? <span className="text-warning-foreground">ainda não escolhida</span>}</dd>
          </dl>

          {conexao.expirada && (
            <p className="flex items-start gap-2 text-destructive" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />O Google não aceita mais esta autorização. Conecte de novo: a pasta escolhida continua a mesma.</p>
          )}

          <form action={escolher} className="flex flex-col gap-2">
            <Campo rotulo={conexao.raizNome ? 'Trocar a pasta da filial' : 'Pasta da filial'} ajuda="Abra a pasta no Google Drive e copie o endereço do navegador. Prefira uma pasta com o acesso geral “Restrito”: quem precisa abre pelo Palácio. Trocar a pasta cria pastas novas para os setores; as antigas ficam onde estão.">
              {(p) => <input {...p} name="link" className={campo} placeholder="https://drive.google.com/drive/folders/…" inputMode="url" autoComplete="off" required />}
            </Campo>
            <Erros erros={estado?.erro ? [estado.erro] : []} />
            {estado?.recado && <p role="status" className="text-sm">{estado.recado}</p>}
            <Button type="submit" variant={pronta ? 'outline' : 'default'} disabled={escolhendo} focusableWhenDisabled className="self-start aria-disabled:opacity-60">
              {escolhendo && <Loader2 className="animate-spin" aria-hidden />}{escolhendo ? 'Conferindo a pasta…' : 'Usar esta pasta'}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" render={<a href="/api/google/conectar-drive" />}><PlugZap aria-hidden />{conexao.expirada ? 'Conectar o Google Drive' : 'Reconectar'}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setDesligar(true)} className="text-destructive hover:text-destructive"><Unplug aria-hidden />Desconectar</Button>
          </div>
        </div>
      )}

      {desligar && (
        <Confirmacao titulo="Desconectar o Google Drive?" confirmar={{ rotulo: 'Desconectar', icone: <Unplug className="size-4" aria-hidden /> }} destrutivo andamento="Desconectando…"
          executar={desconectarDrive} onFeito={(r) => { setDesligar(false); setDesligado((r as { recado?: string }).recado ?? 'Desconectado.'); router.refresh() }} onFechar={() => setDesligar(false)}>
          <p>Nada é apagado do Drive. Pelo Palácio, os Arquivos do setor só voltam a abrir quando alguém conectar de novo.</p>
        </Confirmacao>
      )}
    </Card>
  )
}
