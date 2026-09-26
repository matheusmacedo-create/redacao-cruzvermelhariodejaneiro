/**
 * Confere as regras dos banners da Área do Voluntário: `npx tsx scripts/conferir-banners.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import { bannerNoAr, caminhoValido, lerLink, ordenarBanners, situacaoDoBanner } from '../lib/banners/regras'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) { falhas++; console.log(`FALHOU ${nome}: ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`) }
}

const hoje = '2026-09-26'
confere('ligado sem período', bannerNoAr({ ativo: true, inicio: null, fim: null }, hoje), true)
confere('desligado', bannerNoAr({ ativo: false, inicio: null, fim: null }, hoje), false)
confere('começa hoje', bannerNoAr({ ativo: true, inicio: hoje, fim: null }, hoje), true)
confere('termina hoje', bannerNoAr({ ativo: true, inicio: null, fim: hoje }, hoje), true)
confere('começa amanhã', bannerNoAr({ ativo: true, inicio: '2026-09-27', fim: null }, hoje), false)
confere('terminou ontem', bannerNoAr({ ativo: true, inicio: null, fim: '2026-09-25' }, hoje), false)
confere('situação agendado', situacaoDoBanner({ ativo: true, inicio: '2026-10-01', fim: null }, hoje), 'agendado')
confere('situação encerrado', situacaoDoBanner({ ativo: true, inicio: null, fim: '2026-09-01' }, hoje), 'encerrado')
confere('situação desligado vence agendado', situacaoDoBanner({ ativo: false, inicio: '2026-10-01', fim: null }, hoje), 'desligado')

confere('ordem', ordenarBanners([
  { id: 'a', ordem: 1, created_at: '2026-09-01' },
  { id: 'b', ordem: 0, created_at: '2026-08-01' },
  { id: 'c', ordem: 1, created_at: '2026-09-10' },
]).map((b) => b.id), ['b', 'c', 'a'])

confere('link vazio', lerLink('  '), { url: null })
confere('link interno', lerLink('/membro/oportunidades'), { url: '/membro/oportunidades' })
confere('link raiz membro', lerLink('/membro'), { url: '/membro' })
confere('link https', lerLink('https://cruzvermelhariodejaneiro.org/doe'), { url: 'https://cruzvermelhariodejaneiro.org/doe' })
confere('recusa http', lerLink('http://exemplo.org').erro !== undefined, true)
confere('recusa javascript', lerLink('javascript:alert(1)').erro !== undefined, true)
confere('recusa //', lerLink('//exemplo.org').erro !== undefined, true)
confere('recusa /membros', lerLink('/membrosx').erro !== undefined, true)
confere('recusa /dashboard', lerLink('/dashboard').erro !== undefined, true)

const ws = '11111111-2222-3333-4444-555555555555'
confere('caminho ok', caminhoValido(`${ws}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`, ws), true)
confere('caminho de outro espaço', caminhoValido(`99999999-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`, ws), false)
confere('caminho com ..', caminhoValido(`${ws}/../x.jpg`, ws), false)
confere('extensão errada', caminhoValido(`${ws}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.gif`, ws), false)

console.log(falhas ? `${falhas} falha(s).` : 'Banners: tudo certo.')
process.exit(falhas ? 1 : 0)
