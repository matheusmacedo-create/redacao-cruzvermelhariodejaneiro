import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { chamadaFinal, lerOpcoes, tamanhoDoTitulo } from '@/lib/cartaz/copy'
import { chamadasDoCurso, CHAVE_PADRAO, linkDeMatricula, PARAMETRO_DO_CURSO, PASSOS_DA_MATRICULA, type CursoDoCartaz } from '@/lib/escola/cartaz'
import { COPY_POR_CURSO } from '@/lib/escola/cartaz-copy'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { BarraDeOpcoes } from '@/components/cartaz/barra-de-opcoes'

export const metadata = { title: 'Cartaz — Cursos da Escola' }
export const dynamic = 'force-dynamic'

/**
 * O cartaz com QR de matrícula de um curso da Escola (A4 em pé), para o mural
 * da sede, unidades parceiras, escolas e empresas: o QR leva à página do curso
 * cadastrada no Marketing ou, sem ela, à matrícula dos cursos presenciais no
 * site. A copy (chamada, título e frase) vem da URL (lib/escola/cartaz.ts).
 * Fora do grupo (app), como os outros cartazes: a folha impressa é só o
 * cartaz. Quem vê os cursos no Marketing da Escola pode imprimir.
 */
export default async function CartazDosCursos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { context, supabase, nivel } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const { data } = await supabase.from('escola_cursos').select('id, nome, descricao, pagina_url').eq('workspace_id', context.workspace.id).eq('ativo', true).order('nome')
  const cursos: CursoDoCartaz[] = ((data ?? []) as { id: string; nome: string; descricao: string | null; pagina_url: string | null }[])
    .map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao, paginaUrl: c.pagina_url }))
  if (!cursos.length) {
    return <p className="p-8 text-sm">Nenhum curso ativo cadastrado. <Link href="/escola/marketing/cursos" className="underline">Cadastrar cursos</Link></p>
  }
  const opcoes = lerOpcoes(await searchParams, PARAMETRO_DO_CURSO, CHAVE_PADRAO)
  const curso = cursos.find((c) => c.id === opcoes.alvo) ?? cursos[0]
  const lista = chamadasDoCurso(curso, COPY_POR_CURSO)
  const chamada = chamadaFinal(opcoes, lista)
  const destino = linkDeMatricula(curso)
  const qr = await QRCode.toDataURL(destino.url, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })
  const curto = destino.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const vermelho = 'text-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]'
  const corpoDoTitulo = { grande: 'text-[36pt]', medio: 'text-[30pt]', pequeno: 'text-[25pt]', minusculo: 'text-[21pt]' }[tamanhoDoTitulo(chamada.titulo)]

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <BarraDeOpcoes
        rota="/escola/cartaz"
        voltar={{ href: '/escola/marketing/cursos', rotulo: 'Cursos' }}
        alvo={{ rotulo: 'Curso', parametro: PARAMETRO_DO_CURSO, itens: cursos.map((c) => ({ valor: c.id, nome: c.nome })), ajuda: 'Só os cursos ativos. O nome e a descrição vêm do cadastro em Marketing → Cursos.' }}
        chamadaPadrao={CHAVE_PADRAO}
        opcoes={{ ...opcoes, alvo: curso.id }}
        chamadas={lista.map((c) => ({ chave: c.chave, nome: `${c.titulo[0]} ${c.titulo[1]}`.trim(), texto: c.texto, titulo: c.titulo }))}
        nota={destino.daPagina
          ? `O QR abre a página do curso: ${curto}`
          : `O QR abre a página geral de matrícula do site (${curto}). Para levar direto a este curso, cadastre a “Página do curso” em Marketing → Cursos → Editar.`}
      />
      <article className="papel mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-neutral-900 shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:shadow-none print:[zoom:1]" aria-label={`Cartaz: matrícula em ${curso.nome}`} data-cartaz-curso={curso.id}>
        <div className="h-[4mm] bg-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" />
        <div className="flex flex-1 flex-col items-center px-[18mm] pb-[12mm] pt-[14mm] text-center">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} priority sizes="80mm" className="h-auto w-[66mm]" />
          <p className={`mt-[9mm] text-[15pt] font-semibold uppercase tracking-[0.12em] ${vermelho}`}>Escola de Educação e Saúde</p>
          <h1 className={`mt-[3mm] ${corpoDoTitulo} font-extrabold leading-[1.05] tracking-tight [text-wrap:balance]`} data-cartaz-titulo>
            {chamada.titulo[0]}
            {chamada.titulo[1] && <><br /><span className={vermelho}>{chamada.titulo[1]}</span></>}
          </h1>
          <p className="mt-[4mm] max-w-[150mm] text-[16pt] leading-snug text-neutral-700 [text-wrap:balance]" data-cartaz-texto>{chamada.texto}</p>
          <div className="mt-[8mm] rounded-[4mm] border-[1.4mm] border-[rgb(227_34_25)] bg-white p-[5mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={qr} alt={`QR code para ${destino.url}`} className="block size-[74mm]" />
          </div>
          <p className="mt-[3mm] max-w-[170mm] break-all font-mono text-[10pt] text-neutral-500">{curto}</p>
          <ol className="mt-[8mm] flex flex-col gap-[4mm] text-left text-[14pt] leading-snug">
            {PASSOS_DA_MATRICULA.map((t, i) => (
              <li key={i} className="flex items-center gap-[4mm]">
                <span className="flex size-[10mm] shrink-0 items-center justify-center rounded-full bg-[rgb(227_34_25)] text-[14pt] font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <p className="mt-auto pt-[6mm] text-[11pt] text-neutral-600">Cursos presenciais com certificado da Cruz Vermelha Brasileira. Matrícula pelo site; a secretaria confirma turma e horário.</p>
        </div>
        <div className="flex h-[12mm] items-center justify-between border-t border-neutral-200 px-[16mm] text-[9.5pt] text-neutral-500">
          <span>{DADOS_DA_FILIAL.nome}</span>
          <span>cruzvermelhariodejaneiro.org</span>
        </div>
      </article>
    </div>
  )
}
