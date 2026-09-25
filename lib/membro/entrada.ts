/**
 * A entrada na Área do Voluntário (código de 6 dígitos por e-mail) e a
 * renovação do cookie da sessão. Puro, sem 'server-only': a tela de entrada,
 * as actions e o proxy usam os mesmos números e as mesmas regras, e dá para
 * conferir tudo com um script avulso.
 */

import { dentroDe } from './regras'

// ---------------------------------------------------------------- cookie da sessão

export const COOKIE_DO_MEMBRO = 'cvrj_membro'
/** Irmão do cookie da sessão: guarda o dia (UTC) em que o proxy o regravou pela última vez. */
export const COOKIE_DA_RENOVACAO = 'cvrj_membro_renovado'
export const DIAS_DE_SESSAO = 30
/** Cabeçalho da requisição com o caminho pedido, posto pelo proxy só em /membro. */
export const CABECALHO_DO_CAMINHO = 'x-membro-caminho'

/**
 * As opções do cookie da sessão. As mesmas no login e na renovação: com
 * `path` ou `sameSite` diferentes, o navegador guardaria dois cookies com o
 * mesmo nome em vez de trocar um pelo outro.
 */
export const opcoesDoCookieDoMembro = (producao: boolean) => ({
  httpOnly: true, secure: producao, sameSite: 'lax' as const, path: '/', maxAge: DIAS_DE_SESSAO * 86400,
})

export const tokenNoFormato = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t)

/** O dia da regravação ('AAAA-MM-DD', em UTC): basta mudar uma vez a cada 24 h. */
export const diaDaRenovacao = (agora: number) => new Date(agora).toISOString().slice(0, 10)

export const naAreaDoMembro = (caminho: string) => dentroDe(caminho, '/membro')

/**
 * O caminho que o proxy põe no cabeçalho para `exigirMembro()` montar o
 * `?voltar=`. Só da própria área e com tamanho de gente: o destino ainda é
 * conferido de novo por `voltarSeguro()` antes de virar redirecionamento.
 */
export function caminhoParaVoltar(pathname: string, search: string): string | null {
  const caminho = `${pathname}${search}`
  return naAreaDoMembro(pathname) && caminho.length <= 512 ? caminho : null
}

/**
 * O proxy deve regravar o cookie da sessão nesta requisição? O banco já
 * estende a sessão a cada acesso (`membro_sessao`), mas o cookie tinha prazo
 * fixo desde o login: quem usava todo dia caía no 30º. Regrava:
 * - só em GET/HEAD (páginas): uma action (entrar, sair) pode estar gravando ou
 *   apagando o mesmo cookie na mesma resposta, e dois Set-Cookie brigariam;
 * - só na área e fora da entrada (lá o token, se houver, já não vale);
 * - só com token no formato, e no máximo uma vez por dia.
 * O proxy não consulta o banco: regravar um token que já morreu não dá acesso
 * a nada, porque toda página confere a sessão no banco.
 */
export function renovaCookieDoMembro(p: { metodo: string; caminho: string; token: string | undefined; renovadoEm: string | undefined; hoje: string }): boolean {
  if (p.metodo !== 'GET' && p.metodo !== 'HEAD') return false
  if (!naAreaDoMembro(p.caminho) || dentroDe(p.caminho, '/membro/entrar')) return false
  if (!p.token || !tokenNoFormato(p.token)) return false
  return p.renovadoEm !== p.hoje
}

// ---------------------------------------------------------------- o código

export const TAMANHO_DO_CODIGO = 6
/** Quanto o código vale depois de enviado (é o que o banco grava em `expira_em`). */
export const MINUTOS_DO_CODIGO = 10
/** Espera entre um envio e o próximo: o banco aceita só 5 pedidos por hora por e-mail. */
export const SEGUNDOS_PARA_REENVIAR = 60

/**
 * Só os dígitos, no máximo 6. Assim colar "123 456", "123-456" ou o assunto
 * inteiro do e-mail ("123456 é o seu código de acesso") dá o código certo.
 */
export const digitosDoCodigo = (texto: string) => texto.replace(/\D/g, '').slice(0, TAMANHO_DO_CODIGO)

/** Segundos que faltam para liberar o "Reenviar código" (0 a 60). Sem envio conhecido, já libera. */
export function segundosParaReenviar(enviadoEm: number | null | undefined, agora: number): number {
  if (enviadoEm == null || !Number.isFinite(enviadoEm) || !Number.isFinite(agora)) return 0
  const faltam = Math.ceil(SEGUNDOS_PARA_REENVIAR - (agora - enviadoEm) / 1000)
  return Math.min(SEGUNDOS_PARA_REENVIAR, Math.max(0, faltam))
}

