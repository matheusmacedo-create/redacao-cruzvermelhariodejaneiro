/**
 * Os nomes dos cookies do menu, num módulo sem 'use client': o layout do
 * (app) lê esses cookies no servidor para desenhar a sidebar como a pessoa
 * deixou. Exportados de app-shell.tsx ou sidebar.tsx (módulos do cliente),
 * eles chegavam ao servidor como referência de cliente — uma função, não o
 * texto —, o layout nunca achava o cookie e a sidebar abria larga e com todos
 * os grupos abertos a cada carregamento.
 */

/** A sidebar recolhida (só os ícones). */
export const COOKIE_DA_SIDEBAR = 'sidebar_recolhida'

/** Os grupos que a pessoa fechou. */
export const COOKIE_DOS_GRUPOS = 'sidebar_grupos_fechados'
