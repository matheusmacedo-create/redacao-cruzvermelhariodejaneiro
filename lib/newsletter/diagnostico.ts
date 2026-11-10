/**
 * O veredito do "Conferir envio" da Newsletter (app/api/admin/newsletter-check), sem rede nem banco. Conferido em
 * scripts/conferir-newsletter-diagnostico.ts.
 *
 * Saiu de dentro da rota em 09/11/2026, por causa de um alarme falso. A chave do Resend que está em produção é do
 * tipo "só de envio" (Sending access): envia, e NÃO lista os domínios da conta (o Resend responde 401, com o nome
 * "restricted_api_key"). A rota tratava "não consegui listar" como "não está verificado" e respondia que o domínio
 * do remetente ainda não estava verificado, com o envio funcionando e todas as mensagens do mês entregues. Quem leu
 * foi atrás de consertar um domínio que não estava quebrado.
 *
 * A regra daqui é uma só: o diagnóstico afirma o que conferiu. "Conferi e está certo", "conferi e está errado" e
 * "não deu para conferir" são três respostas diferentes, com três tons diferentes, e a terceira nunca se veste da
 * segunda. Alarme que dispara sem conferir ensina a ser ignorado (o mesmo princípio do cartão do formulário da home).
 */

/** O que a conta do Resend respondeu quando o diagnóstico pediu a lista de domínios. */
export type ListagemDeDominios =
  | { tipo: 'lista'; dominios: { nome: string; estado: string }[] }
  /** A chave só envia: é válida, e o Resend não deixa listar domínios com ela. */
  | { tipo: 'chave-so-de-envio' }
  /** Não deu para listar por outro motivo: rede, Resend fora do ar, chave recusada. */
  | { tipo: 'erro'; mensagem: string }

/**
 * A recusa do Resend é a da chave "só de envio"? O 401 dele tem dois nomes: `restricted_api_key` (a chave existe e só
 * envia) e `missing_api_key` (não chegou chave nenhuma); chave inválida é 403. O texto da mensagem entra como segunda
 * pista, só para o dia em que o corpo vier sem o nome.
 */
export function recusaDeChaveSoDeEnvio(status: number, corpo: unknown): boolean {
  if (status !== 401 || !corpo || typeof corpo !== 'object') return false
  const { name, message } = corpo as { name?: unknown; message?: unknown }
  if (name === 'restricted_api_key') return true
  return name === undefined && typeof message === 'string' && /restricted to only send/i.test(message)
}

/** ok: conferido e certo. neutro: não deu para conferir, e não há sinal de problema. atencao: há o que fazer. */
export type TomDoVeredito = 'ok' | 'neutro' | 'atencao'

export type Veredito = {
  veredito: string
  tom: TomDoVeredito
  /** true: conferido e verificado. false: conferido e não verificado. null: não deu para conferir. */
  dominioVerificado: boolean | null
  /** O que fazer e, quando não há nada a fazer, o que saber. Uma frase por item. */
  oQueFazer: string[]
}

