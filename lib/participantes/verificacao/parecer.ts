import { Folha, dataPorExtenso, iniciar } from '@/lib/pdf/folha'
import {
  CATEGORIAS_DE_DOCUMENTO, ESCOPOS, PARECERES, RESTRICOES, codigoDoParecer, dataCurta, ehRestricao, linhasDoParecer,
  type ArquivoDoVoluntario, type Referencia, type Verificacao,
} from './regras'

/**
 * O parecer da verificação em PDF, no timbrado da filial: quem é o
 * candidato, o que foi conferido (item a item, por quem e quando), a decisão
 * e as restrições. Documento interno com dados pessoais — vai para a pasta
 * do voluntário, nunca para o site.
 */
export type DadosDoParecer = {
  verificacao: Verificacao
  arquivos: ArquivoDoVoluntario[]
  referencias: Referencia[]
  candidato: { nome: string; nomeSocial: string | null; cpfMascara: string | null; vinculo: string; situacao: string; nascimento: string | null }
  decididoPor: string | null
  geradoPor: string
  geradoEm: string
}

const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

export async function parecerDaVerificacao(d: DadosDoParecer): Promise<Uint8Array> {
  const v = d.verificacao
  const codigo = codigoDoParecer(v.id, v.decidido_em)
  const { pdf, f } = await iniciar(`Parecer de verificação ${codigo}`)
  const folha = new Folha(pdf, f, 'PARECER DE VERIFICAÇÃO DO VOLUNTÁRIO', codigo, 'Voluntariado')
  folha.paragrafo(`${ESCOPOS[v.escopo]} · ${v.decidido_em ? `decidida em ${dataPorExtenso(v.decidido_em.slice(0, 10))}` : 'em andamento'}`, 9, false, 8)
  folha.paragrafo('Candidato', 9, true, 0)
  folha.paragrafo([
    d.candidato.nomeSocial ? `${d.candidato.nomeSocial} (nome civil: ${d.candidato.nome})` : d.candidato.nome,
    d.candidato.cpfMascara ? `CPF ${d.candidato.cpfMascara}` : null,
    d.candidato.nascimento ? `nascimento ${dataCurta(d.candidato.nascimento)}` : null,
    d.candidato.vinculo, d.candidato.situacao,
  ].filter(Boolean).join(' · '), 9.5, false, 8)
  folha.paragrafo('Base', 9, true, 0)
  folha.paragrafo('Lei 14.811/2024 (art. 59-A do ECA): certidão de antecedentes de todos os colaboradores, inclusive voluntários, renovada a cada 6 meses. IFRC Child Safeguarding Policy. LGPD: finalidade declarada no termo aceito pelo candidato; decisão humana (art. 20).', 8.5, false, 4)
  folha.paragrafo(`Termo ${v.termo_aceito_em ? `aceito em ${quando(v.termo_aceito_em)}` : 'não aceito'} · documentos ${v.enviado_em ? `enviados pelo candidato em ${quando(v.enviado_em)}` : 'anexados pela coordenação'}.`, 8.5, false, 10)

  folha.tabela(
    [{ titulo: 'Item', largura: 110 }, { titulo: 'Situação', largura: 130 }, { titulo: 'Detalhe', largura: 255 }],
    linhasDoParecer(v, d.arquivos, d.referencias),
  )

  if (v.documento_lido?.divergencias.length) {
    folha.paragrafo('Divergências apontadas na leitura do documento', 9, true, 0)
    for (const x of v.documento_lido.divergencias) folha.paragrafo(`• ${x}`, 9, false, 0)
    folha.paragrafo(' ', 4, false, 0)
  }

  const ativos = d.arquivos.filter((a) => !a.excluido_em)
  if (ativos.length) {
    folha.paragrafo('Documentos guardados', 9, true, 0)
    for (const a of ativos) {
      folha.paragrafo(`• ${CATEGORIAS_DE_DOCUMENTO[a.categoria].rotulo}${a.lado && a.lado !== 'unico' ? ` (${a.lado})` : ''}${a.data_documento ? `, emitido em ${dataCurta(a.data_documento)}` : ''} · ${a.pelo_candidato ? 'enviado pelo candidato' : 'anexado pela coordenação'} em ${quando(a.created_at)}${a.sha256 ? ` · SHA-256 ${a.sha256.slice(0, 16)}…` : ''}`, 8.5, false, 0)
    }
    folha.paragrafo(' ', 4, false, 0)
  }

  folha.paragrafo('Decisão', 9, true, 0)
  if (v.parecer) {
    folha.paragrafo(PARECERES[v.parecer].toUpperCase(), 11, true, 2)
    if (v.restricoes.length) folha.paragrafo(`Restrições: ${v.restricoes.map((r) => (ehRestricao(r) ? RESTRICOES[r].rotulo : r)).join('; ')}.`, 9.5, false, 2)
    if (v.motivo) folha.paragrafo(`Motivo: ${v.motivo}`, 9.5, false, 2)
    folha.paragrafo(`Decidido por ${d.decididoPor ?? 'coordenação'} em ${quando(v.decidido_em)}.`, 9, false, 6)
  } else {
    folha.paragrafo('Verificação ainda sem decisão.', 9.5, false, 6)
  }
  folha.paragrafo('A restrição “Não atua com crianças e adolescentes” vale até identidade e antecedentes serem conferidos. O atestado de antecedentes é renovado a cada 6 meses; a coordenação é avisada 15 dias antes.', 8, false, 6)
  folha.assinaturas([
    { linha1: d.decididoPor ?? 'Coordenação do Voluntariado', linha2: 'Coordenação do Voluntariado' },
    { linha1: ' ', linha2: 'Diretoria ou responsável pela proteção' },
  ])
  folha.rodapes(`${codigo} · documento interno com dados pessoais — não publicar · gerado por ${d.geradoPor} em ${d.geradoEm}`)
  return pdf.save()
}
