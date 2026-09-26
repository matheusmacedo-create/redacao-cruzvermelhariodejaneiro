import {
  Brain, Building2, FileSignature, GraduationCap, HeartHandshake, Megaphone, Monitor, Package, Scale, ShoppingCart, Siren,
  Sprout, Stethoscope, Ticket, Trophy, Truck, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import type { IconeDeFila } from '@/lib/chamados/setores'

/** O desenho de cada ícone de fila (a lista de chaves mora em lib/chamados/setores.ts). */
export const ICONES_DAS_FILAS: Record<IconeDeFila, { Icone: LucideIcon; rotulo: string }> = {
  ticket: { Icone: Ticket, rotulo: 'Chamado' },
  monitor: { Icone: Monitor, rotulo: 'Computador' },
  wrench: { Icone: Wrench, rotulo: 'Ferramenta' },
  megaphone: { Icone: Megaphone, rotulo: 'Megafone' },
  scale: { Icone: Scale, rotulo: 'Balança' },
  wallet: { Icone: Wallet, rotulo: 'Carteira' },
  'shopping-cart': { Icone: ShoppingCart, rotulo: 'Carrinho' },
  users: { Icone: Users, rotulo: 'Pessoas' },
  'heart-handshake': { Icone: HeartHandshake, rotulo: 'Aperto de mãos' },
  'graduation-cap': { Icone: GraduationCap, rotulo: 'Capelo' },
  stethoscope: { Icone: Stethoscope, rotulo: 'Estetoscópio' },
  siren: { Icone: Siren, rotulo: 'Sirene' },
  truck: { Icone: Truck, rotulo: 'Caminhão' },
  building: { Icone: Building2, rotulo: 'Prédio' },
  'file-signature': { Icone: FileSignature, rotulo: 'Documento assinado' },
  brain: { Icone: Brain, rotulo: 'Mente' },
  trophy: { Icone: Trophy, rotulo: 'Troféu' },
  sprout: { Icone: Sprout, rotulo: 'Broto' },
  package: { Icone: Package, rotulo: 'Pacote' },
}

export const iconeDaFila = (chave: string): LucideIcon => ICONES_DAS_FILAS[chave as IconeDeFila]?.Icone ?? Ticket
