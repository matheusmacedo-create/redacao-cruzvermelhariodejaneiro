/**
 * O selo digital da filial, desenhado: o carimbo redondo da Cruz Vermelha RJ
 * com o número do ofício, a data em que as assinaturas se completaram e a
 * impressão digital da chave que selou. É a face visível de lib/oficios/selo.ts
 * — quem confere de verdade é a assinatura Ed25519 (e o QR code leva à
 * página de conferência).
 *
 * SVG puro, sem imagem externa: sai igual na tela, no PDF do navegador e na
 * impressão.
 */

const VERMELHO = '#e32219'

export function SeloVisual({ numero, data, impressao, valido, tamanho = 148 }: {
  numero: string | null
  /** "26/09/2026" */
  data: string
  /** "A1B2-C3D4-E5F6-0718" */
  impressao: string
  /** false: a assinatura não confere — o selo sai riscado. */
  valido: boolean
  tamanho?: number
}) {
  const cor = valido ? VERMELHO : '#737373'
  return (
    <svg viewBox="0 0 200 200" width={tamanho} height={tamanho} role="img" aria-label={`Selo digital da Cruz Vermelha RJ${numero ? `, ofício ${numero}` : ''}, ${data}${valido ? '' : ' — não confere'}`} className="shrink-0">
      <defs>
        {/* Os textos correm entre os dois círculos (r 84 e 96): em cima, a base no r 86 e as letras para fora; embaixo, a base no r 93 e as letras para dentro. */}
        <path id="selo-arco-cima" d="M 14 100 A 86 86 0 1 1 186 100" />
        <path id="selo-arco-baixo" d="M 7 100 A 93 93 0 0 0 193 100" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="white" stroke={cor} strokeWidth="4" />
      <circle cx="100" cy="100" r="84" fill="none" stroke={cor} strokeWidth="1.2" strokeDasharray={valido ? undefined : '4 3'} />
      <text fill={cor} fontFamily="Helvetica, Arial, sans-serif" fontSize="10.5" fontWeight="700" letterSpacing="0.8">
        <textPath href="#selo-arco-cima" startOffset="50%" textAnchor="middle">CRUZ VERMELHA BRASILEIRA · RJ</textPath>
      </text>
      <text fill={cor} fontFamily="Helvetica, Arial, sans-serif" fontSize="8" fontWeight="700" letterSpacing="0.8">
        <textPath href="#selo-arco-baixo" startOffset="50%" textAnchor="middle">SELO DIGITAL · {impressao}</textPath>
      </text>
      {/* A cruz: vermelha sobre branco, como na marca. */}
      <rect x="88" y="52" width="24" height="64" fill={cor} />
      <rect x="68" y="72" width="64" height="24" fill={cor} />
      <text x="100" y="134" fill="#171717" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" textAnchor="middle">
        {numero ? `OFÍCIO ${numero}` : 'OFÍCIO'}
      </text>
      <text x="100" y="149" fill="#404040" fontFamily="Helvetica, Arial, sans-serif" fontSize="10.5" textAnchor="middle">{data}</text>
      {!valido && <line x1="30" y1="170" x2="170" y2="30" stroke="#b91c1c" strokeWidth="5" />}
    </svg>
  )
}
