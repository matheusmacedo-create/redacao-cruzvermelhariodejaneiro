/*
 * Service worker do Palácio Virtual.
 *
 * Só guarda o que é igual para todo mundo e não tem dado de ninguém:
 *  - os arquivos do build (/_next/static, nome com hash): cache primeiro;
 *  - logo, ícones e imagens fixas (/images): mostra o guardado e atualiza por trás.
 * Páginas, dados das telas (RSC), /api e fotos privadas vão sempre à rede: são
 * de cada pessoa e mudam o tempo todo. Sem rede, a navegação mostra /offline.html.
 *
 * Para desligar de vez (se um dia der problema): troque este arquivo por um que
 * chame self.registration.unregister() no activate e publique.
 */
const VERSAO = 'palacio-v1'
const ESTATICOS = VERSAO + '-estaticos'
const OFFLINE = '/offline.html'
const MAXIMO = 300

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(ESTATICOS)
      .then((cache) => cache.addAll([OFFLINE, '/images/logo-cvrj.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

// Os arquivos do build se acumulam a cada versão publicada: guarda só os mais recentes.
async function aparar(cache) {
  const chaves = await cache.keys()
  for (let i = 0; i < chaves.length - MAXIMO; i++) await cache.delete(chaves[i])
}

async function cachePrimeiro(pedido) {
  const cache = await caches.open(ESTATICOS)
  const guardado = await cache.match(pedido)
  if (guardado) return guardado
  const resposta = await fetch(pedido)
  if (resposta.ok && resposta.type === 'basic') {
    await cache.put(pedido, resposta.clone())
    aparar(cache)
  }
  return resposta
}

async function guardadoEAtualiza(evento, pedido) {
  const cache = await caches.open(ESTATICOS)
  const guardado = await cache.match(pedido)
  const daRede = fetch(pedido).then((resposta) => {
    if (resposta.ok && resposta.type === 'basic') return cache.put(pedido, resposta.clone()).then(() => resposta)
    return resposta
  })
  if (guardado) {
    evento.waitUntil(daRede.catch(() => undefined))
    return guardado
  }
  return daRede
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request
  if (pedido.method !== 'GET') return
  const url = new URL(pedido.url)
  if (url.origin !== self.location.origin) return

  // Página: sempre da rede (é de cada pessoa). Sem conexão, a página offline.
  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())))
    return
  }
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(cachePrimeiro(pedido))
    return
  }
  if (url.pathname.startsWith('/images/') || url.pathname === '/icon.png' || url.pathname === '/apple-icon.png' || url.pathname === '/favicon.ico') {
    evento.respondWith(guardadoEAtualiza(evento, pedido))
  }
  // O resto (dados das telas, /api, fotos privadas) segue direto para a rede, sem passar por aqui.
})
