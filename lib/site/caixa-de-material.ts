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
 * QUATRO GUIAS NOVOS (11/11/2026, pedido do Matheus: mais materiais, mais matérias com caixa). De 18 para 27 matérias:
 *  - `quando-ligar-192`: AVC, infarto, engasgo (adulto e bebê) e desmaio. Tinham ficado de fora porque um kit não
 *    ajuda ali; o cartaz diz justamente quando ligar e o que fazer até o socorro chegar.
 *  - `verao`: onda de calor, insolação, afogamento e o helicóptero dos bombeiros na praia.
 *  - `plano-familiar`: o plano da família, os alertas da Defesa Civil (celular e SMS 40199) e os estágios da cidade.
 *    Saíram da variante `emergencia`: a ficha do plano é o passo que essas matérias pedem.
 *  - `mochila`: a sirene e os sinais de deslizamento, as duas matérias em que a ordem é sair de casa. Também saíram
 *    de `emergencia`.
 *
 * MAIS CINCO GRUPOS (12/11/2026, mesmo pedido). De 27 para 58 matérias:
 *  - `cuidador`: banho no leito, Alzheimer, lesão por pressão, a caderneta da pessoa idosa e a sobrecarga de quem cuida.
 *  - `acidentes`: picada de cobra, picada de escorpião e choque elétrico, que não tinham guia nenhum.
 *  - `movimento`: as matérias de história, do Movimento, do direito humanitário e dos emblemas ganham o cartaz
 *    "A Cruz Vermelha em uma página".
 *  - `dengue`: a matéria da prevenção da dengue ganha o checklist da vistoria semanal.
 *  - `lei-lucas`: três matérias de Lei Lucas sem botão de matrícula ganham o kit Lei Lucas para escolas, que já existia.
 *    As de curso e o advertorial do kit escolar continuam de fora (em advertorial a página nem monta a caixa).
 *  Continuam sem caixa de material: voluntariado, bombeiro civil, cursos, saúde mental, violência e notícias datadas.
 *
 * A CAIXA SÓ SOBE COM O ARQUIVO NO AR. O PDF é publicado pelo repositório do site; na hora de gerar a página, a
 * publicação confere se ele responde (lib/site/material-no-ar.ts) e, se não, a página sai sem a caixa, com o motivo
 * no aviso. A prévia do hub mostra a caixa sempre: ela não confere o site.
 *
 * Módulo puro (roda também no navegador, na prévia do hub). Conferido em scripts/conferir-caixa-de-material.ts.
 */
import { escapar } from '@/lib/site/esqueleto'
import { ENDERECO_DO_PALACIO } from '@/lib/dominio'
import {
  ACIDENTES_EM_CASA, CARTAZ_DA_CRUZ_VERMELHA, CHECKLIST_DENGUE, GUIA_DO_CUIDADOR, KIT_DE_EMERGENCIA, KIT_DE_PRIMEIROS_SOCORROS, KIT_LEI_LUCAS,
  MOCHILA_DE_EMERGENCIA, PLANO_FAMILIAR, QUANDO_LIGAR_192, VERAO_SEGURO, type Material,
} from '@/lib/newsletter/materiais'

/**
 * Por qual lado a matéria chega: muda o título, o texto da caixa e, desde 11/11/2026, o arquivo. As matérias de
 * emergência entregam a lista do kit de emergência; as de primeiros socorros, o guia do kit de primeiros socorros,
 * que ganhou PDF próprio. A caixa só troca na página de cada matéria quando ela é regerada, e só com o PDF novo no ar.
 */
export type Variante =
  | 'emergencia' | 'primeiros-socorros' | 'quando-ligar-192' | 'verao' | 'plano-familiar' | 'mochila'
  | 'cuidador' | 'acidentes' | 'movimento' | 'dengue' | 'lei-lucas'

