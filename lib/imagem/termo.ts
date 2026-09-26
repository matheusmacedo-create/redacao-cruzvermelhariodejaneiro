/**
 * O termo de autorização de uso de imagem que a pessoa assina pelo link.
 *
 * MINUTA: o texto deve ser revisado pelo Jurídico da filial. Mudou o texto,
 * muda a VERSÃO — nunca edite o texto de uma versão já assinada: a
 * impressão digital (hash) de cada assinatura aponta para o texto exato que a
 * pessoa leu, e o próprio banco guarda uma cópia de cada versão
 * (imagem_termo_versoes) na primeira assinatura.
 *
 * O texto é genérico de propósito. O que muda de pessoa para pessoa — nome,
 * finalidades marcadas, a ação e as fotos — entra no "documento assinado"
 * (lib/imagem/regras.ts, documentoCanonico), que também vira hash.
 */
import { createHash } from 'node:crypto'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'

export const TERMO_VERSAO = '2026-09-v1'

export const TITULO_DO_TERMO = 'Termo de autorização de uso de imagem e voz'

/** Os parágrafos do termo, na ordem em que aparecem. */
export const PARAGRAFOS_DO_TERMO: readonly string[] = [
  `Autorizo a ${DADOS_DA_FILIAL.nome} (CNPJ ${DADOS_DA_FILIAL.cnpj}) a usar a minha imagem e a minha voz captadas nas fotos e nos vídeos mostrados nesta página, da ação indicada acima.`,
  'O uso é só para as finalidades que eu marquei neste formulário, sempre para divulgar e prestar contas das atividades humanitárias da Cruz Vermelha, sem fins comerciais e sem venda da minha imagem a terceiros.',
  'A autorização é gratuita: não recebo e não receberei pagamento por ela.',
  'A autorização vale por prazo indeterminado, até que eu a revogue.',
  'Posso revogar a qualquer momento, pelo link do comprovante que recebo ao assinar ou pedindo à filial. Depois da revogação, a minha imagem não é usada em peças novas e é retirada dos canais digitais da filial quando isso for possível; o que já tiver sido impresso, distribuído ou publicado por terceiros antes da revogação não precisa ser recolhido.',
  'A minha imagem não será usada de forma que me exponha a situação humilhante, vexatória ou contrária aos Princípios Fundamentais da Cruz Vermelha.',
  `Os meus dados (nome, contato, assinatura e o registro do aparelho usado) são tratados pela filial só para comprovar esta autorização, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), e acessados apenas pela equipe da filial. Dúvidas e pedidos: ${DADOS_DA_FILIAL.email}.`,
  'Quando a pessoa retratada tem menos de 18 anos, quem assina é o pai, a mãe ou o responsável legal, que declara ter esse poder.',
  'Aceito assinar eletronicamente. Ficam registrados a data e a hora, o endereço de internet (IP), o aparelho usado e a impressão digital (hash) deste texto e do que eu preenchi.',
]

export const textoDoTermo = () => [TITULO_DO_TERMO, `Versão ${TERMO_VERSAO}`, ...PARAGRAFOS_DO_TERMO].join('\n\n')

export const hashDoTermo = () => createHash('sha256').update(textoDoTermo(), 'utf8').digest('hex')
