# Preparação da migração SQLite → PostgreSQL

> Registro histórico da primeira etapa. A adaptação posterior da API está no
> [relatório da etapa 2](migracao-postgresql-etapa-2.md).

Data: 2026-11-02. Estado: primeira etapa implementada; **a API continua usando SQLite**.
Não houve transferência de dados, alteração de `.env`, execução de migrations remotas,
reinício de serviço ou mudança no frontend. A troca do banco da API ainda não está implementada.

## Diagnóstico do repositório

O documento recebido propõe investigar e migrar a persistência, preservando os contratos.
Sua hipótese de banco vazio não corresponde ao arquivo local. O responsável confirmou
explicitamente que **todos os registros devem ser preservados**, e autorizou instalar `pg`
localmente sem scripts de pacotes.

Tecnologias encontradas: Node 24.14.0, módulos ESM, Express 5.3.0,
better-sqlite3 13.0.3, Zod 4.6.7, jose 6.2.12, testes `node:test`/Supertest.
O frontend é uma PWA com Vite e IndexedDB; sua persistência offline não faz parte desta mudança.
O processo Express também serve o build da PWA. Docker/Caddy pressupõem processo persistente
e volume SQLite. Não foi iniciada adaptação para Vercel.

O arquivo `backend/data/passcheck.sqlite` foi aberto com `readonly`, `fileMustExist`
e `query_only`. Resultado: `integrity_check = ok`, nenhuma violação de chave estrangeira,
cinco migrations aplicadas. Foram consultadas contagens, sem publicar credenciais ou registros:

| Tabela | Registros |
| --- | ---: |
| eventos | 3 |
| portoes | 6 |
| ingressos | 22 |
| recebimentos | 2 |
| validacoes | 2 |
| usuarios | 1 |
| instalacoes | 1 |
| usuarios_eventos | 0 |
| usuarios_portoes | 0 |
| auditoria_divergencias | 0 |
| resolucoes_administrativas | 0 |

Há backups locais e implementações de backup/readiness ainda específicas de SQLite.
A existência desses arquivos não comprova uma política de retenção ou restauração em produção.
Não há `DATABASE_URL` configurada no `.env` local. Não foi encontrado `psql` no PATH;
o daemon Docker não está disponível. Não houve acesso ao Supabase.

## Superfície impactada e incompatibilidades

| Arquivos atuais | Dependência a adaptar antes da troca |
| --- | --- |
| `src/db/connection.js`, `migrate.js`, `cli.js` | Conexão síncrona, PRAGMA, catálogo SQLite, transações `immediate` |
| `src/db/migrations/001_…005_*.sql` | STRICT, GLOB, funções JSON/datas, RAISE, triggers e INTEGER PRIMARY KEY |
| `src/repositories/{eventos,identidade,sincronizacao,administracao}.js` | `prepare/get/all/run`, placeholders `?`, `lastInsertRowid`, aliases camelCase, JSON |
| `src/services/*`, `src/routes/*`, `src/middleware/autenticacao.js` | Chamadas síncronas devem aguardar IO e autorização dentro da transação |
| `src/services/provisionamento.js`, `src/auth-cli.js`, `src/provisionar-interativo.js` | Escritas diretas e leitura de migrações SQLite |
| `src/db/readiness.js`, `src/routes/health.js`, `src/server.js` | Inspeção estrutural SQLite, abertura e encerramento síncronos |
| `src/db/seeds/development.js`, `src/db/backup*.js` | Seed com IDs explícitos; backup SQLite/WAL |
| `tests/*`, `tests/helpers/*` | Bancos em memória, PRAGMA, falhas de trigger e concorrência em processos |
| `scripts/setup.mjs`, Dockerfile, compose, documentação de hospedagem | Inicialização, volume local, manutenção e recuperação |

Uma substituição de driver não seria suficiente: `BEGIN IMMEDIATE` serializa escritores
no SQLite. No PostgreSQL, dois leitores podem observar o mesmo ingresso disponível.
O adaptador futuro deve bloquear de maneira consistente a chave de idempotência e o ingresso,
reler a autorização dentro da mesma transação e manter a unidade de commit por item.
Constraints únicas impedem duas confirmações, mas sozinhas não produzem os contratos
`CONFLITO` e `JA_PROCESSADA` da API.

