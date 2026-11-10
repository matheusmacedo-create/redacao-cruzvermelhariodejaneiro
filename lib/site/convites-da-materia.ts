/**
 * Os convites da página de matéria (10/11/2026): o que a leitura oferece a quem chegou ao fim do texto.
 *
 * Até aqui a matéria terminava em dois links pequenos na coluna lateral ("Seja voluntário", "Doe"), que no celular
 * ficavam depois de todo o texto, e só as 18 matérias da lista do kit tinham caixa de e-mail. Agora cada matéria leva:
 *
 *  1. UM convite do assunto dela, logo depois do texto (`conviteDaMateria`), pela editoria (lib/site/editorias.ts):
 *     - Primeiros socorros, Cuidado com idosos e Cursos → a Escola de Educação e Saúde. SÓ nesses assuntos, de
 *       propósito: a auditoria do Ad Grants (19/10/2026, achado C7) não quer o noticiário da ONG como vitrine de
 *       curso. O cartão vem depois do texto, sem preço, e diz de quem é a escola.
 *     - Voluntariado, História e Movimento e Rio de Janeiro → ser voluntário.
 *     - Emergências e clima → o guia do kit de emergência. Fica de fora quando a matéria já tem a caixa que manda a
 *       lista do kit por e-mail (lib/site/caixa-de-material.ts): seriam dois convites para a mesma coisa.
 *  2. A caixa "Receba as notícias no seu e-mail" (`htmlDaCaixaDeNoticias`), em toda matéria que não tem a caixa do
 *     kit. É a mesma inscrição da home (app/api/newsletter/inscrever, sem `material`), com `origem=materia`.
 *  3. "Como ajudar", na coluna lateral (`htmlDeComoAjudar`): voluntariado e doação, em botões.
 *
 * ADVERTORIAL NÃO LEVA NADA DISSO (quem chama decide, por `dados.rastreio`): ali o clique é o da matrícula.
 *
 * A caixa de notícias usa as classes e o script da caixa de material (`.news-material`, SCRIPT_DA_CAIXA_DE_MATERIAL):
 * uma página tem uma ou outra, nunca as duas. O evento do GA4 é `newsletter_inscrever`, com `origem` = "materia" e
 * `tipo` = a editoria.
 *
 * Módulo puro (roda também no navegador, na prévia do hub). Conferido em scripts/conferir-convites-da-materia.ts.
 */
import { escapar } from '@/lib/site/esqueleto'
import { editoriaDaMateria, type Editoria } from '@/lib/site/editorias'
import { ROTA_DE_INSCRICAO_PADRAO } from '@/lib/site/caixa-de-material'

export type TipoDeConvite = 'escola' | 'voluntariado' | 'kit'

export type Convite = {
  tipo: TipoDeConvite
  olho: string
  titulo: string
  texto: string
  botao: string
  /** A partir da raiz do site: a matéria é do mesmo domínio. */
  href: string
}

const CONVITES: Readonly<Record<TipoDeConvite, Convite>> = {
  escola: {
    tipo: 'escola',
    olho: 'Escola de Educação e Saúde',
    titulo: 'Aprenda na prática com a Cruz Vermelha',
    texto: 'A Escola de Educação e Saúde da filial tem cursos presenciais na sede, no Centro do Rio. Veja quais estão com turma aberta.',
    botao: 'Ver os cursos presenciais',
    href: '/matricula-cursos-presenciais/',
  },
  voluntariado: {
    tipo: 'voluntariado',
    olho: 'Faça parte',
    titulo: 'Seja voluntário da Cruz Vermelha no Rio',
    texto: 'A filial forma os próprios voluntários, na sede, no Centro do Rio. Veja como funciona e faça o seu cadastro.',
    botao: 'Quero ser voluntário',
    href: '/voluntariado/',
  },
  kit: {
    tipo: 'kit',
    olho: 'Prepare a sua casa',
    titulo: 'Monte o kit de emergência da família',
    texto: 'O guia mostra o que separar para 3 dias, o kit de primeiros socorros e os telefones que a família precisa ter à mão.',
    botao: 'Abrir o guia do kit de emergência',
    href: '/kit-de-emergencia/',
  },
}

const CONVITE_DA_EDITORIA: Readonly<Record<string, TipoDeConvite>> = {
  'primeiros-socorros': 'escola',
  cuidado: 'escola',
  cursos: 'escola',
  voluntariado: 'voluntariado',
  movimento: 'voluntariado',
  rio: 'voluntariado',
  emergencias: 'kit',
}

/**
 * O convite desta matéria, pela editoria dela; null quando não cabe nenhum.
 * `temCaixaDoKit`: a página já leva a caixa que manda a lista do kit por e-mail.
 */
export function conviteDaMateria(editoria: Editoria, temCaixaDoKit = false): Convite | null {
  const tipo = CONVITE_DA_EDITORIA[editoria.id]
  if (!tipo || (tipo === 'kit' && temCaixaDoKit)) return null
  return CONVITES[tipo]
}

/** Atalho: a editoria e o convite de uma matéria, pelo título e pelo endereço. */
export function conviteDoTitulo(titulo: string, url: string, temCaixaDoKit = false): Convite | null {
  return conviteDaMateria(editoriaDaMateria(titulo, url), temCaixaDoKit)
}

