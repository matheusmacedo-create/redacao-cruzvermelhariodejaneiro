/** "agora", "há 5 min", "há 3 h", "ontem", "12/09" — como nas redes sociais. */
export function haQuanto(iso: string, agora = Date.now()): string {
  const passado = Math.max(0, agora - new Date(iso).getTime())
  const min = Math.floor(passado / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