Outras diferenças concretas: PostgreSQL transforma aliases não delimitados em minúsculas;
`COUNT(*)` retorna bigint; IDs explícitos não avançam automaticamente sequences;
JSONB pode alterar a representação textual usada na comparação de idempotência;
erros usam SQLSTATE, e uma falha de SQL aborta a transação até rollback.

## Plano executado e arquivos

1. Auditoria em leitura e execução dos testes existentes antes das mudanças.
2. Driver `pg@8.23.1` instalado com `--save-exact --ignore-scripts --no-audit --no-fund`;
   package.json e lockfile atualizados, sem remover better-sqlite3.
3. `src/db/postgres/config.js`: URL explícita, schema privado, pool limitado, timeouts,
   TLS com certificado verificado; nenhum valor sensível aparece nas mensagens.
4. `src/db/postgres/connection.js`: pool reutilizável por processo, client único por
   transação, commit após `await`, rollback, descarte de conexão quebrada e fechamento idempotente.
   `SET LOCAL` evita que configurações escapem para outra transação do pooler.
5. `src/db/postgres/migrate.js` e `migrations/001_…005_*.sql`: conversão do modelo
   existente, histórico próprio com SHA-256 e lock transacional antes do DDL.
   Migrations SQLite originais permanecem intactas. O lote PostgreSQL é atômico.
6. `migrations/006_proveniencia_sqlite.sql`: metadados imutáveis da transferência,
   incluindo histórico original, contagens e digest, sem caminho local ou credenciais.
7. `src/db/postgres/seed.js`: mesmos mocks, somente development, sem sobrescrita;
   confirmações via triggers; ajuste transacional das sequences.
8. `src/db/postgres/import-sqlite.js`: snapshot consistente e somente leitura da origem,
   recusa tabelas/colunas inesperadas, exige destino vazio, importa relações em ordem,
   preserva IDs, hashes de senha, versões de token, permissões, instalações, JSON e horários.
   O estado `utilizado` é restaurado pelas confirmações e conferido campo a campo.
   Falhas revertem todos os registros e ajustes de sequence do destino.
9. `src/db/postgres/cli.js`, scripts `db:pg:*` e `.env.example`: comandos explícitos,
   separados da operação SQLite atual. `check` consulta conectividade e histórico de migrations;
   não substitui uma futura verificação completa de readiness estrutural.
10. `tests/postgres-foundation.test.js` e `tests/postgres-integration.test.js`: testes
    locais e suíte opt-in para PostgreSQL real em schema exclusivo de testes.

IDs usam bigint com limite seguro JavaScript e conversão restrita ao pool. Datas e
instantes continuam TEXT para preservar a representação original; CHECKs validam o conteúdo.
Indicadores `ativo`/`utilizado` continuam 0/1 internamente. JSON de idempotência continua TEXT;
JSONB é usado apenas no índice de pendências e nos metadados da transferência.
Comparações de códigos/dispositivos usam collation `C`.
Triggers conservam imutabilidade, confirmação e revogação de tokens. Há proteções adicionais
contra `TRUNCATE`, operação que não dispara os triggers por linha no PostgreSQL.

O schema padrão `passcheck` evita colocar dados no `public` normalmente usado pela Data API
do Supabase. Não se adicionaram Supabase Auth, SDK no frontend ou políticas RLS.
Na implantação, o schema deve continuar fora dos schemas expostos e sem grants a clientes
anon/authenticated. Use conta de runtime com privilégios limitados, distinta do migrador;
permissões reais ainda não foram inspecionadas ou alteradas.

## Configuração e comandos preparados

Preencha apenas no ambiente privado `backend/.env`:

- `DATABASE_URL`: URI PostgreSQL fornecida pelo provedor, com usuário, senha, host,
  porta e banco. Sem query string; opções TLS são definidas separadamente.
