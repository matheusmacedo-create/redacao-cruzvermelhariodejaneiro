'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { lerPauta } from '@/lib/cerebro/cliente'
import { DESTINO_POR_CANAL, type PautaDoCerebro } from '@/lib/cerebro/contrato'

/**
 * Traz uma sugestão do Cérebro para o hub de publicações.
 *
 * O Cérebro observa as contas oficiais e decide o que merece virar pauta;
 * ele não publica. Isto é a fronteira: a sugestão vira um pacote em rascunho,
 * com o mestre preenchido e um destino por canal que o Cérebro liberou. Nada
 * é enviado — o trabalho segue em /redes/[id], com decisão humana.
 *
 * O que NÃO acontece aqui é tão importante quanto o que acontece: a mídia da
 * fonte não é anexada ao pacote. Ela é de terceiro — Defesa Civil, COR-Rio,
 * Bombeiros — e anexá-la faria a filial publicar foto alheia como se fosse
 * sua. Ela viaja como referência no mestre, creditada, para a pessoa ver do
 * que se trata e escolher a imagem própria.
 */
export async function importarDoCerebro(formData: FormData): Promise<{ erro?: string; id?: string }> {
  try {
    const sinalId = String(formData.get('sinalId') ?? '').trim()
    if (!sinalId) throw new Error('Faltou o identificador do sinal.')

    const context = await requireWorkspace()
    const supabase = await createClient()

    const pauta = await lerPauta(sinalId)
    if (!pauta) throw new Error('Não foi possível ler esta pauta no Cérebro. Tente de novo em instantes.')

    // Um sinal já importado não vira dois pacotes: quem clica duas vezes
    // quer o pacote, não uma cópia.
    const { data: existente } = await supabase
      .from('social_packages')
      .select('id')
      .eq('workspace_id', context.workspace.id)
      .eq('mestre->>cerebroId', sinalId)
      .neq('status', 'arquivado')
      .maybeSingle()
    if (existente) {
      revalidatePath('/redes')
      return { id: existente.id }
    }

    const { data: pacote, error } = await supabase
      .from('social_packages')
      .insert({
        workspace_id: context.workspace.id,
        titulo_interno: pauta.titulo.slice(0, 180),
        origem_tipo: 'pauta',
        mestre: mestreDaPauta(pauta),
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (error || !pacote) throw new Error('Não foi possível criar o pacote a partir desta pauta.')

    // Só os canais que o Cérebro liberou viram destino. Os recusados ficam
    // registrados nas notas com o motivo — a recusa é informação, não silêncio.
    const destinos = pauta.canais
      .filter((c) => c.usar && DESTINO_POR_CANAL[c.canal])
      .map((c) => ({
        workspace_id: context.workspace.id,
        package_id: pacote.id,
        canal: DESTINO_POR_CANAL[c.canal].canal,
        formato: DESTINO_POR_CANAL[c.canal].formato,
        corpo: corpoDoCanal(pauta, c.texto, c.cta),
        estado: 'gerada' as const,
      }))

    if (destinos.length > 0) {
      const { error: erroDestinos } = await supabase.from('package_destinations').insert(destinos)
      // O pacote já existe e é editável à mão: falhar aqui não justifica
      // desfazer o que deu certo, mas a pessoa precisa saber.
      if (erroDestinos) {
        revalidatePath('/redes')
        return { id: pacote.id, erro: 'O pacote foi criado, mas os destinos não. Adicione-os pelo pacote.' }
      }
    }

    revalidatePath('/redes')
    return { id: pacote.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar esta pauta.') }
  }
}

/** O texto-mestre, com o fato, o raciocínio e as travas. */
function mestreDaPauta(p: PautaDoCerebro): Record<string, unknown> {
  const naoUsar = p.canais.filter((c) => !c.usar)
  const notas = [
    `Sugerido pelo Cérebro · nota ${p.decisao.nota}/100 · ${p.decisao.modoRotulo}.`,
    '',
    'POR QUE APARECEU',
    ...p.decisao.porque.map((x) => `· ${x}`),
    '',
    'NÃO PODE',
    ...p.proibido.map((x) => `· ${x}`),
  ]

  if (p.midia) {
    notas.push(
      '',
      'MÍDIA DA FONTE',
      `· ${p.midia.credito} — direito: ${p.midia.direito}.`,
      p.midia.podePublicar
        ? '· Autorizada. Pode entrar na peça.'
        : '· NÃO pode entrar na peça. Serve para você ver do que se trata; use arte própria ou foto autorizada da filial.',
    )
  }

  if (naoUsar.length > 0) {
    notas.push('', 'CANAIS QUE O CÉREBRO NÃO LIBEROU')
    for (const c of naoUsar) notas.push(`· ${c.canal}: ${c.texto.split('\n')[0]}`)
  }

  notas.push('', `Fonte: ${p.fato.fonte} — ${p.fato.url}`)
  if (p.urlNoCerebro) notas.push(`Raciocínio completo: ${p.urlNoCerebro}`)

  return {
    corpo: p.resumo || p.titulo,
    titulo: p.titulo,
    subtitulo: '',
    notas: notas.join('\n'),
    // Identificador do sinal: deixa reencontrar a origem e impede importar
    // o mesmo sinal duas vezes.
    cerebroId: p.id,
    cerebroUrl: p.urlNoCerebro ?? '',
    ...(p.midia ? { cerebroMidiaUrl: p.midia.url, cerebroMidiaCredito: p.midia.credito } : {}),
  }
}

/** O corpo de cada destino sai do plano por canal, com o encaminhamento. */
function corpoDoCanal(p: PautaDoCerebro, texto: string, cta: string): string {
  const partes = [texto.trim()]
  if (cta && cta !== '—') partes.push('', `Encaminhamento: ${cta}`)
  return partes.join('\n').slice(0, 4000)
}
