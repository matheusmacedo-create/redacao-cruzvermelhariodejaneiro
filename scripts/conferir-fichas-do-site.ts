/**
 * Confere as regras puras da importação das fichas de voluntariado do site
 * (lib/voluntariado/fichas-do-site-regras.ts). Não toca em banco nem em rede.
 *
 * Uso: npx tsx --tsconfig tsconfig.json scripts/conferir-fichas-do-site.ts
 */
import {
  camposDaFicha, deveImportar, disponibilidadeDaFicha, linkDoWhatsapp, mensagemDoCodigo, observacoesDaFicha,
  telefoneFormatado, urlDeConferencia, versaoDoTermo, type FichaDoSite,
} from '../lib/voluntariado/fichas-do-site-regras'

let falhas = 0
let total = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  total++
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) { falhas++; console.log(`FALHOU ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
  else console.log(`ok   ${nome}`)
}

const base: FichaDoSite = {
  id: 7, protocolo: 'VOL-261027-0007', situacao: 'nova', criado_em: '2026-10-27T15:00:00Z', nome: '  Maria da Silva ', data_nascimento: '1990-05-20',
  email: ' Maria@Exemplo.org ', telefone: '21998765432', cpf: '529.982.247-25', cidade: 'Rio de Janeiro', bairro: 'Tijuca', estado: 'RJ',
  escolaridade: 'Superior completo', profissao: 'Professora', formacao_saude: 'Técnica de enfermagem', experiencia: 'Escola do bairro.', habilidades: 'Inglês',
  frentes: ['Juventude', 'Comunicação'], dias: ['Segunda', 'Sábado'], periodos: ['Manhã', 'Noite'], motivacao: 'Quero ajudar.', como_conheceu: 'Instagram',
  aceita_contato: true, consentimento_em: '2026-10-27T15:00:00Z', politica_versao: '2026-10-27', selfie: null, codigo_aprovacao: null,
}

confere('importa nova, em análise e entrevista; não importa aceita, recusada e arquivada',
  ['nova', 'em_analise', 'entrevista', 'aceita', 'recusada', 'arquivada'].map((s) => deveImportar({ situacao: s })), [true, true, true, false, false, false])
confere('telefone formatado (11 e 10 dígitos; outro tamanho volta como veio)',
  [telefoneFormatado('21998765432'), telefoneFormatado('2133334444'), telefoneFormatado('123')], ['(21) 99876-5432', '(21) 3333-4444', '123'])
confere('disponibilidade: período em dia útil, sábado e domingo nas opções da Redação',
  disponibilidadeDaFicha(['Segunda', 'Sábado', 'Domingo'], ['Manhã', 'Noite']), ['Manhãs em dias úteis', 'Noites em dias úteis', 'Sábados', 'Domingos e feriados'])
confere('disponibilidade: só fim de semana não vira período de dia útil', disponibilidadeDaFicha(['Sábado'], ['Tarde']), ['Sábados'])
const c = camposDaFicha(base)
confere('campos: nome aparado, e-mail minúsculo, telefone, nascimento, UF, CPF só dígitos, frentes como habilidades',
  [c.nome, c.email, c.telefone, c.data_nascimento, c.uf, c.cpf, c.habilidades], ['Maria da Silva', 'maria@exemplo.org', '(21) 99876-5432', '1990-05-20', 'RJ', '52998224725', ['Juventude', 'Comunicação']])
confere('campos: CPF inválido e UF fora da lista ficam de fora', [camposDaFicha({ ...base, cpf: '111.111.111-11', estado: 'XX' }).cpf, camposDaFicha({ ...base, estado: 'XX' }).uf], [undefined, undefined])
confere('campos: nada de saúde (no site é formação profissional, vai nas observações)', ['restricoes_saude', 'tipo_sanguineo'].some((k) => k in c), false)
const obs = observacoesDaFicha(base)
confere('observações: protocolo, frentes, escolaridade, formação, motivação', ['VOL-261027-0007', 'Frentes de interesse: Juventude, Comunicação', 'Escolaridade: Superior completo', 'Formação na área da saúde: Técnica de enfermagem', 'Motivação:\nQuero ajudar.'].map((t) => obs.includes(t)), [true, true, true, true, true])
confere('observações: até 4000 caracteres', observacoesDaFicha({ ...base, motivacao: 'x'.repeat(5000) }).length, 4000)
confere('versão do termo: a revisão da política do site, até 40 caracteres', versaoDoTermo(base), 'site:privacidade 2026-10-27')
const url = urlDeConferencia('U3FQW4BB')
confere('URL de conferência do site', url, 'https://cruzvermelhariodejaneiro.org/conferir/?c=U3FQW4BB')
const msg = mensagemDoCodigo('maria da Silva', 'U3FQW4BB', url)
confere('mensagem: primeiro nome com maiúscula, código formatado e o link', [msg.startsWith('Olá, Maria!'), msg.includes('U3FQ-W4BB'), msg.includes(url)], [true, true, true])
confere('WhatsApp: 55 na frente do número brasileiro; telefone curto não gera link',
  [linkDoWhatsapp('(21) 99876-5432', 'oi'), linkDoWhatsapp('123', 'oi')], ['https://wa.me/5521998765432?text=oi', null])

console.log(`\n${total} conferências, ${falhas} falhas`)
process.exit(falhas ? 1 : 0)