- `DATABASE_SCHEMA=passcheck` (ou outro schema privado dedicado).
- `PG_SSL_MODE=verify-full`; `PG_SSL_CA_FILE` somente se precisar fornecer a CA do provedor.
- `PG_POOL_MAX=5`; timeouts documentados em `.env.example` podem permanecer nos padrões.
- `DATABASE_PATH`: mantenha o arquivo SQLite de origem explicitamente configurado.

`PG_SSL_MODE=disable` só é aceito para loopback em development/test.
Não use senha em argumento de shell, relatório, frontend ou commit. Não compartilhe a URL no chat.
Para o processo persistente atual, a conexão direta ou o pooler de sessão do provedor
são opções a validar conforme rede disponível. O pooler transacional é relevante para
uma futura hospedagem serverless; não há prepared statements nomeados ou locks de sessão
na implementação nova. Referência: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Comandos abaixo são executados a partir da raiz. **Não foram executados contra banco real.**
A API continuará no SQLite mesmo depois desses comandos.

```powershell
# Cria/aplica o schema PostgreSQL e seu histórico; requer destino autorizado.
npm.cmd --prefix backend run db:pg:migrate

# Somente leitura: verifica conexão e histórico atual.
npm.cmd --prefix backend run db:pg:check

# Após backup verificado e suspensão autorizada de escritas na origem:
# copia todos os registros para o schema de destino VAZIO.
npm.cmd --prefix backend run db:pg:import-sqlite
```

**Não executar `db:pg:seed` no destino da transferência.** Ele preencheria o destino,
que seria corretamente recusado pelo importador. O comando existe apenas para ambientes
de desenvolvimento independentes que precisem dos mocks:

```powershell
npm.cmd --prefix backend run db:pg:seed
```

A origem deve ficar sem escritores durante todo o corte. O importador compara um novo
snapshot antes do commit e cancela se perceber mudanças, mas isso não substitui uma janela
de manutenção: uma escrita posterior à comparação ainda poderia ocorrer. Nenhum serviço
foi parado automaticamente.

O importador conserva triggers ativos. Caso uma resolução histórica se refira a um
administrador atualmente desativado/rebaixado, a restrição de inserção pode recusar a cópia.
Nessa situação ocorre rollback integral e será necessário revisar uma estratégia explícita
de carga histórica. Não se desabilitam proteções nem se descartam registros silenciosamente.
Na origem examinada não existem resoluções administrativas.

O snapshot cabe em memória para o volume atual. Uma origem muito maior exigirá avaliar
streaming/staging e duração da janela de manutenção. A leitura confirma integridade e
formato, mas não substitui a validação funcional completa no destino.

## Validação

| Comando / verificação | Resultado |
| --- | --- |
| `npm.cmd test -- --test-concurrency=1` em backend, antes das alterações | 169 testes passaram |
| Mesmo comando após instalar `pg` e adicionar a preparação | 182 passaram, 0 falhas, 2 grupos PostgreSQL ignorados |
| `npm.cmd --prefix backend run test:pg:unit` | 13 testes passaram |
| `npm.cmd --prefix backend run test:pg:integration` | 2 grupos ignorados por ausência de PostgreSQL de teste |
| `npm.cmd --prefix backend ls pg --depth=0` | pg 8.23.1 instalado |
| SQLite real, somente leitura | integridade ok, cinco migrations, contagens acima |

Uma nova leitura consistente da origem ao final confirmou as mesmas contagens e o
histórico SQLite de cinco migrations. Os testes não usaram o banco local compartilhado.

O `npm.ps1` foi bloqueado pela política do PowerShell; foi usado `npm.cmd`, sem mudar
a política do sistema. O download inicial foi bloqueado pela rede do sandbox; a instalação
autorizada foi concluída com acesso ampliado apenas para o comando de instalação.

Os testes unitários usam SQLite temporário para leitura da origem e um driver injetado
para observar commit/rollback/liberação de conexões. **Eles não validam a execução do SQL
PostgreSQL nem equivalência dos triggers em servidor real.**

