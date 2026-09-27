'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { convidarEmLote } from '@/app/actions/usuarios'
import { PAPEIS, PAPEL, type Papel } from '@/lib/permissoes'

/**
 * Da ficha do RH direto para o acesso: o mesmo convite de Pessoas → Adicionar
 * (conta, link para criar a senha por WhatsApp e/ou e-mail), já ligado a esta
 * ficha, sem digitar tudo de novo. Só para administradores.
 */
export function DarAcesso({ fichaId, nome, cargo, setor, setores, papelSugerido, whatsapp, email, faltaFicha, whatsappConfigurado }: {
  fichaId: string; nome: string; cargo: string; setor: string; setores: string[]; papelSugerido: Papel
  whatsapp: string; email: string; faltaFicha: boolean
  /** O WhatsApp do Palácio está ligado; sem ele, o convite só sai por e-mail. */
  whatsappConfigurado: boolean
}) {
  const router = useRouter()
  const [papel, setPapel] = useState<Papel>(papelSugerido)
  const [coordenacao, setCoordenacao] = useState(setores.includes(setor) ? setor : '')
  const [numero, setNumero] = useState(whatsapp)
  const [endereco, setEndereco] = useState(email)
  const [pedirFicha, setPedirFicha] = useState(faltaFicha)
  const [recado, setRecado] = useState<{ erro: boolean; texto: string } | null>(null)
  const [ocupado, iniciar] = useTransition()
  const zap = whatsappConfigurado ? numero.trim() : ''
  const pronto = Boolean(coordenacao && (zap || endereco.trim()))

  return (
    <div className="flex flex-col gap-3" data-ajuda="rh.dar-acesso">
      <p className="text-sm text-muted-foreground">Esta pessoa ainda não entra no Palácio Virtual. O convite leva o usuário e um link para ela criar a própria senha, e fica ligado a esta ficha.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {whatsappConfigurado && <label className="flex flex-col gap-1 text-xs font-medium">WhatsApp<input type="tel" inputMode="tel" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={30} placeholder="(21) 98765-4321" className={inputClass} /></label>}
        <label className="flex flex-col gap-1 text-xs font-medium">E-mail<input type="email" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} placeholder="nome@exemplo.org" className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-xs font-medium">Setor
          <select value={coordenacao} onChange={(e) => setCoordenacao(e.target.value)} className={inputClass}><option value="">Escolha…</option>{setores.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">Papel
          <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)} className={inputClass}>{PAPEIS.map((p) => <option key={p} value={p}>{PAPEL[p].rotulo}</option>)}</select>
        </label>
      </div>
      {whatsappConfigurado && <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={pedirFicha && Boolean(zap)} disabled={!zap} onChange={(e) => setPedirFicha(e.target.checked)} />
        Pedir, na mesma mensagem do WhatsApp, que a pessoa complete a ficha
      </label>}
      <p className="text-xs text-muted-foreground">{PAPEL[papel].descricao}</p>
      <div>
        <Button disabled={!pronto || ocupado} onClick={() => iniciar(async () => {
          setRecado(null)
          const r = await convidarEmLote([{ nome, email: endereco.trim(), whatsapp: zap, papel, coordenacao, cargo, fichaId, pedirFicha: pedirFicha && Boolean(zap) }])
          const resultado = r.resultados?.[0]
          if (r.erro || !resultado) { setRecado({ erro: true, texto: r.erro ?? 'Não foi possível dar o acesso.' }); return }
          setRecado({ erro: !resultado.ok, texto: resultado.mensagem })
          router.refresh()
        })}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Dar acesso e mandar o convite
        </Button>
      </div>
      {recado && <p role={recado.erro ? 'alert' : 'status'} className={recado.erro ? 'text-sm text-destructive' : 'text-sm text-(--success-texto)'}>{recado.texto}</p>}
    </div>
  )
}