export const MATERIAS_COM_A_LISTA_DO_KIT: Readonly<Record<Variante, readonly string[]>> = {
  emergencia: [
    'o-que-fazer-em-alagamento',
    'diferenca-entre-enchente-inundacao-e-alagamento',
    'leptospirose-depois-da-enchente-como-se-proteger',
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
  'quando-ligar-192': [
    'sinais-de-avc-como-reconhecer-e-quando-ligar-192',
    'sinais-de-infarto-o-que-nao-ignorar',
    'engasgo-em-adulto-o-que-fazer',
    'o-que-fazer-quando-o-bebe-engasga',
    'o-que-fazer-quando-alguem-desmaia',
  ],
  verao: [
    'onda-de-calor-o-que-fazer-para-se-proteger',
    'insolacao-sintomas-e-o-que-fazer',
    'afogamento-prevencao-e-o-que-fazer',
    'helicoptero-dos-bombeiros-na-praia-o-que-fazer-e-o-que-evitar',
  ],
  'plano-familiar': [
    'plano-familiar-de-emergencia-no-rio',
    'alerta-da-defesa-civil-no-celular-como-funciona-no-rio',
    'sms-40199-como-receber-alertas-da-defesa-civil-no-rio',
    'estagios-operacionais-do-rio-o-que-significa-cada-nivel',
  ],
  mochila: [
    'sirene-da-defesa-civil-o-que-fazer-quando-toca',
    'sinais-de-deslizamento-de-terra',
  ],  cuidador: [
    'banho-no-leito-do-idoso',
    'como-cuidar-de-idoso-com-alzheimer-no-dia-a-dia',
    'lesao-por-pressao-em-idoso-acamado',
    'caderneta-da-pessoa-idosa-para-que-serve',
    'sobrecarga-do-cuidador-quem-cuida-tambem-precisa-de-cuidado',
  ],
  acidentes: [
    'picada-de-cobra-o-que-fazer',
    'picada-de-escorpiao-o-que-fazer',
    'choque-eletrico-o-que-fazer',
  ],
  movimento: [
    'batalha-de-solferino-a-origem-da-cruz-vermelha',
    'henry-dunant-quem-foi-o-fundador-da-cruz-vermelha',
    'cicv-o-que-e-o-comite-internacional-da-cruz-vermelha',
    'federacao-internacional-da-cruz-vermelha-o-que-e',
    'cruz-vermelha-e-ong-como-a-instituicao-funciona',
    'convencoes-de-genebra-o-que-sao-e-o-que-protegem',
    'protocolos-adicionais-as-convencoes-de-genebra',
    'prisioneiros-de-guerra-o-que-garante-a-convencao-de-genebra',
    'armas-proibidas-em-guerra-o-que-diz-o-dih',
    'restabelecimento-de-lacos-familiares',
    'crescente-vermelho-o-que-e-e-por-que-existe',
    'cristal-vermelho-o-terceiro-emblema-do-movimento',
    'farmacia-pode-usar-a-cruz-vermelha',
    'cruz-vermelha-brasileira-na-primeira-guerra',
    'cruz-vermelha-brasileira-na-segunda-guerra',
    'escola-de-enfermagem-da-cruz-vermelha-no-rio-a-historia',
    'hospital-da-cruz-vermelha-no-rio-de-janeiro-a-historia',
    'gripe-espanhola-no-rio-de-janeiro-e-a-cruz-vermelha-em-1918',
    'oswaldo-cruz-e-a-cruz-vermelha-brasileira',
  ],
  dengue: [
    'prevencao-da-dengue-no-verao-como-eliminar-focos-em-casa',
  ],
  'lei-lucas': [
    'lei-lucas-na-pratica-checklist-para-escolas-e-creches',
    'primeiros-socorros-em-creche-lei-lucas',
    'quem-pode-ministrar-o-curso-de-primeiros-socorros-da-lei-lucas',
  ],
}

// "e\u2011mail" leva o hífen que não quebra: no celular o título partia em "e-" no fim da linha e "mail" na de baixo.
const MATERIAL_DA_VARIANTE: Readonly<Record<Variante, Material>> = {
  emergencia: KIT_DE_EMERGENCIA,
  'primeiros-socorros': KIT_DE_PRIMEIROS_SOCORROS,
  'quando-ligar-192': QUANDO_LIGAR_192,
  verao: VERAO_SEGURO,
  'plano-familiar': PLANO_FAMILIAR,
  mochila: MOCHILA_DE_EMERGENCIA,
  cuidador: GUIA_DO_CUIDADOR,
  acidentes: ACIDENTES_EM_CASA,
  movimento: CARTAZ_DA_CRUZ_VERMELHA,
  dengue: CHECKLIST_DENGUE,
  'lei-lucas': KIT_LEI_LUCAS,
}

const TEXTOS: Readonly<Record<Variante, { titulo: string; texto: string }>> = {
  emergencia: {
    titulo: 'Receba a lista do kit de emergência no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e marcar o que já tem em casa: o kit de emergência para 3 dias, o kit de primeiros socorros e os telefones da família.',
  },
  'primeiros-socorros': {
    titulo: 'Receba a lista do kit de primeiros socorros no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e marcar o que já tem na caixa: os itens do kit, o que fazer num corte que sangra e os telefones de emergência. E uma folha com todas as fontes.',
  },
  'quando-ligar-192': {
    titulo: 'Receba o cartaz “Quando ligar 192” no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e deixar à vista: os sinais de AVC, de infarto e de engasgo, o que fazer até o socorro chegar e o que dizer ao atendente. E uma folha com todas as fontes.',
  },
  verao: {
    titulo: 'Receba o guia “Verão seguro no Rio” no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir: o que fazer nos dias de calor forte, os sinais de alerta no corpo e os cuidados na praia. E uma folha com todas as fontes.',
  },
  'plano-familiar': {
    titulo: 'Receba a ficha do plano familiar de emergência no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e preencher com a família: os telefones, os pontos de encontro e quem ajuda quem. E uma folha com todas as fontes.',
  },
  mochila: {
    titulo: 'Receba a lista da mochila de emergência no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e marcar o que já está na mochila: o que levar para 3 dias, os documentos e o que fazer na hora de sair. E uma folha com todas as fontes.',
  },  cuidador: {
    titulo: 'Receba o guia do cuidador de idosos no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir: a rotina de cuidados do dia, a ficha dos remédios e os sinais de alerta. E uma folha com todas as fontes.',
  },
  acidentes: {
    titulo: 'Receba o cartaz “Acidentes em casa” no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e deixar à vista: o que fazer e o que não fazer em picada de cobra, picada de escorpião e choque elétrico. E uma folha com todas as fontes.',
  },
  movimento: {
    titulo: 'Receba o cartaz “A Cruz Vermelha em uma página” no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir e afixar: os 7 Princípios Fundamentais, os três emblemas, quem é quem no Movimento e uma linha do tempo. E uma folha com todas as fontes.',
  },
  dengue: {
    titulo: 'Receba o checklist contra a dengue no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir: a vistoria semanal da casa para marcar, os sintomas e os sinais de alarme. E uma folha com todas as fontes.',
  },
  'lei-lucas': {
    titulo: 'Receba o kit Lei Lucas para escolas no seu e\u2011mail',
    texto: 'Duas folhas em PDF para imprimir: o checklist de adequação à Lei Lucas, a ficha dos profissionais capacitados e o cartaz de emergência. E uma folha com as fontes.',
  },
}

export type CaixaDaMateria = { material: Material; variante: Variante }

/** A caixa desta matéria, pelo endereço dela; null para todas as outras. */
export function caixaDaMateria(slug: string | null | undefined): CaixaDaMateria | null {
  const s = (slug ?? '').trim()
  if (!s) return null
  for (const variante of Object.keys(MATERIAS_COM_A_LISTA_DO_KIT) as Variante[]) {
    if (MATERIAS_COM_A_LISTA_DO_KIT[variante].includes(s)) return { material: MATERIAL_DA_VARIANTE[variante], variante }
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
  // "a lista", "o cartaz", "a ficha": o botão e o recado falam do material desta caixa (até 11/11/2026 era sempre "a lista").
  const objeto = material.email.objeto
  const Objeto = objeto.charAt(0).toUpperCase() + objeto.slice(1)
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
              <button type="submit">Enviar ${escapar(objeto)} para o meu e-mail</button>
            </form>
            <p class="news-material-recado" role="status" aria-live="polite"></p>
            <p class="news-material-guia" hidden>Não chegou? ${escapar(Objeto)} também está no <a href="${escapar(guia)}">${escapar(material.rotuloDoGuia)}</a>.</p>
          </aside>`
}

/**
 * O estilo da caixa: a mesma família da matéria e do índice (filete preto em cima e embaixo, título e texto na serifa
 * da matéria, cantos retos, o quadrado vermelho dos rótulos), sem imagem e sem cor de fundo forte, para não parecer
 * anúncio de terceiros. No computador o texto fica de um lado e o formulário do outro; no celular, um sob o outro. `[hidden]` precisa da regra própria: o `display` das classes abaixo ganharia
 * do atributo, e o formulário não sumiria depois do envio.
 */
export const CSS_DA_CAIXA_DE_MATERIAL = `.news-material{margin:40px 0 0;padding:26px 28px 28px;border-top:3px solid var(--news-ink);border-bottom:1px solid var(--news-ink);background:var(--box);font-family:var(--sans)}.news-material [hidden]{display:none}.news-material-olho{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--brand)}.news-material-olho::before{content:'';width:10px;height:10px;background:var(--brand);flex:none}.news-material h2{margin:0 0 10px;font-family:var(--serif);font-size:27px;line-height:1.18;font-weight:800;letter-spacing:-.015em;color:var(--news-ink);text-wrap:balance}.news-material-texto{margin:0 0 18px;font-family:var(--serif);font-size:18px;line-height:1.5;color:var(--ink-2)}.news-material-form{display:grid;gap:12px}.news-material-rotulo{margin-bottom:-6px;font-size:15px;font-weight:700;color:var(--news-ink)}.news-material input[type=email]{width:100%;min-height:52px;padding:12px 14px;border:1.5px solid #6b7480;border-radius:4px;background:#fff;color:var(--news-ink);font:inherit;font-size:17px}.news-material-aceite{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.5;color:var(--ink-2);cursor:pointer}.news-material-aceite input{flex:0 0 auto;width:22px;height:22px;margin:1px 0 0;accent-color:var(--brand)}.news-material button{min-height:52px;padding:12px 20px;border:0;border-radius:4px;background:var(--brand);color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}.news-material button:hover{background:var(--brand-dark)}.news-material button[disabled]{opacity:.7;cursor:progress}.news-material-armadilha{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.news-material-recado{margin:14px 0 0;font-size:17px;line-height:1.5;font-weight:600;color:#14532d}.news-material-recado:empty{display:none}.news-material-recado[data-erro]{color:#991b1b}.news-material-guia{margin:8px 0 0;font-size:15.5px;line-height:1.5;color:var(--ink-2)}.news-material-guia a{color:var(--brand);font-weight:600;text-decoration:underline;text-underline-offset:2px}@media(min-width:700px){.news-material{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto 1fr;column-gap:36px}.news-material-olho,.news-material h2,.news-material-texto{grid-column:1}.news-material-texto{margin-bottom:0}.news-material-form{grid-column:2;grid-row:1/span 3;align-self:center;padding-left:36px;border-left:1px solid var(--news-line)}.news-material-recado,.news-material-guia{grid-column:1/-1}}@media(max-width:699px){.news-material{padding:22px 20px 24px}.news-material h2{font-size:24px}}`

/**
 * O script da caixa: melhoria progressiva sobre o formulário comum. Envia em JSON para a rota (como o formulário da
 * home), mostra o recado que a rota devolve, some com o formulário e mostra o link do guia: é por ali que chega ao
 * arquivo quem pediu de novo no mesmo dia (quem já está na lista recebe uma entrega por dia, lib/newsletter/materiais.ts)
 * e quem ficou sem a mensagem porque o e-mail não saiu.
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
            body: JSON.stringify({ email: d.get('email'), site: d.get('site'), consentimento: d.get('consentimento') === '1', material: d.get('material'), origem: 'materia' }) })
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
