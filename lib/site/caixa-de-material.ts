/**
 * A caixa "Receba a lista do kit de emergência no seu e-mail", no fim de algumas matérias do site (09/11/2026).
 *
 * A pessoa deixa o e-mail, marca a autorização e recebe a lista em PDF (lib/newsletter/materiais.ts). O formulário
 * manda para a mesma rota da newsletter (app/api/newsletter/inscrever), com o campo `material`: as quatro defesas de
 * lá (armadilha, limite por IP, resposta sempre igual e confirmação em duas etapas) valem aqui sem mudar nada.
 *
 * EM QUAIS MATÉRIAS. A lista é explícita, por endereço, e não uma regra de palavras: caixa que aparece sozinha numa
 * matéria nova, porque o título tem "emergência", é surpresa para quem escreveu. O endereço de uma matéria publicada
 * não muda, então a lista não envelhece. Para pôr a caixa em outra matéria: acrescente o endereço dela abaixo e,
 * depois de a mudança estar no ar, toque em "Regerar as páginas das matérias", em Configurações › Site (a matéria que
 * já está publicada só ganha a caixa quando a página é refeita).
 *
 * O critério da ronda de 09/11/2026, nas 89 matérias no ar:
 *  - `emergencia`: chuva forte, alagamento, deslizamento, vendaval, raios, falta de luz, os alertas e as sirenes da
 *    Defesa Civil e o plano da família. É para essas horas que o kit de emergência existe.
 *  - `primeiros-socorros`: o guia de primeiros socorros, a matéria do curso básico (que tem a seção do kit de casa) e
 *    os ferimentos em que o kit de casa é usado (acidente, fratura, sangramento, pancada na cabeça).
 *  - FICARAM DE FORA, de propósito: advertoriais e matérias de curso com botão de matrícula (a caixa disputaria o
 *    clique com a matrícula); Lei Lucas (o kit da escola não é o de casa); AVC, infarto, engasgo, afogamento, desmaio,
 *    choque, calor e picadas (ali o recado é ligar 192 ou ir ao hospital, e um kit não ajuda; na de cobra, o texto
 *    diz que compressa atrapalha); saúde mental e violência; história, direito humanitário, voluntariado e notícias
 *    datadas.
 *
 * Módulo puro (roda também no navegador, na prévia do hub). Conferido em scripts/conferir-caixa-de-material.ts.
 */
import { escapar } from '@/lib/site/esqueleto'
import { ENDERECO_DO_PALACIO } from '@/lib/dominio'
import { KIT_DE_EMERGENCIA, type Material } from '@/lib/newsletter/materiais'

/** Por qual lado da lista a matéria chega: muda o título e o texto da caixa, não o arquivo. */
export type Variante = 'emergencia' | 'primeiros-socorros'

export const MATERIAS_COM_A_LISTA_DO_KIT: Readonly<Record<Variante, readonly string[]>> = {
  emergencia: [
    'alerta-da-defesa-civil-no-celular-como-funciona-no-rio',
    'sms-40199-como-receber-alertas-da-defesa-civil-no-rio',
    'sirene-da-defesa-civil-o-que-fazer-quando-toca',
    'plano-familiar-de-emergencia-no-rio',
    'estagios-operacionais-do-rio-o-que-significa-cada-nivel',
    'o-que-fazer-em-alagamento',
    'diferenca-entre-enchente-inundacao-e-alagamento',
    'leptospirose-depois-da-enchente-como-se-proteger',
    'sinais-de-deslizamento-de-terra',
    'vendaval-o-que-fazer',
    'como-se-proteger-de-raios-em-casa-e-na-rua',
    'falta-de-luz-o-que-fazer',
  ],
  'primeiros-socorros': [
    'primeiros-socorros-o-que-fazer-nas-emergencias-mais-comuns',
    'curso-de-primeiros-socorros-basico-para-o-dia-a-dia-em-casa',
    'o-que-fazer-ao-presenciar-um-acidente',
    'suspeita-de-fratura-o-que-fazer',
    'sangramento-nasal-o-que-fazer',
    'crianca-bateu-a-cabeca-o-que-fazer',
  ],
}

