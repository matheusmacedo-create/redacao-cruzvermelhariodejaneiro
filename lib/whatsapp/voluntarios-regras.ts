import { normalizar as normalizarBusca } from '@/lib/navegacao'

/**
 * O WhatsApp dos voluntários — as regras, sem banco. O servidor fica em
 * lib/whatsapp/voluntarios.ts; a tela, em components/membro/whatsapp.tsx.
 *
 * Só recebe quem confirmou o próprio número na Área do Voluntário E marcou a
 * autorização abaixo. O texto aceito fica guardado com a data (LGPD): se ele
 * mudar, muda a versão, e quem aceitou a anterior continua com a dela.
 */

export const VERSAO_DO_CONSENTIMENTO = '2026-09-27'
export const TEXTO_DO_CONSENTIMENTO =
  'Autorizo a Cruz Vermelha Brasileira – Filial do Rio de Janeiro a me mandar pelo WhatsApp, neste número, as oportunidades de voluntariado ' +
  'e avisos sobre as minhas inscrições. Posso parar a qualquer momento respondendo SAIR ou pela Área do Voluntário. ' +
  'O número é usado só para isso e não é compartilhado.'

export const consentimentoGuardado = () => `[${VERSAO_DO_CONSENTIMENTO}] ${TEXTO_DO_CONSENTIMENTO}`

const limpo = (t: string, max: number) => t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

export const RODAPE_DO_VOLUNTARIO = '_Cruz Vermelha RJ · Voluntariado. Responda *menu* para ver as opções ou *sair* para não receber mais._'

/** O anúncio de uma oportunidade: o essencial e o link para se inscrever na Área. */
export function textoDaOportunidade(p: { titulo: string; quando: string; local: string | null; vagas: string | null; url: string }): string {
  return [
    '*Nova oportunidade de voluntariado*',
    [`*${limpo(p.titulo, 160)}*`, `🗓 ${limpo(p.quando, 80)}`, p.local ? `📍 ${limpo(p.local, 160)}` : null, p.vagas ? limpo(p.vagas, 60) : null].filter(Boolean).join('\n'),
    `Para se inscrever: ${p.url}`,
    RODAPE_DO_VOLUNTARIO,
  ].join('\n\n')
}

export type ComandoDoVoluntario = 'menu' | 'oportunidades' | 'inscricoes' | 'sair' | 'voltar' | 'desconhecido'

/** O que o voluntário pediu. "3" alterna: sai quem recebe, volta quem saiu. */
export function comandoDoVoluntario(entrada: string, p: { pausado: boolean }): ComandoDoVoluntario {
  const t = normalizarBusca(entrada).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return 'desconhecido'
  if (t === '3') return p.pausado ? 'voltar' : 'sair'
  const palavras = t.split(' ')
  const tem = (lista: string[]) => palavras.some((w) => lista.includes(w))
  if (tem(['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar'])) return 'sair'
  if (tem(['voltar', 'ativar', 'retomar', 'start'])) return 'voltar'
  if (t === '1' || tem(['oportunidades', 'oportunidade', 'vagas', 'acoes'])) return 'oportunidades'
  if (t === '2' || tem(['inscricoes', 'inscricao', 'inscrito', 'inscrita'])) return 'inscricoes'
  if (['menu', 'oi', 'ola', 'oie', 'bom', 'boa', 'ajuda', 'inicio', '0'].includes(palavras[0])) return 'menu'
  return 'desconhecido'
}

export function textoDoMenuDoVoluntario(p: { nome: string | null; pausado: boolean; urlBase: string }): string {
  const nome = limpo(p.nome ?? '', 60).split(' ')[0]
  return [
    `${nome ? `Olá, ${nome}!` : 'Olá!'} Aqui é o WhatsApp do *Voluntariado* da Cruz Vermelha RJ.`,
    p.pausado ? '_Você saiu dos avisos por aqui._' : null,
    ['Responda com o número:', '*1* – as oportunidades abertas', '*2* – as suas inscrições',
      p.pausado ? '*3* – voltar a receber as oportunidades por aqui' : '*3* – parar de receber por aqui'].join('\n'),
    `Para se inscrever e ver tudo: ${p.urlBase}/membro/oportunidades`,
  ].filter(Boolean).join('\n\n')
}

export type LinhaDaLista = { titulo: string; quando: string; detalhe?: string | null }

export function textoDaListaDoVoluntario(p: { titulo: string; vazio: string; itens: LinhaDaLista[]; url: string; maximo?: number }): string {
  const max = p.maximo ?? 6
  if (!p.itens.length) return `${p.vazio}\n\n${p.url}`
  const linhas = p.itens.slice(0, max).map((i) => `• *${limpo(i.titulo, 120)}*\n  ${limpo(i.quando, 80)}${i.detalhe ? ` · ${limpo(i.detalhe, 60)}` : ''}`)
  if (p.itens.length > max) linhas.push(`_e mais ${p.itens.length - max}_`)
  return [p.titulo, linhas.join('\n'), p.url].join('\n\n')
}

export const TEXTO_SAIU_DO_VOLUNTARIO = 'Pronto: você não recebe mais as oportunidades por aqui. Para voltar, responda *voltar* ou ligue na Área do Voluntário.'
export const TEXTO_VOLTOU_DO_VOLUNTARIO = 'Pronto: as oportunidades voltam a chegar por aqui.'

export function textoDoCodigoDoVoluntario(codigo: string, minutos: number): string {
  return [
    `Seu código da Área do Voluntário: *${codigo}*`,
    `Digite na Área do Voluntário para receber as oportunidades por aqui. Vale por ${minutos} minutos.`,
    '_Se não foi você que pediu, ignore: nada muda sem o código._',
  ].join('\n\n')
}
