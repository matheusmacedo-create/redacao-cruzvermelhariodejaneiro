import type { Adapter, Aviso, Variante } from './contrato'
import { gerarSlug } from '@/lib/site/slug'

/**
 * O site institucional como destino de primeira classe — a novidade da v1.1
 * do spec. A variante não é uma legenda: é a página (título, linha fina,
 * corpo, slug). O conector é o gerador de páginas + FTP que já publicam as
 * matérias hoje.
 */
export const siteWeb: Adapter = {
  id: 'site_web',
  nome: 'Site da instituição',
  cor: 'border-primary/40 bg-primary/10 text-primary',
  formatos: [
    { id: 'nota', rotulo: 'Nota rápida', midia: { min: 0, max: 1, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 20_000, unidade: 'caracteres' } },
    { id: 'materia', rotulo: 'Matéria', midia: { min: 0, max: 10, proporcaoPreferida: 'livre', video: 'permitido' },
      texto: { max: 20_000, unidade: 'caracteres' } },
  ],
  camposExtras: [
    { chave: 'titulo', rotulo: 'Título da página', tipo: 'texto', max: 120 },
    { chave: 'subtitulo', rotulo: 'Linha fina', tipo: 'texto', max: 200,
      dica: 'Vira a descrição que o Google e as redes mostram.' },
    { chave: 'slug', rotulo: 'Endereço (slug)', tipo: 'texto', max: 80,
      dica: 'Em branco, nasce do título. Depois de publicado, não muda.' },
  ],
  aoGerar(variante, mestre) {
    const titulo = variante.extras.titulo || mestre.titulo || primeiraLinha(mestre.corpo)
    return {
      ...variante,
      // A página recebe o texto inteiro do mestre — no site não há limite de
      // rede para enxugar.
      corpo: mestre.corpo,
      extras: {
        ...variante.extras,
        titulo,
        subtitulo: variante.extras.subtitulo || mestre.subtitulo || '',
        slug: variante.extras.slug || (titulo ? gerarSlug(titulo) : ''),
      },
    }
  },
  validarExtras(variante): Aviso[] {
    const avisos: Aviso[] = []
    if (!variante.extras.titulo?.trim()) avisos.push({ nivel: 'erro', mensagem: 'A página precisa de um título.' })
    if (!variante.corpo?.trim()) avisos.push({ nivel: 'erro', mensagem: 'A página precisa de texto. Complete o contexto no Mestre para publicar no site.' })
    return avisos
  },
}

function primeiraLinha(texto: string): string {
  return (texto.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 120)
}
