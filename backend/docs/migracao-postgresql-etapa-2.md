# Migração PostgreSQL — API assíncrona e seleção do motor

Data: 2026-11-02. Etapa: integração do runtime com a persistência preparada na etapa 1.
O responsável autorizou prosseguir e determinou preservar todos os registros.
**Não houve troca do banco local, transferência de dados, modificação de `.env`, reinício
de serviço existente ou alteração do frontend. O runtime foi validado em PostgreSQL local
temporário; a conclusão do corte depende da preparação e validação do destino Supabase.**

## Implementação

| Grupo | Mudança |
| --- | --- |
| `src/db/access.js` | Contexto transacional compartilhado pelos repositórios, fila SQLite e serialização PostgreSQL |
| `src/db/postgres/repositories.js` | Consultas PostgreSQL dos quatro repositórios, `$1…`, `RETURNING`, aliases delimitados e extração JSON |
| `src/repositories/*.js` | Seleção por conexão e acesso seguro ao SQLite; repositório de provisionamento acrescentado |
| `src/services/{identidade,eventos,sincronizacao,administracao,provisionamento}.js` | IO aguardado; regras, autorização, mensagens e commits por item preservados |
| `src/routes/{auth,eventos,sincronizacao,administracao,health}.js` | Handlers aguardam resultados antes da resposta; leituras autorizadas usam snapshot |
| `src/config.js`, `configuration-error.js`, `src/db/runtime.js` | Seleção explícita `DATABASE_ENGINE`, configuração PostgreSQL validada sem fallback |
| `src/db/postgres/readiness.js`, `src/db/readiness.js`, `src/server.js` | Verificação de histórico, tabelas/colunas, triggers ativos e índices; lifecycle assíncrono |
| `src/auth-cli.js`, `src/provisionar-interativo.js`, `src/db/cli.js` | Provisionamento e comandos de migração/seed respeitam o motor selecionado |
| `src/db/backup-cli.js`, `scripts/setup.mjs` | Recusam a operação SQLite quando o motor selecionado é PostgreSQL |
| `.env.example` raiz/backend e `compose.yaml` | Variáveis documentadas e repassadas; SQLite permanece padrão |
| `tests/database-access.test.js`, `tests/postgres-api.test.js`, `tests/helpers/postgres*.js/mjs` | Isolamento assíncrono e integração HTTP em processos independentes |

Não foi introduzido Supabase Auth, SDK no frontend, mudança no IndexedDB, sincronização
offline ou hospedagem Vercel. `better-sqlite3` permanece necessário à operação atual,
regressão, backup e leitura da origem durante a transferência.

## Transações e segurança

No SQLite, callbacks assíncronos não podem ser passados ao `database.transaction()` do
better-sqlite3. A camada nova executa `BEGIN IMMEDIATE`, aguarda o callback e somente então
faz `COMMIT` ou `ROLLBACK`. Uma fila compartilhada por conexão impede que outra requisição
use a mesma conexão durante uma transação pendente. A fila também protege leituras:
não se expõem alterações que ainda poderão ser revertidas.

