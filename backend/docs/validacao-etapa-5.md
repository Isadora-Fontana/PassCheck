# Validação da Etapa 5 — sincronização transacional e idempotente

Data: 17/10/2026. Escopo autorizado por Gabriel: contrato versão 1 da Etapa 4,
`POST /sincronizacao` e migração 003 de auditoria durável. Etapa 6 não iniciada.

## Resultado

Implementado o POST sem prefixo `/api`, com validação Zod estrita, conteúdo
canônico, transação IMMEDIATE por item, recuperação idempotente, conflitos,
rejeições auditáveis e auditoria durável de conteúdo divergente na mesma chave.
As migrações 001/002, os GETs, o health e os dados existentes foram preservados.

Última execução de `npm.cmd test`: **81 testes, 81 aprovados, 0 falhas, 0 ignorados,
0 cancelados**, em 14541,6862 ms. São 59 testes anteriores, com expectativas
atualizadas para o novo escopo, e 22 testes novos. Os 24 cenários T01–T24 estão
cobertos em testes agrupados, conforme o mapa abaixo; não se trata de 24 arquivos
ou 24 casos de teste individuais adicionais.

## Pré-requisitos executados antes de editar

- `npm.cmd test`: 59 aprovados, zero falhas, 5850,7141 ms.
- Banco de desenvolvimento aberto em readonly: `integrity_check = ok` e
  `foreign_key_check = []`; 22 ingressos, dois recebimentos e duas validações.
- Histórico 001/002 comparado com os nomes/checksums dos arquivos pelo executor.
- Leitura do contrato, decisões, modelo, migrações, conexão, rotas, serviços,
  middleware e testes existentes. Nenhum pré-requisito falhou.

| Versão | SHA-256 do SQL com LF normalizado |
|---|---|
| 001 | `f4a3ac4aa51e2df743f0ff8c61e4851d4304c99893bad4e1428cd59c4a6d1271` |
| 002 | `954ced7e340478b8604bb37227921ab29e91031848c3bf86c749d6173f92efed` |
| 003 | `37eea0ba120836a8302a1dbbcee56cd399d7a78991511b88c89e5fbadb1352cf` |

001/002 conservam os mesmos checksums antes/depois. Antes da migração local e da
atualização do README de migrações, também se conferiu o hash agregado dos 35
arquivos protegidos de frontend, migrações anteriores e banco:
`2a8c9dfb6d4eab1bb7fb8c3e59e01eea4ed2f73f41a0a6100b64989e2d32f23e`, idêntico ao
inicial. A migração local altera o arquivo SQLite intencionalmente; seus dados
anteriores foram comparados depois com o backup, não apenas contados.

## Arquivos criados e alterados

Caminhos relativos a `backend/`:

| Criados | Função |
|---|---|
| `src/db/migrations/003_auditoria_divergencias.sql` | Tabela de auditoria, índices, FK, checks e triggers de imutabilidade |
| `src/routes/sincronizacao.js` | Tipo de mídia, schema Zod, limites e controller HTTP simples |
| `src/services/sincronizacao.js` | Regras, normalização, idempotência e transação por item |
| `src/repositories/sincronizacao.js` | SQL parametrizado de recibos, vínculos, confirmações e auditoria |
| `tests/sincronizacao.test.js` | 17 testes de contrato, integridade, rollback, auditoria e evolução do banco |
| `tests/sincronizacao-processos.test.js` | Cinco testes de processos/conexões independentes, HTTP, rede e persistência |
| `tests/helpers/sync-worker.mjs` | Processo auxiliar de API ou detentor de lock, com encerramento controlado |
| `docs/validacao-etapa-5.md` | Este relatório e mapa T01–T24 |

| Alterados | Motivo |
|---|---|
| `src/app.js` | Composição do POST, verificação de mídia antes do parser e limite explícito de 102400 bytes |
| `src/middleware/cors.js` | GET e POST nas origens já configuradas |
| `src/middleware/errors.js` | Retry-After no 503, mídia/encoding 415 e logs estruturais sem payload |
| `tests/app.test.js` | Substituir expectativa histórica de POST ausente por `/api/sincronizacao` ausente; preflight GET/POST |
| `tests/migrations.test.js` | Esperar histórico 001/002/003 e versão atual 3 |
| `tests/seed.test.js` | Versão atual 3; simulação de migração pendente remove somente a última versão no banco isolado |
| `README.md` | Execução, endpoint, auditoria, limites e continuidade |
| `src/db/migrations/README.md` | Catálogo da migração 003 |
| `docs/decisoes.md` | D06: aprovação do contrato, auditoria e limites da Etapa 5 |
| `docs/modelo-relacional.md` | Evolução aditiva de auditoria, preservando descrição histórica da Etapa 2 |
| `docs/contrato-sincronizacao.md` | Nota de aprovação/implementação; especificação original preservada |

