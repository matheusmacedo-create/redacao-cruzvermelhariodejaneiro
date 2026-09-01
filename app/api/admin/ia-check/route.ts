import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import {
  adaptarTexto, esforcoDeEscrita, esforcoDeRaciocinio, iaConfigurada, modeloDeEscrita, modeloDeImagem,
  modeloDeTexto, modelosDisponiveis, semChave, tetoMensalDeImagens,
  MODELO_DE_ESCRITA_PADRAO, MODELO_DE_IMAGEM_PADRAO, MODELO_DE_TEXTO_PADRAO,
} from '@/lib/ia/openai'
import {
  claudeConfigurado, modeloDoClaude, reescreverComClaude, semChaveDoClaude, MODELO_CLAUDE_PADRAO,
} from '@/lib/ia/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diz, em uma resposta, se o módulo de IA está de pé.
 *
 * Existe por três motivos, nesta ordem:
 *
 *  1. Variável de ambiente na Vercel só entra em build novo. Adicionar a chave
 *     e não republicar deixa a produção rodando sem ela — e o sintoma é o
 *     botão que não aparece, que ninguém liga à causa. Aqui, `configurado:
 *     false` responde isso de uma vez.
 *  2. A OpenAI renomeia e aposenta modelos com frequência. Um nome vencido só
 *     apareceria como 404 no meio de uma publicação.
 *  3. Chave válida não é o mesmo que funcionando. Com ?testar=1 a rota faz uma
 *     chamada de texto mínima e diz se a ida e volta completou.
 *
 * Nunca devolve a chave — nem inteira, nem em pedaço.
 */
