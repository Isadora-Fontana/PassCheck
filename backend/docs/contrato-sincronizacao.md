# Contrato de sincronização — Etapa 4

Atualização da Etapa 7: POST exige Bearer JWT válido, concessão para evento/portão
e instalação registrada/ativa do usuário autenticado. Verificação antecede
qualquer consulta de recibo, inclusive reenvios, dentro de cada transação. Falta
de autenticação retorna 401; acesso negado, 403; nenhum desses erros autoriza
apagar pendências. JSONs de negócio e chave de idempotência permanecem iguais.
O contrato atual de acesso está em [contrato-autenticacao.md](contrato-autenticacao.md).
Menções à ausência de autenticação no texto histórico não descrevem o backend atual.

Data: 17/10/2026. Versão proposta: 1. Responsável pelo backend: Gabriel.

Atualização da Etapa 5: Gabriel aprovou expressamente esta versão e autorizou a
migração 003 para resolver a pendência de auditoria durável. A implementação e
seus resultados estão em [validacao-etapa-5.md](validacao-etapa-5.md) e a decisão
está em [D06](decisoes.md#d06--sincronização-e-auditoria-autorizadas-na-etapa-5).
O texto abaixo preserva a análise e a especificação da Etapa 4; menções à ausência
do endpoint/auditoria descrevem aquele momento. As adaptações do frontend e a
resolução administrativa continuam pendentes, fora do escopo da Etapa 5.

Esta entrega define o contrato para a futura implementação de `POST /sincronizacao`, sem prefixo `/api`. As regras abaixo são a especificação proposta para a Etapa 5; não representam um endpoint entregue nem aprovação de mudanças no frontend. A compatibilidade foi analisada estaticamente contra o código local. A integração e os testes de sincronização ainda precisam ser executados em etapa autorizada.

## 1. Referências e resultado da auditoria

Foram consultados:

- [Plano de Ação Backend](../../docs/Plano_de_Acao_Backend_PassCheck.md), principalmente seção 7: identificação, reenvio, resultados e resolução de pendências.
- [Decisões D01–D05](decisoes.md): stack aprovada, limites de cada autorização, persistência e APIs GET. D01–D03 registram 16/10; D04–D05 registram 17/10. A numeração das etapas deste documento segue as solicitações atuais de Gabriel, não a tabela histórica do plano.
- [IndexedDB](../../frontend/src/db.js), [API do frontend](../../frontend/src/api.js), [scanner](../../frontend/src/screens/scanner.js), [preparação](../../frontend/src/screens/preparacao.js), [service worker](../../frontend/src/service-worker.js) e [mocks de ingressos](../../frontend/src/mocks/ingressos.js).
- [Migração 001](../src/db/migrations/001_modelo_central.sql), [migração 002](../src/db/migrations/002_integridade_confirmacoes.sql), [modelo relacional](modelo-relacional.md), conexão SQLite, aplicação, middleware de erros, CORS e testes existentes.

`PassCheck_Documentacao_Backend_Atualizada.md` v0.2 e o PEI IV original continuam ausentes do workspace, conforme os registros anteriores. O plano local referencia esses documentos; isso não equivale à consulta direta aos originais. Não se presumem requisitos adicionais a partir deles.

### Comportamento efetivamente implementado

| Componente | Evidência no código | Consequência para o contrato |
|---|---|---|
| `db.js:abrirBanco` | Banco `passcheck`, versão 1; `validacoesPendentes` com `keyPath: 'id'`, `autoIncrement: true` | O ID local existente é numérico; ainda não existe campo `idLocal` |
| `registrarValidacao` | Uma transação grava uso local e pendência; só conclui como válida após `oncomplete` | O envio deve partir do registro persistido, sem recriar a validação |
| `classificarIngresso` | Só `VALIDO` gera pendência; `INVALIDO`, `PORTAO_INCORRETO` e `JA_UTILIZADO` não geram histórico local | Este POST envia entradas localmente aceitas; não é uma API de todas as tentativas do scanner |
| `obterIdDispositivo` | Identificador em `operacao['dispositivo']`; UUID ou fallback com data/`Math.random`; leitura e escrita separadas | Há persistência normal entre recargas, mas falta criação atômica entre abas e geração forte em todos os caminhos |
| `contarValidacoesPendentes` | Conta `!sincronizado` | Conflitos/rejeições deverão continuar contando como pendências não resolvidas |
| `salvarPreparacao` | Bloqueio de troca consultado antes da transação; limpa apenas `ingressos`; preserva usos do mesmo evento | A fila não é apagada pela preparação; a proteção precisa ficar atômica para múltiplas abas |
| `api.js` | Somente três funções de leitura com mocks | Não há serializador, POST nem aplicação de resposta de sincronização |
| Scanner e service worker | `online` atualiza indicação visual; worker cuida dos arquivos do app | Não há envio automático nem Background Sync implementado |
| Horário exibido | Preparação grava `ultimaSincronizacao`; scanner mostra `—` | Download e confirmação de envio precisam de indicadores distintos |
| Backend | Somente health e GETs de eventos; teste existente espera POST `/sincronizacao` com 404; CORS anuncia apenas GET | Endpoint, preflight POST e tratamento específico serão trabalho posterior |

### Campos reais da pendência e mapeamento

Os tipos abaixo são produzidos pelo código e pelos mocks atuais; IndexedDB não aplica um schema que impeça registros adulterados. O servidor deverá validar tudo novamente.

| Campo persistido | Tipo atual | Destino no JSON |
|---|---|---|
| `id` | number, autogerado | `validacoes[].idLocal = String(id)` |
| `ingressoId` | number | `validacoes[].ingressoId` |
| `codigo` | string, valor exato do ingresso | `validacoes[].codigo` |
| `eventoId` | number | `eventoId` do grupo |
| `portaoId` | number | `portaoId` do grupo |
| `dispositivo` | string, capturada ao criar a pendência | `dispositivo` do grupo |
| `dataHora` | string de `new Date().toISOString()` | `validacoes[].dataHora` |
| `sincronizado` | boolean, inicialmente `false` | Somente controle local; não enviar |

O cliente deve agrupar pela tripla **dos registros** `(eventoId, portaoId, dispositivo)`. Não deve substituir esses campos pela operação atualmente selecionada nem pelo identificador global atual. Mesmo uma fila antiga com diferentes identificadores pode ser transmitida em grupos separados. Não enviar `id`, `sincronizado` ou repetir os campos do grupo em cada item.

## 2. Identidade local e ciclo de vida

### Decisão proposta

Adotar `idLocal = String(id)` com inteiro positivo seguro e representação decimal canônica, junto de `(dispositivo, idLocal)` como identidade permanente do fato. Não gerar um novo ID ao tentar novamente, ao agrupar, ao dividir um lote ou após uma falha de rede. Um novo UUID por validação não é necessário para esta versão.

`dispositivo` identifica uma **instalação/geração da fila por origem e perfil do navegador**, não o aparelho físico nem o operador. Para novas instalações, gerar UUID v4 com `crypto.randomUUID()`, disponível em contexto seguro e sem chamada ao servidor. Quando essa API não estiver disponível, a alternativa permitida é UUID v4 construído com `crypto.getRandomValues`, com bits de versão/variante corretos e testes próprios; retirar o fallback `Math.random`. Se não houver gerador criptográfico disponível, sinalizar falha de preparação, sem aceitar uma entrada que não possa ser registrada com segurança. [MDN: randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).

Persistir em `operacao['dispositivo']`. Ler, criar se ausente e gravar em uma única transação `readwrite`; só publicar o resultado após `transaction.oncomplete`. Duas abas precisam observar o mesmo identificador comprometido no banco. A criação da pendência também deve verificar a identidade e a operação vigente dentro de uma transação que inclua `operacao`, `ingressos` e `validacoesPendentes`. Não esperar rede dentro dessa transação.

Identificadores legados já gravados são preservados exatamente nos reenvios. O protocolo aceita o formato legado, mas sua qualidade de geração não passa a ser garantida por isso. Para novas pendências de uma instalação com identificador fraco, adotar um novo UUID atomicamente, mantendo o identificador antigo nos registros já existentes. O agrupamento por registro permite enviar ambos. Não reidentificar silenciosamente um fato que pode já ter chegado ao servidor.

UUID aleatório oferece unicidade probabilística forte, não prova de exclusividade. Clonar um perfil/base pode copiar a identidade; uma restauração antiga pode recuar o contador. Sem coordenação online, não se pode provar que duas cópias não estão operando simultaneamente. Exportação/restauração automática da fila não faz parte deste contrato.

### Exclusão, recriação e recuperação

| Situação | Regra |
|---|---|
| Recarregar app, reiniciar navegador ou atualizar arquivos do service worker | Preservar identidade e IDs |
| Excluir um registro ou executar `clear()` na store existente | O gerador não volta ao início; ainda assim não limpar pendências não resolvidas |
| Excluir/recriar `validacoesPendentes`, ou recriar a base | Pode reiniciar IDs; criar uma nova identidade para os novos fatos junto do novo ciclo da fila |
| Recriar apenas a store mantendo `operacao` | Rotacionar a identidade na mesma transação de upgrade; nunca combinar contador novo e identidade antiga |
| Recuperar registros antigos preservados | Manter suas duplas originais e seu conteúdo; novas entradas usam identidade nova; nunca renumerar os fatos recuperados |
| Restaurar snapshot antigo ou clonar perfil | Exigir procedimento controlado antes de voltar a operar: preservar fatos antigos, nova identidade para novas entradas e impedir duas cópias operantes com a mesma geração |
| Limpeza de dados pelo usuário/navegador | Uma nova instalação pode operar com outro UUID, mas pendências perdidas não podem ser reconstruídas pelo POST |

O gerador IndexedDB não diminui por exclusão de registros ou `clear()`; a criação de uma nova store cria outro gerador. Alterações abortadas são revertidas. Essas distinções sustentam a política acima. [Especificação IndexedDB, geradores de chave](https://www.w3.org/TR/IndexedDB/#key-generator-concept).

Se houver pendências não resolvidas, nenhuma rotina de manutenção deve apagar a fila para “destravar” a operação. Persistir o UUID em `localStorage` enquanto se recria somente o IndexedDB também não resolve o problema: preservaria a identidade com o contador reiniciado. A rotação deve acompanhar a geração da fila, não uma troca de evento/portão.

## 3. Requisição JSON proposta

`POST /sincronizacao`, `Content-Type: application/json` (UTF-8). Sem prefixo `/api` e sem parâmetros de escopo na URL. O objeto de topo e cada item têm somente os campos definidos abaixo; propriedades desconhecidas são erro de contrato.

| Campo | Validação |
|---|---|
| `eventoId`, `portaoId` | JSON number, inteiros positivos seguros: 1 a 9007199254740991; sem coerção de strings |
| `dispositivo` | String de 1–128 caracteres ASCII em `[A-Za-z0-9._:-]`, sem normalização de caixa; novas identidades são UUID v4; prefixo `seed:` reservado e recusado na API |
| `validacoes` | Array de 1–100 itens; `idLocal` não pode repetir dentro do lote, mesmo com conteúdo igual |
| `idLocal` | String decimal positiva canônica, sem sinal/zeros à esquerda, representando inteiro seguro; exemplos válidos: `"1"`, `"17"` |
| `ingressoId` | JSON number, inteiro positivo seguro |
| `codigo` | String não vazia, até 128 unidades UTF-16, sem controles U+0000–001F/U+007F e sem espaços nas extremidades; comparação literal e sensível a maiúsculas |
| `dataHora` | String UTC: `YYYY-MM-DDTHH:mm:ssZ` ou `YYYY-MM-DDTHH:mm:ss.SSSZ`; data de calendário válida, ano 0001–9999, segundos 00–59; sem `null`, offset local ou coerção |

Os limites de strings são validação HTTP proposta, não restrições adicionadas às tabelas. Não aparar ou transformar `codigo`: o scanner já usa o código do ingresso persistido. Aceitar `Z` sem milissegundos mantém o exemplo inicial compatível; o frontend atual produz três casas decimais. Normalizar o instante para `YYYY-MM-DDTHH:mm:ss.SSSZ` depois de validar calendário e formato, sem aceitar a correção automática de datas impossíveis.

Limites independentes: no máximo **100 itens** e **100 KiB (102400 bytes)** de corpo JSON, respeitando o limite existente do parser Express. Quantidade excessiva ou corpo excessivo: HTTP 413. Lote vazio, campos/tipos inválidos ou IDs locais repetidos: HTTP 400, sem gravação de qualquer item. O cliente divide em grupos menores por quantidade e tamanho UTF-8; não perde nem renumera itens. Mais de um item pode referir-se ao mesmo ingresso se tiver chaves locais distintas: isso é tratado como negócio, não como erro estrutural.

Não se exige que o horário do celular esteja próximo do servidor nem dentro da data do evento. Relógios errados e envio posterior são compatíveis com operação offline. Guardar o instante informado e o horário do servidor; usar o commit central para decidir precedência. Não ordenar vencedores pelo horário declarado, não substituir esse horário em cada tentativa e não usá-lo como prova de autorização ou presença.

## 4. Resposta, estados e motivos

HTTP 200 devolve `{ "resultados": [...] }`, com exatamente um resultado para cada `idLocal`, na ordem recebida. Nenhum resultado pode se referir a um item que não veio no lote. HTTP 200 significa processamento completo dos itens, inclusive os recusados; não significa sucesso de todas as entradas. Não usar HTTP 409 ou 207 para conflitos individuais nesta versão.

| `status` de negócio na resposta | Campos adicionais obrigatórios | Fato persistido | Política local |
|---|---|---|---|
| `CONFIRMADA` | `validacaoId`: inteiro positivo seguro | Recibo CONFIRMADA e uma validação | `sincronizado = true`; preservar histórico |
| `JA_PROCESSADA` com `resultadoOriginal: CONFIRMADA` | `resultadoOriginal`, `validacaoId` original | Nenhum fato novo | `sincronizado = true`; sem nova contagem |
| `CONFLITO` | `motivo: INGRESSO_JA_UTILIZADO` | Recibo CONFLITO, sem validação nova | Manter `sincronizado = false` e caso para revisão |
| `REJEITADA` | `motivo` do catálogo abaixo | Recibo REJEITADA, exceto colisão de chave descrita adiante | Manter `sincronizado = false` e caso para revisão |
| `JA_PROCESSADA` com original CONFLITO ou REJEITADA | `resultadoOriginal` e `motivo` original | Nenhum fato novo | Preservar problema; não tratar como confirmação |
| Sem resultado confiável | Não se aplica | Pode ter ocorrido commit central | Preservar fila e repetir os mesmos fatos |

Todos os resultados contêm `idLocal` e `status`. `validacaoId` só aparece nas confirmações e em seus reenvios. `resultadoOriginal` só aparece em `JA_PROCESSADA`; `motivo` só aparece em conflito/rejeição ou no reenvio desses resultados. Não retornar o identificador de outro dispositivo, o código QR ou detalhes da entrada vencedora em conflitos. As mensagens para humanos ficam no cliente, a partir dos códigos estáveis.

O banco admite apenas CONFIRMADA, CONFLITO e REJEITADA em `recebimentos.status`. `JA_PROCESSADA` é uma representação HTTP de um fato anterior, nunca uma atualização de status ou uma nova linha. Um recibo confirmado sem sua validação correspondente indica falha de integridade: responder erro interno e investigar; não inventar `validacaoId` nem reconhecer o item como sincronizado.

### Regras de negócio e precedência

Primeiro consultar a chave de idempotência. Para uma chave nova, verificar nesta ordem:

| Verificação | Resultado se falhar |
|---|---|
| Evento existe | REJEITADA / `EVENTO_INEXISTENTE` |
| Portão existe | REJEITADA / `PORTAO_INEXISTENTE` |
| Portão pertence ao evento informado | REJEITADA / `PORTAO_INCOMPATIVEL` |
| Ingresso existe pelo `ingressoId` | REJEITADA / `INGRESSO_INEXISTENTE` |
| ID e código correspondem ao mesmo ingresso | REJEITADA / `CODIGO_INCOMPATIVEL` |
| Ingresso pertence ao evento informado | REJEITADA / `EVENTO_INCOMPATIVEL` |
| Ingresso pertence ao portão informado | REJEITADA / `PORTAO_INCOMPATIVEL` |
| Ingresso ainda não tem confirmação | CONFLITO / `INGRESSO_JA_UTILIZADO` |
| Todas as verificações passam | CONFIRMADA, com a nova `validacaoId` |

Eventos/portões inexistentes no cabeçalho são erros de negócio de cada item estruturalmente válido: gerar recibos REJEITADA e HTTP 200 com todos os resultados. Não responder 404 de recurso e perder a auditoria do lote. IDs com tipo/formato inválido continuam sendo HTTP 400 antes de qualquer transação.

Uma chave nova para um ingresso já confirmado gera CONFLITO mesmo se vier do mesmo dispositivo. O servidor não consegue afirmar que outro ID local descreve o mesmo fato. Dois dispositivos concorrentes disputam a primeira confirmação válida comprometida no banco; a segunda recebe conflito. A sincronização detecta uso duplicado central, mas não desfaz a entrada física que dois aparelhos offline já autorizaram.

## 5. Idempotência e conteúdo normalizado

Chave única: `recebimentos(dispositivo, id_local)`. Comparar valores exatos, com SQL parametrizado. Não limitar essa identidade ao evento ou ao portão: ela é global para a instalação.

Para cada item, construir um JSON com estas propriedades nesta ordem, usando os tipos já validados:

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "ingressoId": 1,
  "codigo": "PC-A7X9K2",
  "dataHora": "2026-11-20T22:03:27.000Z"
}
```

Persistir `JSON.stringify` desse objeto em `conteudo_normalizado`, sem espaços adicionais. Dispositivo/ID local já são a chave; posição no lote, ordem das propriedades de entrada, espaços do JSON e campos locais não entram no conteúdo. As duas formas aceitas do mesmo instante (`...27Z` e `...27.000Z`) produzem o mesmo conteúdo. Alterar evento, portão, ingresso, código ou instante altera a identidade de conteúdo. Não comparar o corpo bruto, só o ingresso, ou apenas um hash sem o conteúdo guardado.

| Situação | Efeito |
|---|---|
| Chave inexistente | Julgar negócio e gravar o resultado final |
| Chave existente, conteúdo igual | Recuperar resultado original, com mesmo `validacaoId` quando confirmado; responder JA_PROCESSADA |
| Chave existente, conteúdo diferente | REJEITADA / `IDEMPOTENCIA_DIVERGENTE`; preservar integralmente o recibo e a confirmação originais |

Um reenvio de rejeição não é reavaliado porque o cadastro foi corrigido depois. O recibo é histórico imutável. Uma eventual correção precisa de fluxo explícito e auditável, fora deste endpoint; não orientar o cliente a trocar `idLocal` para contornar uma rejeição. Uma tentativa divergente também não substitui o resultado original: reenviar posteriormente o conteúdo original recupera o original.

Os dois recibos sintéticos do seed (`seed:frontend:1838a5a`, horário de cliente nulo) não são pendências enviáveis. Permanecem intocados. Os ingressos 4 e 12 já possuem confirmação e geram conflito para uma nova tentativa real.

### Auditoria e limite do modelo existente

Confirmações, conflitos e rejeições de negócio **com chave nova** cabem no modelo atual: o recibo registra chave, conteúdo, status, motivo e `recebido_em`. Os identificadores no JSON não têm FKs, permitindo auditar um ingresso inexistente. Conflitos/rejeições não criam `validacoes` nem mudam `utilizado`.

Uma tentativa com `IDEMPOTENCIA_DIVERGENTE` não cabe como segundo recibo sob a mesma chave UNIQUE. Não usar UPDATE, REPLACE, novo `id_local` artificial ou uma validação fictícia. O resultado dessa tentativa é calculado comparando com o original; o original permanece recuperável.

Para registrar também **essa tentativa divergente**, propõe-se evento estruturado de auditoria separado, com ID de correlação da requisição, horário do servidor, ID do recibo original, hashes SHA-256 dos conteúdos canônicos original/apresentado e motivo. Não registrar o corpo, código QR, credenciais ou conteúdo pessoal em logs. Erros estruturais não identificáveis geram apenas log sanitizado e HTTP, não recibos fictícios.

O backend atual só tem log genérico de erro; não existe destino durável de auditoria nem tabela de tentativas. Portanto, o registro durável de divergências é uma **pendência real**, não uma garantia entregue. Antes de considerar a auditoria operacional completa, Gabriel deve aprovar um destino persistente de eventos ou, em outro escopo autorizado, um modelo adicional para tentativas. `console.log` sozinho não comprova retenção. Falha ao registrar a auditoria exigida deve produzir erro técnico e preservar o original, nunca uma confirmação falsa. Esta etapa não cria infraestrutura ou migração.

## 6. Fluxo transacional proposto

1. Validar tipo de mídia, tamanho, schema estrito, limites e ausência de IDs locais repetidos no lote inteiro. Nenhuma escrita antes da aprovação estrutural completa. Autenticação/autorização, quando introduzidas em etapa própria, deverão ocorrer antes de consultar ou revelar recibos.
2. Percorrer os itens na ordem do array. Para cada item, abrir uma transação curta `BEGIN IMMEDIATE` na conexão com foreign keys e triggers habilitadas.
3. Consultar `(dispositivo, id_local)` dentro da transação. Tratar reenvio ou divergência antes de reavaliar o negócio. Uma eventual exigência de auditoria externa não deve manter uma transação SQLite aberta enquanto aguarda rede.
4. Para chave nova, conferir os vínculos e o código conforme a seção 4. Persistir um recibo REJEITADA ou CONFLITO quando aplicável.
5. Se disponível, inserir **recibo CONFIRMADA → validação referenciando recibo/ingresso**. O trigger existente marca `ingressos.utilizado = 1`. Não atualizar o booleano antes e não confirmar o recibo sozinho.
6. Efetuar commit do item antes de incluí-lo nos resultados. O horário de cliente normalizado vai para `data_hora_cliente`; os horários do servidor vêm dos defaults do banco. Não aceitar horário de servidor fornecido pelo celular.
7. Em erro técnico, desfazer integralmente a transação do item, interromper o restante do lote e responder erro HTTP, se ainda houver conexão. Itens anteriores podem já estar comprometidos; jamais informar que o lote inteiro sofreu rollback.
8. Se todos os itens tiveram resultado, responder HTTP 200. Se a resposta se perder, o cliente reenvia as mesmas chaves/conteúdos e recupera os recibos.

O SQLite serializa escritores; `BEGIN IMMEDIATE` obtém a transação de escrita antes de ler/decidir e pode falhar com banco ocupado. Manter transações por item e usar as restrições UNIQUE como proteção adicional. [SQLite: transações](https://www.sqlite.org/lang_transaction.html).

Preservar o timeout de conexão atual de 5 segundos; no primeiro esgotamento por disputa, interromper o lote e retornar 503, sem um laço ilimitado de tentativas no servidor. Não converter genericamente qualquer violação SQL em CONFLITO: FKs, triggers ou vínculos inesperados podem indicar defeito e exigem rollback/500. Somente concorrência comprovada sobre uma confirmação existente permite classificar conflito.

O schema não obriga sozinho todo recibo CONFIRMADA a ter validação nem confere o JSON contra o ingresso. A transação e o serviço devem fechar essas duas invariantes. Recibos/validações são imutáveis por triggers; resoluções futuras não podem reescrever o fato original. Não é necessária migração para o caminho principal proposto.

```mermaid
sequenceDiagram
    participant C as Cliente com fila persistida
    participant A as API futura
    participant B as SQLite
    C->>A: Lote com dispositivo + idLocal estáveis
    A->>B: BEGIN IMMEDIATE; consultar recibo
    A->>B: Gravar recibo e validação; COMMIT
    Note over C,A: Resposta perdida
    C->>A: Reenvio do mesmo fato
    A->>B: Consultar recibo e conteúdo
    B-->>A: Confirmação original
    A-->>C: JA_PROCESSADA + CONFIRMADA + mesmo validacaoId
    C->>C: Gravar reconhecimento; aguardar oncomplete
```

## 7. Política HTTP e recuperação

Erros de requisição/infraestrutura seguem `{ "erro": "CODIGO", "mensagem": "Texto seguro." }`, conforme o middleware atual. Os códigos novos abaixo são propostos; ainda não estão implementados. Não devolver stack, SQL ou corpo recebido.

| HTTP | Código/situação | Persistência e ação do cliente |
|---|---|---|
| 200 | Resultados completos, inclusive CONFLITO/REJEITADA | Aplicar política por item após validar a resposta inteira |
| 400 | `JSON_INVALIDO` ou `LOTE_INVALIDO` | Nenhuma escrita; manter fila e corrigir serialização, sem loop automático |
| 413 | `CORPO_MUITO_GRANDE` ou `LOTE_MUITO_GRANDE` | Nenhuma escrita; dividir lote preservando chaves/conteúdo; item isolado excessivo exige revisão |
| 415 | `TIPO_DE_CONTEUDO_INVALIDO` | Nenhuma escrita; enviar JSON com tipo de mídia correto |
| 403 | `ORIGEM_NAO_PERMITIDA` do CORS | Nenhuma escrita na aplicação; erro de configuração, não apagar fila |
| 404 | Endpoint ausente/URL incompatível | Não é resultado de item; verificar versão/endereço, preservar fila |
| 500 | `ERRO_INTERNO` | Item em andamento revertido; anteriores podem estar gravados; manter fila e tentar novamente com atraso limitado, sinalizando falhas persistentes |
| 503 | `BANCO_INDISPONIVEL`, com `Retry-After: 1` | Mesmo cuidado com commits anteriores; repetir lote com as mesmas identidades |
| Sem resposta, timeout ou resposta ilegível | Resultado remoto desconhecido | Não reconhecer nenhum item; repetir sem recriar fatos |

Não há `resultados` parciais reconhecíveis em respostas 500/503. Descartar o conjunto parcial em memória e permitir reenvio integral. HTTP 200 com lista truncada, IDs ausentes/repetidos/desconhecidos, status desconhecido ou campos obrigatórios faltantes também não autoriza reconhecimento: repetir o lote com segurança e registrar falha de protocolo.

O cliente deve usar uma rotina de envio coordenada por instalação, com tentativas ao abrir o app, acionar sincronização ou recuperar conectividade. `navigator.onLine` é apenas um gatilho; sucesso depende da API. Não depender de Background Sync para o fluxo básico. Para falhas transitórias, propor atrasos de 1, 2, 4, 8, 16 e 30 segundos com variação aleatória, respeitando `Retry-After`; após seis tentativas consecutivas, manter a fila e aguardar ação/reabertura/novo sinal de conectividade. Uma falha de rede não impede continuar registrando novas entradas offline.

Se um intermediário retornar 401/403 de acesso ou 429, preservar a fila: exigir regularização de acesso ou respeitar o atraso, respectivamente. Isso não significa autenticação ou rate limiting implementados. CORS não autentica instalações e não impede clientes fora do navegador. O identificador é declarado pelo cliente; o uso operacional fora de ambiente controlado exige a etapa de controle de acesso.

## 8. Exemplos completos

Os exemplos são **ilustrativos do contrato**, não respostas HTTP executadas. IDs/códigos dos ingressos usados são os mocks reais. IDs de validação são exemplos de valores atribuídos pelo SQLite; não são IDs inventados de ingresso. Os cenários são independentes, exceto quando explicitamente indicam reenvio.

### A. Confirmação de um ingresso disponível

Requisição (`POST /sincronizacao`, JSON):

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "971b6382-28ad-4f06-9d71-97ef1ada8df0",
  "validacoes": [
    {
      "idLocal": "17",
      "ingressoId": 1,
      "codigo": "PC-A7X9K2",
      "dataHora": "2026-11-20T22:03:27Z"
    }
  ]
}
```

Resposta HTTP 200:

```json
{
  "resultados": [
    { "idLocal": "17", "status": "CONFIRMADA", "validacaoId": 101 }
  ]
}
```

### B. Resposta perdida e reenvio

Reenviar exatamente a requisição A. Resposta HTTP 200, sem nova confirmação:

```json
{
  "resultados": [
    {
      "idLocal": "17",
      "status": "JA_PROCESSADA",
      "resultadoOriginal": "CONFIRMADA",
      "validacaoId": 101
    }
  ]
}
```

### C. Lote com confirmação, conflito e rejeição

Estado inicial dos mocks: ingresso 2 disponível; ingresso 4 já utilizado; ingresso 6 pertence ao portão 2. A tentativa incompatível é intencional para ilustrar a defesa do servidor, embora o scanner normal deva barrá-la localmente.

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "971b6382-28ad-4f06-9d71-97ef1ada8df0",
  "validacoes": [
    { "idLocal": "18", "ingressoId": 2, "codigo": "PC-B3M8Q1", "dataHora": "2026-11-20T22:04:00.000Z" },
    { "idLocal": "19", "ingressoId": 4, "codigo": "PC-D9R4L6", "dataHora": "2026-11-20T22:04:01.000Z" },
    { "idLocal": "20", "ingressoId": 6, "codigo": "PC-F8N3V5", "dataHora": "2026-11-20T22:04:02.000Z" }
  ]
}
```

Resposta HTTP 200:

```json
{
  "resultados": [
    { "idLocal": "18", "status": "CONFIRMADA", "validacaoId": 102 },
    { "idLocal": "19", "status": "CONFLITO", "motivo": "INGRESSO_JA_UTILIZADO" },
    { "idLocal": "20", "status": "REJEITADA", "motivo": "PORTAO_INCOMPATIVEL" }
  ]
}
```

Reenvio da mesma requisição C, HTTP 200:

```json
{
  "resultados": [
    { "idLocal": "18", "status": "JA_PROCESSADA", "resultadoOriginal": "CONFIRMADA", "validacaoId": 102 },
    { "idLocal": "19", "status": "JA_PROCESSADA", "resultadoOriginal": "CONFLITO", "motivo": "INGRESSO_JA_UTILIZADO" },
    { "idLocal": "20", "status": "JA_PROCESSADA", "resultadoOriginal": "REJEITADA", "motivo": "PORTAO_INCOMPATIVEL" }
  ]
}
```

### D. Segundo dispositivo depois da confirmação A

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "044b3ce0-652c-4ceb-b5c8-6ac4d58e8802",
  "validacoes": [
    { "idLocal": "17", "ingressoId": 1, "codigo": "PC-A7X9K2", "dataHora": "2026-11-20T22:03:26.000Z" }
  ]
}
```