No PostgreSQL, `AsyncLocalStorage` faz todos os repositórios, inclusive identidade,
usarem o mesmo client da operação. Escritas adquirem `SHARE ROW EXCLUSIVE` sobre as tabelas
de domínio, em ordem fixa, **antes** da releitura da autorização. É uma implementação
conservadora do escritor único existente no SQLite: mantém a semântica de bootstrap,
instalações, sincronização, CSV e resolução também diante de outros escritores SQL.
Esse modo bloqueia escritas concorrentes e admite leituras normais, conforme a
[documentação de locks PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

O custo é serializar operações de escrita que poderiam, futuramente, executar em paralelo.
Locks por ingresso/chave de idempotência e ganho de throughput ficam para uma etapa de
otimização com testes próprios. Os timeouts continuam limitados; lock/serialização/deadlock
e falhas conhecidas de conexão em sincronização/administração produzem o contrato 503 com
`Retry-After`. Não há retry automático de commit com resultado desconhecido.

Consultas de eventos, resumo, ingressos, permissões e pendências verificam a identidade
e leem dados no mesmo snapshot. PostgreSQL usa transação `REPEATABLE READ READ ONLY`;
operações de escrita conservam `READ COMMITTED`, depois da aquisição dos locks.
Tarefas assíncronas que escapem do callback não podem reutilizar seu contexto encerrado.

A disponibilidade inicial é verificada antes de abrir HTTP em todos os ambientes PostgreSQL.
O start não executa DDL, seed, importação ou provisionamento. `/ready` recusa histórico
divergente, estrutura ausente, triggers desativados ou índices inválidos, sem expor SQL.
Essa verificação estrutural não é uma auditoria completa de alterações nos corpos de
funções/triggers ou de privilégios do servidor.

## Configuração e comandos

SQLite continua padrão, mesmo se `DATABASE_URL` estiver definida. Para um ambiente
PostgreSQL **já migrado e validado**, configurar privadamente:

```dotenv
DATABASE_ENGINE=postgres
DATABASE_SCHEMA=passcheck
PG_SSL_MODE=verify-full
PG_POOL_MAX=5
```

`DATABASE_URL` deve conter a URI real do provedor, sem query string, conforme a etapa 1.
`JWT_SECRET`, política de senhas e demais parâmetros da API permanecem com seus contratos
anteriores. Conservar o segredo JWT do ambiente ao preservar sessões é uma decisão
operacional; nenhuma chave foi alterada nesta implementação.

Se PostgreSQL estiver selecionado, falta de URL, certificado inválido, erro de conexão ou
schema incompleto interrompem a inicialização. Não há retorno silencioso ao SQLite.

| Comando na raiz | Destino |
| --- | --- |
| `npm.cmd start` / `npm.cmd run dev:api` | Motor selecionado, sem migrations automáticas |
| `npm.cmd --prefix backend run db:migrate` | Motor selecionado; comando de escrita explícito |
| `npm.cmd --prefix backend run db:seed` | Motor selecionado, somente development |
| `npm.cmd run admin` / `npm.cmd run operador` | Motor selecionado; credenciais pelo terminal |
| `npm.cmd --prefix backend run db:pg:check` | Sempre PostgreSQL, apenas leitura de conectividade e estrutura |
| `npm.cmd --prefix backend run db:pg:import-sqlite` | Origem `DATABASE_PATH` → destino PostgreSQL vazio |

Os comandos `db:pg:*` continuam separados da seleção do runtime. Não usar seed no destino
que receberá os registros atuais. No Compose, a configuração vem do `.env` privado da raiz;
o volume SQLite foi preservado. A imagem/Compose não foram construídos nem iniciados nesta etapa.

`npm run backup` ainda implementa somente backup SQLite. Quando selecionado PostgreSQL,
o comando falha explicitamente, sem copiar um SQLite antigo e anunciá-lo como backup atual.
`npm run setup` igualmente recusa preparar PostgreSQL pelo fluxo automático SQLite.
Backup PostgreSQL e restauração precisam ser definidos e testados antes do corte real.

## Testes e limites

O responsável autorizou uma instância PostgreSQL temporária local. Foram baixados os
binários `@embedded-postgres/windows-x64@18.6.0-beta.19`, com scripts npm desabilitados,
para um diretório ignorado isolado. O servidor reportou **PostgreSQL 18.6**, escutando
somente em `127.0.0.1`, com senha aleatória de teste e dados fictícios. Nenhum serviço do
Windows foi instalado. Os binários vêm do projeto
[embedded-postgres](https://github.com/leinelissen/embedded-postgres); não foram adicionados
às dependências da aplicação. A configuração TLS remota foi verificada por testes de
configuração; a instância local usou a exceção `disable` restrita a loopback/test.

A execução dedicada de `postgres-integration.test.js` e `postgres-api.test.js` terminou
com **17 testes passando, zero falhas e zero testes ignorados**. Isso inclui migrations
executadas de fato, transferência campo a campo de SQLite fictício e HTTP em dois processos.

A validação final executou `node --test --test-concurrency=1 --test-reporter=tap` com
`TEST_DATABASE_URL` apontando para essa instância e escrita de teste habilitada:
**205 testes passaram, zero falhas, zero cancelados e zero ignorados**, em aproximadamente
60 segundos. Essa rodada inclui toda a regressão SQLite e os testes PostgreSQL.
Uma rodada anterior encerrou o subprocesso de `resumo.test.js` sem diagnóstico; sua
execução isolada, a repetição completa e a rodada final acima passaram.

A instância foi encerrada pelo `pg_ctl` do próprio diretório temporário. A limpeza
remove somente esse diretório validado dentro de `backend/.npm-cache`, sem modificar
outros servidores, dados ou caches preexistentes do projeto.

Os testes existentes foram mantidos. Cinco verificações diretas de serviços passaram de
`assert.throws` para `await assert.rejects`; a injeção de falha antes do commit agora aguarda
o callback. As mesmas asserções de autorização, erro e ausência de escrita parcial permanecem.

Os testes novos de acesso verificam isolamento entre requisições, rollback após `await`,
liberação da fila após falha, client compartilhado entre repositórios, separação entre
transações concorrentes, contexto expirado e seleção explícita do motor.

Comandos de regressão:

```powershell
npm.cmd --prefix backend test -- --test-concurrency=1
node --test backend/tests/database-access.test.js
```

Suíte PostgreSQL preparada:

```powershell
# TEST_DATABASE_URL deve estar configurada privadamente para banco exclusivo de teste.
$env:PASSCHECK_PG_TEST_WRITE='1'
npm.cmd --prefix backend run test:pg:integration
```

Ela mantém a validação de migrations/seed/transferência da etapa 1 e acrescenta dois processos
Express reais: login, autorização por evento, leitura com tipos/aliases corretos,
bootstrap concorrente, registro de instalação, disputa por ingresso, chave idempotente
concorrente, auditoria de divergência, CSV duplicado, resolução concorrente, timeout de lock,
reenvio, falha de trigger, readiness e revogação de token entre processos.
O helper exige banco de teste explícito, não carrega `.env` e remove somente schemas aleatórios
`passcheck_test_<uuid>`. Os subprocessos encerram seus pools antes da remoção dos schemas.

## Estado dos dados e pendências

A leitura da origem confirmou 3 eventos, 6 portões, 22 ingressos, 2 recebimentos,
2 validações, 1 usuário, 1 instalação e cinco migrations SQLite. Os demais vínculos,
auditorias e resoluções continuam vazios. Nenhum desses registros foi modificado.

Antes do corte: validar a conexão/TLS e o runtime com o PostgreSQL do provedor, preparar backup restaurável e
privilégios do Supabase, revisar a janela sem escritores, executar a importação autorizada
para destino vazio, comparar os registros e executar testes de login/QR/reenvio após a troca.
Revisar também latência e contenção do pool com o provedor real; o teste local não as substitui.

Rollback desta etapa de código: preservar os patches anteriores e retirar somente as
alterações desta etapa, com revisão do diff. A configuração atual já continua SQLite.
Depois de uma futura troca com novas escritas PostgreSQL, retornar à origem exige reconciliar
esses registros; simplesmente mudar `DATABASE_ENGINE` poderia perder operações recentes.

**Estado: runtime preparado; migração operacional não concluída.**
