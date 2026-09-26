import type { Metadata } from 'next'
import Link from 'next/link'
import { Camera, ChevronRight, CircleCheck, ListTodo, Lock, MessageSquareText } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { fotoDoMembro, perfilDoMembro } from '@/lib/membro/dados'
import { VINCULOS } from '@/lib/participantes/regras'
import { dataCurta, pendenciasDoPerfil } from '@/lib/membro/regras'
import { FormularioDoPerfil, PreferenciaDeAvisos, SairDaArea } from '@/components/membro/perfil'
import { BensComigo } from '@/components/membro/bens'
import { EditorDaFoto } from '@/components/membro/foto'
import { CabecalhoDaPagina, Secao, Selo } from '@/components/membro/pecas'
import { bensDoMembro } from '@/lib/membro/bens'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Meu perfil · Área do Voluntário".
export const metadata: Metadata = { title: 'Meu perfil' }

/** "Cadastro 75% completo" e um link direto para cada bloco que falta. */
function Completude({ pct, faltam }: ReturnType<typeof pendenciasDoPerfil>) {
  if (!faltam.length) return <Selo tom="sucesso" icone={CircleCheck}>Cadastro completo</Selo>
  return (
    <div className="flex flex-col items-start gap-1" data-ajuda="membro.completude">
      <Selo icone={ListTodo}>Cadastro {pct}% completo</Selo>
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span id="perfil-falta" className="text-muted-foreground">Falta preencher:</span>
        <ul aria-labelledby="perfil-falta" className="-ml-2 flex flex-wrap">
          {/*
            <a> e não <Link>: navegação de fragmento nativa, sem recarregar. O
            navegador rola e põe o foco no campo (o <Link> só rolava, e o foco
            ficava no link), como no "Pular para o conteúdo".
          */}
          {faltam.map((f) => (
            <li key={f.chave}>
              <a href={f.href} className="inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 font-medium text-foreground underline underline-offset-4 hover:bg-muted">
                {f.rotulo}<ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default async function PerfilDoMembro() {
  const m = await exigirMembro()
  const [p, bens, foto] = await Promise.all([perfilDoMembro(m), bensDoMembro(m), fotoDoMembro(m.participanteId).catch(() => null)])
  const dados: [string, string][] = [
    ['Nome', p.nome],
    ['E-mail (seu acesso)', p.email ?? '—'],
    ['CPF', p.cpf_mascara ?? '—'],
    ['Nascimento', dataCurta(p.data_nascimento) || '—'],
    ['Vínculo', VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo ?? p.vinculo],
    ['Função', p.funcao || '—'],
    ['Setores', p.setores.join(', ') || '—'],
  ]
  // Largura de formulário, alinhada à esquerda: o título não pula de lugar entre as abas.
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <CabecalhoDaPagina titulo="Meu perfil" descricao="Mantenha seus dados em dia: é por eles que a filial fala com você.">
        <Completude {...pendenciasDoPerfil(p)} />
      </CabecalhoDaPagina>

      <BensComigo bens={bens} />

      {/* Salva na hora, fora do formulário (como as preferências). Na visualização da equipe, só mostra. */}
      <Secao titulo="Foto de perfil" icone={Camera} id="foto" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <EditorDaFoto url={foto} nome={p.nome_social || p.nome} endpoint="/api/membro/foto" podeEditar={!m.previa} />
      </Secao>

      <Secao titulo="Dados do cadastro" icone={Lock} id="dados-do-cadastro" className="rounded-xl border border-border bg-card p-4 sm:p-5"
        acao={
          <Link href="/membro/mensagens?nova=documentos" data-ajuda="membro.pedir-correcao" className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
            <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />Pedir correção<span className="sr-only"> dos dados do cadastro</span>
          </Link>
        }>
        <p className="-mt-1 text-sm text-muted-foreground">Só a coordenação altera estes dados.</p>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{rotulo}</dt>
              <dd className="wrap-anywhere">{valor}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <FormularioDoPerfil p={p} />

      <PreferenciaDeAvisos inicial={p.avisos_por_email} />

      {/* Na visualização da equipe não há o que "sair": a faixa do alto já tem o "Voltar ao Palácio Virtual". */}
      {!m.previa && <SairDaArea />}
    </div>
  )
}
