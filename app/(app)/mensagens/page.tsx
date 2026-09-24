import { redirect } from 'next/navigation'

/** As conversas da equipe agora moram no Chat (as diretas antigas foram levadas para lá). */
export default function MensagensPage() {
  redirect('/chat')
}
