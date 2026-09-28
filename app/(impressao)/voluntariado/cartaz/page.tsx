import Image from 'next/image'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { urlBase } from '@/lib/newsletter/contexto'
import { chamadaFinal, lerOpcoes, tamanhoDoTitulo } from '@/lib/cartaz/copy'
import { ALVOS, chamadasDoVoluntariado, CHAVE_PADRAO, ehAlvo, linkDoCartaz, PARAMETRO_DO_ALVO } from '@/lib/voluntariado/cartaz'
import { COPY_DO_VOLUNTARIADO } from '@/lib/voluntariado/cartaz-copy'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { BarraDeOpcoes } from '@/components/cartaz/barra-de-opcoes'

export const metadata = { title: 'Cartaz — Voluntariado' }
export const dynamic = 'force-dynamic'

/**
 * Os cartazes com QR do Voluntariado (A4 em pé): o de inscrição, para o
 * público (o QR abre o formulário público /participe), e o da Área do
 * Voluntário, para quem já é (o QR abre /membro). A copy (chamada, título e
 * frase) vem da URL (lib/voluntariado/cartaz.ts). Fora do grupo (app), como os
 * outros cartazes: a folha impressa é só o cartaz. Quem gerencia o
 * Voluntariado pode imprimir (o mesmo nível do botão em Voluntários).
 */
export default async function CartazDoVoluntariado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const opcoes = lerOpcoes(await searchParams, PARAMETRO_DO_ALVO, CHAVE_PADRAO)
  const alvo = ehAlvo(opcoes.alvo) ? opcoes.alvo : 'inscricao'
  const dados = ALVOS[alvo]
  const lista = chamadasDoVoluntariado(alvo, COPY_DO_VOLUNTARIADO)
  const chamada = chamadaFinal(opcoes, lista)
  const link = linkDoCartaz(urlBase(), alvo)
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })
  const curto = link.replace(/^https?:\/\//, '')
  const vermelho = 'text-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]'
  const corpoDoTitulo = { grande: 'text-[36pt]', medio: 'text-[30pt]', pequeno: 'text-[25pt]', minusculo: 'text-[21pt]' }[tamanhoDoTitulo(chamada.titulo)]

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <BarraDeOpcoes
        rota="/voluntariado/cartaz"
        voltar={{ href: '/voluntariado', rotulo: 'Voluntários' }}
        alvo={{ rotulo: 'Cartaz', parametro: PARAMETRO_DO_ALVO, itens: (Object.keys(ALVOS) as (keyof typeof ALVOS)[]).map((k) => ({ valor: k, nome: ALVOS[k].rotulo })) }}
        chamadaPadrao={CHAVE_PADRAO}
        opcoes={{ ...opcoes, alvo }}
        chamadas={lista.map((c) => ({ chave: c.chave, nome: c.rotulo, texto: c.texto, titulo: c.titulo }))}
        nota={alvo === 'inscricao'
          ? `O QR abre o formulário público de inscrição (${curto}). Quem se inscreve cai em “Inscrições pendentes”.`
          : `O QR abre a Área do Voluntário (${curto}): a pessoa entra com o e-mail do cadastro e um código de 6 dígitos.`}
      />
      <article className="papel mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-neutral-900 shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:shadow-none print:[zoom:1]" aria-label={`Cartaz: ${dados.rotulo}`} data-cartaz-voluntariado={alvo}>
        <div className="h-[4mm] bg-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" />
        <div className="flex flex-1 flex-col items-center px-[18mm] pb-[12mm] pt-[14mm] text-center">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} priority sizes="80mm" className="h-auto w-[66mm]" />
          <p className={`mt-[9mm] text-[15pt] font-semibold uppercase tracking-[0.12em] ${vermelho}`}>{dados.cabecalho}</p>
          <h1 className={`mt-[3mm] ${corpoDoTitulo} font-extrabold leading-[1.05] tracking-tight [text-wrap:balance]`} data-cartaz-titulo>
            {chamada.titulo[0]}
            {chamada.titulo[1] && <><br /><span className={vermelho}>{chamada.titulo[1]}</span></>}
          </h1>
          <p className="mt-[4mm] max-w-[150mm] text-[16pt] leading-snug text-neutral-700 [text-wrap:balance]" data-cartaz-texto>{chamada.texto}</p>
          <div className="mt-[8mm] rounded-[4mm] border-[1.4mm] border-[rgb(227_34_25)] bg-white p-[5mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={qr} alt={`QR code para ${link}`} className="block size-[74mm]" />
          </div>
          <p className="mt-[3mm] font-mono text-[10pt] text-neutral-500">{curto}</p>
          <ol className="mt-[8mm] flex flex-col gap-[4mm] text-left text-[14pt] leading-snug">
            {dados.passos.map((t, i) => (
              <li key={i} className="flex items-center gap-[4mm]">
                <span className="flex size-[10mm] shrink-0 items-center justify-center rounded-full bg-[rgb(227_34_25)] text-[14pt] font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <p className="mt-auto pt-[6mm] text-[11pt] text-neutral-600">{dados.rodape}</p>
        </div>
        <div className="flex h-[12mm] items-center justify-between border-t border-neutral-200 px-[16mm] text-[9.5pt] text-neutral-500">
          <span>{DADOS_DA_FILIAL.nome}</span>
          <span>cruzvermelhariodejaneiro.org</span>
        </div>
      </article>
    </div>
  )
}
