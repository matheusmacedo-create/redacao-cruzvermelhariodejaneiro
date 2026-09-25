# Registro de acessos — especificação (proposta, 25/09/2026)

Proposta de implementação da ferramenta que responde **quem entrou, quando, de onde e com qual
aparelho** na Redação. Nada disto está construído ainda: este arquivo é o contrato a aprovar antes
do código. Mudança de decisão muda este arquivo no mesmo commit.

As decisões que dependem do Matheus estão na §10. Até elas serem tomadas, vale o que está marcado
como **recomendado**.

## 1. O que a ferramenta responde

| Pergunta | Onde aparece |
| --- | --- |
| Quem entrou nas últimas horas/dias, e quem tentou e errou? | Administração → **Acessos** |
| De onde (cidade, estado, país, IP) e com qual aparelho (navegador, sistema, celular/computador)? | mesma lista, e o detalhe de cada acesso |
| Esse aparelho é novo para essa pessoa? | selo "aparelho novo" no acesso |
| Quem está com sessão aberta agora, e desde quando? | aba **Sessões abertas**, com botão "Encerrar sessão" |
| O que a pessoa fez depois de entrar? | link do acesso para o histórico de ações que já existe (`activity_log`) |
| Houve algo estranho (muitas senhas erradas, país diferente, aparelho novo)? | alerta no sino e por e-mail (`notificar()`) |
| Quais foram os **meus** acessos? Algum não fui eu? | Meu perfil → **Seus acessos**, com "Não fui eu" |

Não é objetivo: medir produtividade, registrar cada página visitada ou vigiar o que a pessoa faz
fora da Redação. A finalidade declarada é **segurança da conta e dos dados da instituição** (§8).

## 2. O que já existe hoje (e por que não basta)

Levantamento feito no banco de produção e no código em 25/09/2026:

| Fonte | O que guarda | Limite |
| --- | --- | --- |
| `auth.sessions` (Supabase) | IP e navegador de cada sessão **aberta** | só as sessões vivas (3 hoje); ao sair ou expirar, some — não há histórico |
| `auth.audit_log_entries` (Supabase) | eventos de login do Auth | **vazio** em produção: o log do Auth não é gravado no banco |
| `activity_log` | ações (criou, publicou, aprovou…) com autor e data | não registra entrada, saída, IP nem aparelho |
| `membro_sessoes` | sessão da Área do Voluntário, com o navegador | sem IP, sem local, sem tentativas erradas |
| `pedidos_de_recuperacao` | hash do IP de quem pediu redefinição de senha | só serve ao limite de pedidos |
| Trilha pública (`auditoria`) | registro público de documentos | **nunca** recebe dado pessoal — acesso não entra lá |

O ponto que muda o desenho: **o login da equipe acontece no navegador**
(`components/auth/login-form.tsx` chama `signInWithPassword` direto no Supabase). O servidor da
Redação não vê a tentativa, nem certa nem errada, e por isso não tem como registrá-la (§5.1).

## 3. O que se coleta — o "fingerprint"

"Fingerprint completo" cobre três níveis bem diferentes em utilidade, custo e risco jurídico.
**Recomendado: níveis 1 e 2.** O nível 3 fica documentado como opção, fora da primeira versão.

### Nível 1 — o que toda requisição já traz (servidor, sem código no navegador)

| Dado | De onde vem |
| --- | --- |
| IP | `x-real-ip` (na Vercel; o `x-forwarded-for` pode ser forjado pelo cliente e só vale como apoio) |
| País, estado, cidade, CEP aproximado, latitude/longitude aproximadas, fuso | cabeçalhos `x-vercel-ip-country`, `-country-region`, `-city`, `-postal-code`, `-latitude`, `-longitude`, `-timezone` — a Vercel resolve de graça, sem mandar o IP a terceiro |
| Navegador, versão, sistema, tipo de aparelho | `user-agent` e as *client hints* (`sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`) |
| Idiomas | `accept-language` |