Resposta HTTP 200, mesmo que o segundo celular declare horário anterior:

```json
{
  "resultados": [
    { "idLocal": "17", "status": "CONFLITO", "motivo": "INGRESSO_JA_UTILIZADO" }
  ]
}
```

### E. Mesma chave de A, conteúdo alterado

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "971b6382-28ad-4f06-9d71-97ef1ada8df0",
  "validacoes": [
    { "idLocal": "17", "ingressoId": 2, "codigo": "PC-B3M8Q1", "dataHora": "2026-11-20T22:03:27.000Z" }
  ]
}
```

Resposta HTTP 200, sem alterar a confirmação 101 ou criar outra entrada:

```json
{
  "resultados": [
    { "idLocal": "17", "status": "REJEITADA", "motivo": "IDEMPOTENCIA_DIVERGENTE" }
  ]
}
```

### F. Lote inválido e erro técnico

Requisição estruturalmente inválida:

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "971b6382-28ad-4f06-9d71-97ef1ada8df0",
  "validacoes": []
}
```

Resposta HTTP 400, sem gravação:

```json
{
  "erro": "LOTE_INVALIDO",
  "mensagem": "Lote de validações inválido."
}
```

Se a requisição C encontrar banco ocupado no segundo item após o primeiro commit, resposta HTTP 503 com `Retry-After: 1`:

