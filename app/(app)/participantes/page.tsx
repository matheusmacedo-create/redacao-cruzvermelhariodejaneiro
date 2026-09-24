import { redirect } from 'next/navigation'

// O cadastro virou Voluntários (/voluntariado); o endereço antigo continua levando para lá.
export default function Participantes() {
  redirect('/voluntariado')
}