Limite honesto: localização por IP é aproximada. Em rede móvel (4G/5G, CGNAT) a cidade costuma
sair errada, às vezes a capital do estado. Serve para "Rio de Janeiro × outro país", não para
endereço.

### Nível 2 — aparelho reconhecível (um script pequeno na tela de login)

| Dado | Para quê |
| --- | --- |
| **Cookie de aparelho** `cvrj_aparelho`: id aleatório de 128 bits, `httpOnly`, `secure`, 400 dias; no banco só o hash | é o que de fato responde "este aparelho já entrou antes?" |
| Fuso do navegador, idiomas, tamanho e densidade da tela, toque, núcleos (`hardwareConcurrency`), memória (`deviceMemory`) | compõem uma **assinatura** do aparelho (hash) que reconhece o mesmo computador quando o cookie foi apagado, e que junta o que diz o servidor ao que diz o aparelho (ex.: IP no Rio com fuso de outro país) |

### Nível 3 — fingerprint invasivo (não recomendado agora)

Canvas, WebGL, áudio, lista de fontes, ou um serviço pago como o FingerprintJS Pro. Identifica o
navegador mesmo em aba anônima e sem cookie.

Por que fica de fora da v1:
- **LGPD, princípio da necessidade** (art. 6º, III): os níveis 1 e 2 já respondem tudo da §1.
  Coletar mais do que o necessário precisa de justificativa que hoje não temos.
- Quem quer burlar troca de navegador ou usa ferramenta anti-fingerprint. O ganho real é contra
  quem não está tentando se esconder, e para esse o cookie já basta.
- O serviço pago manda os sinais do aparelho para uma empresa fora do Brasil: seria transferência
  internacional a declarar na política de privacidade.

Se a decisão for incluir (§10), entra como fase própria, com aviso específico na tela de login.

## 4. Modelo de dados

Tudo no schema `public`, com RLS. Gravação só por RPC `security definer` chamada com a chave de
serviço. As tabelas só aceitam acréscimo: ninguém atualiza nem apaga pela aplicação, a não ser a
rotina de retenção (§8.3).

### 4.1 `acessos_aparelhos` — um aparelho de uma pessoa

| Coluna | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid | |
| `workspace_id` | uuid | |
| `tipo_de_conta` | text | `equipe` (inclui quem tem o papel `escola`, que entra pelo mesmo login) · `voluntario` |
| `conta_id` | uuid | `profiles.id` ou `participantes.id` |
| `cookie_hash` | text | SHA-256 do cookie `cvrj_aparelho` |
| `assinatura` | text | hash dos sinais do nível 2 |
| `rotulo` | text | "Chrome 131 · Windows 11 · computador" |
| `primeiro_em`, `ultimo_em` | timestamptz | |
| `ultimo_ip`, `ultima_cidade` | text | para a lista sem abrir o histórico |
| `confiavel_em` | timestamptz | a pessoa marcou "sou eu" no aviso de aparelho novo |

Única por `(tipo_de_conta, conta_id, cookie_hash)`.

### 4.2 `acessos_eventos` — cada entrada, saída e tentativa

