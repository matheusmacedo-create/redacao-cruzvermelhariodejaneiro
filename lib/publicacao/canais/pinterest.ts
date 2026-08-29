import type { Adapter, Aviso, Variante } from './contrato'

export const pinterest: Adapter = {
  id: 'pinterest',
  nome: 'Pinterest',
  cor: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  formatos: [
    { id: 'feed', rotulo: 'Pin', midia: { min: 1, max: 5, proporcaoPreferida: '2:3', video: 'permitido' },
      texto: { max: 500, unidade: 'caracteres' } },
  ],
  camposExtras: [
    { chave: 'pinTitle', rotulo: 'Título do pin', tipo: 'texto', max: 100,
      dica: 'É o que aparece em destaque na busca do Pinterest.',
      indisponivel: 'Em verificação: o conector ainda não confirmou o campo de título.' },
  ],
  aoGerar(variante, mestre) {
    // O título do pin nasce do título do mestre — Pinterest sem título é um
    // pin anônimo na busca.
    if (mestre.titulo && !variante.extras.pinTitle) {
      return { ...variante, extras: { ...variante.extras, pinTitle: mestre.titulo.slice(0, 100) } }
    }
    return variante
  },
  validarExtras(variante): Aviso[] {
    if (!variante.extras.pinTitle?.trim()) {
      return [{ nivel: 'aviso', mensagem: 'Pin sem título rende mal na busca do Pinterest.' }]
    }
    return []
  },
}
