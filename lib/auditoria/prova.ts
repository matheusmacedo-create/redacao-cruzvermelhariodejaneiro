/**
 * A prova OpenTimestamps de um item, montada sob demanda: do SHA-256 do
 * conteúdo do item até o compromisso do lote (nonce, caminho de Merkle,
 * cabeças e compromisso anterior), e dali a árvore que o lote recebeu dos
 * calendários. Quem baixa confere sem depender da Cruz Vermelha:
 *
 *   ots verify <arquivo>.ots     (ou em https://opentimestamps.org)
 *
 * O arquivo conferido é o que tem aquele SHA-256: o texto canônico (itens
 * públicos) ou o manifesto de assinaturas (ofícios).
 */

import { aplicar, escreverProva, lerProva, type Carimbo, type Operacao } from '@/lib/oficios/ots'

export type PassoDoCaminho = { lado: 'direita' | 'esquerda'; hash: string }

/** O que public.auditoria_dados_prova devolve. */
export type DadosDaProva = {
  codigo: string
  classe: 'P' | 'V' | 'C'
  hash_conteudo: string
  nonce: string
  folha: string
  caminho: PassoDoCaminho[]
  raiz: string
  cabecas: string
  anterior: string
  compromisso: string
  dia: string
  ots: string | null
  ots_estado: 'pendente' | 'enviado' | 'confirmado'
  bloco: number | null
}

const hex = (h: string, bytes: number) => {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(h)) throw new Error('Dado de prova malformado.')
  return Buffer.from(h, 'hex')
}

/** As operações do conteúdo até o compromisso do lote. */
export function operacoesAteOCompromisso(d: DadosDaProva): Operacao[] {
  const ops: Operacao[] = [{ tipo: 'anexar', arg: hex(d.nonce, 16) }, { tipo: 'sha256' }]
  for (const passo of d.caminho) {
    const irmao = hex(passo.hash, 32)
    ops.push(passo.lado === 'direita' ? { tipo: 'anexar', arg: irmao } : { tipo: 'prefixar', arg: irmao }, { tipo: 'sha256' })
  }
  ops.push({ tipo: 'anexar', arg: Buffer.concat([hex(d.cabecas, 32), hex(d.anterior, 32)]) }, { tipo: 'sha256' })
  return ops
}

/** O .ots do item. Recusa se as operações não chegarem ao compromisso do lote. */
export function montarProvaDoItem(d: DadosDaProva): Buffer {
  if (!d.ots) throw new Error('O lote ainda não foi carimbado.')
  const doLote = lerProva(Buffer.from(d.ots, 'base64'))
  const compromisso = hex(d.compromisso, 32)
  if (!doLote.hash.equals(compromisso)) throw new Error('A prova do lote é de outro compromisso.')

  const conteudo = hex(d.hash_conteudo, 32)
  const raiz: Carimbo = { msg: conteudo, atestados: [], ramos: [] }
  const ops = operacoesAteOCompromisso(d)
  // Antes das duas últimas operações (cabeças e anterior), a mensagem é a raiz de Merkle.
  const naRaiz = ops.length - 2
  let no = raiz
  ops.forEach((op, i) => {
    if (i === naRaiz && !no.msg.equals(hex(d.raiz, 32))) throw new Error('O caminho do item não chega à raiz de Merkle do lote.')
    const filho: Carimbo = { msg: aplicar(op, no.msg), atestados: [], ramos: [] }
    no.ramos.push({ op, filho })
    no = filho
  })
  if (!no.msg.equals(compromisso)) throw new Error('A prova do item não chega ao compromisso do lote.')
  no.atestados = doLote.carimbo.atestados
  no.ramos = doLote.carimbo.ramos
  return escreverProva(conteudo, raiz)
}

/** Nome do arquivo da prova: o cliente do OpenTimestamps confere <nome sem .ots>. */
export const nomeDaProva = (d: Pick<DadosDaProva, 'codigo' | 'classe'>) => `${d.codigo}${d.classe === 'P' ? '.json' : ''}.ots`