export async function GET(request: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  // O lado do Claude é independente do da OpenAI: cada provedor responde por
  // si, e um sem chave não esconde o diagnóstico do outro.
  const claude: Record<string, unknown> = {
    configurado: claudeConfigurado(),
    modelo: modeloDoClaude(),
    usandoPadrao: modeloDoClaude() === MODELO_CLAUDE_PADRAO,
  }
  if (!claude.configurado) {
    claude.veredito = 'Sem chave. Cadastre ANTHROPIC_API_KEY na Vercel e republique — variável nova só entra em build novo.'
  } else if (request.nextUrl.searchParams.get('testar')) {
    try {
      const { texto: resposta, medida } = await reescreverComClaude({
        system: 'Responda apenas com o texto reescrito, sem comentários.',
        texto: 'Reescreva em uma frase: A Cruz Vermelha do Rio abriu inscrições para o curso de primeiros socorros.',
      })
      claude.teste = { ok: true, devolveu: resposta.slice(0, 200), custo: medida }
      claude.veredito = `Funcionando: a chamada completou em ${medida.segundos}s no modelo ${medida.modelo}.`
    } catch (causa) {
      claude.teste = { ok: false, erro: semChaveDoClaude(causa instanceof Error ? causa.message : String(causa)) }
      claude.veredito = 'A chave chegou, mas a chamada de teste falhou — veja claude.teste.'
    }
  } else {
    claude.veredito = 'Chave presente. Acrescente ?testar=1 para fazer uma chamada de verdade.'
  }

  const imagem = modeloDeImagem()
  const escrita = modeloDeTexto()
  const redator = modeloDeEscrita()
  const base = {
    claude,
    configurado: iaConfigurada(),
    modeloDeImagem: imagem,
    modeloDeTexto: escrita,
    modeloDeEscrita: redator,
    esforcoDeEscrita: esforcoDeEscrita() || '(padrão do modelo)',
    usandoPadrao: {
      imagem: imagem === MODELO_DE_IMAGEM_PADRAO,
      texto: escrita === MODELO_DE_TEXTO_PADRAO,
      escrita: redator === MODELO_DE_ESCRITA_PADRAO,
    },
    tetoMensalDeImagens: tetoMensalDeImagens(),
  }

  if (!base.configurado) {
    return NextResponse.json({
      ...base,
      veredito: 'A chave não chegou a esta versão publicada.',
      oQueFazer: 'Se você já cadastrou OPENAI_API_KEY na Vercel, republique: variável nova só entra em build novo '
        + '(Deployments → o mais recente → ⋯ → Redeploy). Se ainda não cadastrou, cadastre nos três ambientes — '
        + 'e nunca com o prefixo NEXT_PUBLIC_.',
    })
  }

  let modelos: string[]
  try {
    modelos = await modelosDisponiveis()
  } catch (causa) {
    return NextResponse.json({
      ...base,
      chaveValida: false,
      veredito: 'A chave chegou, mas a OpenAI recusou.',
      erro: semChave(causa instanceof Error ? causa.message : String(causa)),
      oQueFazer: 'Confira se a chave foi copiada inteira e se não foi revogada em platform.openai.com/api-keys.',
    })
  }

  const existe = (nome: string) => modelos.includes(nome)
  const modelosOk = existe(imagem) && existe(escrita) && existe(redator)

  // O teste de verdade é opcional porque custa: uma chamada de texto curta,
  // fração de centavo. Imagem não é testada aqui de propósito — essa custa.
  let teste: Record<string, unknown> | undefined
  if (request.nextUrl.searchParams.get('testar')) {
    try {
      // Canal e formato reais de propósito: com nomes de mentira ("Teste"), o
      // modelo devolveu "Teste (Teste) — …" e o diagnóstico deixou de exercitar
      // o caminho que a redação usa. O teste tem de ter a forma do uso.
      const { texto: resposta, medida } = await adaptarTexto({
        texto: 'A Cruz Vermelha Brasileira do Rio de Janeiro abriu inscrições para o curso de primeiros socorros.',
        canal: 'Facebook', formato: 'Feed', limite: 280, dobra: 125,
      })
      teste = {
        ok: true,
        devolveu: resposta.slice(0, 200),
        // Se o modelo voltar a colar o nome do canal na frente, aparece aqui.
        comecouComRotuloDoCanal: /^facebook\b/i.test(resposta),
        // O custo em números: é isto que diz se a otimização está valendo.
        custo: medida,
      }
    } catch (causa) {
      teste = { ok: false, erro: semChave(causa instanceof Error ? causa.message : String(causa)) }
    }
  }

  const tudoOk = modelosOk && (!teste || teste.ok === true)
  return NextResponse.json({
    ...base,
    chaveValida: true,
    modeloDeImagemExiste: existe(imagem),
    modeloDeTextoExiste: existe(escrita),
    modeloDeEscritaExiste: existe(redator),
    ...(teste ? { testeDeTexto: teste } : {}),
    esforcoDeRaciocinio: esforcoDeRaciocinio() || '(padrão do modelo)',
    veredito: tudoOk
      ? (teste
          ? `Tudo funcionando: chave válida, modelos existem e a chamada de texto completou em ${(teste.custo as { segundos: number }).segundos}s.`
          : 'Chave válida e os dois modelos existem. Acrescente ?testar=1 para fazer uma chamada de verdade.')
      : !existe(escrita) ? `O modelo de texto "${escrita}" não existe nesta conta.`
      : !existe(redator) ? `O modelo de escrita "${redator}" não existe nesta conta (OPENAI_WRITER_MODEL).`
      : !existe(imagem) ? `O modelo de imagem "${imagem}" não existe nesta conta.`
      : 'A chamada de teste falhou — veja testeDeTexto.',
    ...(modelosOk ? {} : {
      oQueFazer: 'Escolha um nome da lista abaixo e cadastre em OPENAI_IMAGE_MODEL ou OPENAI_TEXT_MODEL na Vercel, '
        + 'depois republique.',
    }),
    // Só os nomes plausíveis: a lista inteira passa de cem itens e nenhum
    // deles ajuda quem está procurando o nome certo do gerador.
    candidatosDeImagem: modelos.filter((m) => m.includes('image')),
    candidatosDeTexto: modelos
      .filter((m) => /^(gpt|o\d)/.test(m) && !/image|audio|realtime|transcribe|tts|search|embedding/.test(m))
      .slice(0, 40),
  })
}
