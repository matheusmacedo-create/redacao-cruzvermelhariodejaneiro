import type { Adapter, Aviso, Variante } from './contrato'
import { textoParaRede } from '@/lib/publicacao/texto-plano'

/**
 * TikTok. Duas réguas diferentes no mesmo canal: no vídeo a legenda vai até
 * 2.200 caracteres; no post de fotos a legenda é o "título", limitado a 90 —
 * o texto longo entra na descrição, que é outro campo.
 */
export const tiktok: Adapter = {
  id: 'tiktok',
  nome: 'TikTok',
  cor: 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200',
  formatos: [
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: '9:16', video: 'obrigatorio', duracaoMaxima: 10 * 60 },
      texto: { max: 2_200, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Fotos', midia: { min: 1, max: 35, proporcaoPreferida: '9:16', video: 'nao' },
      texto: { max: 90, unidade: 'caracteres' } },
  ],
  camposExtras: [
    { chave: 'tiktokDescricao', rotulo: 'Descrição', tipo: 'textarea', max: 4_000, formatos: ['feed'],
      dica: 'No post de fotos, a legenda visível tem 90 caracteres; o texto longo vai aqui.' },
    { chave: 'tiktokPrivacidade', rotulo: 'Quem vê', tipo: 'select',
      opcoes: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
      dica: 'PUBLIC_TO_EVERYONE = todos · MUTUAL_FOLLOW_FRIENDS = amigos · FOLLOWER_OF_CREATOR = seguidores · SELF_ONLY = só você. Em branco, publica para todos.' },
  ],
  aoGerar(variante, mestre, formatoId): Variante {
    // Sem isto, o texto do mestre seria simplesmente cortado em 90 caracteres
    // e o resto se perderia. A legenda curta fica onde o TikTok a mostra; o
    // texto inteiro vai para a descrição, que aceita 4.000.
    if (formatoId !== 'feed' || variante.extras.tiktokDescricao) return variante
    const completo = textoParaRede(mestre.corpo).texto
    if (!completo) return variante
    return { ...variante, extras: { ...variante.extras, tiktokDescricao: completo.slice(0, 4_000) } }
  },
  validarExtras(variante, formatoId): Aviso[] {
    if (formatoId === 'feed' && (variante.extras.tiktokDescricao ?? '').length > 4_000) {
      return [{ nivel: 'erro', mensagem: 'A descrição do TikTok passa de 4.000 caracteres.' }]
    }
    return []
  },
}
