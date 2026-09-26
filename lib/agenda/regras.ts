/**
 * Os alertas da Agenda (docs/calendario-inteligente.md §3.4): regras simples,
 * sem IA, sobre os itens que a pessoa está vendo. Roda no navegador (para o
 * liga/desliga das camadas refletir na hora) e no resumo semanal. Módulo puro.
 */

import type { Camada, ItemDaAgenda } from './camadas'
import { diferencaEmDias, feriadosEntre, rotuloDoDia, segundaDaSemana, somarDias } from './datas'

export type NivelDoAlerta = 'urgente' | 'atencao' | 'info'

export type Alerta = {
  id: string
  nivel: NivelDoAlerta
  camada: Camada
  titulo: string
  detalhe: string
  dia: string
  href?: string | null
  /** Data comemorativa sem pauta: a tela oferece "Criar pauta". */
  criarPauta?: { dataComemorativaId: string; ano: number; nome: string; dia: string }
}

export const MAXIMO_POR_CANAL_NO_DIA = 3
export const HORAS_PARA_APROVAR = 48
export const DIAS_DE_AVISO_DE_VENCIMENTO = 7

const ORDEM: Record<NivelDoAlerta, number> = { urgente: 0, atencao: 1, info: 2 }

/** "qua., 30 de set" — sem o ponto final da abreviatura, para a frase terminar com um só. */
const rotulo = (d: string) => rotuloDoDia(d).replace(/\.$/, '')

type Agora = { dia: string; hora: string }

/** Horas entre agora e o dia/hora do item (itens sem hora contam do começo do dia). */
function horasAte(agora: Agora, dia: string, hora: string | null | undefined): number {
  const [ha, ma] = agora.hora.split(':').map(Number)
  const [hi, mi] = (hora ?? '00:00').split(':').map(Number)
  return diferencaEmDias(agora.dia, dia) * 24 + (hi - ha) + (mi - ma) / 60
}

/**
 * Os alertas a partir dos itens visíveis. `ate` é até onde olhar para frente
 * (a tela passa o fim da janela carregada, limitado a ~6 semanas).
 */