// "e\u2011mail" leva o hífen que não quebra: no celular o título partia em "e-" no fim da linha e "mail" na de baixo.
const TEXTOS: Readonly<Record<Variante, { titulo: string; texto: string }>> = {
  emergencia: {
    titulo: 'Receba a lista do kit de emergência no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e marcar o que já tem em casa: o kit de emergência para 3 dias, o kit de primeiros socorros e os telefones da família.',
  },
  'primeiros-socorros': {
    titulo: 'Receba a lista do kit de primeiros socorros no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e marcar o que já tem em casa: o kit de primeiros socorros, o kit de emergência para dias de chuva forte e os telefones da família.',
  },
}

export type CaixaDaMateria = { material: Material; variante: Variante }

/** A caixa desta matéria, pelo endereço dela; null para todas as outras. */
export function caixaDaMateria(slug: string | null | undefined): CaixaDaMateria | null {
  const s = (slug ?? '').trim()
  if (!s) return null
  for (const variante of Object.keys(MATERIAS_COM_A_LISTA_DO_KIT) as Variante[]) {
    if (MATERIAS_COM_A_LISTA_DO_KIT[variante].includes(s)) return { material: KIT_DE_EMERGENCIA, variante }
  }
  return null
}

/**
 * A rota de inscrição quando ninguém informa outra: a do endereço fixo do Palácio. A publicação passa a dela
 * (`urlBase()`, que respeita NEWSLETTER_URL_BASE); a prévia do hub, que roda no navegador, fica com esta.
 */
export const ROTA_DE_INSCRICAO_PADRAO = `${ENDERECO_DO_PALACIO}/api/newsletter/inscrever`

/**
 * O HTML da caixa.
 *
 * Pensada para o celular de quem tem mais de 50 anos: um campo só (o e-mail), rótulo escrito e não só exemplo dentro
 * do campo, letra de 17 px no campo (abaixo de 16 px o iPhone dá zoom ao tocar), botão e campo com 52 px de altura e
 * o aceite inteiro clicável. O formulário funciona sem JavaScript: navega para a página de resposta do Palácio.
 *
 * O texto do aceite é o do material, igual ao que a rota grava: é o que a pessoa leu que fica registrado.
 */
export function htmlDaCaixaDeMaterial(caixa: CaixaDaMateria, rota: string = ROTA_DE_INSCRICAO_PADRAO): string {
  const { material, variante } = caixa
  const t = TEXTOS[variante]
  // O guia sai a partir da raiz (a página é do mesmo site), como os outros links internos da matéria.
  const guia = material.guia.replace(/^https?:\/\/[^/]+/i, '')
  return `<aside class="news-material" aria-labelledby="news-material-titulo" data-material="${escapar(material.id)}" data-variante="${escapar(variante)}" data-evento="${escapar(material.evento)}">
            <p class="news-material-olho">Para imprimir</p>
            <h2 id="news-material-titulo">${escapar(t.titulo)}</h2>
            <p class="news-material-texto">${escapar(t.texto)}</p>
            <form class="news-material-form" action="${escapar(rota)}" method="post">
              <input type="hidden" name="material" value="${escapar(material.id)}">
              <label class="news-material-armadilha" aria-hidden="true">Não preencha este campo
                <input type="text" name="site" tabindex="-1" autocomplete="off"></label>
              <label class="news-material-rotulo" for="news-material-email">Seu e-mail</label>
              <input id="news-material-email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="nome@exemplo.com" required>
              <label class="news-material-aceite">
                <input type="checkbox" name="consentimento" value="1" required>
                <span>${escapar(material.consentimento)}</span>
              </label>
              <button type="submit">Enviar a lista para o meu e-mail</button>
            </form>
            <p class="news-material-recado" role="status" aria-live="polite"></p>
            <p class="news-material-guia" hidden>Não chegou? A lista também está no <a href="${escapar(guia)}">${escapar(material.rotuloDoGuia)}</a>.</p>
          </aside>`
}

/**
 * O estilo da caixa: a mesma família da matéria (filete vermelho da marca, Inter), sem imagem e sem cor de fundo forte,
 * para não parecer anúncio de terceiros. `[hidden]` precisa da regra própria: o `display` das classes abaixo ganharia
 * do atributo, e o formulário não sumiria depois do envio.
 */
