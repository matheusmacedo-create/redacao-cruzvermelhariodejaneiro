import type { Adapter } from './contrato'

export const googleBusiness: Adapter = {
  id: 'google_business',
  nome: 'Perfil do Google',
  cor: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  formatos: [
    { id: 'texto', rotulo: 'Atualização', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 1_500, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Atualização com foto', midia: { min: 1, max: 1, proporcaoPreferida: '4:3', video: 'nao' },
      texto: { max: 1_500, unidade: 'caracteres' } },
  ],
  camposExtras: [
    // Os valores são os da API (gbp_cta_type); o rótulo legível fica na UI.
    { chave: 'ctaTipo', rotulo: 'Botão de ação', tipo: 'select',
      opcoes: ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'],
      dica: 'LEARN_MORE = Saiba mais · BOOK = Reservar · ORDER = Pedir · SHOP = Comprar · SIGN_UP = Inscrever-se · CALL = Ligar' },
    { chave: 'ctaUrl', rotulo: 'Link do botão', tipo: 'url',
      dica: 'Obrigatório quando o botão está definido.' },
  ],
  validarExtras(variante) {
    if (variante.extras.ctaTipo && !variante.extras.ctaUrl?.trim()) {
      return [{ nivel: 'erro' as const, mensagem: 'Botão de ação sem link: a API exige gbp_cta_url quando há botão.' }]
    }
    return []
  },
}
