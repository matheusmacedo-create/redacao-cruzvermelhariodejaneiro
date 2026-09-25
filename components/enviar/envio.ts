/**
 * O envio dos arquivos, do navegador direto ao armazenamento (R2), com
 * progresso e novas tentativas — a rede na rua cai. Cada arquivo sobe por um
 * link assinado que a Redação emitiu; depois de subir, a Redação confere que
 * ele chegou inteiro (acao "recebido").
 */

export type EstadoDoArquivo = 'esperando' | 'enviando' | 'conferindo' | 'pronto' | 'falhou'
export type Progresso = { enviado: number; total: number; estado: EstadoDoArquivo; erro?: string }
export type Par = { upload: { id: string; url: string }; arquivo: File }

const TENTATIVAS = 4
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

function subir(url: string, arquivo: File, aoProgredir: (enviado: number) => void): Promise<void> {
  return new Promise((resolver, recusar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (arquivo.type) xhr.setRequestHeader('Content-Type', arquivo.type)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir(e.loaded) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : recusar(new Error(`HTTP ${xhr.status}`)))
    xhr.onerror = () => recusar(new Error('rede'))
    xhr.ontimeout = () => recusar(new Error('tempo'))
    xhr.send(arquivo)
  })
}

export async function acaoDoEnvio(envioId: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`/api/enviar/${envioId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok) throw new Error(typeof j.erro === 'string' ? j.erro : 'Falha na conexão. Tente de novo.')
  return j
}

/** Sobe um arquivo com até 4 tentativas; devolve true se chegou e foi conferido. */
export async function enviarUm(envioId: string, token: string, par: Par, aoMudar: (p: Partial<Progresso>) => void): Promise<boolean> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      aoMudar({ estado: 'enviando', enviado: 0, erro: undefined })
      await subir(par.upload.url, par.arquivo, (enviado) => aoMudar({ enviado }))
      aoMudar({ estado: 'conferindo', enviado: par.arquivo.size })
      await acaoDoEnvio(envioId, { token, acao: 'recebido', arquivoId: par.upload.id })
      aoMudar({ estado: 'pronto' })
      return true
    } catch (causa) {
      if (tentativa === TENTATIVAS) {
        aoMudar({ estado: 'falhou', erro: causa instanceof Error && causa.message !== 'rede' ? causa.message : 'A conexão caiu.' })
        return false
      }
      aoMudar({ estado: 'esperando', erro: `A conexão falhou; tentando de novo (${tentativa + 1}/${TENTATIVAS})…` })
      await espera(1500 * tentativa)
    }
  }
  return false
}

/** Sobe vários, dois de cada vez (celular com rede fraca não aguenta mais). */
export async function enviarTodos(envioId: string, token: string, pares: Par[], aoMudar: (id: string, p: Partial<Progresso>) => void): Promise<number> {
  let proximo = 0
  let prontos = 0
  async function trabalhador() {
    while (proximo < pares.length) {
      const par = pares[proximo++]
      if (await enviarUm(envioId, token, par, (p) => aoMudar(par.upload.id, p))) prontos++
    }
  }
  await Promise.all([trabalhador(), trabalhador()])
  return prontos
}