```json
{
  "erro": "BANCO_INDISPONIVEL",
  "mensagem": "Não foi possível concluir o lote. Tente novamente."
}
```

O cliente mantém os três itens. No reenvio, o primeiro retorna JA_PROCESSADA e os demais são processados normalmente. Não presumir que HTTP 503 significa nenhuma gravação.

## 9. Política obrigatória do frontend

1. Ler pendências persistidas, agrupar por evento/portão/dispositivo de cada registro e montar o contrato da seção 3. Capturar um lote estável; novas leituras do scanner entram em lotes posteriores.
2. Validar a resposta inteira contra o lote enviado antes de atualizar qualquer item. Usar os IDs locais para correlação; jamais marcar toda a fila porque o HTTP foi 200. Só CONFIRMADA ou JA_PROCESSADA com original CONFIRMADA e `validacaoId` válido permitem `sincronizado = true`.
3. Em uma transação IndexedDB, conferir novamente a identidade/conteúdo de cada registro antes de gravar reconhecimento, status, motivo e `validacaoId` recebido quando houver. Só atualizar a UI após `oncomplete`. Se o registro divergir ou a gravação local falhar, abortar reconhecimento e preservar para diagnóstico/reenvio. Não usar apenas a posição do array nem marcar pendências criadas durante o envio.
4. Preservar conflitos e rejeições, inclusive os reprocessados, com `sincronizado = false` e dados suficientes para revisão. Não apagá-los, não liberar automaticamente o ingresso local e não reenviá-los continuamente como se fossem falhas de rede. Estados locais propostos: PENDENTE, ENVIANDO (transitório), SINCRONIZADA, CONFLITO e REJEITADA. Reiniciar o app devolve ENVIANDO sem reconhecimento confiável a PENDENTE.
5. Guardar o resultado original; um conflito resolvido administrativamente no futuro precisará de resolução separada, com responsável e justificativa. `resolvido` não significa `sincronizado = true` nem nova confirmação. Retenção/arquivamento não serão implementados silenciosamente nesta etapa.
6. Bloquear troca de evento **ou** portão enquanto existir qualquer registro não sincronizado e não resolvido, incluindo ENVIANDO, CONFLITO e REJEITADA. Hoje não há resolução implementada: todos com `sincronizado = false` bloqueiam. Exibir contagens/motivos e retorno à operação ativa; não sugerir limpar os dados.
7. Revalidar esse bloqueio na mesma transação de escrita que troca operação/base local, abrangendo `operacao`, `ingressos` e `validacoesPendentes`. Scanner deve ler/conferir a operação vigente nessa mesma abrangência ao registrar entrada, evitando que uma aba antiga grave para uma operação substituída. A verificação visual atual, anterior à escrita, não basta.
8. Preparar novamente o mesmo evento/portão pode atualizar o cache, preservando usos locais, pendências e identidade. Ao buscar os GETs depois do envio, mesclar sem transformar uso pendente em disponível. Separar horário de download, última resposta recebida e pendências restantes; resposta com conflitos não significa fila resolvida.

