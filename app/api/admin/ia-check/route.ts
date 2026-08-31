import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import {
  iaConfigurada, modeloDeImagem, modeloDeTexto, modelosDisponiveis,
  semChave, tetoMensalDeImagens, MODELO_DE_IMAGEM_PADRAO, MODELO_DE_TEXTO_PADRAO,
} from '@/lib/ia/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diz se a chave da OpenAI funciona e se os modelos configurados existem.
 *
 * Existe porque a OpenAI renomeia e aposenta modelos com frequência: sem esta
 * conferência, um nome vencido só aparece como um 404 no meio de uma
 * publicação. Aqui a resposta é direta, com a lista do que a conta enxerga.
 *
 * Nunca devolve a chave — nem inteira, nem em pedaço.
 */
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const imagem = modeloDeImagem()
  const escrita = modeloDeTexto()
  const base = {
    configurado: iaConfigurada(),
    modeloDeImagem: imagem,
    modeloDeTexto: escrita,
    usandoPadrao: {
      imagem: imagem === MODELO_DE_IMAGEM_PADRAO,
      texto: escrita === MODELO_DE_TEXTO_PADRAO,
    },
    tetoMensalDeImagens: tetoMensalDeImagens(),
  }

  if (!base.configurado) {
    return NextResponse.json({
      ...base,
      recado: 'Falta OPENAI_API_KEY nas variáveis de ambiente. Nunca com o prefixo NEXT_PUBLIC_.',
    })
  }

  try {
    const modelos = await modelosDisponiveis()
    const existe = (nome: string) => modelos.includes(nome)
    return NextResponse.json({
      ...base,
      chaveValida: true,
      modeloDeImagemExiste: existe(imagem),
      modeloDeTextoExiste: existe(escrita),
      // Só os nomes plausíveis: a lista inteira passa de cem itens e nenhum
      // deles ajuda quem está procurando o nome certo do gerador.
      candidatosDeImagem: modelos.filter((m) => m.includes('image')),
      candidatosDeTexto: modelos.filter((m) => /^(gpt|o\d)/.test(m) && !m.includes('image') && !m.includes('audio') && !m.includes('realtime')).slice(0, 40),
    })
  } catch (causa) {
    return NextResponse.json({
      ...base,
      chaveValida: false,
      erro: semChave(causa instanceof Error ? causa.message : String(causa)),
    })
  }
}
