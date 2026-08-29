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
    { chave: 'ctaTipo', rotulo: 'Botão de ação', tipo: 'select',
      opcoes: ['Saiba mais', 'Ligar', 'Reservar', 'Inscrever-se'],
      indisponivel: 'Em verificação: o conector ainda não confirmou o botão de ação.' },
  ],
}