As novas informações de resultado podem ser propriedades dos objetos locais; não é necessário mudar a chave numérica só para serializar `idLocal`. Qualquer alteração de stores/índices ou upgrade deve preservar registros e seguir a regra de geração da seção 2. Tudo nesta seção é impacto necessário futuro; nenhum arquivo do frontend foi alterado.

## 10. Achados relevantes e decisões pendentes

Esta é uma auditoria focada no contrato, não uma certificação de segurança de todo o produto. Não houve correção de código nesta etapa.

| ID / severidade / componente | Evidência, risco e cenário | Remediação proposta e validação |
|---|---|---|
| S4-01 / MEDIUM / identidade IndexedDB | `obterIdDispositivo` separa leitura/escrita e usa fallback fraco. Duas abas podem criar identidades diferentes; reenvio montado com identidade global pode duplicar a chave do fato | Criação atômica e geração criptográfica; manter identidade por registro. Testar duas abas na primeira leitura, reinício e fila legada |
| S4-02 / HIGH / ciclo da fila | Chave local autogerada e UNIQUE central por instalação/ID. Recriar somente a store ou restaurar cópia antiga pode reutilizar uma chave, recuperando indevidamente outro fato ou causando divergência | Rotação coordenada e política de restauração; testar clear versus recriação, snapshot e preservação das pendências |
| S4-03 / MEDIUM / troca de operação | `salvarPreparacao` verifica pendências antes da escrita; scanner mantém operação lida ao abrir tela. Outra aba pode criar pendência entre conferência e troca | Verificar dentro de transações com stores compartilhadas e invalidar operação antiga; testar scanner e preparação simultâneos |
| S4-04 / MEDIUM / auditoria de divergências | UNIQUE impede segundo recibo; triggers impedem alteração; logger atual só registra erro genérico. Reutilizações maliciosas/acidentais da chave podem não deixar tentativa durável | Aprovar registro separado sem alterar o original; testar retenção após reinício e falha do destino de auditoria |

