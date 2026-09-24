import { SITUACOES } from '@/lib/rh/regras'

export const nomeDe = (m: { nome: string; nome_social: string | null }) => m.nome_social || m.nome

export function Situacao({ s }: { s: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === 'ativo' ? 'bg-success/15 text-success' : s === 'desligado' ? 'bg-destructive/10 text-destructive' : 'bg-warning/20 text-warning-foreground'}`}>
      {SITUACOES[s as keyof typeof SITUACOES]?.rotulo ?? s}
    </span>
  )
}