Artefatos locais ignorados pelo Git: backup novo
`backups/pre-etapa5-20261017.sqlite` e atualização do esquema de
`data/passcheck.sqlite`. Nenhuma dependência foi instalada/adicionada; package.json
e lockfile não precisaram mudar. O backend já estava não rastreado no Git antes
da tarefa; `git diff` sozinho não lista suas mudanças. Nenhum commit foi feito.

## Migração aplicada e persistência

`auditoria_divergencias` é STRICT e contém somente:

- `id` positivo, PK;
- `recebimento_id`, FK obrigatória com DELETE/UPDATE RESTRICT;
- `correlacao_id`, UUID gerado pelo servidor para a requisição;
- `motivo`, restrito a IDEMPOTENCIA_DIVERGENTE;
- `hash_original` e `hash_apresentado`, SHA-256 hexadecimais de 64 caracteres;
- `data_hora_servidor`, UTC com default SQLite.

Índices por recibo e correlação. UPDATE/DELETE e substituição por REPLACE são
impedidos pelos triggers com a configuração existente de triggers recursivos.
Não são repetidos QR, payload completo, credenciais ou identidade do aparelho.
Cada nova tentativa divergente é um novo evento de auditoria, mesmo quando a
tentativa também é um reenvio. A confirmação original nunca é refeita.

Antes de migrar, foi criado backup consistente pela API SQLite. Resultado real:

```json
{"command":"migrate","applied":["003_auditoria_divergencias.sql"],"currentVersion":3}
```

Conferência após migração:

```json
{
  "counts": {"eventos":3,"portoes":6,"ingressos":22,"recebimentos":2,"validacoes":2},
  "auditorias": 0,
  "priorData": "unchanged",
  "integrity": "ok"
}
```

Todas as linhas das cinco tabelas e o histórico completo de 001/002 foram
comparados ao backup. A tabela nova está vazia no desenvolvimento porque os
testes de escrita rodaram somente em bancos isolados. Não houve seed/reset local.
Recuperação seria manual: interromper acessos, preservar o estado atual e
restaurar uma cópia do backup. Restaurar descarta alterações posteriores na cópia
restaurada; nenhum comando de restauração ou `down` foi executado.

## Contrato implementado

- JSON application/json em UTF-8, topo e itens estritos; IDs numéricos positivos
  seguros, `idLocal` decimal canônico, dispositivo conforme whitelist e sem
  namespace `seed:`, código literal sem alteração de caixa.
- Datas UTC válidas com zero ou três casas decimais; normalização para três casas,
  com verificação de calendário por round-trip. Sem precedência pelo relógio do celular.
- Lotes de 1–100 itens e corpo de até 102400 bytes; nenhuma escrita se a estrutura
  do lote for inválida. Repetição de idLocal no lote é 400.
- Conteúdo canônico em ordem `eventoId`, `portaoId`, `ingressoId`, `codigo`, `dataHora`.
  Chave global `(dispositivo, idLocal)` consultada dentro da transação IMMEDIATE.
- CONFIRMADA grava recibo e validação juntos; trigger existente atualiza o uso.
  JA_PROCESSADA recupera resultado/ID/motivo originais. Chave nova para ingresso
  confirmado gera CONFLITO. Vínculos/recursos inválidos geram REJEITADA auditável.
- Conteúdo diferente sob a mesma chave grava auditoria e retorna REJEITADA /
  IDEMPOTENCIA_DIVERGENTE, sem sobrescrever o original.
- Cada item confirma separadamente. Falha técnica interrompe os seguintes e
  reverte o item atual; resultados anteriores persistem. Respostas 500/503 não
  levam resultados parciais; reenvio integral recupera commits anteriores.
- HTTP 200, 400, 413, 415, 500 e 503 implementados; 503 inclui Retry-After: 1.
  CORS conserva origens exatas e anuncia GET/POST. Erros/logs não incluem SQL,
  stack, QR ou corpo. Não há autenticação simulada.