export const CSS_DA_CAIXA_DE_MATERIAL = `.news-material{margin:40px 0 0;padding:22px 20px 22px;border:1px solid var(--news-line);border-top:3px solid var(--brand);border-radius:0 0 10px 10px;background:#faf8f6;font-family:var(--sans)}.news-material [hidden]{display:none}.news-material-olho{margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--brand)}.news-material h2{margin:0 0 8px;font-family:var(--sans);font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:var(--news-ink)}.news-material-texto{margin:0 0 18px;font-size:17px;line-height:1.5;color:var(--ink-2)}.news-material-form{display:grid;gap:12px;max-width:520px}.news-material-rotulo{margin-bottom:-6px;font-size:15px;font-weight:700;color:var(--news-ink)}.news-material input[type=email]{width:100%;min-height:52px;padding:12px 14px;border:1.5px solid #6b7480;border-radius:8px;background:#fff;color:var(--news-ink);font:inherit;font-size:17px}.news-material-aceite{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.5;color:var(--ink-2);cursor:pointer}.news-material-aceite input{flex:0 0 auto;width:22px;height:22px;margin:1px 0 0;accent-color:var(--brand)}.news-material button{min-height:52px;padding:12px 20px;border:0;border-radius:8px;background:var(--brand);color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}.news-material button:hover{background:var(--brand-dark)}.news-material button[disabled]{opacity:.7;cursor:progress}.news-material-armadilha{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.news-material-recado{margin:14px 0 0;font-size:17px;line-height:1.5;font-weight:600;color:#14532d}.news-material-recado:empty{display:none}.news-material-recado[data-erro]{color:#991b1b}.news-material-guia{margin:8px 0 0;font-size:15.5px;line-height:1.5;color:var(--ink-2)}.news-material-guia a{color:var(--brand);font-weight:600;text-decoration:underline;text-underline-offset:2px}`

/**
 * O script da caixa: melhoria progressiva sobre o formulário comum. Envia em JSON para a rota (como o formulário da
 * home), mostra o recado que a rota devolve, some com o formulário e mostra o link do guia: quem já está na lista não
 * recebe outra mensagem (lib/newsletter/materiais.ts), e é por ali que essa pessoa chega ao arquivo.
 *
 * Medição: com o pedido aceito, o evento do material (`kit_pedir`) vai ao GA4 pelo gtag que a página já carrega, com
 * `origem` = "materia" e `tipo` = a variante da caixa; a matéria é a página do evento. Sem gtag, nada é enviado.
 */
export const SCRIPT_DA_CAIXA_DE_MATERIAL = `<script>
      (function(){
        var caixa = document.querySelector('.news-material'); if (!caixa || !window.fetch) return;
        var f = caixa.querySelector('form'), r = caixa.querySelector('.news-material-recado'), guia = caixa.querySelector('.news-material-guia');
        if (!f || !r) return;
        f.addEventListener('submit', function(ev){
          ev.preventDefault();
          var b = f.querySelector('button[type=submit]'), rotulo = b.textContent, d = new FormData(f);
          b.disabled = true; b.textContent = 'Enviando…'; r.removeAttribute('data-erro'); r.textContent = '';
          fetch(f.action, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: d.get('email'), site: d.get('site'), consentimento: d.get('consentimento') === '1', material: d.get('material') }) })
            .then(function(x){ return x.json().catch(function(){ return {}; }); })
            .then(function(resp){
              if (resp && resp.ok) {
                r.textContent = resp.recado || 'Pronto! Confira o seu e-mail.';
                f.hidden = true; if (guia) guia.hidden = false;
                try { if (typeof window.gtag === 'function') window.gtag('event', caixa.getAttribute('data-evento'), { origem: 'materia', tipo: caixa.getAttribute('data-variante') }); } catch (e) {}
              } else {
                r.setAttribute('data-erro', '1'); r.textContent = (resp && resp.erro) || 'Não foi possível concluir agora. Tente de novo.';
              }
            })
            .catch(function(){ r.setAttribute('data-erro', '1'); r.textContent = 'Não foi possível concluir agora. Confira a sua conexão e tente de novo.'; })
            .then(function(){ b.disabled = false; b.textContent = rotulo; });
        });
      })();
    </script>`