| Coluna | Tipo | Nota |
| --- | --- | --- |
| `id` | bigint identity | |
| `ocorrido_em` | timestamptz | |
| `workspace_id` | uuid | |
| `evento` | text | `entrada` · `entrada_falhou` · `mfa_ok` · `mfa_falhou` · `codigo_pedido` · `saida` · `sessao_encerrada` · `senha_trocada` · `senha_redefinida` · `acesso_negado` |
| `tipo_de_conta`, `conta_id` | text, uuid | `conta_id` nulo quando a tentativa foi com usuário que não existe |
| `identificador_hash` | text | hash do usuário/e-mail digitado — agrupa tentativas sem guardar o que foi digitado |
| `ip` | inet | |
| `pais`, `estado`, `cidade`, `latitude`, `longitude`, `fuso` | | nível 1 |
| `user_agent` | text | cortado em 400 caracteres |
| `navegador`, `sistema`, `dispositivo` | text | já interpretados, para filtrar |
| `aparelho_id` | uuid → `acessos_aparelhos` | |
| `sinais` | jsonb | nível 2 (tela, fuso do navegador, idiomas…) |
| `sessao_ref` | text | hash do id da sessão do Supabase, para "encerrar" e para ligar ao "visto por último" |
| `sinais_de_risco` | text[] | `aparelho_novo` · `pais_novo` · `muitas_falhas` · `fuso_divergente` (§6) |
| `motivo` | text | para `entrada_falhou`/`acesso_negado`: "senha errada", "conta desativada", "sem MFA"… |

Índices: `(conta_id, ocorrido_em desc)`, `(workspace_id, ocorrido_em desc)`,
`(identificador_hash, ocorrido_em)` e `(ip, ocorrido_em)` para os limites de tentativa.

### 4.3 `acessos_sessoes` — sessões abertas e "visto por último"

| Coluna | Nota |
| --- | --- |
| `sessao_ref` (pk) | hash do id da sessão |
| `tipo_de_conta`, `conta_id`, `aparelho_id` | |
| `aberta_em`, `visto_em`, `encerrada_em`, `encerrada_por` | `visto_em` é atualizado no máximo a cada 5 minutos (§5.3) |
| `ultimo_ip`, `ultima_cidade` | |

Esta tabela sim é atualizada: é estado, não histórico. O histórico está em `acessos_eventos`.

### 4.4 Quem lê o quê (RLS)

| Quem | Vê |
| --- | --- |
| admin do espaço | tudo do espaço |
| a própria pessoa | os próprios eventos, aparelhos e sessões (Meu perfil) |
| demais papéis | nada |

Olhar os acessos de outra pessoa também é registrado: a leitura da tela de Acessos e do detalhe
grava uma linha em `activity_log` (`acessos.consultados`, com o filtro usado). Quem vigia também
fica visível.

### 4.5 Volume

Hoje são 4 contas ativas na equipe. Mesmo com 30 pessoas e uns 10 eventos por dia cada, seriam 300
linhas/dia, ~55 mil em 6 meses, na casa de 25 MB. Os voluntários da Área do Voluntário multiplicam
isso por algumas vezes, o que ainda cabe com folga no plano do Supabase. O que pesaria é registrar cada página vista, e isso fica de
fora de propósito.

## 5. Captura — onde entra no código

### 5.1 Login da equipe: passa a ser pelo servidor (recomendado)

Hoje o navegador fala direto com o Supabase. Proposta: uma server action `entrar()` em
`app/actions/entrada.ts`, que:

1. lê o nível 1 dos cabeçalhos e o nível 2 que o formulário manda num campo oculto;
2. confere o limite de tentativas por usuário e por IP (ex.: 5 erros em 15 minutos), que hoje
   **não existe** para a senha da equipe;
3. chama `signInWithPassword` pelo cliente de servidor (`@supabase/ssr` grava o cookie de sessão
   do mesmo jeito);
4. registra `entrada` ou `entrada_falhou` com o motivo, cria/atualiza o aparelho e grava o cookie
   `cvrj_aparelho` se ele não existir;
5. devolve para a tela o próximo passo (MFA, troca de senha obrigatória ou painel), como hoje.

A verificação do MFA (`mfa_ok` / `mfa_falhou`) segue o mesmo caminho.

Alternativa descartada: continuar no navegador e avisar o servidor depois do login. As tentativas
erradas não chegariam (bastaria não chamar o aviso), e o limite de tentativas continuaria sem
existir.

Alternativa a conferir: *Auth Hooks* do Supabase ("password verification attempt"). Eles avisam o
banco de cada tentativa, mas sem IP nem aparelho, e dependem do plano. Servem no máximo de
complemento.

