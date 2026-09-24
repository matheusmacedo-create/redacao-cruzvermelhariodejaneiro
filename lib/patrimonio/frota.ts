/**
 * Regras da Frota, sem banco nem rede — dá para conferir com tsx. O banco
 * (frota_*) confere de novo CNH, curso de emergência, km e viagem aberta.
 */

import { diasAte } from './estoque'

export const TIPOS_DE_VEICULO = {
  ambulancia: 'Ambulância', carro: 'Carro', van: 'Van', caminhonete: 'Caminhonete', caminhao: 'Caminhão', moto: 'Moto', barco: 'Barco', outro: 'Outro',
} as const
export type TipoDeVeiculo = keyof typeof TIPOS_DE_VEICULO

export const COMBUSTIVEIS = { flex: 'Flex', gasolina: 'Gasolina', etanol: 'Etanol', diesel: 'Diesel', gnv: 'GNV', eletrico: 'Elétrico' } as const
export type Combustivel = keyof typeof COMBUSTIVEIS

export const SITUACOES_DO_VEICULO = {
  ativo: { rotulo: 'Disponível', classe: 'bg-success/15 text-success' },
  manutencao: { rotulo: 'Em manutenção', classe: 'bg-warning/20 text-warning-foreground' },
  inativo: { rotulo: 'Fora de uso', classe: 'bg-muted text-muted-foreground' },
} as const

export const CATEGORIAS_CNH = ['A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'] as const
export type CategoriaCnh = (typeof CATEGORIAS_CNH)[number]

export const FINALIDADES_DE_USO = {
  atendimento: 'Atendimento / emergência', evento: 'Evento (posto médico)', transporte_doacoes: 'Transporte de doações', administrativo: 'Administrativo',
  treinamento: 'Treinamento', manutencao: 'Levar à oficina', outro: 'Outro',
} as const
export type FinalidadeDeUso = keyof typeof FINALIDADES_DE_USO

export const TIPOS_DE_SERVICO = { preventiva: 'Preventiva', corretiva: 'Corretiva (conserto)', pneus: 'Pneus', funilaria: 'Funilaria e pintura', vistoria: 'Vistoria', outro: 'Outro' } as const
export type TipoDeServico = keyof typeof TIPOS_DE_SERVICO

export const TIPOS_DE_DOCUMENTO = {
  crlv: 'CRLV', licenciamento: 'Licenciamento anual', ipva: 'IPVA', seguro: 'Seguro', dpvat: 'Seguro obrigatório', vistoria: 'Vistoria (Detran / Vigilância Sanitária)',
  tacografo: 'Aferição do tacógrafo', outro: 'Outro',
} as const
export type TipoDeDocumento = keyof typeof TIPOS_DE_DOCUMENTO

const ehChave = <T extends object>(o: T) => (v: unknown): v is keyof T => typeof v === 'string' && Object.hasOwn(o, v)
export const ehTipoDeVeiculo = ehChave(TIPOS_DE_VEICULO)
export const ehCombustivel = ehChave(COMBUSTIVEIS)
export const ehFinalidadeDeUso = ehChave(FINALIDADES_DE_USO)
export const ehTipoDeServico = ehChave(TIPOS_DE_SERVICO)
export const ehTipoDeDocumento = ehChave(TIPOS_DE_DOCUMENTO)
export const ehCategoriaCnh = (c: unknown): c is CategoriaCnh => typeof c === 'string' && (CATEGORIAS_CNH as readonly string[]).includes(c)