export function htmlDoConvite(c: Convite): string {
  return `<aside class="news-convite" aria-labelledby="news-convite-titulo" data-convite="${c.tipo}">
            <p class="news-convite-olho">${escapar(c.olho)}</p>
            <h2 id="news-convite-titulo">${escapar(c.titulo)}</h2>
            <p class="news-convite-texto">${escapar(c.texto)}</p>
            <a class="news-convite-botao" href="${escapar(c.href)}">${escapar(c.botao)} <span aria-hidden="true">→</span></a>
          </aside>`
}

/**
 * O texto do aceite da caixa de notícias: o MESMO de TEXTO_DO_CONSENTIMENTO (lib/newsletter/inscricao.ts), que é o
 * que a rota grava. Fica copiado aqui porque aquele módulo usa `node:crypto` e este roda também no navegador; o
 * script de conferência acusa se os dois se afastarem.
 */
export const ACEITE_DA_CAIXA_DE_NOTICIAS =
  'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu '
  + 'e-mail notícias, campanhas e informações sobre cursos. Sei que posso sair da lista '
  + 'a qualquer momento pelo link presente em todas as mensagens.'

/**
 * A caixa "Receba as notícias no seu e-mail". Mesmas escolhas da caixa de material, para o celular de quem tem mais
 * de 50 anos: um campo só, rótulo escrito, letra de 17 px, campo e botão de 52 px. Funciona sem JavaScript.
 */
export function htmlDaCaixaDeNoticias(editoria: Editoria, rota: string = ROTA_DE_INSCRICAO_PADRAO): string {
  return `<aside class="news-material news-assine" aria-labelledby="news-material-titulo" data-variante="${escapar(editoria.id)}" data-evento="newsletter_inscrever">
            <p class="news-material-olho">Newsletter</p>
            <h2 id="news-material-titulo">Receba as notícias da Cruz Vermelha do Rio no seu e‑mail</h2>
            <p class="news-material-texto">Orientações de primeiros socorros, preparo para emergências e o trabalho dos voluntários. É gratuito e você sai da lista quando quiser.</p>
            <form class="news-material-form" action="${escapar(rota)}" method="post">
              <input type="hidden" name="origem" value="materia">
              <label class="news-material-armadilha" aria-hidden="true">Não preencha este campo
                <input type="text" name="site" tabindex="-1" autocomplete="off"></label>
              <label class="news-material-rotulo" for="news-material-email">Seu e-mail</label>
              <input id="news-material-email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="nome@exemplo.com" required>
              <label class="news-material-aceite">
                <input type="checkbox" name="consentimento" value="1" required>
                <span>${escapar(ACEITE_DA_CAIXA_DE_NOTICIAS)}</span>
              </label>
              <button type="submit">Quero receber as notícias</button>
            </form>
            <p class="news-material-recado" role="status" aria-live="polite"></p>
          </aside>`
}

/** "Como ajudar", na coluna lateral: os dois caminhos de sempre, agora em botões de 48 px. */
export function htmlDeComoAjudar(): string {
  return `<section class="rail-ajudar" aria-labelledby="rail-ajudar-titulo">
          <h2 class="rail-titulo" id="rail-ajudar-titulo">Como ajudar</h2>
          <p>A filial vive do trabalho dos voluntários e do apoio de quem acredita nele.</p>
          <a class="rail-botao cheio" href="/doe/">Doe para a filial</a>
          <a class="rail-botao" href="/voluntariado/">Seja voluntário no Rio</a>
        </section>`
}

/** O estilo do convite e do "Como ajudar": a família da matéria (filete da marca, Inter), sem imagem. */
export const CSS_DOS_CONVITES = `.news-convite{margin:40px 0 0;padding:22px 22px 24px;border-left:4px solid var(--brand);background:var(--box);font-family:var(--sans)}.news-convite-olho{margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--brand)}.news-convite h2{margin:0 0 8px;font-family:var(--serif);font-size:27px;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:var(--news-ink)}.news-convite-texto{margin:0 0 18px;font-family:var(--serif);font-size:18px;line-height:1.5;color:var(--ink-2)}.news-convite-botao{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:12px 24px;border-radius:4px;background:var(--brand);color:#fff;font-size:17px;font-weight:700;text-decoration:none}.news-convite-botao:hover{background:var(--brand-dark);color:#fff}.news-convite+.news-material{margin-top:24px}.news-source{background:none}.rail-ajudar{border-top:3px solid var(--brand);padding-top:14px}.rail-ajudar .rail-titulo{border-bottom:0;padding-bottom:0}.rail-ajudar p{margin:6px 0 14px;font-size:15px;line-height:1.5;color:var(--ink-2)}.rail-botao{display:flex;align-items:center;justify-content:center;min-height:48px;padding:10px 16px;margin-top:10px;border:2px solid var(--brand);border-radius:4px;color:var(--brand);font-size:16px;font-weight:700;text-align:center;text-decoration:none}.rail-botao:hover{background:var(--brand);color:#fff}.rail-botao.cheio{background:var(--brand);color:#fff}.rail-botao.cheio:hover{background:var(--brand-dark);border-color:var(--brand-dark)}@media(max-width:640px){.news-convite-botao{display:flex;width:100%}}@media print{.news-convite,.news-material,.rail-ajudar{display:none}}`
