// "Por que o Palácio existe" (docs/AJUDA.md §18), versão de 90 segundos: as cenas, na ordem das falas do roteiro
// (scripts/videos/roteiros.ts). Celular primeiro: poucas palavras por cena, números grandes e a fonte de cada dado.
// Dados de fora conferidos na fonte primária em 09/11/2026; os do Palácio, no banco (só totais, só leitura).
window.CENAS = [
  { tipo: 'numero', antes: 'Cruz Vermelha Brasileira', valor: 1908, ano: true, rotulo: 'Fundada aqui, no Rio de Janeiro.', detalhe: 'Desde então, ela **se adapta para servir**.', fonte: '**Cruz Vermelha Brasileira**, "Fundação e reconhecimento"' },
  { tipo: 'numero', antes: 'O mundo mudou', valor: 74.5, decimais: 1, sufixo: '%', rotulo: 'das pessoas com 60 anos ou mais já usam a internet', detalhe: 'São **3 em cada 4**.', fonte: '**IBGE**, PNAD Contínua TIC 2025' },
  { tipo: 'barras', titulo: 'As organizações sociais\njá estão no digital', sufixo: '%', itens: [{ rotulo: 'Estão nas redes sociais', valor: 80 }, { rotulo: 'Têm site próprio', valor: 46 }, { rotulo: 'Recebem doações pela internet', valor: 29 }], fonte: '**TIC Organizações Sem Fins Lucrativos 2025**, Cetic.br/NIC.br' },
  { tipo: 'citacao', texto: 'Todas as filiais conectadas digitalmente.', autor: '**Federação Internacional da Cruz Vermelha**, Estratégia 2030', fonte: 'IFRC, Strategy 2030, transformação 6 (tradução livre)' },
  { tipo: 'numero', antes: 'Google Ad Grants', prefixo: 'US$', valor: 10000, rotulo: 'por mês em anúncios gratuitos para organizações sem fins lucrativos', detalhe: 'Mais de **115 mil organizações** já usam.', fonte: '**Google para ONGs**, programa Ad Grants' },
  { tipo: 'lista', titulo: 'Mas o Google\nexige organização', itens: ['Site próprio e seguro', 'Resultados medidos todo mês', 'As regras do programa seguidas'], rodape: 'É isso que o Palácio faz.', fonte: '**Google para ONGs**, políticas do Ad Grants' },
  { tipo: 'numeros', titulo: 'Confiança se conquista\nmostrando', itens: [{ valor: 83, sufixo: '%', rotulo: 'buscam informações antes de doar' }, { valor: 30, sufixo: '%', rotulo: 'acham a maioria das ONGs confiável' }], fonte: '**IDIS**, Pesquisa Doação Brasil 2024' },
  { tipo: 'numeros', titulo: 'O Palácio já está funcionando', itens: [{ valor: 153, rotulo: 'candidatos a voluntário' }, { valor: 88, rotulo: 'publicações no ar' }, { valor: 177, rotulo: 'arquivos organizados' }], fonte: 'o próprio Palácio, de 20/08 a 09/11/2026' },
  { tipo: 'chamada', titulo: '==11 pessoas== da equipe já estão no Palácio.\nFalta você.' },
]
