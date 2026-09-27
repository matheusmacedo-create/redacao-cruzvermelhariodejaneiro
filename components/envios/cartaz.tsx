import type { CSSProperties } from 'react'
import { CHAMADAS, DECRETO, FORMATOS, NOME_COMPLETO, PASSOS, SITE, VERMELHO, type Formato, type OpcoesDoCartaz } from '@/lib/envios/cartaz'

/**
 * O cartaz do /enviar em todos os formatos e modelos. É o MESMO desenho na
 * tela (e na impressão do A4) e no PNG gerado por /api/envios/cartaz com o
 * next/og (Satori). Por isso: só estilo inline, só flexbox, todo bloco com
 * `display: flex`, nada de grid, fragmento, <br> ou texto misturado com
 * elementos.
 *
 * Identidade: a cruz é sempre vermelha sobre branco. No modelo "Destaque", o
 * fundo é vermelho e a logo e o QR ficam em caixas brancas (manual, pp. 17–20).
 * O nome completo da filial está em toda peça.
 */

export type PropsDoCartaz = OpcoesDoCartaz & {
  /** QR do link, em data URL (PNG). */
  qr: string
  /** A logo oficial: o caminho público na tela, data URL no PNG. */
  logo: string
  /** "palacio.cruzvermelhariodejaneiro.org/enviar" */
  endereco: string
  /** As famílias de fonte: as do next/font na tela, os nomes registrados no PNG. */
  fontes: { texto: string; titulo: string }
  /** Multiplica todas as medidas (o PNG do A4 sai em 2×, para imprimir nítido). */
  escala?: number
}

const PRETO = '#1a1a1a'
const CINZA = '#525252'
const PROPORCAO_DA_LOGO = 1844 / 752

/**
 * As medidas de cada formato, em milésimos da largura da peça (a altura
 * disponível é 1000 × altura ÷ largura: A4 1414, story 1778, feed 1250,
 * quadrado 1000). Conferidas renderizando cada formato com o título e o
 * texto mais longos.
 */
const MEDIDAS: Record<Formato, { margem: [number, number]; logo: number; titulo: number; texto: number; qr: number; passo: number; selo: number }> = {
  a4: { margem: [52, 26], logo: 280, titulo: 80, texto: 26, qr: 280, passo: 27, selo: 26 },
  story: { margem: [72, 34], logo: 330, titulo: 96, texto: 31, qr: 370, passo: 27, selo: 34 },
  feed: { margem: [52, 26], logo: 270, titulo: 84, texto: 28, qr: 270, passo: 28, selo: 28 },
  quadrado: { margem: [56, 30], logo: 250, titulo: 74, texto: 26, qr: 300, passo: 26, selo: 26 },
}

