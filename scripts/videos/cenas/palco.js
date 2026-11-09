/*
 * O palco dos vídeos de explicação (docs/AJUDA.md §18). Cada vídeo é um arquivo de cenas (<id>.js, com window.CENAS),
 * aberto por palco.html?v=<id>; o gravador (scripts/videos/gravar.ts) chama palco.ir(n) a cada fala do roteiro.
 * Tipos de cena: capa, numero, numeros, barras, citacao, lista, comparacao, dupla, passos, rede e chamada. Todo número
 * vem com a fonte.
 */
;(function () {
  const fmt = (n, decimais, ano) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimais || 0, maximumFractionDigits: decimais || 0, useGrouping: !ano }).format(n)
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // A única marcação das cenas: **negrito**, ==destaque em vermelho== e \n para quebrar a linha.
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/==(.+?)==/g, '<span class="destaque">$1</span>').replace(/\n/g, '<br>')
  const el = (i, html, classe = '') => `<div class="e ${classe}" style="--i:${i}">${html}</div>`
  const fonte = (c) => (c.fonte ? `<p class="fonte e" style="--i:${(c.ordemDaFonte ?? 5)}">Fonte: ${md(c.fonte)}</p>` : '')
  const contador = (valor, decimais, ano) => `<span class="valor" data-ate="${valor}" data-decimais="${decimais || 0}"${ano ? ' data-ano="1"' : ''}>0</span>`

  const MOLDES = {
    capa: (c) => `${el(0, `<p class="etiqueta">${esc(c.etiqueta)}</p><div class="filete"></div>`)}${el(1, `<h1>${md(c.titulo)}</h1>`)}${c.texto ? el(2, `<p class="texto">${md(c.texto)}</p>`) : ''}${fonte(c)}`,
    numero: (c) => `${c.antes ? el(0, `<p class="etiqueta">${esc(c.antes)}</p><div class="filete"></div>`) : ''}${el(1, `<p class="numero ${fmt(c.valor, c.decimais, c.ano).length + (c.prefixo ? 2 : 0) > 4 ? 'longo' : ''}">${c.prefixo ? `<span class="prefixo">${esc(c.prefixo)}</span>` : ''}${contador(c.valor, c.decimais, c.ano)}${c.sufixo ? `<span class="sufixo ${c.sufixo.length > 3 ? 'longo' : ''}">${esc(c.sufixo)}</span>` : ''}</p>`)}${el(2, `<p class="rotulo">${md(c.rotulo)}</p>`)}${c.detalhe ? el(3, `<p class="detalhe">${md(c.detalhe)}</p>`) : ''}${fonte(c)}`,
    numeros: (c) => `${el(0, `<p class="titulo">${md(c.titulo)}</p>`)}<div class="grade" style="--colunas:${c.itens.length > 3 ? 2 : c.itens.length}">${c.itens.map((x, i) => el(i + 1, `<div class="caixa"><span class="numero-da-caixa">${contador(x.valor, x.decimais)}${x.sufixo ? `<span class="sufixo">${esc(x.sufixo)}</span>` : ''}</span><p class="rotulo">${md(x.rotulo)}</p></div>`)).join('')}</div>${fonte(c)}`,
    barras: (c) => `${el(0, `<p class="titulo">${md(c.titulo)}</p>`)}<div class="barras">${c.itens.map((x, i) => el(i + 1, `<div class="barra ${x.fraca ? 'fraca' : ''}"><p class="nome"><span>${esc(x.rotulo)}</span><b>${fmt(x.valor, x.decimais)}${esc(c.sufixo || '')}</b></p><div class="trilho"><div class="cheio" data-largura="${Math.min(100, (x.valor / (c.maximo || 100)) * 100)}"></div></div></div>`)).join('')}</div>${fonte(c)}`,
    citacao: (c) => `${el(0, '<p class="aspas">“</p>')}${el(1, `<p class="citacao">${md(c.texto)}</p>`)}${el(2, `<p class="autor">${md(c.autor)}</p>`)}${fonte(c)}`,
    lista: (c) => `${el(0, `<p class="titulo">${md(c.titulo)}</p>`)}<ul class="lista">${c.itens.map((x, i) => `<li class="e" style="--i:${i + 1}">${md(x)}</li>`).join('')}</ul>${c.rodape ? el(c.itens.length + 1, `<p class="rodape">${md(c.rodape)}</p>`) : ''}${fonte(c)}`,
    comparacao: (c) => `${c.titulo ? el(0, `<p class="titulo">${md(c.titulo)}</p>`) : ''}<div class="lados">${el(1, `<div class="lado antes"><h2>${esc(c.antes.titulo)}</h2><ul>${c.antes.itens.map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>`)}${el(2, `<div class="lado depois"><h2>${esc(c.depois.titulo)}</h2><ul>${c.depois.itens.map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>`)}</div>${fonte(c)}`,
    rede: (c) => {
      const n = c.nos.length
      const pontos = c.nos.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        return { x: 50 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 41 }
      })
      const linhas = pontos.map((p, i) => `<line x1="50" y1="50" x2="${p.x}" y2="${p.y}" style="--i:${i}" />`).join('')
      const nos = c.nos.map((nome, i) => `<div class="no" style="left:${pontos[i].x}%;top:${pontos[i].y}%;--i:${i}">${esc(nome)}</div>`).join('')
      // No computador, o Palácio no meio e os setores em volta; no celular (palco.css), o Palácio em cima e os setores em grade.
      return `<div class="lado-a-lado">${c.titulo ? el(0, `<p class="titulo">${md(c.titulo)}</p>${c.texto ? `<p class="texto">${md(c.texto)}</p>` : ''}`) : ''}<div class="rede"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${linhas}</svg><div class="centro"><span>${esc(c.centro)}</span></div><div class="nos">${nos}</div></div></div>`
    },
    // Dois cartões lado a lado, os dois do bem (✓): quem faz o quê. A comparação (✗ × ✓) é para antes e depois.
    dupla: (c) => `${c.titulo ? el(0, `<p class="titulo">${md(c.titulo)}</p>`) : ''}<div class="lados">${[c.esquerda, c.direita].map((l, k) => el(k + 1, `<div class="lado par ${k ? 'depois' : ''}"><h2>${esc(l.titulo)}</h2>${l.subtitulo ? `<p class="subtitulo">${md(l.subtitulo)}</p>` : ''}<ul>${l.itens.map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>`)).join('')}</div>`,
    // Um caminho numerado: cada passo entra depois do outro.
    passos: (c) => `${c.titulo ? el(0, `<p class="titulo">${md(c.titulo)}</p>`) : ''}<ol class="passos">${c.itens.map((x, i) => `<li class="e" style="--i:${i + 1}"><span class="n">${i + 1}</span><span>${md(x)}</span></li>`).join('')}</ol>${c.rodape ? el(c.itens.length + 1, `<p class="rodape">${md(c.rodape)}</p>`) : ''}`,
    chamada: (c) => `<div class="chamada">${el(0, `<p class="etiqueta">${esc(c.etiqueta || 'Palácio Virtual')}</p><div class="filete"></div>`)}${el(1, `<p class="titulo">${md(c.titulo)}</p>`)}${c.texto ? el(2, `<p class="texto">${md(c.texto)}</p>`) : ''}</div>`,
  }

  function animarNumeros(cena) {
    cena.querySelectorAll('.valor[data-ate]').forEach((alvo, k) => {
      const ate = Number(alvo.dataset.ate)
      const decimais = Number(alvo.dataset.decimais || 0)
      const ano = alvo.dataset.ano === '1'
      const atraso = 500 + k * 420
      const duracao = 1500
      const inicio = performance.now() + atraso
      const passo = (agora) => {
        const t = Math.min(1, Math.max(0, (agora - inicio) / duracao))
        const suave = 1 - Math.pow(1 - t, 3)
        // O ano conta só a partir de perto dele (1908 não começa do zero).
        alvo.textContent = fmt(ano ? Math.round(ate - 120 * (1 - suave)) : ate * suave, decimais, ano)
        if (t < 1) requestAnimationFrame(passo)
      }
      requestAnimationFrame(passo)
    })
    cena.querySelectorAll('.cheio[data-largura]').forEach((barra, k) => {
      setTimeout(() => { barra.style.width = `${barra.dataset.largura}%` }, 700 + k * 420)
    })
  }

  let atual = null
  window.palco = {
    montar(cenas) {
      const palco = document.getElementById('palco')
      palco.innerHTML = cenas.map((c, i) => {
        const miolo = MOLDES[c.tipo]({ ...c, fonte: null })
        return `<section class="cena cena-${c.tipo}" data-n="${i}"><div class="miolo">${miolo}</div>${fonte(c)}</section>`
      }).join('')
      document.documentElement.dataset.pronto = '1'
    },
    /** Mostra a cena n (a partir de 0), com as entradas animadas. */
    ir(n) {
      const nova = document.querySelector(`.cena[data-n="${n}"]`)
      if (!nova || nova === atual) return
      if (atual) {
        const velha = atual
        velha.classList.add('saindo')
        velha.classList.remove('ativa')
        setTimeout(() => velha.classList.remove('saindo'), 700)
      }
      atual = nova
      // Recomeça as animações (uma cena pode voltar).
      nova.querySelectorAll('.cheio').forEach((b) => { b.style.width = '0' })
      void nova.offsetWidth
      nova.classList.add('ativa')
      animarNumeros(nova)
    },
  }
})()
