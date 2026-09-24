import { redirect } from 'next/navigation'

// O cadastro virou Voluntariado; o endereço antigo continua levando para lá.
export default function Participantes() {
  redirect('/voluntariado')
}