export function Cartaz(p: PropsDoCartaz) {
  const f = FORMATOS[p.formato]
  const m = MEDIDAS[p.formato]
  const e = p.escala ?? 1
  const u = (n: number) => Math.round(((n * f.largura) / 1000) * e * 100) / 100
  const destaque = p.modelo === 'destaque'
  const faixa = p.modelo === 'faixa'
  const corDoTexto = destaque ? '#ffffff' : PRETO
  const corSecundaria = destaque ? 'rgba(255,255,255,0.9)' : CINZA
  const c = CHAMADAS[p.chamada]
  const story = p.formato === 'story'
  const quadrado = p.formato === 'quadrado'
  const a4 = p.formato === 'a4'

  const flex = (s: CSSProperties = {}): CSSProperties => ({ display: 'flex', ...s })
  // Bloco que não encolhe: se faltar espaço, a peça corta embaixo em vez de sobrepor texto.
  const bloco = (s: CSSProperties = {}): CSSProperties => flex({ flexShrink: 0, ...s })
  const caixaBranca = (s: CSSProperties = {}): CSSProperties => bloco({ backgroundColor: '#ffffff', borderRadius: u(16), ...s })
  const condensada = (tamanho: number, s: CSSProperties = {}): CSSProperties => ({ fontFamily: p.fontes.titulo, fontWeight: 700, fontSize: u(tamanho), textTransform: 'uppercase', ...s })

  // ---------------------------------------------------------------- peças
  const imgLogo = <img src={p.logo} alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={u(m.logo)} height={u(m.logo / PROPORCAO_DA_LOGO)} style={{ width: u(m.logo), height: u(m.logo / PROPORCAO_DA_LOGO) }} />
  // Sobre o vermelho, a logo vai numa caixa branca com respiro (a área de proteção do manual).
  const logo = destaque
    ? <div style={caixaBranca({ padding: `${u(12)}px ${u(20)}px`, alignSelf: 'flex-start' })}>{imgLogo}</div>
    : <div style={bloco()}>{imgLogo}</div>

  const selo = p.acao ? (
    <div style={bloco({ alignSelf: 'flex-start', alignItems: 'center', gap: u(12), marginTop: u(26), padding: `${u(9)}px ${u(20)}px`, borderRadius: u(999), backgroundColor: destaque ? '#ffffff' : 'rgba(227,34,25,0.09)', color: VERMELHO, ...condensada(m.selo, { letterSpacing: u(1) }) })}>
      <div style={bloco({ width: u(11), height: u(11), borderRadius: u(11), backgroundColor: VERMELHO })} />
      <div style={flex()}>{p.acao}</div>
    </div>
  ) : null

  const titulo = (
    <div style={bloco({
      flexDirection: 'column', marginTop: u(p.acao ? 22 : 34), lineHeight: 1.02, ...condensada(m.titulo),
      ...(faixa ? { backgroundColor: VERMELHO, color: '#ffffff', marginLeft: -u(70), marginRight: quadrado ? 0 : -u(70), padding: `${u(26)}px ${u(quadrado ? 30 : 70)}px ${u(30)}px ${u(70)}px` } : { color: corDoTexto }),
    })}>
      <div style={flex()}>{c.titulo[0]}</div>
      <div style={flex({ color: faixa || destaque ? '#ffffff' : VERMELHO })}>{c.titulo[1]}</div>
    </div>
  )

  const apoio = (
    <div style={bloco({ marginTop: u(22), fontSize: u(m.texto), lineHeight: 1.38, color: corSecundaria })}>{c.texto}</div>
  )

  const qr = (
    <div style={caixaBranca({ padding: u(18), border: destaque ? 'none' : `${u(8)}px solid ${VERMELHO}` })}>
      <img src={p.qr} alt={`QR code para ${p.endereco}`} width={u(m.qr)} height={u(m.qr)} style={{ width: u(m.qr), height: u(m.qr) }} />
    </div>
  )

  const numero = (i: number) => (
    <div style={bloco({ width: u(52), height: u(52), borderRadius: u(52), alignItems: 'center', justifyContent: 'center', backgroundColor: destaque ? '#ffffff' : VERMELHO, color: destaque ? VERMELHO : '#ffffff', ...condensada(32) })}>{String(i + 1)}</div>
  )
  const textoDoPasso = (forte: string, resto: string) => (
    <div style={flex({ flexDirection: 'column', fontSize: u(m.passo), lineHeight: 1.28, color: corSecundaria })}>
      <div style={flex({ fontWeight: 700, color: corDoTexto })}>{forte}</div>
      <div style={flex()}>{resto}</div>
    </div>
  )
  // Em coluna ao lado do QR (A4 e feed) ou em três colunas embaixo dele (story).
  const passos = story ? (
    <div style={bloco({ gap: u(26), marginTop: u(40) })}>
      {PASSOS.map(([forte, resto], i) => (
        <div key={i} style={flex({ flex: 1, flexDirection: 'column', gap: u(14) })}>{numero(i)}{textoDoPasso(forte, resto)}</div>
      ))}
    </div>
  ) : (
    <div style={flex({ flex: 1, flexDirection: 'column', gap: u(28) })}>
      {PASSOS.map(([forte, resto], i) => (
        <div key={i} style={flex({ alignItems: 'flex-start', gap: u(20) })}>{numero(i)}{textoDoPasso(forte, resto)}</div>
      ))}
    </div>
  )

  const endereco = (
    <div style={bloco({ flexDirection: 'column', marginTop: u(28), fontSize: u(a4 ? 22 : 24), lineHeight: 1.4, color: corSecundaria })}>
      <div style={flex({ gap: u(8), flexWrap: 'wrap' })}>
        <div style={flex()}>Sem câmera? Digite</div>
        <div style={flex({ fontWeight: 700, color: corDoTexto })}>{p.endereco}</div>
      </div>
      {a4 ? <div style={flex()}>Sem login e sem aplicativo. Só mande imagens de pessoas que autorizaram o uso.</div> : null}
    </div>
  )

  const rodape = (
    <div style={bloco({
      flexDirection: 'column', gap: u(4), padding: `${u(20)}px ${u(70)}px ${u(story ? 40 : 24)}px`,
      borderTop: `${u(2)}px solid ${destaque ? 'rgba(255,255,255,0.35)' : '#e5e5e5'}`,
      color: corSecundaria, fontSize: u(a4 ? 21 : 23), lineHeight: 1.3,
    })}>
      <div style={flex({ fontWeight: 700, color: corDoTexto })}>{NOME_COMPLETO}</div>
      <div style={flex({ fontSize: u(a4 ? 16 : 20) })}>{a4 ? `${SITE} · ${DECRETO}` : SITE}</div>
    </div>
  )

  // ---------------------------------------------------------------- composição por formato
  const espaco = <div style={flex({ flex: 1 })} />
  let miolo
  if (story) {
    miolo = [logo, selo, titulo, apoio, espaco, <div key="qr" style={bloco({ justifyContent: 'center', marginTop: u(30) })}>{qr}</div>, passos, endereco]
  } else if (quadrado) {
    miolo = [
      logo, espaco,
      <div key="meio" style={flex({ gap: u(44), alignItems: 'center' })}>
        <div style={flex({ flex: 1, flexDirection: 'column' })}>{selo}{titulo}{apoio}</div>
        <div style={bloco({ flexDirection: 'column', alignItems: 'center', gap: u(14) })}>
          {qr}
          <div style={flex({ color: corDoTexto, ...condensada(28, { letterSpacing: u(1) }) })}>Aponte a câmera</div>
        </div>
      </div>,
      espaco, endereco,
    ]
  } else {
    // A4 e feed: título em cima, QR e passos lado a lado.
    miolo = [
      logo, selo, titulo, apoio, espaco,
      <div key="qr" style={bloco({ alignItems: 'center', gap: u(48), marginTop: u(28) })}>{qr}{passos}</div>,
      a4 ? (
        <div key="vale" style={bloco({ marginTop: u(30), flexDirection: 'column', padding: `${u(20)}px ${u(28)}px`, borderRadius: u(12), backgroundColor: '#f5f5f5' })}>
          <div style={flex({ color: VERMELHO, ...condensada(22, { letterSpacing: u(2) }) })}>O que vale mandar</div>
          <div style={flex({ marginTop: u(10), flexWrap: 'wrap', rowGap: u(6), fontSize: u(22), color: PRETO })}>
            {['Atendimentos e ações de saúde', 'Treinamentos e cursos', 'Campanhas e arrecadações', 'Eventos, visitas e parcerias'].map((t) => (
              <div key={t} style={flex({ alignItems: 'center', gap: u(10), width: '50%' })}>
                <div style={bloco({ width: u(10), height: u(10), backgroundColor: VERMELHO })} />
                <div style={flex()}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null,
      endereco,
    ]
  }

  return (
    <div style={flex({ width: f.largura * e, height: f.altura * e, flexDirection: 'column', overflow: 'hidden', backgroundColor: destaque ? VERMELHO : '#ffffff', color: corDoTexto, fontFamily: p.fontes.texto })}>
      {/* Filete do alto: branco com a linha vermelha; no destaque, o próprio fundo já é a marca. */}
      {destaque ? null : <div style={bloco({ height: u(12), backgroundColor: VERMELHO })} />}
      <div style={flex({ flex: 1, flexDirection: 'column', overflow: 'hidden', padding: `${u(m.margem[0])}px ${u(70)}px ${u(m.margem[1])}px` })}>
        {miolo.map((parte, i) => (parte ? <div key={i} style={flex({ flexDirection: 'column', flexShrink: parte === espaco ? 1 : 0, flexGrow: parte === espaco ? 1 : 0 })}>{parte}</div> : null))}
      </div>
      {rodape}
    </div>
  )
}
