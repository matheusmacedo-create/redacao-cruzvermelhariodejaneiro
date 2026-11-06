import 'server-only'
import { indiceDosTextos } from './ouvir-textos'

let indice: Promise<Map<string, string>> | null = null

/**
 * O texto de um código do "Ouvir" (lib/ajuda/ouvir.ts), ou null se não é da ajuda. A rota do áudio só grava o que
 * está aqui: o conjunto é fechado (o conteúdo da ajuda). O índice é montado uma vez por instância do servidor.
 */
export async function textoPeloCodigo(codigo: string): Promise<string | null> {
  indice ??= indiceDosTextos().catch((causa) => { indice = null; throw causa })
  return (await indice).get(codigo) ?? null
}
