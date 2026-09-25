import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Cada página exporta o próprio título ("Cursos", "Entrar"…); sem ele, vale o padrão.
  title: { template: '%s · Área do Voluntário', default: 'Área do Voluntário — Cruz Vermelha RJ' },
  description: 'O espaço do voluntário da Cruz Vermelha Brasileira – Filial do Rio de Janeiro.',
  robots: { index: false, follow: false },
}

/*
 * Os tokens de escopo valem só aqui dentro, sem mexer no Redação: como o
 * globals.css usa `@theme inline`, `text-destructive`/`bg-destructive` passam a
 * usar um vermelho de erro mais escuro (~6:1 sobre branco) que não se confunde
 * com o da marca; `text-(--success-texto)` é o verde legível em texto pequeno.
 *
 * `[body:has(&)]:overflow-x-clip`: o globals.css põe `overflow-x: hidden` no
 * html E no body; o do body não passa para a janela e faz dele um contêiner de
 * rolagem que nunca rola, e aí nenhum `sticky` gruda (cabeçalho do computador,
 * `barraFixa` da prova, da aula, do perfil e da conversa). `clip` corta igual
 * sem criar contêiner de rolagem. Vale só enquanto a área está na tela.
 */
export default function LayoutDoMembro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-sidebar text-foreground [--destructive:oklch(0.5_0.19_27)] [--success-texto:oklch(0.45_0.12_150)] [body:has(&)]:overflow-x-clip">{children}</div>
}