Decisões propostas neste documento: chave local decimal com identidade da geração; canonicalização explícita; transação por item; quatro estados HTTP com resultado original; limites de 100 itens/100 KiB; horário do cliente sem poder de precedência. Não são novas decisões D06 etc. já aprovadas por Gabriel: esta entrega serve à revisão do contrato antes de autorizar a implementação.

| Pendência | Responsável a confirmar | Efeito / orientação |
|---|---|---|
| Aceite do contrato e autorização da Etapa 5 | Gabriel; alinhar integração com Isadora | Implementar somente após autorização; frontend não está integrado |
| Destino durável de auditoria para chaves divergentes | Gabriel | Resolver antes de prometer auditoria completa; o modelo atual não armazena uma segunda tentativa na mesma chave |
| Fluxo de resolução de conflitos/rejeições | Equipe backend/frontend | Definir permissão, justificativa, representação e desbloqueio em etapa própria; até lá manter bloqueio e testes controlados |
| Recuperação/restauração da instalação e tratamento de filas legadas | Responsável pelo frontend | Adotar política da seção 2 e validá-la em navegador; nenhuma migração local automática autorizada aqui |
| Documentação original ausente | Equipe | Conferir eventuais regras funcionais adicionais quando disponível; registrar divergências sem alterar contratos silenciosamente |
| Autorização por operador/instalação e uso em produção | Etapa de controle de acesso | UUID e CORS não substituem autenticação; não ampliar esta etapa para implementá-la |