export function vereditoDoEnvio(e: {
  /** Há chave do Resend no ambiente? */
  configurado: boolean
  /** O domínio do endereço de onde a newsletter sai. */
  dominioDoRemetente: string
  /** A resposta da listagem de domínios; null quando ela nem foi pedida (sem chave). */
  listagem: ListagemDeDominios | null
  erroDoEspaco?: string | null
  erroDaLista?: string | null
  lista?: { confirmados: number; pendentes: number } | null
  /** O que a leitura da home do site devolveu ("ligado", "DECORATIVO…", "não encontrado na home"…). */
  formularioDaHome?: string
  /** Há endereço de resposta configurado (NEWSLETTER_RESPONDER_PARA)? */
  temRespostaPara: boolean
}): Veredito {
  const dominio = e.dominioDoRemetente
  const oQueFazer: string[] = []
  const listagem = e.configurado ? e.listagem : null
  const oNosso = listagem?.tipo === 'lista' ? listagem.dominios.find((d) => d.nome === dominio) : undefined
  // Só a lista responde sim ou não. Chave só de envio e listagem que falhou são "não sei".
  const dominioVerificado = listagem?.tipo === 'lista' ? oNosso?.estado === 'verified' : null
  const soDeEnvio = listagem?.tipo === 'chave-so-de-envio'

  if (!e.configurado) oQueFazer.push('Cadastre RESEND_API_KEY nas variáveis de ambiente da Vercel e republique — variável nova só vale num build novo.')
  else if (!listagem) oQueFazer.push('Não deu para listar os domínios do Resend: a consulta não foi feita.')
  else if (listagem.tipo === 'erro') oQueFazer.push(`Não deu para listar os domínios do Resend: ${listagem.mensagem}`)
  else if (listagem.tipo === 'chave-so-de-envio') {
    oQueFazer.push('Não é defeito e não precisa trocar a chave: a que só envia é a mais segura para ficar no servidor. Se o Resend recusar um envio, o Palácio avisa a administração na hora, no sino e no WhatsApp.')
    oQueFazer.push(`Para ver a situação do domínio "${dominio}", abra o painel do Resend, em Domains.`)
  }
  else if (!oNosso) oQueFazer.push(`O domínio "${dominio}" não está cadastrado no Resend. Cadastre-o e publique os registros de DNS que o painel mostrar.`)
  else if (!dominioVerificado) oQueFazer.push(`O domínio "${dominio}" está cadastrado como "${oNosso.estado}". Enquanto não ficar "verified", toda tentativa de envio volta 403.`)

  if (e.erroDoEspaco) oQueFazer.push(e.erroDoEspaco)
  if (e.erroDaLista) oQueFazer.push(`Não deu para contar a lista: ${e.erroDaLista}`)
  if (e.formularioDaHome?.startsWith('DECORATIVO')) {
    oQueFazer.push('O formulário da home ainda é o decorativo: quem se inscreve por lá tem o endereço descartado. Substitua pelo trecho de docs/newsletter-formulario-da-home.html.')
  }
  if (e.lista?.pendentes && !e.lista.confirmados) {
    oQueFazer.push(`Há ${e.lista.pendentes} inscrição(ões) pendente(s) e nenhuma confirmada — sinal de que os convites não estão chegando.`)
  }
  if (!e.temRespostaPara) oQueFazer.push('Sem NEWSLETTER_RESPONDER_PARA, quem responder à newsletter escreve para o vazio.')

  const semOutroErro = !e.erroDoEspaco && !e.erroDaLista
  const confirmados = e.lista ? `, ${e.lista.confirmados} inscrito(s) confirmado(s)` : ''

  if (!e.configurado) return { veredito: 'Falta a chave do Resend.', tom: 'atencao', dominioVerificado, oQueFazer }
  if (dominioVerificado === false) return { veredito: `O domínio "${dominio}" ainda não está verificado no Resend.`, tom: 'atencao', dominioVerificado, oQueFazer }
  if (!listagem || listagem.tipo === 'erro') {
    return { veredito: `Não deu para conferir o domínio "${dominio}" no Resend agora. O motivo está logo abaixo.`, tom: 'atencao', dominioVerificado, oQueFazer }
  }
  if (!semOutroErro) return { veredito: 'Veja oQueFazer.', tom: 'atencao', dominioVerificado, oQueFazer }
  if (soDeEnvio) {
    return {
      // Sem o nome do domínio aqui: ele vai na nota logo abaixo, e no celular um nome comprido entre aspas quebra feio.
      veredito: 'Envio configurado: a chave do Resend é válida e do tipo "só de envio". Com ela o Palácio envia, mas não consegue consultar no Resend a situação do domínio do remetente.',
      tom: 'neutro', dominioVerificado, oQueFazer,
    }
  }
  return { veredito: `Envio pronto: chave válida, domínio "${dominio}" verificado${confirmados}.`, tom: 'ok', dominioVerificado, oQueFazer }
}
