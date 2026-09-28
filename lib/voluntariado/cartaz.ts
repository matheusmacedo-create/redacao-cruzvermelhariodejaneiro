import { montarChamadas, type Chamada, type ChamadaPronta } from '@/lib/cartaz/copy'

/**
 * Os cartazes com QR do Voluntariado (/voluntariado/cartaz), dois alvos:
 *   inscricao  para o público: o QR abre o formulário público de inscrição
 *              (/participe); quem se inscreve cai em "Inscrições pendentes".
 *   area       para quem já é voluntário: o QR abre a Área do Voluntário
 *              (/membro), com entrada pelo e-mail e um código de 6 dígitos.
 *
 * A copy é escolhida na hora de imprimir (lib/cartaz/copy.ts): as chamadas
 * de cada alvo (lib/voluntariado/cartaz-copy.ts) e título e frase livres.
 * Sem marcadores: o texto não depende de cadastro.
 *
 * Puro: a página e a conferência (`npx tsx scripts/conferir-cartaz-do-voluntariado.ts`)
 * usam as mesmas regras.
 */

export const PARAMETRO_DO_ALVO = 'para'
export const CHAVE_PADRAO = 'padrao'

export const ALVOS = {
  inscricao: {
    rotulo: 'Seja voluntário (inscrição pública)',
    caminho: '/participe',
    cabecalho: 'Voluntariado',
    passos: [
      'Aponte a câmera do celular para o código.',
      'Preencha a inscrição: leva poucos minutos.',
      'A coordenação do Voluntariado entra em contato com você.',
    ],
    rodape: 'Voluntariado da Cruz Vermelha Brasileira – Rio de Janeiro: sem remuneração, com formação, equipe e propósito.',
  },
  area: {
    rotulo: 'Área do Voluntário (quem já é)',
    caminho: '/membro',
    cabecalho: 'Área do Voluntário',
    passos: [
      'Aponte a câmera do celular para o código.',
      'Entre com o seu e-mail e o código de 6 dígitos que chega nele.',
      'Veja suas horas, ações, cursos, certificados e avisos.',
    ],
    rodape: 'Para quem já é voluntário da filial. Dúvidas? Fale com a coordenação pela própria área.',
  },
} as const
export type AlvoDoVoluntariado = keyof typeof ALVOS
export const ehAlvo = (v: unknown): v is AlvoDoVoluntariado => typeof v === 'string' && Object.hasOwn(ALVOS, v)

/** O endereço que vai no QR. */
export function linkDoCartaz(base: string, alvo: AlvoDoVoluntariado): string {
  return `${base.replace(/\/+$/, '')}${ALVOS[alvo].caminho}`
}

/** A copy de cada alvo: lib/voluntariado/cartaz-copy.ts. A primeira é a de sempre (chave "padrao"). */
export type CopyDoVoluntariado = Record<AlvoDoVoluntariado, Record<string, Chamada>>

export function chamadasDoVoluntariado(alvo: AlvoDoVoluntariado, copy: CopyDoVoluntariado): ChamadaPronta[] {
  return montarChamadas(Object.entries(copy[alvo]), { valores: {} })
}