Na Etapa 5, além da rota/serviço/repositório, será necessário permitir POST no CORS das mesmas origens aprovadas, adicionar validação Zod e mapear os erros propostos ao middleware existente. Preservar GETs, migrações 001/002, seed e triggers. O ajuste de CORS é requisito futuro do navegador, não uma mudança feita agora.

## 11. Plano de testes da Etapa 5

Backend: Node.js Test Runner e Supertest, com bancos isolados em memória/arquivos temporários e dados fictícios derivados dos mocks. Para concorrência real, usar conexões/processos independentes sobre o mesmo arquivo de teste; requisições paralelas a um único event loop com driver síncrono não demonstram sozinhas a disputa entre escritores. Nunca executar os cenários de escrita no banco de desenvolvimento.

| Caso | Procedimento e resultado obrigatório |
|---|---|
| T01 — Confirmação | Ingresso 1 disponível: um recibo, uma validação, utilizado=1; ID/código/evento/portão exatos |
| T02 — Idempotência | Reenviar dez vezes a mesma chave/conteúdo: só uma confirmação; mesmo ID em JA_PROCESSADA |
| T03 — Canonicalização | Reordenar JSON e usar `Z`/`.000Z`: mesmo recibo; mudar cada campo de negócio separadamente: IDEMPOTENCIA_DIVERGENTE |
| T04 — Colisão de chave | Divergência não muda original nem outro ingresso; tentativa auditada; conteúdo original continua recuperável |
| T05 — Mesmo ingresso, nova chave | Mesmo dispositivo com outro idLocal: CONFLITO, sem segunda confirmação |
| T06 — Dois dispositivos | Processos concorrentes para o mesmo ingresso: exatamente uma confirmação e um conflito; não escolher pelo relógio do celular |
| T07 — Mesma chave concorrente | Conteúdos iguais: uma confirmação e um reenvio; conteúdos diferentes: um original e uma divergência, sem sobrescrita |
| T08 — Recursos/vínculos | Evento, portão e ingresso inexistentes; portão de outro evento; ingresso de outro evento/portão; ID/código incompatíveis: motivos definidos, recibos auditáveis, nenhum uso indevido |
| T09 — Mocks utilizados | IDs 4 e 12 geram conflito sob chave nova; suas confirmações sintéticas permanecem iguais; integridade dos 22 ingressos preservada |
| T10 — Lote parcialmente recusado | Executar cenário C; confirmar só disponível, persistir recusas; reenvio recupera cada resultado original |
| T11 — Rejeição histórica | Reenviar rejeição após cadastro corrigido: recuperar a rejeição original, sem reavaliar silenciosamente |
| T12 — Falha antes do envio | Rede indisponível: nenhuma alteração remota; pendências continuam utilizáveis offline |
| T13 — Resposta perdida | Descartar resposta depois do commit; reenviar: JA_PROCESSADA, uma confirmação |
| T14 — Interrupção no meio | Falhar após commit do primeiro item: anteriores persistem, item em andamento reverte, seguintes não processados; reenvio conclui sem duplicar |
| T15 — Rollback interno | Injetar falha após recibo, após validação/trigger e antes do commit: sem recibo confirmado órfão, validação parcial ou utilizado divergente |
| T16 — Reinicialização | Encerrar/reabrir API e SQLite em arquivo; reenvio recupera resultados e IDs, sem perder confirmações |
| T17 — Bloqueio SQLite | Segurar escrita em outro processo; exceder timeout: 503, transação limpa, sem laço infinito; após liberação reenvio funciona |
| T18 — Schema/limites | Tipos errados, campos extras, nulos, idLocal numérico/zero/zeros à esquerda, inteiro inseguro, IDs repetidos, lote vazio: 400 e zero recibos |
| T19 — Quantidade/tamanho | 100 itens dentro do corpo aceitos; 101 ou corpo >102400 bytes: 413 sem escrita; dividir preserva resultados/identidades |
| T20 — Datas | UTC válido com/sem milissegundos; dia impossível, offset, segundo 60, ausência: rejeitar estruturalmente; horário válido atrasado/futuro não muda precedência |
| T21 — Erros e SQL | JSON malformado 400, tipo de mídia 415, falha interna 500 sanitizada; conteúdo com caracteres SQL tratado como dado por parâmetros |
| T22 — CORS/HTTP real | Preflight POST só para origens permitidas; rejeitar outra origem; executar POST por HTTP real e regressões health/GET sem prefixo `/api` |
| T23 — Invariantes | Conferir foreign_key_check; um ingresso no máximo uma validação; cada recibo confirmado do serviço tem uma validação; conflitos/rejeições não têm confirmação; históricos imutáveis |
| T24 — Auditoria | Nova rejeição/conflito persiste após reinício; divergência deixa evento no destino aprovado; falha do destino não produz confirmação falsa nem sobrescreve recibo |

