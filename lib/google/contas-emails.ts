import { montar, type EmailPronto } from '@/lib/contas/emails'

/**
 * O aviso de quem criou a própria conta do Google pelo link: um e-mail só,
 * para o e-mail pessoal, com o endereço novo, a senha provisória e o passo
 * a passo. É a exceção assumida (15/10/2026) à regra "nenhum e-mail leva
 * senha" de lib/contas/emails.ts: para a conta do Google não existe link de
 * uso único, a senha é provisória e o Google obriga a troca no primeiro
 * acesso; e um canal só é mais simples de explicar à equipe do que dois.
 * Módulo puro: só monta texto.
 */

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

export function emailDeContaDoGoogle(p: { nome: string; email: string; senha: string; setor: string; grupo: string | null; caixaDoSetor?: { nome: string; email: string; senha: string } | null }): EmailPronto {
  return montar({
    assunto: 'Seu e-mail da Cruz Vermelha RJ está pronto',
    preheader: `${p.email} já existe. Aqui está a senha provisória e como entrar.`,
    titulo: `Seu e-mail está pronto, ${primeiroNome(p.nome)}`,
    blocos: [
      { tipo: 'p', texto: `Este é o seu endereço de e-mail na Cruz Vermelha Brasileira, filial do Rio de Janeiro, no setor ${p.setor}:` },
      { tipo: 'destaque', texto: p.email },
      { tipo: 'p', texto: 'E esta é a sua senha provisória. Ela vale só para o primeiro acesso: o Google pede uma senha nova assim que você entrar.' },
      { tipo: 'destaque', texto: p.senha },
      { tipo: 'botao', rotulo: 'Entrar no Gmail', url: 'https://mail.google.com' },
      { tipo: 'item', titulo: '1. Entre', texto: 'Em mail.google.com, use o endereço e a senha provisória acima. Se já houver outra conta Google aberta, use "Adicionar outra conta".' },
      { tipo: 'item', titulo: '2. Crie a sua senha', texto: 'O Google pede uma senha nova na hora. Escolha uma só sua, com pelo menos 8 caracteres, e guarde num lugar seguro. Depois disso, apague este e-mail.' },
      { tipo: 'item', titulo: '3. No celular', texto: 'Baixe o app do Gmail (Android ou iPhone) e entre com o mesmo endereço. Os e-mails chegam como notificação.' },
      ...(p.grupo ? [{ tipo: 'item' as const, titulo: '4. O e-mail do seu setor', texto: `Você já recebe na sua caixa o que chega em ${p.grupo}. Para responder em nome do setor, no Gmail abra Configurações › Contas › "Enviar e-mail como" e adicione ${p.grupo}.` }] : []),
      ...(p.caixaDoSetor ? [
        { tipo: 'p' as const, texto: `Como coordenador(a), você também cuida da caixa própria do setor ${p.caixaDoSetor.nome}. É uma conta à parte, com caixa privada:` },
        { tipo: 'destaque' as const, texto: p.caixaDoSetor.email },
        { tipo: 'p' as const, texto: 'Senha provisória da caixa do setor (também só para o primeiro acesso):' },
        { tipo: 'destaque' as const, texto: p.caixaDoSetor.senha },
        { tipo: 'item' as const, titulo: 'Entrar na caixa do setor', texto: 'No Gmail, use "Adicionar outra conta" e entre com esse endereço e essa senha. Troque a senha na hora, como na sua conta.' },
      ] : []),
      { tipo: 'nota', texto: 'Esqueceu a senha depois de trocar? Na tela de entrada do Google, "Esqueceu a senha?" manda um código para o celular que você informou. Ninguém da equipe vai pedir a sua senha por e-mail ou telefone.' },
    ],
  })
}
