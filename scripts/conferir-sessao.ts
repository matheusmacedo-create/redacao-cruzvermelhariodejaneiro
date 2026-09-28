// Conferência do pacote da sessão (lib/sessao/pacote.ts).
// Rode com: npx tsx scripts/conferir-sessao.ts
import { chatDoPacotePronto, lerPacoteDaSessao } from '../lib/sessao/pacote'

let falhas = 0
const igual = (obtido: unknown, esperado: unknown, nome: string) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.error(`FALHOU: ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
}

const WS = '7cbe994e-60db-42fa-b2da-db2429af4c45'
const completo = {
  profile: { id: 'u1', full_name: 'Ana', active: true, trocar_senha: false },
  memberships: [{ role: 'editor', coordination: 'Presidência', workspaces: { id: WS, name: 'CVB-RJ', slug: 'cvrj', kind: 'production', mfa_obrigatorio_para: ['admin'] } }],
  workspace_id: WS,
  acessos: { financeiro: { nivel: 'lancar', entidade_id: null }, patrimonio: null, participantes: 'gerenciar', equipe: null },
  leitor_de_acessos: false, avaliador_de_envios: true, escola_tem_entidade: true,
  entidades: [{ id: 'e1', nome: 'Filial', razao_social: null, cnpj: null, tipo: 'filial', principal: true, fechado_ate: null }],
  notificacoes: [{ id: 'n1', title: 'Oi', message: null, link: '/x', read_at: null, created_at: '2026-09-28T00:00:00Z' }],
  nao_lidas: 3, aprovacoes_pendentes: '2',
  chat: [{ id: 'c1', geral: true, nao_lidas: 0 }],
  pessoas: [{ user_id: 'u1', profiles: { full_name: 'Ana', username: 'ana', initials: 'AN', color: null, avatar_path: null, active: true } }, { user_id: 7 }],
  inicio: [{ id: 'pautas', visivel: true }],
}
const p = lerPacoteDaSessao(completo)!
igual(Boolean(p), true, 'pacote completo é lido')
igual(p.memberships[0].workspaces.kind, 'production', 'vínculo com o espaço')
igual(p.memberships[0].workspaces.mfa_obrigatorio_para, ['admin'], 'verificação obrigatória por papel')
igual(p.acessos.financeiro, { nivel: 'lancar', entidade_id: null }, 'acesso ao Financeiro')
igual(p.acessos.participantes, 'gerenciar', 'acesso aos voluntários')
igual(p.acessos.patrimonio, null, 'sem acesso ao Patrimônio')
igual(p.avaliadorDeEnvios, true, 'avaliador de envios')
igual(p.naoLidas, 3, 'não lidas')
igual(p.aprovacoesPendentes, 2, 'contagem que veio como texto (bigint) vira número')
igual(p.pessoas.length, 1, 'pessoa sem user_id é descartada')
igual(p.inicio, [{ id: 'pautas', visivel: true }], 'blocos do Início')
igual(chatDoPacotePronto(p), true, 'chat com o canal geral está pronto')
igual(chatDoPacotePronto(lerPacoteDaSessao({ ...completo, chat: [] })), false, 'sem canal geral, o layout prepara o chat')

igual(lerPacoteDaSessao(null), null, 'null não é pacote')
igual(lerPacoteDaSessao({}), null, 'objeto vazio não é pacote')
igual(lerPacoteDaSessao({ profile: null, memberships: [] }), null, 'sem perfil não é pacote')
igual(lerPacoteDaSessao({ profile: { id: 'u1' }, memberships: 'x' }), null, 'vínculos que não são lista: não é pacote')
const minimo = lerPacoteDaSessao({ profile: { id: 'u1' }, memberships: [] })!
igual(minimo.memberships, [], 'sem vínculo: lista vazia (a sessão vira null como antes)')
igual(minimo.acessos, { financeiro: null, patrimonio: null, participantes: null, equipe: null }, 'sem acessos: tudo null')
igual(minimo.entidades, [], 'sem empresas')
igual(minimo.leitorDeAcessos, false, 'campos ausentes viram falso')
igual(lerPacoteDaSessao({ profile: { id: 'u1' }, memberships: [{ role: 'admin' }] })!.memberships, [], 'vínculo sem espaço é descartado')
igual(lerPacoteDaSessao({ profile: { id: 'u1' }, memberships: [], acessos: { financeiro: { entidade_id: 'x' } } })!.acessos.financeiro, null, 'acesso ao Financeiro sem nível não vale')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Sessão: tudo certo.')