Para executar a suíte de integração, configure `TEST_DATABASE_URL` privadamente para um
banco exclusivo de testes, mais `PASSCHECK_PG_TEST_WRITE=1`. Ela não carrega `.env` nem
usa `DATABASE_URL` como fallback. Use `PG_SSL_MODE=disable` somente se o servidor estiver
em loopback; remotamente mantenha a verificação TLS.

```powershell
$env:PASSCHECK_PG_TEST_WRITE='1'
npm.cmd --prefix backend run test:pg:integration
```

A suíte cria schemas `passcheck_test_<uuid>` e remove apenas esses schemas ao finalizar.
Isso envolve DDL e escrita: revisar o destino antes de autorizar/executar. Os cenários
preparados incluem migrations concorrentes, repetição, checksum divergente, rollback de DDL,
seed, sequences, FKs compostas, datas, JSON, imutabilidade, revogação de token, duas confirmações
concorrentes e transferência integral SQLite → PostgreSQL. Esses cenários ainda não foram executados.

## Achados operacionais relevantes

**MIG-001 — HIGH — Premissa incorreta de banco vazio.**
Componente: SQLite central e plano de implantação. Evidência: contagens acima, usuário
e instalação existentes. Risco: perda de acesso, eventos e histórico ao apontar a aplicação
para um banco novo. Cenário: implantação apenas com schema/seed, deixando registros reais
inacessíveis. Remediação: preservar a origem, backup verificado e transferência integral
com conferência; decisão de preservação confirmada pelo responsável. Validação: comparar
todas as colunas e testar login, permissões e reenvio depois do corte. Estado: importador
preparado, transferência real pendente.

**MIG-002 — HIGH — Semântica de concorrência ainda depende de SQLite.**
Componente: repositórios, serviços e provisionamento. Evidência: transações `immediate()`
e IO síncrono na implementação atual. Risco: numa troca direta, retornos incorretos ou
confirmação de operações não concluídas. Cenário: dispositivos disputam um ingresso ou a
mesma chave de idempotência; uma implementação apenas convertida para promises pode retornar
erro genérico ou não aguardar a autorização. Remediação: adaptar chamadas/transações,
bloqueios e SQLSTATE antes de conectar a API ao PostgreSQL. Validação: repetir os testes
HTTP em processos independentes e os casos de idempotência/concorrência no novo motor.
Estado: a API permanece SQLite, impedindo ativação acidental da implementação incompleta.

## Pendências para concluir a migração

1. Disponibilizar PostgreSQL de testes e executar a suíte real; corrigir divergências de
   SQL, constraints e triggers antes da integração com a API.
2. Adaptar os quatro repositórios, serviços, rotas, autenticação, provisionamento,
   readiness e lifecycle para IO assíncrono; preservar erros e contratos HTTP.
3. Implementar e validar a serialização de sincronização, instalação, bootstrap,
   importação CSV e resolução administrativa com múltiplos processos.
4. Portar fixtures e testes HTTP para o motor PostgreSQL, preservando a cobertura existente.
5. Preparar backups/restauração PostgreSQL e ajustar scripts de setup/container/hospedagem.
6. Configurar destino privado, privilégios e conexão Supabase; revisar plano de corte,
   backup restaurável, manutenção, importação, validação e retorno à origem.
7. Trocar o runtime somente após essas verificações. **Migração não concluída.**

Para reverter somente esta primeira etapa de código: retirar os arquivos novos de
`src/db/postgres/`, os dois testes novos, este relatório e apenas os acréscimos PostgreSQL
de `.env.example`, package.json e package-lock.json. Não usar `git reset --hard`/`git restore`
genéricos: há numerosas alterações anteriores do usuário. Nenhum rollback de banco é
necessário agora. Após futura transferência, a origem continuará intacta; voltar a ela
depois de novas escritas no destino exigirá reconciliação, não apenas trocar uma URL.

Referências técnicas consultadas: [transações node-postgres](https://node-postgres.com/features/transactions),
[TLS node-postgres](https://node-postgres.com/features/ssl),
[pool node-postgres](https://node-postgres.com/apis/pool),
[locks PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html),
[identity columns PostgreSQL](https://www.postgresql.org/docs/current/ddl-identity-columns.html).
