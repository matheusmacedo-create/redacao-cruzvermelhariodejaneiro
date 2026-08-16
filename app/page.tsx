import Link from 'next/link'
import { Lock, Mail, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CrossMark } from '@/components/app/brand-mark'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — form */}
      <div className="flex w-full flex-col justify-between px-6 py-8 md:w-[46%] md:px-14 lg:px-20">
        <div className="flex items-center gap-3">
          <CrossMark className="size-10 border border-border" />
          <div>
            <p className="text-sm font-bold tracking-tight">CVRJ Redação</p>
            <p className="text-[11px] text-muted-foreground">Central de Comunicação</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm py-12">
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Acesse a Redação CVRJ
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Ambiente interno da equipe de Comunicação da Cruz Vermelha Brasileira — Rio de
            Janeiro.
          </p>

          <form className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail institucional
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  defaultValue="matheus@cvrj.org.br"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Senha
                </label>
                <Link href="#" className="text-xs text-primary hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  defaultValue="senha1234"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" defaultChecked className="size-4 accent-[oklch(0.593_0.244_27.2)]" />
              Manter conectado neste computador
            </label>

            <Button size="lg" className="mt-2 h-11 w-full" render={<Link href="/dashboard" />}>
              Entrar
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Acesso restrito à equipe autorizada. Em caso de dúvida, procure a Comunicação.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Cruz Vermelha Brasileira — Filial Rio de Janeiro
        </p>
      </div>

      {/* Right — brand panel */}
      <div className="relative hidden flex-1 overflow-hidden bg-primary md:block">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2">
            <span className="absolute left-1/2 top-0 h-full w-[30%] -translate-x-1/2 bg-white" />
            <span className="absolute top-1/2 left-0 h-[30%] w-full -translate-y-1/2 bg-white" />
          </div>
        </div>
        <div className="relative flex h-full flex-col justify-end p-14">
          <blockquote className="max-w-md">
            <p className="text-2xl font-semibold leading-snug text-primary-foreground text-balance">
              A memória, a redação e o fluxo operacional da Comunicação da Cruz Vermelha RJ em um
              só lugar.
            </p>
            <footer className="mt-4 text-sm text-primary-foreground/80">
              Organize pautas, arquivos e aprovações com clareza e controle.
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  )
}
