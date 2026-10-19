'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ExternalLink, HardDrive, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { desconectarGoogleDrive } from '@/app/actions/google-drive'

export type ConexaoDoDriveNaTela = { email: string; estado: 'ativa' | 'expirada'; conectadaEm: string; pastaRaizLink: string | null } | null

type Resultado = { erro?: string; recado?: string }
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/**
 * 6. Google Drive: a conexão da conta Google da filial onde o Palácio guarda arquivos (lib/google/drive.ts) — a
 * cópia automática dos envios que chegam pelo WhatsApp e os documentos que a equipe guarda por lá. Outra conexão,
 * separada das dos passos 1 e 5, com um escopo só (drive.file: o Palácio enxerga só o que ele mesmo criou, dentro
 * da pasta "Palácio – Arquivos"). `disponivel`: a tabela da conexão existe (a migração do Drive foi aplicada).
 */
export function DriveDoGoogle({ conexao, clienteConfigurado, disponivel, aviso }: {
  conexao: ConexaoDoDriveNaTela
  clienteConfigurado: boolean
  disponivel: boolean
  aviso: { tom: 'ok' | 'erro'; texto: string } | null
}) {
  const router = useRouter()
  const [recado, setRecado] = useState(aviso)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<Resultado>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    router.refresh()
  })

  const conectada = conexao?.estado === 'ativa'
  return (
    <Card className="flex flex-col gap-4 p-5" id="google-drive" data-ajuda="configuracoes.google-drive">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium"><HardDrive className="size-4" aria-hidden="true" />6. Google Drive</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!disponivel
              ? 'Falta aplicar a migração do Google Drive no banco; depois disso, o botão de conectar aparece aqui.'
              : !clienteConfigurado
                ? 'Primeiro, o cliente OAuth do Google em Integrações (o mesmo do passo 1).'
                : !conexao
                  ? 'Conecte a conta Google da filial: o Palácio copia para lá os envios que chegam pelo WhatsApp e guarda os documentos que a equipe manda por lá, tudo dentro da pasta “Palácio – Arquivos”. Ele só enxerga o que ele mesmo criou.'
                  : conexao.estado === 'expirada'
                    ? `A autorização de ${conexao.email} expirou ou foi revogada. Reconecte para as cópias voltarem.`
                    : `Conectado: ${conexao.email} (desde ${quando.format(new Date(conexao.conectadaEm))}).`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {disponivel && clienteConfigurado && (
            <Button render={<a href="/api/google/conectar-drive" />} variant={conectada ? 'outline' : 'default'}>
              <Link2 className="size-4" />{conexao ? 'Reconectar' : 'Conectar Google Drive'}
            </Button>
          )}
          {conexao && (
            <Button variant="ghost" className="text-destructive" disabled={ocupado}
              onClick={() => { if (confirm('Desconectar o Google Drive? A cópia dos envios e o guardar pelo WhatsApp param até reconectar; o que já está no Drive continua lá.')) executar(desconectarGoogleDrive) }}>
              <Unlink className="size-4" />Desconectar
            </Button>
          )}
        </div>
      </div>

      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}

      {conexao && (
        <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Situação</dt>
            <dd className={conectada ? 'text-emerald-700' : 'text-destructive'}>{conectada ? 'Ativa' : 'Expirada: reconecte'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Conta conectada</dt>
            <dd className="truncate">{conexao.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pasta raiz</dt>
            <dd>
              {conexao.pastaRaizLink
                ? <a href={conexao.pastaRaizLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">Palácio – Arquivos<ExternalLink className="size-3.5" aria-hidden="true" /></a>
                : <span className="text-muted-foreground">nasce no primeiro arquivo</span>}
            </dd>
          </div>
        </dl>
      )}

      {conexao && (
        <p className="text-xs text-muted-foreground">
          Dentro da pasta: “Envios do WhatsApp/AAAA-MM/título do envio (ENV-…)” (a cópia de cada envio, com a autorização de imagem na descrição de cada arquivo) e as pastas dos setores, onde cada pessoa guarda pelo WhatsApp só na do próprio setor (quem administra, em qualquer lugar). O WhatsApp responde com o link do arquivo.
          {' '}O que o Palácio cria nasce privado desta conta: no Google Drive, compartilhe “Palácio – Arquivos” com a equipe (o que nasce dentro herda o acesso), senão o link que o WhatsApp devolve e o da ficha do envio só abrem para esta conta.
        </p>
      )}
    </Card>
  )
}