Integração frontend, em escopo posteriormente autorizado, exige navegador real com IndexedDB e múltiplas abas; Supertest não demonstra essas garantias:

| Caso | Procedimento e resultado obrigatório |
|---|---|
| F01 — Identidade | Primeira inicialização simultânea em duas abas produz um UUID persistido; recarregar offline preserva; testar fallback criptográfico e falha de gravação |
| F02 — Ciclo da store | Excluir registro/clear mantém avanço; recriar store/base gera nova identidade; preservar duplas de registros recuperados; testar restauração antiga |
| F03 — Fila legada | Identificadores legados e novos agrupados por registro, sem substituir pela operação/identidade global |
| F04 — Aplicação da resposta | Só confirmação direta/repetida marca sincronizado; erro, motivo desconhecido, resultado incompleto ou ID extra não reconhece o lote |
| F05 — Falha local no reconhecimento | Abortar transação IndexedDB depois do HTTP 200; reabrir e reenviar sem duplicar; UI não anuncia sucesso antes do commit local |
| F06 — Retenção/bloqueio | Conflitos e rejeições permanecem visíveis, não são apagados nem liberam troca; reenviar não transforma rejeição em sucesso |
| F07 — Abas e operação | Preparação concorrente com scanner não perde fila nem grava entrada usando operação obsoleta; bloqueio é transacional |
| F08 — Recuperação de rede | Offline → online, timeout e resposta perdida; respeitar atraso, não duplicar workers/identidades e continuar scanner offline |
| F09 — Download posterior | GET/mesclagem preserva uso local pendente; distinguir download de envio reconhecido; novos itens durante envio ficam pendentes |

