/**
 * Da linha do banco para o que as telas da Imprensa leem.
 *
 * A lista de contatos e a ficha de um contato leem a mesma tabela: as colunas
 * e a conversão moram aqui para as duas não divergirem. Módulo puro (sem
 * banco): quem consulta é a página.
 */
import type { ContatoDeImprensa } from '@/app/actions/imprensa'
import { lerCriterio, type ListaDeImprensa } from './listas'
import { comoBaseLegal, comoCanal, comoRelevancia, comoTipoDeContato, comoTipoDeVeiculo, type VeiculoDeImprensa } from './vocabulario'

/** Uma linha como a API do banco devolve: sem tipo gerado, cada campo é conferido aqui. */
type Linha = Record<string, unknown>

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const textoOuNulo = (v: unknown) => (typeof v === 'string' ? v : null)
const numero = (v: unknown) => (typeof v === 'number' ? v : 0)
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : [])

export const COLUNAS_DO_CONTATO = [
  'id', 'nome', 'veiculo', 'cargo', 'dominio', 'email', 'email_status', 'confianca', 'telefone', 'tags', 'notas', 'fonte',
  'verificado_em', 'created_by', 'updated_at', 'descadastrado_em', 'devolvido_em', 'motivo_da_devolucao', 'ultimo_envio_em',
  'ultima_abertura_em', 'envios_sem_abertura', 'total_envios', 'total_aberturas',
  'veiculo_id', 'editorias', 'praca', 'tipo_de_contato', 'canal_preferido', 'whatsapp', 'origem_do_dado', 'base_legal',
].join(',')

export function comoContato(c: Linha): ContatoDeImprensa {
  return {
    id: texto(c.id),
    nome: texto(c.nome),
    veiculo: texto(c.veiculo),
    cargo: texto(c.cargo),
    dominio: texto(c.dominio),
    email: textoOuNulo(c.email),
    emailStatus: (['valido', 'arriscado', 'invalido'] as const).find((s) => s === c.email_status) ?? 'nao_verificado',
    confianca: typeof c.confianca === 'number' ? c.confianca : null,
    telefone: texto(c.telefone),
    tags: lista(c.tags),
    notas: texto(c.notas),
    fonte: (['hunter_dominio', 'hunter_email_finder', 'importado'] as const).find((f) => f === c.fonte) ?? 'manual',
    verificadoEm: textoOuNulo(c.verificado_em),
    criadoPor: textoOuNulo(c.created_by),
    atualizadoEm: texto(c.updated_at),
    descadastradoEm: textoOuNulo(c.descadastrado_em),
    devolvidoEm: textoOuNulo(c.devolvido_em),
    motivoDaDevolucao: texto(c.motivo_da_devolucao),
    ultimoEnvioEm: textoOuNulo(c.ultimo_envio_em),
    ultimaAberturaEm: textoOuNulo(c.ultima_abertura_em),
    enviosSemAbertura: numero(c.envios_sem_abertura),
    totalEnvios: numero(c.total_envios),
    totalAberturas: numero(c.total_aberturas),
    veiculoId: textoOuNulo(c.veiculo_id),
    editorias: lista(c.editorias),
    praca: texto(c.praca),
    tipoDeContato: comoTipoDeContato(c.tipo_de_contato),
    canalPreferido: comoCanal(c.canal_preferido),
    whatsapp: texto(c.whatsapp),
    origemDoDado: texto(c.origem_do_dado),
    baseLegal: comoBaseLegal(c.base_legal),
  }
}

export const COLUNAS_DO_VEICULO = 'id,nome,tipo,praca,dominio,relevancia,notas,created_by,updated_at'

export function comoVeiculo(v: Linha): VeiculoDeImprensa {
  return {
    id: texto(v.id),
    nome: texto(v.nome),
    tipo: comoTipoDeVeiculo(v.tipo),
    praca: texto(v.praca),
    dominio: texto(v.dominio),
    relevancia: comoRelevancia(v.relevancia),
    notas: texto(v.notas),
    criadoPor: textoOuNulo(v.created_by),
    atualizadoEm: texto(v.updated_at),
  }
}

export const COLUNAS_DA_LISTA = 'id,nome,descricao,tipo,criterio,plantao,created_by,updated_at'

export function comoLista(l: Linha): ListaDeImprensa {
  return {
    id: texto(l.id),
    nome: texto(l.nome),
    descricao: texto(l.descricao),
    tipo: l.tipo === 'filtro' ? 'filtro' : 'fixa',
    criterio: lerCriterio(l.criterio),
    plantao: l.plantao === true,
    criadaPor: textoOuNulo(l.created_by),
    atualizadaEm: texto(l.updated_at),
  }
}
