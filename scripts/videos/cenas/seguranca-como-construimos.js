// "Como o Palácio é construído, com o Claude" (docs/AJUDA.md §18): a obra, as regras e a governança. Cenas na ordem das falas.
window.CENAS = [
  { tipo: 'capa', etiqueta: 'Como o Palácio é construído', titulo: 'Sob medida para a filial,\n==com ajuda de inteligência artificial==.' },
  { tipo: 'dupla', titulo: 'Pense numa obra', esquerda: { titulo: 'O Matheus', subtitulo: 'o engenheiro responsável', itens: ['Diz o que a filial precisa', 'Confere tudo', 'Aprova o que entra no ar'] }, direita: { titulo: 'O Claude', subtitulo: 'o mestre de obras', itens: ['Constrói muito rápido', 'Segue as normas', 'Nunca põe nada no ar sozinho'] } },
  { tipo: 'lista', titulo: 'O Claude não faz\ntudo o que pedem', itens: ['As regras escritas do projeto', 'As boas práticas do mercado', 'As regras da empresa que o fez'], rodape: 'Nenhuma depende de quem pede.' },
  { tipo: 'capa', etiqueta: 'Um exemplo de verdade', titulo: 'Pediram um começo\n==sem senha==.', texto: 'O Claude simplificou tudo, mas manteve **duas travas**: a coordenação aprova o e-mail, e a administração convida para o Palácio.' },
  { tipo: 'passos', titulo: 'O caminho de toda mudança', itens: ['Preparada à parte', 'Conferida por verificações automáticas', 'Testada numa versão de teste', 'Aprovada pelo responsável', 'No ar, e registrada para sempre'] },
  { tipo: 'numero', antes: 'Desde agosto de 2026', valor: 386, rotulo: 'mudanças aprovadas e registradas', detalhe: 'Cada uma com **quem fez, quando e por quê**.', fonte: 'histórico público do código do Palácio (GitHub), até 09/11/2026' },
  { tipo: 'chamada', titulo: 'O código é aberto.\n==Qualquer pessoa pode conferir.==' },
]
