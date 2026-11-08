# Etapa 3 — TLS, conta de runtime e recuperação PostgreSQL

> **Ativação hospedada concluída em 2026-11-08:** após aprovação específica, backups
> e configuração privada Production foram realizados e a aplicação foi publicada em
> https://passcheck-mocha.vercel.app, usando a conta restrita com TLS verify-full.
> Health/readiness e comparação final dos dados aprovados; SQLite local preservado.
> O bloqueio da revisão anterior foi resolvido. Ver
> [resultado da publicação](../../docs/PUBLICACAO_REALIZADA_2026-11-08.md).

> Revisão de 2026-11-08: esta etapa já está concluída; a próxima é a preparação
> final e primeira publicação Vercel. Comparação dos dados, migrations e readiness
> com a conta restrita reconfirmados. O envio de segredos foi bloqueado pela revisão
> automática antes da execução. Ver
> [revisão atual](../../docs/REVISAO_PROXIMA_ETAPA_2026-11-08.md).

Atualização: 2026-11-06, America/Sao_Paulo.

## Resultado

TLS com validação foi configurado e testado. A conta `passcheck_runtime` foi criada
com credencial exclusiva. O backup PostgreSQL foi restaurado em uma instância local
isolada e passou na comparação integral de dados, históricos e sequências.

**A aplicação permanece em SQLite. MAINTAIN foi autorizado explicitamente e aplicado
nas 11 tabelas de domínio; o bloqueio usado pela API passou com a conta remota restrita.**
Nenhuma publicação na Vercel foi executada. Nenhum registro de negócio foi alterado
no Supabase por este lote; a comparação final com SQLite continuou sem divergências.

**Preparação local Vercel concluída em 2026-11-04:** entrada da função, estáticos,
pool e contador de login compartilhado implementados; build aprovado e 234 testes
aprovados (226 backend, 8 frontend), sem testes ignorados, com PostgreSQL 18.4 local.
O teste concorrente concedeu exatamente dez de vinte tentativas em dois pools e
verificou a proteção RLS. A instância temporária foi encerrada. Relatório privado:
`backend/backups/vercel-tests-84b36e2a-383a-403d-9b0f-27918fb6f97c/verification.json`.
Detalhes, parâmetros e reversão em [Publicação Vercel](../../docs/PUBLICACAO_VERCEL.md).
Na conclusão desse lote local, migration 007 e seus novos grants ainda não haviam
sido aplicados remotamente. Nenhum `.env` foi alterado por esse lote local.

**Verificação adicional em 2026-11-05:** Transaction pooler informado pelo responsável
(`aws-0-us-east-1.pooler.supabase.com:6543`) validado com TLS verify-full e a role
restrita, inclusive pela camada de transações da aplicação, somente em leitura.
Comparação integral SQLite/Supabase e histórico 001–006 aprovados novamente.
Naquela verificação, migration 007 continuava pendente; não houve ativação ou publicação. A validação
do pooler ocorreu neste computador, ainda não no ambiente Vercel.

**Migration 007 aplicada em 2026-11-06 após autorização:** backup atualizado,
criação de `login_limites` com RLS, grants SELECT/INSERT/UPDATE/DELETE e policy
somente para `passcheck_runtime`, todos aplicados na mesma transação. A tabela
não concede acesso a PUBLIC, anon, authenticated ou service_role.
Readiness pelo pooler aprovado. O teste real do contador permitiu dez tentativas,
recusou a 11ª e foi integralmente revertido, deixando a tabela vazia.
Dados de negócio, proveniência, oito sequências e permissões anteriores preservados;
arquivos de ambiente inalterados. Backup e relatório estão em
`backend/backups/migration-007-bf3c7ca0-ca3e-4b8e-8c59-75a16214d43c/`.
O novo dump teve exportação/listagem verificadas, sem novo ensaio de restauração.
A aplicação ativa continua em SQLite.

