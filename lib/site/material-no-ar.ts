/**
 * O arquivo de um material já responde no site? (09/11/2026)
 *
 * A caixa "Receba a lista do kit de emergência no seu e-mail" (lib/site/caixa-de-material.ts) promete um arquivo que
 * mora no site institucional e é publicado por outro repositório. Se a página da matéria subisse com a caixa antes de
 * o PDF estar no ar, a pessoa deixaria o e-mail, receberia a mensagem e o botão "Baixar a lista em PDF" daria em
 * página não encontrada. Um aviso escrito ("publique o site antes") já falhou aqui outras vezes (ARQUITETURA §10.7);
 * por isso a trava é mecânica: na hora de gerar a página, o endereço do arquivo é conferido, e sem ele a página sai
 * sem a caixa, com o motivo no aviso da publicação. Publicado o arquivo, a caixa entra na regeração seguinte.
 *
 * O mesmo desenho de `prepararChatDoSite()`: uma leitura com tempo limite, guardada por alguns minutos (por um minuto
 * só, quando falha), e nunca lança. Na dúvida (site fora do ar, tempo esgotado), a resposta é "não": página sem a
 * caixa é um problema menor e visível; caixa que promete arquivo que não existe é pior e ninguém vê.
 *
 * Sem `server-only` de propósito: não lê segredo nenhum, e assim a conferência
 * (scripts/conferir-caixa-de-material.ts) consegue rodá-lo com um `fetch` de mentira.
 */
import type { Material } from '@/lib/newsletter/materiais'

const TEMPO_LIMITE_MS = 5000
const VALIDADE_MS = 10 * 60_000
const VALIDADE_DA_FALHA_MS = 60_000

const guardados = new Map<string, { noAr: boolean; ate: number }>()

export async function materialNoAr(material: Material, buscar: typeof fetch = fetch, agora: () => number = Date.now): Promise<boolean> {
  const visto = guardados.get(material.arquivo)
  if (visto && visto.ate > agora()) return visto.noAr
  let noAr = false
  try {
    const resposta = await buscar(material.arquivo, { method: 'HEAD', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
    // 200 com página HTML é a página de "não encontrado" de algum servidor que não devolve 404: não é o arquivo.
    noAr = resposta.ok && !(resposta.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
  } catch {
    noAr = false
  }
  guardados.set(material.arquivo, { noAr, ate: agora() + (noAr ? VALIDADE_MS : VALIDADE_DA_FALHA_MS) })
  return noAr
}

/** Só para a conferência: esquece o que foi guardado. */
export function esquecerMateriaisConferidos(): void {
  guardados.clear()
}
