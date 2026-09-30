import { ExternalLink, GraduationCap, Megaphone, Printer, QrCode, Siren, Smartphone, Tablet, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/livro-de-ponto') }

/**
 * Livro de ponto — o caminho até o ponto da sede, que mora no site da filial (repositório
 * cruzvermelhariodejaneiro): o tablet da recepção e o celular, pelo QR code do cartaz, registram a
 * entrada e a saída, e o portal da secretaria guarda as horas dos voluntários, a presença dos outros
 * vínculos e dos alunos e a lista de emergência. O portal tem login próprio (link de acesso enviado ao
 * e-mail da equipe); aqui não há dado nenhum, só os endereços.
 */
const SITE = 'https://cruzvermelhariodejaneiro.org'
const PORTAL = `${SITE}/matricula-cursos-presenciais/api/painel.php`

const SECOES = [
  { href: `${PORTAL}?v=ponto`, rotulo: 'Colaboradores', resumo: 'Quem está na sede agora, as horas do mês e os cadastros', icone: Users },
  { href: `${PORTAL}?v=ponto&aba=alunos`, rotulo: 'Alunos nas aulas', resumo: 'A presença dos alunos nas aulas de cada dia', icone: GraduationCap },
  { href: `${PORTAL}?v=ponto&aba=emergencia`, rotulo: 'Lista de emergência', resumo: 'Quem está na sede agora, para imprimir numa evacuação', icone: Siren },
  { href: `${PORTAL}?v=ponto&aba=aparelhos`, rotulo: 'Aparelhos e QR code', resumo: 'O tablet da recepção, o cartaz e o código do dia', icone: QrCode },
  { href: `${PORTAL}?v=comunicacao`, rotulo: 'Comunicação', resumo: 'Lembretes de entrada e saída, comunicados e a fila do WhatsApp', icone: Megaphone },
]

export default async function LivroDePontoPage() {
  await requireWorkspace()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Livro de ponto"
        description="As entradas e saídas na sede ficam no portal da secretaria, no site da filial: as horas doadas pelos voluntários, a presença da equipe e dos alunos e a lista de emergência."
        actions={<Button render={<a href={`${PORTAL}?v=ponto`} target="_blank" rel="noreferrer" />} data-ajuda="ponto.abrir"><ExternalLink className="size-4" />Abrir o livro de ponto</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-ajuda="ponto.registrar">
          <CardHeader>
            <CardTitle>Registrar a entrada e a saída</CardTitle>
            <CardDescription>Para toda a equipe, voluntários e diretoria, na sede.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
            <div className="flex gap-3">
              <Tablet className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p><span className="font-medium">No tablet da recepção:</span> digite o CPF, toque em “Continuar” e depois em “Registrar entrada” ou “Estou saindo agora”.</p>
            </div>
            <div className="flex gap-3">
              <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p><span className="font-medium">No celular:</span> leia o QR code do cartaz da sede. A página pede a localização e só registra perto da sede; ela não guarda onde você está.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" render={<a href={`${SITE}/ponto/`} target="_blank" rel="noreferrer" />}><ExternalLink className="size-4" />Abrir o ponto</Button>
              <Button variant="outline" render={<a href={`${SITE}/matricula-cursos-presenciais/ponto/cartaz/`} target="_blank" rel="noreferrer" />}><Printer className="size-4" />Cartaz para imprimir</Button>
            </div>
          </CardContent>
        </Card>

        <Card data-ajuda="ponto.secretaria">
          <CardHeader>
            <CardTitle>No portal da secretaria</CardTitle>
            <CardDescription>Entra quem tem o e-mail da equipe: o portal manda um link de acesso que vale 20 minutos, e a sessão dura 12 horas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {SECOES.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.035]">
                    <s.icone className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium group-hover:text-primary">{s.rotulo}</span>
                      <span className="block text-muted-foreground">{s.resumo}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
