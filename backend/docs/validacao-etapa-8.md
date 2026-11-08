# Validação da Etapa 8 — administração, CSV e resolução auditável

Data local: 20/10/2026, America/Sao_Paulo. Entrega exclusivamente da Etapa 8.
Referência local inicial: commit 2470334, branch feat/backend-etapas-1-a-7,
árvore limpa antes do trabalho. Nenhum commit, push, deploy ou alteração de
credenciais/dados permanentes foi executado nesta etapa.

## Pré-requisitos

Inspecionados arquitetura, autenticação/autorização, GETs, resumo, sincronização,
modelo relacional, migrações 001–004, contratos, decisões D01–D08, testes, guia
CLAUDE.md e contratos reais de frontend. O frontend permanece com os mocks e o
login visual; não se presume integração administrativa ou resolução local pronta.

`npm.cmd test` executado antes de qualquer alteração: **123 aprovados, 0 falhas,
0 ignorados**, 19693,9962 ms. Banco permanente inspecionado em readonly:
`integrity_check = ok`, `foreign_key_check = []`; histórico/checksums 001–003
correspondem aos arquivos. A 004 permanece pendente nele conforme a entrega da
Etapa 7, sem divergência ou corrupção. Aplicação 001–004 e conferência de esquema
atual em banco isolado: versão 4, integridade ok, FKs sem violações.

Essa pendência de ativação não foi ocultada nem corrigida no banco compartilhado:
a restrição atual exige preservar seus dados/usuários. Todas as escritas desta
etapa, incluindo migrações e simulações de falha, ocorreram em bancos isolados.

Antes do código foi escrito [contrato-administracao.md](contrato-administracao.md)
com corpos, respostas, limites, erros e política de resolução. D09 registra as
decisões dentro do escopo solicitado.

## Arquivos criados

- `docs/contrato-administracao.md` e `docs/validacao-etapa-8.md`.
- `src/db/migrations/005_resolucoes_administrativas.sql`.
- `src/routes/administracao.js`.
- `src/services/administracao.js`, `src/services/csv.js`.
- `src/repositories/administracao.js`.
- `src/validation/administracao.js`.
- `tests/administracao.test.js`, `tests/administracao-http.test.js`.

## Arquivos alterados

- `src/app.js`: composição das rotas administrativas com parsing específico.
- `src/services/identidade.js`: verificação reutilizável de administrador atual.
- `src/middleware/cors.js`: PATCH nas mesmas origens configuradas.
- `src/middleware/errors.js`: linhas/motivos apenas no erro CSV_INVALIDO.
- `tests/app.test.js`, `tests/auth.test.js`, `tests/migrations.test.js`,
  `tests/seed.test.js`, `tests/sincronizacao.test.js`: expectativas de versão 005,
  CORS PATCH e POST /eventos agora protegido. Nenhum cenário antigo foi removido.
- `README.md`, `docs/decisoes.md`, `docs/modelo-relacional.md`,
  `docs/contrato-autenticacao.md`, `docs/contrato-sincronizacao.md`: situação atual
  e referências aos novos contratos, preservando os registros históricos.

Não houve dependência nova, mudança em package.json/lock, frontend, IndexedDB,
scanner, mocks, Service Worker, ambiente, credenciais ou migrações 001–004.

## Migração e regras de integridade

005_resolucoes_administrativas.sql tem SHA-256 normalizado:
`f9a590735bbde9effd3a6cfaa791f72086c9e7d4f7da9256cc082050ebfc6c82`.

Tabela STRICT `resolucoes_administrativas`:

| Campo | Regra |
|---|---|
| id | PK numérica positiva |
| recebimento_id | UNIQUE, FK para recebimentos, sem cascata |
| administrador_id | FK para usuarios, sem cascata |
| status_administrativo | RESOLVIDA, separado do status original |
| justificativa | Obrigatória, 10–1000 caracteres, trim |
| data_hora_servidor | UTC gerado pelo SQLite |

Trigger exige administrador ativo e recibo CONFLITO/REJEITADA. UPDATE/DELETE e
exclusão implícita via REPLACE são bloqueados. Índice parcial em recibos por
evento declarado no JSON e id atende a listagem paginada. Índice adicional cobre
o administrador responsável. Nenhuma confirmação ou recibo original é alterado.

Upgrade isolado de 001–004 para 005 preservou snapshot de negócio, usuários,
concessões e histórico anterior. A migração não cria resolução ou usuário.

## Endpoints implementados

Todos exigem Bearer válido e ADMINISTRADOR ativo, antes de interpretar corpos
ou revelar recursos. As transações revalidam papel/versão do token. OPERADOR,
mesmo autorizado ao evento, recebe 403. Token ausente/revogado recebe 401.

