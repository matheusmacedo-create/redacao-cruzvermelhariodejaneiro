'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { Eye, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarMembro, verDadosRestritos } from '@/app/actions/equipe'
import { BANCO, DOCUMENTOS, NOMES_DOS_SETORES, UFS, VINCULOS, type Nivel } from '@/lib/rh/regras'
import type { Membro, Pessoais } from '@/lib/rh/acesso'

export type Opcao = { id: string; nome: string }

function Campo({ rotulo, dica, children, largo }: { rotulo: string; dica?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>
      {rotulo}{dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}
      {children}
    </label>
  )
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  )
}

/**
 * Documentos e banco guardados não voltam preenchidos: a seção fica fechada e
 * só vai no formulário quando alguém a abre (o que decifra e fica registrado)
 * ou quando ainda não há nada guardado.
 */
function Restritos({ tipo, membroId, guardado, prefixo, campos }: {
  tipo: 'documentos' | 'banco'; membroId: string | null; guardado: boolean; prefixo: string; campos: readonly { campo: string; rotulo: string }[]
}) {
  const [valores, setValores] = useState<Record<string, string> | null>(guardado ? null : {})
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  if (!valores) {
    return (
      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" />Há {tipo === 'documentos' ? 'documentos' : 'dados bancários'} guardados, cifrados.</p>
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={ocupado || !membroId} onClick={() => iniciar(async () => {
          const r = await verDadosRestritos(membroId!)
          if (r.erro) { setErro(r.erro); return }
          setValores((tipo === 'documentos' ? r.documentos : r.banco) ?? {})
        })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}Abrir para editar</Button>
        <p className="text-xs text-muted-foreground">A abertura fica registrada com o seu nome. Sem abrir, o que está guardado não muda.</p>
        {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      </div>
    )
  }
  return (
    <>
      <input type="hidden" name={tipo === 'documentos' ? 'documentos_abertos' : 'banco_aberto'} value="sim" />
      {campos.map(({ campo, rotulo }) => (
        <Campo key={campo} rotulo={rotulo}>
          <input id={`${prefixo}${campo}`} name={`${prefixo}${campo}`} defaultValue={valores[campo] ?? ''} maxLength={campo === 'cpf' ? 14 : 80}
            inputMode={campo === 'cpf' ? 'numeric' : undefined} autoComplete="off" className={inputClass} />
        </Campo>
      ))}
    </>
  )
}

export function FormularioDeMembro({ m, pessoais, nivel, gestores, logins }: {
  m: Membro | null; pessoais: Pessoais | null; nivel: Nivel; gestores: Opcao[]; logins: Opcao[]
}) {
  const [estado, enviar, enviando] = useActionState(salvarMembro.bind(null, m?.id ?? null), {})
  const v = (k: keyof Membro) => (m ? String(m[k] ?? '') : '')
  const p = (k: keyof Pessoais) => (pessoais ? String(pessoais[k] ?? '') : '')

  return (
    <form action={enviar} className="flex flex-col gap-5">
      <Secao titulo="Identificação">
        <Campo rotulo="Nome completo" largo><input id="e-nome" name="nome" required minLength={2} maxLength={200} defaultValue={v('nome')} className={inputClass} /></Campo>
        <Campo rotulo="Nome social" dica="Opcional. Aparece no lugar do nome."><input id="e-nome-social" name="nome_social" maxLength={200} defaultValue={v('nome_social')} className={inputClass} /></Campo>
        <Campo rotulo="Login no Redação" dica="Liga a ficha à conta de acesso, se a pessoa tiver.">
          <select id="e-login" name="user_id" defaultValue={v('user_id')} className={inputClass}>
            <option value="">Sem login</option>{logins.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="E-mail de trabalho"><input id="e-email" name="email_trabalho" type="email" maxLength={254} defaultValue={v('email_trabalho')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone de trabalho"><input id="e-tel" name="telefone_trabalho" type="tel" maxLength={40} defaultValue={v('telefone_trabalho')} className={inputClass} /></Campo>
      </Secao>

      <Secao titulo="Contrato e cargo" descricao={m ? 'Mudança de cargo, setor, gestor, vínculo ou jornada entra no histórico com a data de vigência abaixo.' : undefined}>
        <Campo rotulo="Vínculo">
          <select id="e-vinculo" name="vinculo" defaultValue={m?.vinculo ?? 'clt'} className={inputClass}>
            {Object.entries(VINCULOS).map(([k, x]) => <option key={k} value={k}>{x.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cargo"><input id="e-cargo" name="cargo" maxLength={120} defaultValue={v('cargo')} className={inputClass} /></Campo>
        <Campo rotulo="Setor">
          <select id="e-setor" name="setor" defaultValue={v('setor')} className={inputClass}>
            <option value="">—</option>{NOMES_DOS_SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Gestor direto">
          <select id="e-gestor" name="gestor_id" defaultValue={v('gestor_id')} className={inputClass}>
            <option value="">Ninguém (topo do organograma)</option>{gestores.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Admissão"><input id="e-admissao" name="admissao" type="date" defaultValue={v('admissao')} className={inputClass} /></Campo>
        <Campo rotulo="Jornada semanal (horas)"><input id="e-jornada" name="jornada_semanal" inputMode="decimal" maxLength={5} defaultValue={v('jornada_semanal')} className={inputClass} /></Campo>
        <Campo rotulo="Horário" dica="Ex.: seg. a sex., 9h às 18h"><input id="e-horario" name="horario" maxLength={120} defaultValue={v('horario')} className={inputClass} /></Campo>
        <Campo rotulo="Local de trabalho" dica="Ex.: Sede – Praça da Cruz Vermelha"><input id="e-local" name="local_trabalho" maxLength={120} defaultValue={v('local_trabalho')} className={inputClass} /></Campo>
        {m && (
          <>
            <Campo rotulo="Vigência da mudança" dica="Em branco: hoje."><input id="e-vigencia" name="vigencia" type="date" className={inputClass} /></Campo>
            <Campo rotulo="Motivo da mudança" dica="Opcional. Ex.: promoção aprovada em reunião de diretoria."><input id="e-motivo" name="observacao_da_mudanca" maxLength={600} className={inputClass} /></Campo>
          </>
        )}
      </Secao>

      <Secao titulo="Dados pessoais" descricao="Visíveis a quem gerencia a equipe.">
        <Campo rotulo="E-mail pessoal"><input id="e-email-p" name="email_pessoal" type="email" maxLength={254} defaultValue={p('email_pessoal')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone pessoal"><input id="e-tel-p" name="telefone_pessoal" type="tel" maxLength={40} defaultValue={p('telefone_pessoal')} className={inputClass} /></Campo>
        <Campo rotulo="Data de nascimento"><input id="e-nascimento" name="data_nascimento" type="date" defaultValue={p('data_nascimento')} className={inputClass} /></Campo>
        <Campo rotulo="CEP"><input id="e-cep" name="cep" inputMode="numeric" maxLength={12} defaultValue={p('cep')} className={inputClass} /></Campo>
        <Campo rotulo="Logradouro"><input id="e-logradouro" name="logradouro" maxLength={200} defaultValue={p('logradouro')} className={inputClass} /></Campo>
        <Campo rotulo="Número"><input id="e-numero" name="numero" maxLength={20} defaultValue={p('numero')} className={inputClass} /></Campo>
        <Campo rotulo="Complemento"><input id="e-complemento" name="complemento" maxLength={120} defaultValue={p('complemento')} className={inputClass} /></Campo>
        <Campo rotulo="Bairro"><input id="e-bairro" name="bairro" maxLength={120} defaultValue={p('bairro')} className={inputClass} /></Campo>
        <Campo rotulo="Cidade"><input id="e-cidade" name="cidade" maxLength={120} defaultValue={p('cidade')} className={inputClass} /></Campo>
        <Campo rotulo="UF">
          <select id="e-uf" name="uf" defaultValue={pessoais?.uf ?? 'RJ'} className={inputClass}>
            <option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Contato de emergência"><input id="e-emerg-nome" name="emergencia_nome" maxLength={200} defaultValue={p('emergencia_nome')} className={inputClass} /></Campo>
        <Campo rotulo="Telefone de emergência"><input id="e-emerg-tel" name="emergencia_telefone" type="tel" maxLength={40} defaultValue={p('emergencia_telefone')} className={inputClass} /></Campo>
        <Campo rotulo="Parentesco"><input id="e-emerg-par" name="emergencia_parentesco" maxLength={60} defaultValue={p('emergencia_parentesco')} className={inputClass} /></Campo>
      </Secao>

      {nivel >= 3 && (
        <Secao titulo="Documentos" descricao="Guardados cifrados. Só quem tem acesso a documentos abre; cada abertura fica registrada.">
          <Restritos tipo="documentos" membroId={m?.id ?? null} guardado={!!m?.tem_documentos} prefixo="doc_" campos={DOCUMENTOS} />
        </Secao>
      )}
      {nivel >= 4 && (
        <Secao titulo="Dados bancários" descricao="Guardados cifrados. Só quem tem acesso a remuneração e banco abre.">
          <Restritos tipo="banco" membroId={m?.id ?? null} guardado={!!m?.tem_banco} prefixo="banco_" campos={BANCO} />
        </Secao>
      )}

      <Card className="flex flex-col gap-2 p-5">
        <Campo rotulo="Observações"><textarea id="e-obs" name="observacoes" rows={3} maxLength={4000} defaultValue={v('observacoes')} className={inputClass} /></Campo>
      </Card>

      {estado.erro && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" render={<Link href={m ? `/equipe/${m.id}` : '/equipe'} />}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{m ? 'Salvar alterações' : 'Cadastrar'}</Button>
      </div>
    </form>
  )
}
