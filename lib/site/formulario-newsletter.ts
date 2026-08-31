/**
 * Liga o formulário de newsletter da home do site institucional.
 *
 * A home promete "Receba novidades da Cruz Vermelha RJ" num formulário com
 * action="#" e campos sem atributo name: ao enviar, a página recarrega, os
 * campos limpam — parece que funcionou — e o endereço se perde.
 *
 * Este módulo é PURO de propósito. Ele reescreve o HTML da página inicial de
 * uma instituição, no ar, em produção. Uma expressão regular gulosa aqui não
 * quebra um teste: quebra o site. Então a troca acontece aqui, onde cada
 * recusa tem um caso de teste, e o FTP fica sendo só o transporte.
 *
 * Três regras que o código abaixo garante:
 *
 *  1. RECUSA em vez de adivinhar. Se a seção esperada não estiver lá, ou
 *     estiver duplicada, nada é alterado e o motivo é dito. Página que não se
 *     reconhece é página que não se mexe.
 *  2. IDEMPOTENTE. Rodar duas vezes não duplica formulário nem script.
 *  3. CIRÚRGICO. Só a seção da newsletter muda; o resto do arquivo sai
 *     idêntico, byte a byte.
 */

/** A seção decorativa que está no ar hoje, reconhecida pela âncora abaixo. */
const ABERTURA = '<section class="newsletter-section">'
const FECHAMENTO = '</section>'

/** Marca que identifica a seção já ligada — é o que torna a troca idempotente. */
export const MARCA = 'data-newsletter-cvrj="ligado"'

export type Resultado =
  | { estado: 'trocado'; html: string; detalhe: string }
  | { estado: 'ja-ligado'; detalhe: string }
  | { estado: 'recusado'; detalhe: string }

/**
 * O bloco que substitui o decorativo.
 *
 * Reaproveita as classes que o CSS da home já tem (.newsletter-section,
 * .newsletter-form, .btn), então o visual não muda. O pouco de estilo novo —
 * o aceite, a armadilha e o recado — vai junto, porque não dá para editar a
 * folha de estilo do site daqui.
 *
 * O JavaScript é melhoria progressiva: sem ele o formulário continua
 * funcionando, navegando para a página de resposta. É de propósito — quem
 * bloqueia script tem de conseguir se inscrever do mesmo jeito.
 */
export function blocoLigado(urlDaRota: string): string {
  return `<section class="newsletter-section" ${MARCA}>
      <style>
        .newsletter-form{align-items:flex-start}
        /* O CSS da home tem .newsletter-form input{flex:1;min-width:200px} para
           os campos de texto. Sem as duas regras abaixo, essa mesma regra
           estica a caixinha de aceite para 200px de largura e a joga longe do
           texto dela. */
        .newsletter-aceite{flex:1 0 100%;display:flex;gap:8px;align-items:flex-start;max-width:480px;margin:14px auto 0;text-align:left;font-size:13px;line-height:1.5;color:rgba(255,255,255,.92)}
        .newsletter-aceite input[type=checkbox]{flex:0 0 auto;width:16px;height:16px;min-width:0;margin:2px 0 0;padding:0;border-radius:3px;-webkit-appearance:checkbox;appearance:checkbox}
        .newsletter-armadilha{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
        .newsletter-recado{max-width:480px;margin:16px auto 0;font-size:14.5px;line-height:1.55;color:#fff;min-height:1.2em}
        .newsletter-recado[data-erro]{color:#ffe08a}
      </style>
      <div class="wrap">
        <p class="eyebrow">Fique por dentro</p>
        <h2>Receba novidades da Cruz Vermelha RJ</h2>
        <p class="lead">Cursos, campanhas e o impacto da sua doação, direto no seu e-mail.</p>
        <form class="newsletter-form" id="newsletter-form" action="${urlDaRota}" method="post">
          <label class="newsletter-armadilha" aria-hidden="true">Não preencha este campo
            <input type="text" name="site" tabindex="-1" autocomplete="off"></label>
          <input type="text" name="nome" placeholder="Seu nome" autocomplete="name" required>
          <input type="email" name="email" placeholder="Seu e-mail" autocomplete="email" required>
          <button type="submit" class="btn">Quero Receber</button>
          <label class="newsletter-aceite">
            <input type="checkbox" name="consentimento" value="1" required>
            <span>Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo link presente em todas as mensagens.</span>
          </label>
        </form>
        <p class="newsletter-recado" id="newsletter-recado" role="status" aria-live="polite"></p>
      </div>
      <script>
      (function(){
        var f=document.getElementById('newsletter-form'),r=document.getElementById('newsletter-recado')
        if(!f||!r||!window.fetch)return
        f.addEventListener('submit',function(ev){
          ev.preventDefault()
          var b=f.querySelector('button[type=submit]'),rot=b.textContent
          b.disabled=true;b.textContent='Enviando…';r.removeAttribute('data-erro');r.textContent=''
          var d=new FormData(f)
          fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({nome:d.get('nome'),email:d.get('email'),site:d.get('site'),consentimento:d.get('consentimento')==='1'})})
            .then(function(x){return x.json().catch(function(){return{}})})
            .then(function(resp){
              if(resp&&resp.ok){r.textContent=resp.recado||'Quase lá! Confira seu e-mail para confirmar.';f.reset()}
              else{r.setAttribute('data-erro','1');r.textContent=(resp&&resp.erro)||'Não foi possível concluir agora. Tente de novo.'}
            })
            .catch(function(){r.setAttribute('data-erro','1');r.textContent='Não foi possível concluir agora. Confira sua conexão e tente de novo.'})
            .then(function(){b.disabled=false;b.textContent=rot})
        })
      })()
      </script>
    </section>`
}