| Endpoint | Sucesso e comportamento |
|---|---|
| POST /eventos | 201, id numérico e campos nome/data/local |
| PATCH /eventos/:eventoId | 200, somente metadados; mantém id, vínculos e confirmações |
| POST /eventos/:eventoId/portoes | 201, id/eventoId/nome; evento existente obrigatório |
| POST /eventos/:eventoId/ingressos/importar | 201, eventoId/importados; CSV integral ou rollback |
| GET /eventos/:eventoId/pendencias | 200, pendencias/proximoCursor; estado PENDENTE, RESOLVIDA ou TODAS |
| POST /pendencias/:recebimentoId/resolver | 201, decisão administrativa com responsável/justificativa/horário |

SQL parametrizado. Zod valida corpos/IDs/datas/query/células. JSON de cadastro e
resolução estrito; nomes não vazios; data real YYYY-MM-DD. CORS mantém origens e
headers autorizados, acrescenta PATCH. Cache-Control: no-store preservado.

Não foram implementadas exclusões. Datas/nome/local de evento com confirmações
podem ser corrigidos como metadados; não se move ingresso/portão nem se reescreve
o fato confirmado. Não há concessão automática para operadores em novos eventos.

## Exemplos reais de HTTP

Na suíte completa, os processos 13836 e 3864 executaram requisições HTTP reais
antes/depois de reinicialização sobre o mesmo SQLite temporário. JWTs omitidos.

POST /eventos, requisição:

```json
{"nome":"Encontro acadêmico","data":"2026-11-21","local":"Auditório"}
```

HTTP 201:

```json
{"id":4,"nome":"Encontro acadêmico","data":"2026-11-21","local":"Auditório"}
```

PATCH /eventos/4 com `{"local":"Auditório central"}`: HTTP 200, mesmo id e
demais campos preservados. POST /eventos/4/portoes com
`{"nome":"Entrada principal"}` retornou HTTP 201:

```json
{"id":7,"eventoId":4,"nome":"Entrada principal"}
```

POST /eventos/4/ingressos/importar, Content-Type text/csv:

```csv
codigo,eventoId,portaoId
ACADEMICO-001,4,7
ACADEMICO-002,4,7
```

HTTP 201:

```json
{"eventoId":4,"importados":2}
```

Após gerar um conflito e uma rejeição via POST /sincronizacao, GET
/eventos/1/pendencias retornou HTTP 200 com os dois recibos, sem payload/QR.
POST /pendencias/3/resolver com justificativa
`Revisão administrativa; preservada confirmação original.` retornou HTTP 201:

```json
{"recebimentoId":3,"statusOriginal":"CONFLITO","statusAdministrativo":"RESOLVIDA","resolucao":{"id":1,"administradorId":1,"dataHora":"2026-10-21T01:55:22.042Z","justificativa":"Revisão administrativa; preservada confirmação original."}}
```

Esse horário UTC corresponde à noite de 20/10/2026 em São Paulo. Depois de
reiniciar em outro processo, GET com estado=TODAS recuperou a mesma resolução e
manteve a rejeição não resolvida como PENDENTE. Repetição da resolução retornou
409. Reenvio da sincronização continuou JA_PROCESSADA/CONFLITO. Resumo manteve
duas confirmações sintéticas do seed e GET /health retornou 200.

## Importação, rollback e concorrência

- UTF-8 estrito, BOM opcional, LF/CRLF, aspas e escape de aspas foram exercitados.
  Campos com quebra de linha, cabeçalhos incorretos, bytes inválidos e tipos de
  mídia indevidos foram recusados. Caixa e conteúdo literal de códigos preservados.
- Limites executados: 1000 registros aceitos; 1001 ou corpo acima de 102400 bytes
  recusados com 413. CSV vazio/só cabeçalho retorna 400.
- Erros de linha retornam 422 com número físico/motivos, sem ecoar código. Todas
  as ocorrências duplicadas são identificadas; arquivo com linha válida e outras
  inválidas não importou nenhum ingresso. Códigos já cadastrados, inclusive os
  confirmados 4/12 e códigos de outro evento, não foram sobrescritos.
- Trigger de falha na segunda inserção causou HTTP 500 e rollback integral:
  snapshot anterior idêntico, nenhuma primeira linha remanescente. Após retirar
  o trigger apenas no banco de teste, a mesma carga importou dois ingressos.