export function alertasDaAgenda(itens: ItemDaAgenda[], agora: Agora, ate: string = somarDias(agora.dia, 42)): Alerta[] {
  const alertas: Alerta[] = []
  const hoje = agora.dia
  const futuros = itens.filter((i) => (i.ate ?? i.dia) >= hoje && i.dia <= ate)

  // 1. Data comemorativa dentro da antecedência e ainda sem pauta ligada.
  for (const i of futuros) {
    if (i.camada !== 'datas' || i.temPauta || !i.dataComemorativaId) continue
    const antecedencia = i.antecedencia ?? 21
    const faltam = diferencaEmDias(hoje, i.dia)
    if (faltam > antecedencia || faltam < 0) continue
    const titulo = i.titulo
    alertas.push({
      id: `data:${i.id}`,
      nivel: faltam <= 7 ? 'urgente' : 'atencao',
      camada: 'datas',
      titulo: `${titulo} sem pauta`,
      detalhe: faltam === 0 ? 'É hoje e nada foi planejado.' : `Faltam ${faltam} dia${faltam === 1 ? '' : 's'} (${rotulo(i.dia)}).`,
      dia: i.dia,
      criarPauta: { dataComemorativaId: i.dataComemorativaId, ano: Number(i.dia.slice(0, 4)), nome: titulo, dia: i.dia },
    })
  }

  const publicacoes = futuros.filter((i) => i.camada === 'publicacoes')

  // 2. Semana sem nenhuma publicação (esta e a próxima).
  const segunda = segundaDaSemana(hoje)
  for (const [n, inicio] of [segunda, somarDias(segunda, 7)].entries()) {
    const fim = somarDias(inicio, 6)
    if (fim < hoje) continue
    const tem = itens.some((i) => i.camada === 'publicacoes' && i.dia >= inicio && i.dia <= fim)
    if (!tem) {
      alertas.push({
        id: `semana:${inicio}`,
        nivel: n === 0 ? 'atencao' : 'info',
        camada: 'publicacoes',
        titulo: n === 0 ? 'Nada agendado nesta semana' : 'Nada agendado na próxima semana',
        detalhe: `De ${rotulo(inicio)} a ${rotulo(fim)} não há publicação na agenda.`,
        dia: inicio,
      })
    }
  }

  // 3. Muitos posts no mesmo canal no mesmo dia.
  const porCanalEDia = new Map<string, ItemDaAgenda[]>()
  for (const i of publicacoes) {
    if (!i.canal || i.estado === 'publicado') continue
    const chave = `${i.dia}|${i.canal}`
    porCanalEDia.set(chave, [...(porCanalEDia.get(chave) ?? []), i])
  }
  for (const [chave, grupo] of porCanalEDia) {
    if (grupo.length < MAXIMO_POR_CANAL_NO_DIA) continue
    const [dia, canal] = chave.split('|')
    alertas.push({
      id: `canal:${chave}`,
      nivel: 'info',
      camada: 'publicacoes',
      titulo: `${grupo.length} posts no ${canal} no mesmo dia`,
      detalhe: `${rotuloDoDia(dia)} — espalhar ajuda o alcance de cada um.`,
      dia,
    })
  }

  // 4. Publicação chegando sem aprovação.
  for (const i of publicacoes) {
    if (i.estado !== 'rascunho' && i.estado !== 'em_aprovacao') continue
    const horas = horasAte(agora, i.dia, i.hora)
    if (horas < -24 || horas > HORAS_PARA_APROVAR) continue
    alertas.push({
      id: `aprovacao:${i.id}`,
      nivel: 'urgente',
      camada: 'publicacoes',
      titulo: `Falta aprovar: ${i.titulo}`,
      detalhe: horas <= 0 ? 'O horário marcado já passou.' : `Sai ${rotulo(i.dia)}${i.hora ? `, às ${i.hora}` : ''}, e está ${i.estado === 'rascunho' ? 'em rascunho' : 'em aprovação'}.`,
      dia: i.dia,
      href: i.href,
    })
  }

  // 5. Ação ou evento marcado em feriado (a equipe pode estar de folga; o público, não).
  if (futuros.length) {
    const feriados = new Map(feriadosEntre(hoje, ate).filter((f) => f.tipo !== 'facultativo').map((f) => [f.dia, f.nome]))
    for (const i of futuros) {
      if ((i.camada !== 'voluntariado' && i.camada !== 'publicacoes') || !feriados.has(i.dia)) continue
      alertas.push({
        id: `feriado:${i.id}`,
        nivel: 'info',
        camada: i.camada,
        titulo: `${i.titulo} cai num feriado`,
        detalhe: `${rotulo(i.dia)} é ${feriados.get(i.dia)}. Confira se a equipe estará disponível.`,
        dia: i.dia,
        href: i.href,
      })
    }
  }

  // 6. Vencimentos (contas e documentos de veículos) nos próximos dias ou já vencidos.
  for (const i of itens) {
    if (i.camada !== 'financeiro' && i.camada !== 'frota') continue
    const faltam = diferencaEmDias(hoje, i.dia)
    if (faltam > DIAS_DE_AVISO_DE_VENCIMENTO || faltam < -30) continue
    alertas.push({
      id: `vence:${i.id}`,
      nivel: faltam < 0 ? 'urgente' : 'atencao',
      camada: i.camada,
      titulo: i.titulo,
      detalhe: faltam < 0 ? `Venceu ${rotulo(i.dia)}.` : faltam === 0 ? 'Vence hoje.' : `Vence ${rotulo(i.dia)}.`,
      dia: i.dia,
      href: i.href,
    })
  }

  return alertas.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel] || a.dia.localeCompare(b.dia))
}