Critério de aceite futuro: executar e registrar esses cenários aplicáveis, incluindo concorrência, rollback e HTTP real; comprovar ausência de duplicação e de reconhecimento local indevido. A implementação do backend pode ser validada isoladamente, mas a sincronização do produto só estará concluída com os testes de integração e a auditoria durável resolvida.

## 12. Limites da entrega e verificações

Esta etapa cria somente este documento. Nenhum endpoint, migration, schema Zod executável, mudança no frontend ou alteração no banco foi implementado. Os exemplos não devem ser confundidos com testes HTTP aprovados. O histórico da Etapa 3 registra 59 testes aprovados; essa quantidade não é uma execução de sincronização nesta etapa.

Verificações executadas nesta entrega:

- `git status --short`, `rg` e `Get-Content -Encoding UTF8`: inspeção de código, SQL, decisões e plano, sem alterações nesses arquivos.
- Script em memória via `node --input-type=module`, sem criar arquivo executável: 14 blocos JSON analisados com `JSON.parse`, incluindo cinco requisições, seis respostas de negócio, um conteúdo canônico e dois erros HTTP. Sete referências a ingressos conferidas por ID/código com os mocks; formatos dos resultados e todos os links locais conferidos. Resultado: código de saída 0.
- Plano identificado no documento: 24 cenários de backend e nove de integração frontend. São testes **planejados**, não testes executados/aprovados.
- SHA-256 agregado de 441 arquivos preexistentes de frontend/backend, incluindo arquivos de banco, excluindo diretórios `node_modules`, `.git`, `dist` e este documento: antes e depois, `cec914fd24c64312915c865fefac5f27d1e1c2759e9591074b0f6386ee0ba802`. Nenhum desses arquivos mudou durante a entrega.

`npm.cmd test` e requisições POST não foram executados nesta etapa documental; não se atribui aprovação a testes de sincronização ainda inexistentes. Não foram executados migração, seed, commit, push ou deploy. O próximo passo é revisar as pendências e obter autorização expressa de Gabriel para a Etapa 5.