- Processos independentes 2568/9776 disputaram o mesmo arquivo: CSV concorrente
  produziu HTTP 201/422 e exatamente um ingresso. Resolução concorrente produziu
  HTTP 201/409 e exatamente uma auditoria, sem nova confirmação.
- Falha depois da inserção da resolução também reverteu a auditoria e preservou
  recibos. Recusa de UPDATE/DELETE/REPLACE, administrador inativo/operador e
  referências inválidas foi executada diretamente no banco isolado.
- As duas confirmações originais permanecem sintéticas, sem comprovar entradas
  físicas. Resolução administrativa não altera essa interpretação.

## Comandos e resultados executados

Executados no backend, além de Get-Content/rg e inspeção Git somente de leitura:

| Comando/operação | Resultado |
|---|---|
| npm.cmd test, antes de editar | 123 aprovados, 0 falhas, 19693,9962 ms |
| Conferência readonly do SQLite e checksums | Integridade ok; 001–003 sem divergência; 004 pendente no desenvolvimento |
| migrate/assertMigrationsCurrent em memória antes do código | 001–004 aplicadas, versão 4 íntegra |
| node --test tests/administracao.test.js | 27 aprovados, 0 falhas, 1383,808 ms |
| node --test tests/administracao-http.test.js | 2 aprovados, 0 falhas, 3050,5601 ms |
| npm.cmd test final | **152 aprovados, 0 falhas, 0 ignorados**, 17489,825 ms |
| git diff --check | Sem erros de whitespace; avisos locais de conversão LF/CRLF |
| Comparação SHA-256 dos arquivos protegidos | 37 conferidos, nenhuma alteração |
| PRAGMAs finais readonly | integrity_check ok, foreign_key_check vazio |

Os 123 testes anteriores continuam presentes. Apenas expectativas exigidas pela
etapa mudaram: versão 005, CORS PATCH e POST /eventos passou de rota ausente a
rota autenticada. Regressão inclui autenticação, permissões, 22 ingressos dos
mocks, GETs/resumo, idempotência, rollback, resposta perdida e concorrência da
sincronização. Não se desativou autenticação nos testes novos.

O 503 administrativo foi testado com SQLITE_BUSY injetado no repositório; a
regressão de sincronização também exerceu lock real, HTTP 503 após 5352 ms e
reenvio seguro. Não se atribui ao teste administrativo uma espera real de lock
que não foi executada nele.

## Preservação e compatibilidade

Hashes conferidos: 29 arquivos do frontend, 001–004 e README de migrações,
SQLite/WAL/SHM: todos idênticos. Banco permanente continua com 3 eventos,
6 portões, 22 ingressos, 2 recibos, 2 validações e 0 auditorias de divergência.
Não foram alterados usuários ou credenciais. As migrações 004/005 permanecem
pendentes no desenvolvimento; as cinco foram aplicadas somente nos testes.

Os JSONs de sucesso usados pelo frontend e a chave (dispositivo,idLocal) não
mudaram. Resolução usa outra tabela/status; não modifica recibos, validações,
utilizado, dashboard ou resultado idempotente. Eventos das pendências são os
declarados no recibo, inclusive em rejeições por vínculo incorreto.

IDEMPOTENCIA_DIVERGENTE na auditoria 003 não é um recibo REJEITADA novo e não é
resolvida por esta rota. Não se permite encerrar administrativamente um recibo
CONFIRMADA para simular a resolução daquela tentativa.

## Pendências para a Etapa 9

1. Integrar interface administrativa, CSV e apresentação das linhas inválidas,
   somente após autorização para alterar o frontend. Nenhum painel foi criado.
2. Definir consulta autenticada restrita para o operador reconhecer decisões de
   sua própria fila. Hoje somente administrador consulta pendências/resoluções.
   A interface administrativa usa statusAdministrativo/resolucao e correlaciona
   recebimentoId/dispositivo/idLocal. Não apagar IndexedDB, não converter resolução
   em confirmação e não trocar identidade da operação para obter acesso.
3. Decidir tratamento de tentativas divergentes (auditoria 003), instalações
   legadas e busca global restrita de recibos que declaram evento inexistente.
   A listagem atual exige evento existente; resolução por recibo conhecido
   continua disponível ao administrador, sem atribuir evento artificialmente.
4. Planejar ativação local: backup consistente, chave JWT estável, migrações
   pendentes e provisionamento se necessário, seguindo README e preservando
   credenciais existentes. Nenhuma dessas ações foi executada no desenvolvimento.
5. Validar integração e reconciliação offline em navegador/celular. A existência
   destas APIs não comprova que a PWA já as utiliza.

Etapa 8 encerrada. Etapa 9 depende de autorização expressa de Gabriel.