### 5.2 As outras portas

| Porta | Onde | O que acrescentar |
| --- | --- | --- |
| Área do Voluntário (código por e-mail) | `app/actions/membro.ts` → `pedirCodigo`, `entrar`, `sair` | `codigo_pedido`, `entrada`, `entrada_falhou`, `saida`; hoje só grava o navegador |
| Equipe da escola | entra pelo mesmo login da Redação, com o papel `escola` | já coberta pela §5.1; a tela mostra o papel para filtrar |
| Sair | `app/auth/signout/route.ts` | `saida` e fecha a sessão em `acessos_sessoes` |
| Trocar senha / redefinir | `app/actions/usuarios.ts`, `app/actions/contas.ts` | `senha_trocada` / `senha_redefinida` |
| Reconfirmação de senha ao assinar ofício | `app/actions/oficios.ts` | `entrada_falhou` com motivo "senha de assinatura errada", se falhar |
| Acesso negado por permissão | `requirePermissao()` em `lib/session.ts` | `acesso_negado` — só a negativa, não cada acesso permitido |

### 5.3 "Visto por último" sem custo por requisição

No `proxy.ts`, que já renova a sessão a cada requisição: quando o cookie `cvrj_visto` tiver mais
de 5 minutos, atualiza `acessos_sessoes.visto_em` depois da resposta (`waitUntil`) e regrava o
cookie. É o mesmo padrão do `renovarSessaoDoMembro`. Assim, uma pessoa trabalhando o dia todo gera
umas 100 atualizações, e não uma por clique.

