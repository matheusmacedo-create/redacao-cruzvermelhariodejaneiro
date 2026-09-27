/**
 * O texto do Diploma de Reconhecimento, sem o PDF: o mesmo no PDF
 * (lib/cursos/diploma-pdf.ts), na verificação pública e na prévia da área de
 * Diplomas, que roda no navegador.
 */

/** O texto do reconhecimento, sem o nome (vai logo depois dele). */
export function textoDoDiploma(d: { motivo: 'horas' | 'coordenacao'; marcoHoras: number | null; texto: string | null }): string {
  if (d.motivo === 'horas' && d.marcoHoras) {
    return `em reconhecimento às ${d.marcoHoras.toLocaleString('pt-BR')} horas de serviço voluntário dedicadas à missão humanitária da Cruz Vermelha Brasileira, com a dedicação que tanto dignifica a história desta Instituição perante o Movimento Internacional da Cruz Vermelha e do Crescente Vermelho.`
  }
  const motivo = (d.texto ?? '').trim().replace(/[.;\s]+$/, '')
  return `em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira${motivo ? `: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}` : ''}.`
}
