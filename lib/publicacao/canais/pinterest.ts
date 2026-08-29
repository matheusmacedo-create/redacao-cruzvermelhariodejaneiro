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
      dica: 'É o que aparece em destaque na busca do Pinterest.' },
    { chave: 'pinterestBoardId', rotulo: 'Board (ID)', tipo: 'texto',
      dica: 'Obrigatório: a API exige o ID do board. Peça a um administrador ou consulte /api/uploadposts/pinterest/boards.' },
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
    const avisos: Aviso[] = []
    if (!variante.extras.pinTitle?.trim()) {
      avisos.push({ nivel: 'aviso', mensagem: 'Pin sem título rende mal na busca do Pinterest.' })
    }
    // A API recusa pin sem board — melhor recusar aqui, com o motivo legível.
    if (!variante.extras.pinterestBoardId?.trim()) {
      avisos.push({ nivel: 'erro', mensagem: 'O Pinterest exige o ID do board de destino.' })
    }
    return avisos
  },
}