Cuidado já visto no Financeiro da escola (PR #208): o prefetch do `<Link>` também passa pelo proxy. A
atualização ignora requisições com `next-router-prefetch` ou `Sec-Purpose: prefetch`.

### 5.4 Encerrar sessão de outra pessoa

Um RPC `security definer`, só para admin, apaga a linha em `auth.sessions`. Isso invalida o
*refresh token* na hora. Limite a registrar na tela: o token de acesso já emitido continua válido
até vencer (1 hora no padrão do Supabase). Para corte imediato, a conta pode ser desativada, como
já existe em `/usuarios`.

## 6. Sinais de risco e alertas

Calculados no momento do registro, sem serviço externo:

| Sinal | Regra | Alerta |
| --- | --- | --- |
| `aparelho_novo` | cookie e assinatura nunca vistos para essa conta | e-mail à própria pessoa: "Novo acesso à sua conta — foi você?" |
| `pais_novo` | país diferente de todos os dos últimos 90 dias | e-mail à pessoa e sino para os admins |
| `muitas_falhas` | 5 ou mais `entrada_falhou` em 15 minutos, pela conta ou pelo IP | sino para os admins; bloqueio temporário da tentativa (§5.1) |
| `fuso_divergente` | fuso do navegador muito diferente do fuso do IP | só marca na lista, sem alerta (VPN é comum) |

Tudo passa por `notificar()` (`lib/notificacoes/servidor.ts`), respeitando as preferências da
pessoa. "Viagem impossível" (dois acessos distantes em pouco tempo) fica para depois: com a
imprecisão do IP móvel, daria alarme falso demais.

## 7. Telas

- **Administração → Acessos** (`/acessos`, só admin, no grupo Administração do menu —
  `lib/navegacao.ts`):
  - lista dos últimos acessos: pessoa, evento, quando, cidade/UF/país, aparelho e os selos de
    risco;
  - filtros por pessoa, período, tipo de evento, "só falhas" e "só aparelhos novos";
  - detalhe do acesso com todos os campos, os outros acessos do mesmo aparelho e do mesmo IP, e as
    ações feitas na sessão (`activity_log`);
  - aba **Sessões abertas** com "Encerrar sessão";
  - exportar CSV do período filtrado (a exportação também é registrada).
- **Perfil da pessoa** (`/pessoas/[id]`): aba **Acessos** para admin, com os aparelhos da pessoa e
  os últimos eventos.
- **Meu perfil**: "Seus acessos recentes" e "Seus aparelhos". O botão **Não fui eu** encerra as
  outras sessões, pede a troca da senha e avisa os admins.
- **Tela de login**: uma linha discreta, "Registramos data, local aproximado e aparelho de cada
  acesso, para a segurança da sua conta", com link para a política de privacidade.

## 8. LGPD e transparência

1. **Base legal:** legítimo interesse e segurança da informação (LGPD art. 7º, IX, e art. 46).
   Referência de boa prática: o Marco Civil da Internet (art. 15) manda provedores de aplicação
   guardarem os registros de acesso (IP, data e hora) por 6 meses. A obrigação vale para quem tem
   fins econômicos, mas o prazo serve de régua.
2. **Transparência:** aviso na tela de login e uma seção na política de privacidade do site
   (`/privacidade/`) dizendo o que se coleta, para quê, por quanto tempo e quem vê.
3. **Retenção (recomendado):** 6 meses com o registro completo. Depois disso, a rotina diária
   apaga IP, user agent e sinais e guarda só evento, data, pessoa e cidade/país por mais 18 meses,
   para estatística e investigação tardia. Aparelho sem uso há 13 meses é apagado.
4. **Direitos da pessoa** (art. 18): ela vê os próprios acessos em Meu perfil. O pedido de cópia ou
   de exclusão segue o canal da política de privacidade, e a exclusão respeita o prazo de
   segurança do item 3.
5. **Sem terceiros:** a geolocalização vem da própria Vercel. Nenhum dado de acesso vai para a
   trilha pública, para as redes ou para serviço de análise.
6. **Finalidade restrita:** o registro serve à segurança. Usá-lo para avaliar desempenho ou horário
   de trabalho exigiria outra base legal e outro aviso, e está fora deste escopo.

## 9. Fases

| Fase | Entrega | Depende de |
| --- | --- | --- |
| **1. Base** | migração (tabelas, RLS, RPCs `acessos_registrar` e `acessos_listar`); login da equipe pelo servidor com limite de tentativas; cookie de aparelho; tela Acessos (lista e detalhe) | §10 itens 1–3 |
| **2. Sessões** | "visto por último" no proxy; aba Sessões abertas; encerrar sessão; eventos de saída e troca de senha | fase 1 |
| **3. Alertas e Meu perfil** | sinais de risco, e-mails e sino; "Seus acessos" e "Não fui eu"; aviso na tela de login e texto da política de privacidade | fase 1 |
| **4. Área do Voluntário** | entrada por código, saída e tentativas dos voluntários | fase 1; §10 item 4 |
| **5. Retenção** | rotina diária de anonimização e limpeza (cron da Vercel) | fase 1; §10 item 2 |
| 6. (opcional) Nível 3 | fingerprint avançado | §10 item 1 |

Cada fase segue o de sempre: migração só com acréscimos e ensaiada no banco local, módulo puro em
`lib/acessos/` (interpretação do user agent, assinatura do aparelho, regras de risco) conferido com
`npx tsx`, e `tsc`, eslint e build antes do push.

## 10. Decisões do Matheus

1. **Nível de coleta:** níveis 1 e 2 (recomendado), ou também o 3?
2. **Retenção:** 6 meses completo + 18 meses reduzido (recomendado), ou outro prazo?
3. **Quem vê:** só admin (recomendado), ou também as coordenações, cada uma só a sua equipe?
4. **Quem entra no registro:** equipe, incluindo a da escola (recomendado para começar), e também os
   voluntários da Área do Voluntário?
5. **Alerta de aparelho novo por e-mail à própria pessoa:** sim (recomendado) ou só no sino?
6. **Bloqueio por tentativas:** 5 erros em 15 minutos bloqueia por 15 minutos (recomendado)?
