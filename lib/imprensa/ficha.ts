/**
 * A ficha de um contato de imprensa: o que cada envio rendeu, em palavras.
 *
 * Módulo puro. A ficha não tem tabela de histórico própria: ela junta, pelo
 * contato, as linhas de press_campanha_destinatarios com a campanha de cada
 * uma. Aqui a linha vira as marcas que a tela mostra.
 */

/** Um envio para o contato, como a página o lê do banco. */
export type EnvioNaFicha = {
  id: string
  assunto: string
  /** na_fila, enviando, enviado, falhou ou de_fora (press_campanha_destinatarios.estado). */
  estado: string
  /** Quando saiu; para o que ainda não saiu, quando entrou na fila. */
  quando: string
  /** A hora marcada da campanha, enquanto ela espera. */
  agendadaPara: string | null
  entregueEm: string | null
  abertoEm: string | null
  aberturas: number
  clicadoEm: string | null
  devolvidoEm: string | null
  denunciouEm: string | null
  descadastrouEm: string | null
}

export type MarcaDoEnvio = { rotulo: string; tom: 'neutro' | 'destaque' | 'alerta' }

/** O que aconteceu com um envio, do mais básico ao mais forte. */
export function marcasDoEnvio(e: EnvioNaFicha): MarcaDoEnvio[] {
  if (e.estado === 'na_fila' || e.estado === 'enviando') {
    return [{ rotulo: e.agendadaPara ? 'Agendada' : 'Na fila de envio', tom: 'neutro' }]
  }
  if (e.estado === 'falhou') return [{ rotulo: 'Falhou no envio', tom: 'alerta' }]
  if (e.estado === 'de_fora') return [{ rotulo: 'Ficou de fora', tom: 'neutro' }]

  const marcas: MarcaDoEnvio[] = []
  if (e.devolvidoEm) marcas.push({ rotulo: 'Devolveu', tom: 'alerta' })
  else marcas.push({ rotulo: e.entregueEm ? 'Entregue' : 'Enviada', tom: 'neutro' })
  if (e.abertoEm) marcas.push({ rotulo: e.aberturas > 1 ? `Abriu ${e.aberturas} vezes` : 'Abriu', tom: 'destaque' })
  if (e.clicadoEm) marcas.push({ rotulo: 'Clicou no link', tom: 'destaque' })
  if (e.denunciouEm) marcas.push({ rotulo: 'Marcou como spam', tom: 'alerta' })
  if (e.descadastrouEm) marcas.push({ rotulo: 'Saiu da lista', tom: 'alerta' })
  return marcas
}

/** A frase que resume a leitura: "Recebeu 5 campanhas e abriu 3." */
export function resumoDaLeitura(totalEnvios: number, totalAberturas: number): string {
  if (!totalEnvios) return 'Ainda não recebeu nenhuma campanha.'
  const recebeu = totalEnvios === 1 ? 'Recebeu 1 campanha' : `Recebeu ${totalEnvios} campanhas`
  if (!totalAberturas) return `${recebeu} e não abriu ${totalEnvios === 1 ? 'a mensagem' : 'nenhuma'}.`
  return `${recebeu} e abriu ${totalAberturas === totalEnvios ? (totalEnvios === 1 ? 'a mensagem' : 'todas') : totalAberturas}.`
}

/** Como o contato entrou no banco, a partir de press_contacts.fonte. */
export function comoEntrou(fonte: string): string {
  if (fonte === 'importado') return 'Importado de uma planilha'
  if (fonte === 'hunter_dominio') return 'Encontrado pela Hunter.io, na busca por domínio'
  if (fonte === 'hunter_email_finder') return 'Encontrado pela Hunter.io, pelo nome'
  return 'Cadastrado à mão'
}