As transações síncronas e a variante IMMEDIATE seguem a API do
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function);
os objetos estritos e validações usam o [Zod](https://zod.dev/api). Nenhuma
operação de rede ocorre dentro das transações SQLite.

## Evidências reais de HTTP, concorrência e reinício

Última suíte completa, bancos temporários:

| Cenário | Evidência |
|---|---|
| Disputa por ingresso | APIs em processos 11468/12952 e lock de barreira 19904: uma CONFIRMADA, uma CONFLITO; uma validação para ingresso 1 |
| Mesma chave/conteúdo | Processos 10412/11540: CONFIRMADA e JA_PROCESSADA, ambas validacaoId 3; um recibo |
| Mesma chave divergente | Processos 19372/3640: CONFIRMADA e REJEITADA/IDEMPOTENCIA_DIVERGENTE; um recibo e uma auditoria |
| Banco ocupado | HTTP 503 após 5566 ms com Retry-After: 1; dados inalterados; liberar lock e reenviar retorna 200 |
| Resposta perdida/reinício | API real em `http://127.0.0.1:56087`, processos 13200/4404/23056 no ciclo completo; confirmação recuperada e auditoria persistida |
| Leituras | Health e três tipos de GET retornaram 200; regressão dos GETs conferiu todos os 22 ingressos em duas inicializações |

As APIs concorrentes usam o mesmo arquivo SQLite, com conexões independentes;
um terceiro processo segura a escrita enquanto as requisições são disparadas.
Isso exercita disputa real de escritores, não somente Promise.all no mesmo
event loop síncrono. A ordem de vitória não é presumida nos testes.

Requisição real nos testes de processos:

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "device-A",
  "validacoes": [
    {"idLocal":"17","ingressoId":1,"codigo":"PC-A7X9K2","dataHora":"2026-11-20T22:03:27Z"}
  ]
}
```

Respostas reais HTTP 200 observadas:

```json
{"resultados":[{"idLocal":"17","status":"CONFIRMADA","validacaoId":3}]}
```

```json
{"resultados":[{"idLocal":"17","status":"JA_PROCESSADA","resultadoOriginal":"CONFIRMADA","validacaoId":3}]}
```

```json
{"resultados":[{"idLocal":"17","status":"CONFLITO","motivo":"INGRESSO_JA_UTILIZADO"}]}
```

```json
{"resultados":[{"idLocal":"17","status":"REJEITADA","motivo":"IDEMPOTENCIA_DIVERGENTE"}]}
```

No cenário de resposta perdida, o cliente destruiu a resposta após os headers,
sem consumir o corpo. O banco já tinha confirmado. O reenvio recuperou ID 3 sem
duplicar; uma API nova recuperou o mesmo resultado e recusas anteriores. A tabela
de auditoria foi comparada integralmente também por uma conexão recém-aberta.

## Cobertura T01–T24 e rollback

Todos os casos abaixo passaram na execução final. Arquivos: `sincronizacao.test.js`
(S) e `sincronizacao-processos.test.js` (P).

| Caso do contrato | Arquivo / prova |
|---|---|
| T01 | S: recibo/validação/uso atômicos e conteúdo canônico exato |
| T02 | S: dez reenvios, uma confirmação e mesmo ID |
| T03 | S: ordem de propriedades e Z/.000Z equivalentes; cada campo de negócio alterado diverge |
| T04 | S: hashes conferidos, original preservado e ainda recuperável |
| T05 | S: mesmo ingresso com nova chave conflita |
| T06 | P: dois processos/dispositivos, uma confirmação |
| T07 | P: mesma chave concorrente, conteúdo igual e divergente |
| T08 | S: recursos inexistentes, código errado, evento/portão incompatíveis |
| T09 | S: ingressos 4/12 conflitam; 22 ingressos e seed preservados |
| T10 | S: lote misto e reenvio de todos os resultados |
| T11 | S: rejeição permanece após corrigir cadastro |
| T12 | P: conexão recusada com API encerrada, sem alteração central; fila/UI offline fora do escopo backend |
| T13 | P: corpo da resposta descartado depois do commit; reenvio idempotente |
| T14 | S: trigger de teste falha no segundo item; primeiro commit permanece; terceiro não executa; reenvio conclui |
| T15 | S: falhas após inserir recibo, após validação/trigger e antes do commit; rollback integral do item |
| T16 | P: reiniciar API/conexão e recuperar IDs/resultados |
| T17 | P: lock entre processos, timeout real de cinco segundos e 503 recuperável |
| T18 | S: tipos, objetos malformados, extras, IDs inseguros, repetição e strings proibidas sem escrita |
| T19 | S: 100/101 itens e fronteira exata 102400/102401 bytes |
| T20 | S: calendário inválido recusado; UTC ano 0001/9999 e bissexto válido aceitos |
| T21 | S: JSON/mídia/encoding inválidos, SQL tratado como dado e erros sanitizados |
| T22 | S/P: preflight POST restrito, HTTP real, GETs/health e ausência de prefixo `/api` |
| T23 | S/P: FKs, utilização, recibos/validações, imutabilidade; recibo confirmado órfão responde 500 |
| T24 | S/P: hashes, FK, correlação, imutabilidade, falha real de auditoria e persistência após reinício |

Além do mapa, há teste de migração de banco 001/002 para 003 preservando linhas
e histórico, e toda a regressão anterior de migrações/seed/GETs.

Para T15, a injeção de falhas envolve o repositório real e a transação SQLite;
nenhum gancho de falha foi adicionado ao código de produção. O caso após trigger
confere utilizado=1 ainda dentro da transação e depois verifica reversão integral.
T14 e falha de auditoria usam triggers temporários exclusivamente no banco de teste.

## Comandos executados e resultados

| Comando/ação | Resultado real |
|---|---|
| `npm.cmd test` antes de editar | 59/59 aprovados |
| `rg`, `Get-Content -Encoding UTF8`, `git status --short` | Inspeção do projeto e alterações preexistentes |
| Scripts em memória `node --input-type=module` | Checksums, integridade, hashes, backup e comparação do banco; sem arquivos executáveis extras |
| `node --test tests/sincronizacao.test.js` durante implementação | 16/17; fixture enviava null sem Content-Type e recebia corretamente 415; fixture corrigida para enviar JSON explícito |
| `node --test tests/sincronizacao.test.js tests/sincronizacao-processos.test.js` | 22/22 aprovados após correção |
| `npm.cmd test` com integração completa | 81/81 aprovados; 13495,3811 ms |
| Backup consistente SQLite | `backups/pre-etapa5-20261017.sqlite`, sem sobrescrever arquivo anterior |
| `npm.cmd run db:migrate` | Somente 003 aplicada, versão atual 3 |
| Conferência readonly contra backup | Cinco tabelas e histórico anterior idênticos; zero auditorias de teste no desenvolvimento |
| `npm.cmd test` final, após completar logs/validações de objetos malformados | 81/81 aprovados; 14541,6862 ms |

Os processos e arquivos temporários dos testes foram encerrados/removidos pelos
próprios testes. Não houve teste destrutivo no desenvolvimento, alteração no
frontend, instalação de dependências, mudança de credenciais, commit, push ou deploy.

## Incompatibilidades e pendências para a Etapa 6

Não foi encontrada incompatibilidade entre o contrato aprovado e o modelo central:
a única evolução necessária autorizada foi a auditoria 003. Expectativas antigas
de POST ausente, CORS somente GET e versão 2 nos testes eram históricas e foram
atualizadas sem retirar verificações de integridade.

O frontend ainda usa mocks e não envia/aplica esse contrato. As adaptações F01–F09
continuam pendentes: identidade criptográfica e atômica entre abas, ciclo da fila,
agrupamento pelos dados persistidos, reconhecimento seguro, retenção de recusas,
bloqueio transacional de troca e recuperação de rede. Não foram executados testes
de navegador/IndexedDB nesta etapa; os testes de rede demonstram o comportamento
do backend, não o reconhecimento local na PWA.

Resolução administrativa, autenticação/autorização, dashboard e infraestrutura
não foram implementados. O UUID declarado e CORS não autenticam o operador.
O destino durável de divergências está resolvido pelo SQLite, mas retenção,
monitoramento e procedimentos operacionais de restauração exigem etapa própria.
Os documentos backend/PEI originais continuam ausentes do workspace.

Para continuar: Gabriel deve definir e autorizar o escopo da Etapa 6. A integração
frontend precisa de autorização própria; não ocorre automaticamente pela aprovação
desta implementação backend.