/** "0:45", "1:00". */
export const contagemLegivel = (segundos: number) => {
  const s = Math.max(0, Math.floor(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "14h32", no relógio de quem está vendo a tela. */
export const horaLegivel = (instante: number) =>
  new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

/**
 * O erro do banco diz que este código morreu (vencido, já usado ou com as
 * tentativas esgotadas)? Então o botão principal passa a ser "Enviar novo
 * código": insistir no mesmo não adianta. "Código incorreto. Restam N
 * tentativas." não entra aqui.
 */
export const pedeNovoCodigo = (erro: string | null | undefined) => !!erro && /vencido|já usado|esgotad/i.test(erro)

// ---------------------------------------------------------------- o e-mail

export const normalizarEmail = (texto: string) => texto.trim().toLowerCase().slice(0, 254)

/** A mesma conferência leve do banco (`membro_pedir_codigo`), para avisar antes de gastar um pedido. */
export const emailPlausivel = (email: string) => email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

export type AtalhoDoEmail = { rotulo: string; href: string }

/*
 * Busca pelo assunto ("… é o seu código de acesso") e não pelo remetente: o
 * remetente pode mudar por variável de ambiente (VOLUNTARIADO_REMETENTE).
 */
const BUSCA_NO_GMAIL = 'https://mail.google.com/mail/u/0/#search/in%3Aanywhere+%22c%C3%B3digo+de+acesso%22+newer_than%3A1d'
const CAIXA_DO_OUTLOOK = 'https://outlook.live.com/mail/0/'
const GMAIL = new Set(['gmail.com', 'googlemail.com'])
const OUTLOOK = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.com.br', 'hotmail.com.br'])

/**
 * Atalho para a caixa de entrada, pelo domínio do e-mail. Só os webmails
 * pessoais de Google e Microsoft: e-mail de empresa no Google Workspace ou no
 * Microsoft 365 não dá para reconhecer pelo domínio, e um botão que abre a
 * caixa errada atrapalha mais do que ajuda. Abre na web, em nova aba — não
 * prometemos abrir o aplicativo do celular.
 */
export function atalhoDoEmail(email: string): AtalhoDoEmail | null {
  const e = normalizarEmail(email)
  const arroba = e.lastIndexOf('@')
  if (arroba < 1) return null
  const dominio = e.slice(arroba + 1)
  if (GMAIL.has(dominio)) return { rotulo: 'Abrir Gmail', href: BUSCA_NO_GMAIL }
  if (OUTLOOK.has(dominio)) return { rotulo: 'Abrir Outlook', href: CAIXA_DO_OUTLOOK }
  return null
}

// ---------------------------------------------------------------- a etapa guardada no navegador

/**
 * O que a tela guarda no `sessionStorage` para reabrir na etapa do código
 * quando a pessoa volta do aplicativo de e-mail (o Safari do iPhone costuma
 * descartar a aba) ou recarrega a página. Só e-mail e horários — nunca o
 * código. `enviadoEm` é null quando a pessoa disse "Já tenho um código".
 */
export type EtapaSalva = { email: string; enviadoEm: number | null; salvoEm: number }

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Lê o que foi guardado, descartando qualquer coisa fora do formato. */
export function lerEtapaSalva(bruto: string | null | undefined): EtapaSalva | null {
  if (!bruto) return null
  let v: unknown
  try {
    v = JSON.parse(bruto)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const { email, enviadoEm, salvoEm } = v as Record<string, unknown>
  const e = typeof email === 'string' ? normalizarEmail(email) : ''
  const salvo = numero(salvoEm)
  if (!emailPlausivel(e) || salvo === null) return null
  return { email: e, enviadoEm: numero(enviadoEm), salvoEm: salvo }
}

/**
 * Ainda vale reabrir na etapa do código? Só enquanto o código pode valer: 10
 * minutos desde o envio (ou desde que a pessoa disse que já tinha um). Um
 * horário no futuro (relógio mexido) não vale.
 */
export function etapaAindaVale(e: EtapaSalva, agora: number): boolean {
  const desde = e.enviadoEm ?? e.salvoEm
  return agora >= desde - 60_000 && agora - desde < MINUTOS_DO_CODIGO * 60_000
}
