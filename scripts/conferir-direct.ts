/**
 * Confere as regras do Direct das redes: `npx tsx scripts/conferir-direct.ts`.
 *
 * - a situação (pendente, respondida, resolvida, em dia) de conversas e comentários;
 * - mensagem nova do público reabre a conversa resolvida;
 * - mensagem sem texto (foto, áudio, figurinha) sai marcada, não como texto solto.
 *
 * Sai com código 1 se algo estiver errado.
 */
import { normalizarConversas, SEM_TEXTO, type Mensagem } from '../lib/atendimento/normalizar'
import { situacaoDe, type Registro } from '../lib/atendimento/situacao'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
  }
}

const NOS = { id: '100', username: 'cruzvermelharj' }
const conversa = (id: string, pessoa: string, falas: { de: 'nos' | 'ela'; em: string; texto?: string }[]) => ({
  id,
  participants: { data: [NOS, { id: `u${id}`, username: pessoa }] },
  messages: { data: falas.map((f, i) => ({ id: `${id}-${i}`, created_time: f.em, from: f.de === 'nos' ? NOS : { id: `u${id}`, username: pessoa }, ...(f.texto ? { message: f.texto } : {}) })) },
})
const lote = normalizarConversas({ conversations: [
  conversa('t1', 'ana', [{ de: 'ela', em: '2026-09-26T10:00:00Z', texto: 'Oi, como faço para ser voluntária?' }]),
  conversa('t2', 'bia', [{ de: 'ela', em: '2026-09-26T09:00:00Z', texto: 'Obrigada!' }, { de: 'nos', em: '2026-09-26T09:30:00Z', texto: 'Por nada!' }]),
  conversa('t3', 'caio', [{ de: 'ela', em: '2026-09-26T11:00:00Z' }]),
] }, { nossoUsuario: 'cruzvermelharj', agora: Date.parse('2026-09-26T12:00:00Z') })
const dm = (id: string) => lote.find((m) => m.id === `dm:instagram:${id}`)!

igual(lote.length, 3, 'três conversas')
igual(situacaoDe(dm('t1'), undefined), 'pendente', 'público falou por último: pendente')
igual(situacaoDe(dm('t2'), undefined), 'em_dia', 'nós falamos por último (no aplicativo): em dia')
const respondida: Registro = { situacao: 'respondida', por: 'x', nome: 'Ana Lima', em: '2026-09-26T09:30:05Z' }
igual(situacaoDe(dm('t2'), respondida), 'respondida', 'respondida por aqui mostra quem respondeu')
igual(situacaoDe(dm('t1'), { situacao: 'resolvida', por: 'x', em: '2026-09-26T10:05:00Z' }), 'resolvida', 'resolvida depois da última fala: resolvida')
igual(situacaoDe(dm('t1'), { situacao: 'resolvida', por: 'x', em: '2026-09-26T09:00:00Z' }), 'pendente', 'mensagem nova depois de resolver reabre')
igual([dm('t3').texto, dm('t3').semTexto, dm('t3').conversa?.[0].semTexto], [SEM_TEXTO, true, true], 'mensagem sem texto sai marcada como mídia')
igual(dm('t1').semTexto, undefined, 'mensagem com texto não é mídia')

const comentario: Mensagem = { id: 'comentario:instagram:c1', canal: 'instagram', origem: 'comentario', autor: 'davi', autorId: '', texto: 'Lindo trabalho', quando: '2026-09-26T08:00:00Z', respondivel: true }
igual(situacaoDe(comentario, undefined), 'pendente', 'comentário sem registro: pendente')
igual(situacaoDe(comentario, { situacao: 'resolvida', por: 'x', em: '2026-09-26T08:10:00Z' }), 'resolvida', 'comentário resolvido')
igual(situacaoDe(comentario, respondida), 'respondida', 'comentário respondido')

if (falhas) { console.error(`\n${falhas} verificação(ões) falharam.`); process.exit(1) }
console.log('Direct das redes: tudo certo.')
