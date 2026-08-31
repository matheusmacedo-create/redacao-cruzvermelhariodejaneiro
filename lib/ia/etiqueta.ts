/**
 * A marca que acompanha, para sempre, um arquivo gerado por IA.
 *
 * Vive num módulo próprio porque atravessa camadas que não podem se importar
 * entre si: a action que gera, o carregador que envia às redes, a rota que
 * lista a Biblioteca. Um arquivo 'use server' não pode exportar constante.
 */
export const ETIQUETA_DE_IA = 'ia:openai'
