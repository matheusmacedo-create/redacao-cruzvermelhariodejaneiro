import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { dadosDoLinkRedigidos, dadosRedigidos } from './colaborador-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A faxina do cadastro de colaborador pelo WhatsApp (lib/whatsapp/colaborador.ts). O e-mail e o WhatsApp da pessoa
 * nova vivem só nos dados da pergunta (whatsapp_pendencias, "cadastrar_colaborador") e do link de confirmar
 * (whatsapp_confirmacoes, "cadastrar_colaborador"):
 *
 *  - a pergunta encerrada (respondida, cancelada, trocada por outra) e o link usado ou substituído já perdem o
 *    contato na mesma gravação, pelo banco (private.whatsapp_cadastro_sem_contato, migração 20261019050000);
 *  - o que VENCE sem ser encerrado o banco não alcança: é aqui. A pergunta que acabou (encerrada ou vencida) fica só
 *    com a etapa (dadosRedigidos: sai também o nome e o resto); o link vencido sem uso perde o e-mail e o WhatsApp
 *    (dadosDoLinkRedigidos — o resto fica para o histórico da confirmação).
 *
 * Roda no começo e no fim de cada cadastro e, no máximo a cada INTERVALO_MS por instância, quando a fila anda
 * (processarFila, que roda a cada aviso emitido em qualquer parte do Palácio). Não depende de fila.ts (que a chama).
 * Até 50 de cada por vez. Melhor esforço; nunca lança. Nada de contato vai a log.
 */

const INTERVALO_MS = 30_000
let ultima = 0

/** `geral`: a chamada da fila, com o intervalo; sem ela (o próprio cadastro), roda sempre. */
export async function redigirCadastrosEncerrados(admin: Admin, opcoes: { geral?: boolean } = {}): Promise<void> {
  if (opcoes.geral) {
    if (Date.now() - ultima < INTERVALO_MS) return
    ultima = Date.now()
  }
  try {
    const agora = new Date().toISOString()
    const [perguntas, links] = await Promise.all([
      // Ainda com o nome: a redigida fica só com a etapa (e o banco, ao encerrar, já tirou o contato).
      admin.from('whatsapp_pendencias').select('id, dados').eq('tipo', 'cadastrar_colaborador')
        .or(`encerrada_em.not.is.null,expira_em.lt.${agora}`).not('dados->>nome', 'is', null).limit(50),
      admin.from('whatsapp_confirmacoes').select('id, dados').eq('acao', 'cadastrar_colaborador')
        .is('usado_em', null).lt('expira_em', agora).is('dados->>redigida', null).limit(50),
    ])
    await Promise.all([
      ...(perguntas.error ? [] : perguntas.data ?? []).map((l) => admin.from('whatsapp_pendencias').update({ dados: dadosRedigidos(l.dados) }).eq('id', l.id as number)),
      ...(links.error ? [] : links.data ?? []).map((l) => admin.from('whatsapp_confirmacoes').update({ dados: dadosDoLinkRedigidos(l.dados) }).eq('id', l.id as string)),
    ])
  } catch {
    // Melhor esforço: o próximo cadastro (ou a fila) tenta de novo.
  }
}
