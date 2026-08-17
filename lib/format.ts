export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: 'short' }) {
  if (!value) return 'data não informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'data não informada'
  return new Intl.DateTimeFormat('pt-BR', options).format(date)
}