/**
 * Troca a seção decorativa pela que funciona.
 *
 * `urlDaRota` é o endereço absoluto da rota de inscrição — absoluto porque o
 * formulário roda no site institucional e a rota mora na Redação, em outro
 * domínio.
 */
export function ligarFormularioNaHome(html: string, urlDaRota: string): Resultado {
  if (html.includes(MARCA)) {
    return { estado: 'ja-ligado', detalhe: 'O formulário da home já está ligado nesta rota. Nada foi alterado.' }
  }

  const ocorrencias = html.split(ABERTURA).length - 1
  if (ocorrencias === 0) {
    return {
      estado: 'recusado',
      detalhe: 'Não encontrei a seção da newsletter na home (o trecho <section class="newsletter-section">). A página pode ter sido redesenhada. Nada foi alterado.',
    }
  }
  if (ocorrencias > 1) {
    // Duas seções iguais significam que a página não é a que este código
    // conhece. Escolher uma delas seria adivinhar num arquivo em produção.
    return {
      estado: 'recusado',
      detalhe: `Encontrei ${ocorrencias} seções de newsletter na home e não sei qual é a certa. Nada foi alterado.`,
    }
  }

  const inicio = html.indexOf(ABERTURA)
  const fim = html.indexOf(FECHAMENTO, inicio)
  if (fim === -1) {
    return { estado: 'recusado', detalhe: 'A seção da newsletter começa mas não fecha na home. Nada foi alterado.' }
  }

  // Uma <section> aninhada dentro faria o primeiro </section> fechar a errada,
  // e o corte comeria metade da página. Melhor recusar do que cortar.
  const miolo = html.slice(inicio + ABERTURA.length, fim)
  if (miolo.includes('<section')) {
    return { estado: 'recusado', detalhe: 'A seção da newsletter tem outra seção dentro; o corte não é seguro. Nada foi alterado.' }
  }
  if (!miolo.includes('newsletter-form')) {
    return { estado: 'recusado', detalhe: 'A seção encontrada não contém o formulário esperado. Nada foi alterado.' }
  }

  const novo = html.slice(0, inicio) + blocoLigado(urlDaRota) + html.slice(fim + FECHAMENTO.length)
  return {
    estado: 'trocado',
    html: novo,
    detalhe: 'O formulário da home passou a enviar para a Redação, com aceite de consentimento e proteção contra robô.',
  }
}

/**
 * Onde procurar o index.html da home, em ordem de probabilidade.
 *
 * Função pura para que a ordem seja testável: descobrir a pasta certa foi, na
 * história deste projeto, a parte que mais consumiu tentativa e erro — o painel
 * da Hostinger mostra o caminho cortado e ninguém vê onde a conta cai.
 *
 * Não usa "..": depender de o servidor de FTP resolver caminho relativo é
 * frágil, e alguns simplesmente não resolvem. Os ancestrais são calculados
 * aqui, como caminhos absolutos.
 *
 * A ordem começa pelos ancestrais da pasta de matérias porque, se as notícias
 * são publicadas em <site>/noticias, a home está um nível acima — é o palpite
 * com mais chance e o mais barato de confirmar.
 */
export function candidatosDeIndex(entrada: {
  baseDir: string
  /** Diretórios vistos na raiz da conta. */
  pastasDaRaiz?: string[]
  /** Diretórios dentro de /domains, quando essa pasta existir. */
  pastasDeDomains?: string[]
}): string[] {
  const candidatos: string[] = []
  const juntar = (caminho: string) => {
    const limpo = ('/' + caminho + '/index.html').replace(/\/+/g, '/')
    if (!candidatos.includes(limpo)) candidatos.push(limpo)
  }

  // 1. Os ancestrais da pasta de matérias, do mais próximo ao mais distante.
  const partes = entrada.baseDir.split('/').filter(Boolean)
  for (let i = partes.length - 1; i >= 0; i--) juntar(partes.slice(0, i).join('/'))

  // 2. As pastas de site que existem na raiz da conta.
  const daRaiz = entrada.pastasDaRaiz ?? []
  for (const nome of ['public_html', 'htdocs', 'www']) {
    if (daRaiz.includes(nome)) juntar(nome)
  }

  // 3. O layout de hospedagem com vários domínios.
  for (const dominio of entrada.pastasDeDomains ?? []) juntar(`domains/${dominio}/public_html`)

  // 4. A própria raiz, por último: é a menos provável e a mais arriscada de
  //    acertar por engano, então só depois de tudo o mais falhar.
  juntar('')

  return candidatos
}
