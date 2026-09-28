import Image from 'next/image'
import QRCode from 'qrcode'
import { Download, ScanLine } from 'lucide-react'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import type { CrachaPronto } from '@/lib/cracha/servidor'
import { cn } from '@/lib/utils'
import { condensada } from './fonte'

/**
 * O crachá funcional virtual, no desenho do Manual de Identidade Institucional
 * da CVB (p. 28): frente com o logotipo, a foto, a faixa vermelha com o nome e
 * a função; verso com os dados, a faixa do vínculo e o QR que confere o
 * crachá em /cracha/<código>. Proporção de cartão de crachá (54 × 86 mm).
 *
 * Os contatos do modelo do manual são antigos: o verso usa DADOS_DA_FILIAL.
 */


const CARTAO = 'papel relative flex aspect-[54/86] w-[256px] shrink-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-white text-[#1f1f1f] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]'

function Silhueta() {
  return (
    <svg viewBox="0 0 120 150" className="size-full" aria-hidden="true">
      <rect width="120" height="150" fill="#eeeeee" />
      <circle cx="60" cy="58" r="27" fill="#2b2b2b" />
      <path d="M12 150c3-34 22-52 48-52s45 18 48 52z" fill="#2b2b2b" />
    </svg>
  )
}

function Campo({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn(condensada.className, 'text-[11px] font-bold leading-tight')}>{rotulo}</p>
      <p className="truncate rounded-md border border-[#9a9a9a] px-2 py-[3px] text-[11px] leading-tight">{valor}</p>
    </div>
  )
}

export async function Cracha({ cracha, pdf }: { cracha: CrachaPronto; pdf: string }) {
  const qr = await QRCode.toString(cracha.urlDeVerificacao, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1f1f1f', light: '#ffffff' } })
  // Sem cargo nem setor, a linha fica vazia (a faixa do verso já diz o vínculo).
  const funcao = [cracha.funcao, cracha.setor].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-4" data-cracha>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-start">
        {/* Frente */}
        <figure className={CARTAO} aria-label={`Frente do crachá de ${cracha.nomeCompleto}`}>
          <div className="px-6 pt-5">
            <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="210px" className="h-auto w-full" />
          </div>
          <div className="mx-auto mt-3 h-[150px] w-[120px] overflow-hidden bg-[#eeeeee]">
            {cracha.foto
              ? <img src={cracha.foto} alt={`Foto de ${cracha.nomeCompleto}`} className="size-full object-cover" />
              : <Silhueta />}
          </div>
          <div className="mt-auto">
            <p className={cn(condensada.className, 'flex h-11 items-center justify-center bg-[#e32219] px-3 text-center text-[24px] font-bold uppercase leading-none tracking-wide text-white')}>
              <span className="truncate">{cracha.nomeDeDestaque}</span>
            </p>
            <p className={cn(condensada.className, 'mt-2 line-clamp-2 min-h-[17px] px-4 text-center text-[14px] font-bold uppercase leading-tight')}>{funcao}</p>
            <p className="mt-1.5 px-3 pb-2.5 text-center text-[8.5px] leading-tight text-[#3a3a3a]">
              Filial do Estado do Rio de Janeiro<br />CNPJ {DADOS_DA_FILIAL.cnpj}
            </p>
          </div>
        </figure>

        {/* Verso */}
        <figure className={CARTAO} aria-label="Verso do crachá">
          <div className="flex items-start justify-between gap-2 px-3 pt-3">
            <div className="min-w-0 pt-1">
              <p className="text-[11px] tracking-wide">CRACHÁ FUNCIONAL</p>
              <p className="mt-1 text-[8px] leading-tight text-[#555]">Aponte a câmera para o código e confira se o crachá é válido.</p>
            </div>
            <span className="block size-[62px] shrink-0 [&_svg]:size-full" role="img" aria-label="QR code de verificação do crachá" dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
          <div className="mt-1.5 flex flex-col gap-1 px-3">
            <Campo rotulo="Nome completo:" valor={cracha.nomeCompleto} />
            <Campo rotulo="CPF:" valor={cracha.cpf ?? 'Não informado'} />
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo={cracha.origem === 'voluntario' ? 'Desde:' : 'Admissão:'} valor={cracha.desde ?? '—'} />
              <Campo rotulo="Fator RH:" valor={cracha.fatorRh ?? 'Não informado'} />
            </div>
          </div>
          <p className={cn(condensada.className, 'mx-2 mt-2 truncate border-2 border-[#e32219] px-1 text-center text-[20px] font-bold uppercase leading-[1.15]')}>{cracha.faixa}</p>
          <p className="mt-1.5 bg-[#5f6062] py-[3px] text-center text-[8.5px] tracking-wide text-white">VÁLIDO EM TODO O TERRITÓRIO NACIONAL</p>
          <p className="px-3 pt-1 text-[7px] leading-snug">
            UTILIDADE PÚBLICA INTERNACIONAL — Decreto Federal nº 9.620, de 13/06/1912. Este documento pertence à CVB; em caso de extravio, favor enviar para:
          </p>
          <div className="mt-1 bg-[#e32219] px-4 py-1.5 text-[8px] leading-snug text-white">
            <p className={cn(condensada.className, 'text-[11px] font-bold leading-tight')}>CRUZ VERMELHA BRASILEIRA</p>
            <p>Filial do Estado do Rio de Janeiro</p>
            <p>{DADOS_DA_FILIAL.endereco}</p>
            <p>{DADOS_DA_FILIAL.telefone} · {DADOS_DA_FILIAL.email}</p>
          </div>
          <p className="mt-auto px-3 pb-2 text-[6.5px] leading-snug text-[#3a3a3a]">
            Este crachá é a identificação oficial do(a) colaborador(a) da Cruz Vermelha Brasileira, de uso pessoal e intransferível. A instituição
            credencia o portador como pertencente aos seus quadros e solicita às autoridades civis e militares que o reconheçam como tal.
          </p>
        </figure>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={pdf} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" data-cracha-pdf>
          <Download className="size-4" aria-hidden="true" />Baixar para imprimir (PDF)
        </a>
        <a href={`/cracha/${cracha.codigo}`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted" data-cracha-verificacao>
          <ScanLine className="size-4" aria-hidden="true" />Ver a verificação do QR
        </a>
      </div>
      {!cracha.ativo && <p className="text-sm text-warning-foreground">Seu cadastro não está ativo: quem ler o QR verá o crachá como inativo.</p>}
      {cracha.situacaoDaFoto && cracha.situacaoDaFoto !== 'aprovada' && (
        <p role="status" className="max-w-xl rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-cracha-foto={cracha.situacaoDaFoto}>
          {cracha.situacaoDaFoto === 'sem_foto' && 'Seu crachá ainda está sem foto. Envie uma foto de rosto, de frente e sem óculos escuros: o Voluntariado aprova antes de ela ir para o crachá.'}
          {cracha.situacaoDaFoto === 'aguardando' && 'Sua foto está com o Voluntariado para aprovação. Enquanto isso, o crachá sai sem foto.'}
          {cracha.situacaoDaFoto === 'recusada' && <>O Voluntariado não aprovou sua foto{cracha.motivoDaFoto ? <>: “{cracha.motivoDaFoto.replace(/[.!]+$/, '')}”</> : null}. Envie outra para o crachá.</>}
        </p>
      )}
    </div>
  )
}