**Projeto Vercel criado em 2026-11-06 após autorização:** CLI 65.12.1 instalada
isoladamente e login confirmado pelo responsável. Projeto `check-pass/passcheck`
criado/vinculado, com Node 24.x e comandos de build correspondentes ao `vercel.json`.
Nenhum deployment ou envio dos segredos da aplicação foi realizado.
[Painel do projeto](https://vercel.com/check-pass/passcheck).

## Configuração e acesso

- `backend/.env`: somente `PG_SSL_MODE=verify-full` e `PG_SSL_CA_FILE` foram
  atualizados; caminho absoluto para o certificado público `backend/certs/prod-ca-2021.crt`.
  `DATABASE_ENGINE=sqlite`, URI administrativa, JWT e demais valores foram preservados.
- O certificado foi fornecido pelo responsável a partir do painel. A conexão passou
  com validação de cadeia e hostname. Validade informada pelo certificado: até 26/04/2031.
- Cópia privada da configuração anterior:
  `backend/backups/.env-before-tls-80aaa90d-bbbf-4997-86ab-478728a1de2e.bak`.
- Nova credencial: `backend/.env.postgres-runtime`, ignorado pelo Git. É um arquivo
  de parâmetros de conexão; não é carregado automaticamente e não ativa PostgreSQL.
  Não contém JWT nem substitui a configuração completa da API.
- Role remota: sem superuser, CREATEDB, CREATEROLE, herança de roles, replicação ou
  BYPASSRLS; limite de 10 conexões. Timeouts: statement 15s, lock 5s e transação ociosa 30s.
- Leitura concedida às tabelas usadas pela API e `schema_migrations`; inserções
  limitadas aos fluxos existentes. Updates por coluna: dados do evento, flag de uso
  do ingresso (para o trigger de confirmação) e versão do token do usuário.
- Permanecem negados CREATE no banco/schema, DELETE, TRUNCATE, criação de usuários,
  alteração de senha/papel e alteração de históricos. `auth.users` e `storage.objects`
  não são acessíveis pela conta. Provisionamento de usuários continua administrativo.
- `PUBLIC`, `anon`, `authenticated` e `service_role` não receberam acesso ao schema.
  A conferência remota confirmou ausência de USAGE das três roles da Data API.

## Evidências do ensaio

Artefatos privados, fora do Git:

`backend/backups/pg-recovery-bfb31f5e-5c7c-441d-ac82-664e4615cb06/`

- `passcheck.dump`: exportação custom do schema `passcheck`, 62.255 bytes.
- `verification.json`: comparação e testes locais; resultado `passed`.
- `remote-readonly-verification.json`: estado remoto após o ensaio, sem MAINTAIN.
- `runtime-verification.json`: estado final após autorização e aplicação de MAINTAIN,
  incluindo teste do lock real, privilégios, comparação integral e sequências intactas.
- Script de execução privado: `backend/backups/postgres-recovery-20261103.mjs`.

O `pg_dump` 18.4 leu o PostgreSQL 17.11 do Supabase usando TLS `verify-full`.
Credenciais foram passadas por arquivos de senha privados, nunca por argumentos
de processo. Os arquivos temporários de senha foram removidos ao final.

A restauração usou PostgreSQL 18.4 instalado no computador, somente em loopback,
com autenticação SCRAM e dados em um diretório novo. Não foi instalado serviço Windows.
`pg_restore` executou com `--single-transaction --exit-on-error --no-owner --no-privileges`.

| Verificação | Resultado |
| --- | --- |
| 13 tabelas, todos os campos e históricos | Iguais à origem remota |
| 8 sequências, incluindo `last_value` e `is_called` | Iguais à origem remota |
| Comparação das 11 tabelas de negócio com SQLite | Sem divergências |
| Estrutura, histórico de migrations, triggers habilitados e índices obrigatórios | Aprovados |
| 16 operações proibidas usando a role restrita | Todas recusadas com SQLSTATE 42501 |
| Inserções, updates autorizados, confirmação por trigger, auditoria e resolução | Aprovados em transação local revertida |
| HTTP: health, ready, login, identidade, eventos, instalação e logout | Status esperados |
| HTTP sem token e após revogação | 401 nos dois casos |
| Origem remota antes/depois da exportação e do ensaio | Dados e sequências preservados |

O teste HTTP usou um usuário fictício e uma chave JWT aleatória apenas na cópia local.
Não foram usadas senhas reais de usuários nem emitidos tokens utilizáveis na aplicação.
As duas instâncias dos ensaios foram encerradas; seus diretórios de dados foram removidos
após conferir os caminhos e o estado parado. Dumps e relatórios foram preservados.

Limite: o ensaio comprovou restauração de PostgreSQL 17.11 para 18.4 local, não uma
restauração dentro do serviço Supabase nem em outra instância 17.11. Roles globais não
fazem parte do dump de schema; a restauração sem ACL exige recriar credenciais e
reaplicar as permissões revisadas antes de usar a aplicação.

## Bloqueios da API — pendência resolvida em 2026-11-04

O primeiro ensaio restaurou os dados corretamente, mas o HTTP falhou ao registrar a
instalação: `databaseAccess` adquire `SHARE ROW EXCLUSIVE` nas 11 tabelas de domínio.
Os grants por coluna não autorizam esse lock. Não se alterou a semântica de concorrência
da aplicação, que também protege operações diante de escritores SQL externos.

No segundo ensaio, `MAINTAIN` foi concedido apenas nessas 11 tabelas locais. Isso
habilitou os locks sem conceder UPDATE/DELETE/TRUNCATE amplos. As 16 negativas e os
nove checks HTTP passaram. O SQL revisado está em `deploy/postgres-runtime-grants.sql`.
**O bloco MAINTAIN desse arquivo foi validado localmente e aplicado remotamente após
autorização explícita do responsável, em resposta à pergunta sobre essa permissão.**

A revisão automática de aprovação rejeitou a aplicação remota: considerou que a
autorização anterior para conta restrita e teste local não cobria essa concessão
específica no banco remoto. Não houve tentativa de contornar a rejeição. Após a aprovação
específica, uma nova execução autorizada concedeu somente MAINTAIN nas 11 tabelas.

A validação remota usou a própria camada `databaseAccess` para adquirir os locks,
executar `SELECT 1` e encerrar a transação, sem modificar registros. Confirmou MAINTAIN
exatamente nas 11 tabelas, sem grant option, sem estendê-lo a `schema_migrations` ou
`sqlite_import_history`. DELETE/TRUNCATE, alterações de senha/papel, criação de usuários,
DDL e updates dos históricos continuaram negados. `auth.users` e `storage.objects`
continuaram sem SELECT; anon/authenticated/service_role continuaram sem USAGE no schema.
A comparação final com SQLite passou e as oito sequências permaneceram inalteradas.

**DEP-005 — MEDIUM — Incompatibilidade entre os locks da API e os grants remotos — resolvido.**
Componente: `backend/src/db/access.js` / role `passcheck_runtime`.
Evidência: SQLSTATE 42501 no primeiro teste HTTP e sucesso local após MAINTAIN.
Risco: ativar a conta atual impede transações de instalação, logout, administração
e sincronização. Cenário: um operador consegue entrar, mas não consegue preparar
sua instalação para operar. Remediação aplicada: MAINTAIN nas 11 tabelas listadas.
Validação: lock real com a role remota aprovado, privilégios proibidos negados nos
catálogos remotos, 16 negativas SQL e nove checks HTTP aprovados na cópia local.
Risco residual aceito na autorização: MAINTAIN também permite VACUUM, ANALYZE,
REINDEX e CLUSTER, que podem consumir recursos ou bloquear acesso. Não concede
propriedade, alteração de senhas/papéis, DELETE ou TRUNCATE.
[Privilégios de LOCK](https://www.postgresql.org/docs/17/sql-lock.html),
[alcance de MAINTAIN](https://www.postgresql.org/docs/17/ddl-priv.html).

## Continuidade e ativação

- DEP-003 (TLS sem autenticação): corrigido e validado nesta conexão local.
- DEP-004 (conta privilegiada): alternativa criada; leituras e locks remotos validados,
  além de escritas/HTTP na cópia local. Uso na API ainda depende de configurar
  explicitamente essa credencial na etapa de ativação.
- DEP-002 (recuperação): ensaio local concluído; política operacional e cópia externa
  ainda pendentes. O responsável informou plano Free. Proposta a aprovar: exportação
  diária e antes de mudanças, 7 cópias diárias e 4 semanais em armazenamento externo
  privado, com ensaio periódico de restauração. Nenhum agendamento ou envio foi feito.
  [Backups Supabase](https://supabase.com/docs/guides/platform/backups).
- Revisar no painel a lista de Exposed schemas. O responsável informou
  `graphql_public`, `public` e o schema da aplicação; o nome efetivo é `passcheck`.
  O backend usa conexão SQL e não precisa expor esse schema pela Data API.
  Não foram alteradas configurações do painel nem habilitado RLS nesta execução.
- Para Vercel: entrada/estáticos, gestão do pool e contador compartilhado preparados
  localmente. Endpoint/TLS do pooler e readiness remoto validados neste computador;
  migration 007 e seus grants aplicados após autorização. Projeto criado/vinculado;
  faltam definir origens/segredos e validar publicação autorizada.
- Repetir a comparação da origem imediatamente antes do corte. Novas escritas em
  SQLite tornam a cópia importada desatualizada; o importador recusa destino preenchido.

## Retorno e preservação

O motor segue SQLite. Para reverter somente as duas opções TLS, recuperar seus valores
da cópia privada acima, preservando outras alterações posteriores; não restaurar o
`.env` inteiro às cegas. Não utilizar TLS sem validação em produção.

Para desativar a nova credencial: `ALTER ROLE passcheck_runtime NOLOGIN`, via conta
administrativa e autorização específica. Isso impede novas conexões; sessões existentes
precisam ser drenadas/encerradas separadamente. Não apagar dados nem trocar a senha administrativa.

A reversão de MAINTAIN é `REVOKE MAINTAIN ON TABLE` com
exatamente a lista de 11 tabelas do arquivo SQL. Isso volta a impedir os locks da API.
Conservar dumps e relatórios. Após novas escritas em PostgreSQL, voltar ao SQLite
exige reconciliação de dados, não apenas alterar `DATABASE_ENGINE`.