/** "abc-1d23" → "ABC1D23"; null se não for placa (antiga ou Mercosul). */
export function lerPlaca(texto: string): string | null {
  const p = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p) ? p : null
}
export const placaLegivel = (p: string) => (/^[A-Z]{3}[0-9]{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p)

export const km = (n: number) => `${n.toLocaleString('pt-BR')} km`

/** AAAA-MM-DD + n meses (dia 31 em mês curto vai para o último dia). */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

export type Vencimento = 'vencido' | 'vencendo' | 'ok'
export function situacaoDoVencimento(data: string | null, hoje: string, antes = 30): Vencimento | null {
  if (!data) return null
  const d = diasAte(data, hoje)
  return d < 0 ? 'vencido' : d <= antes ? 'vencendo' : 'ok'
}

export type Plano = { nome: string; a_cada_km: number | null; a_cada_meses: number | null; ultima_km: number | null; ultima_data: string | null; ativo?: boolean }
export type SituacaoDoPlano = { situacao: 'vencido' | 'proximo' | 'ok' | 'sem_registro'; proximaKm: number | null; proximaData: string | null; faltaKm: number | null; faltaDias: number | null }

/** O que vence primeiro manda: km ou data. "Próximo": faltam até 1.000 km ou 30 dias. */
export function situacaoDoPlano(p: Plano, kmAtual: number, hoje: string): SituacaoDoPlano {
  const proximaKm = p.a_cada_km && p.ultima_km !== null ? p.ultima_km + p.a_cada_km : null
  const proximaData = p.a_cada_meses && p.ultima_data ? somarMeses(p.ultima_data, p.a_cada_meses) : null
  const faltaKm = proximaKm !== null ? proximaKm - kmAtual : null
  const faltaDias = proximaData ? diasAte(proximaData, hoje) : null
  if (proximaKm === null && proximaData === null) return { situacao: 'sem_registro', proximaKm, proximaData, faltaKm, faltaDias }
  const vencido = (faltaKm !== null && faltaKm <= 0) || (faltaDias !== null && faltaDias < 0)
  const proximo = (faltaKm !== null && faltaKm <= 1000) || (faltaDias !== null && faltaDias <= 30)
  return { situacao: vencido ? 'vencido' : proximo ? 'proximo' : 'ok', proximaKm, proximaData, faltaKm, faltaDias }
}

export type Abastecimento = { km: number; litros: number; valor: number; tanque_cheio: boolean; data: string }

/**
 * Consumo pelo método do tanque cheio: entre dois abastecimentos de tanque
 * cheio, o km rodado dividido pelos litros postos depois do primeiro (até o
 * segundo, inclusive os parciais). Usa o trecho mais longo possível.
 */
export function consumoMedio(lista: Abastecimento[]): { kmPorLitro: number; km: number; litros: number } | null {
  const a = [...lista].sort((x, y) => x.km - y.km || x.data.localeCompare(y.data))
  const cheios = a.map((x, i) => (x.tanque_cheio ? i : -1)).filter((i) => i >= 0)
  if (cheios.length < 2) return null
  const ini = cheios[0], fim = cheios[cheios.length - 1]
  const rodado = a[fim].km - a[ini].km
  const litros = a.slice(ini + 1, fim + 1).reduce((s, x) => s + x.litros, 0)
  if (rodado <= 0 || litros <= 0) return null
  return { kmPorLitro: Math.round((rodado / litros) * 10) / 10, km: rodado, litros: Math.round(litros * 100) / 100 }
}

/** Custo por km num período: combustível + serviços, dividido pelo km rodado no período. */
export function custoPorKm(combustivel: number, servicos: number, kmRodado: number): number | null {
  if (kmRodado <= 0) return null
  return Math.round(((combustivel + servicos) / kmRodado) * 100) / 100
}

export type Condutor = { nome: string; cnh_categoria: string; cnh_validade: string; emergencia_validade: string | null; ativo: boolean }

/** Por que este condutor não pode levar este veículo hoje (o banco confere igual). null = pode. */
export function impedimento(c: Condutor, tipo: string, hoje: string): string | null {
  if (!c.ativo) return 'condutor inativo'
  if (c.cnh_validade < hoje) return 'CNH vencida'
  if (tipo === 'ambulancia' && (!c.emergencia_validade || c.emergencia_validade < hoje)) return 'sem curso de veículo de emergência válido'
  const cat = c.cnh_categoria
  if (tipo === 'caminhao' && !/[CDE]/.test(cat)) return 'caminhão pede CNH C ou superior'
  if (tipo === 'moto' && !cat.includes('A')) return 'moto pede CNH A'
  if (['ambulancia', 'van', 'carro', 'caminhonete'].includes(tipo) && cat === 'A') return 'pede CNH B ou superior'
  return null
}
