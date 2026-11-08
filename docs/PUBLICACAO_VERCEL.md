# Publicação na Vercel — preparação local

> **Publicação concluída em 2026-11-08 após autorização específica.** Site:
> https://passcheck-mocha.vercel.app. O comando de instalação do frontend agora usa
> `npm --prefix frontend ci --include=dev` para disponibilizar o Vite no build.
> Este registro abaixo descreve a preparação histórica; estado atual e evidências:
> [PUBLICACAO_REALIZADA_2026-11-08.md](PUBLICACAO_REALIZADA_2026-11-08.md).

Atualizado em 2026-11-07. Projeto **passcheck** criado e vinculado à equipe **CheckPass**
(`check-pass`), plano Hobby. [Painel do projeto](https://vercel.com/check-pass/passcheck).
Nenhum deployment foi criado. A aplicação local continua em SQLite.
Preparação local, build e testes foram concluídos. Após autorização específica,
backup atualizado e migration 007 com RLS/grants foram executados no Supabase.
Ativação e publicação ainda dependem de revisão e autorização próprias.

## Retomada após a sessão de 2026-11-07

O roteiro atualizado está em [PROXIMA_ETAPA_VERCEL.md](PROXIMA_ETAPA_VERCEL.md).
Projeto remoto reconferido com zero deployments e zero variáveis cadastradas.
Domínio atribuído e verificado: `passcheck-mocha.vercel.app`; a origem planejada é
`https://passcheck-mocha.vercel.app`. Ainda não houve publicação.

O responsável confirmou que `passcheck` apenas aparece no dropdown de Exposed
schemas, **sem estar selecionado**. Nenhuma remoção foi necessária ou executada.
Também confirmou que ninguém usa o sistema ainda: está somente em desenvolvimento.

TLS e readiness passaram com a conta restrita. A comparação das 11 tabelas e da
proveniência passou novamente em transações READ ONLY, usando a conta administrativa
somente para a inspeção que inclui `sqlite_import_history`. A conta de runtime não
pode ler essa tabela administrativa; manter essa restrição. Simulação `deploy --dry`
selecionou 116 arquivos e confirmou exclusões dos ambientes, bancos e backups.

Não foram feitos novos backups ou testes de escrita nesta sessão. O lote de backups,
envio de segredos e publicação **ainda aguarda autorização explícita**. A autorização
anterior para retirar um schema da Data API não cobre esse lote. O usuário solicitou
somente salvar a documentação para continuar em outra sessão.

## Ferramentas e vínculo Vercel

CLI oficial **65.12.1** instalada em 2026-11-06, após autorização, em
`backend/backups/vercel-cli-65.12.1`, com versão fixada e lockfile próprios.
Instalação isolada, sem scripts automáticos ou alteração dos pacotes da aplicação.
O executável foi validado com os comandos de ajuda. A sessão usa `--global-config`
apontando para `backend/backups/vercel-cli-65.12.1/session`; nunca exibir seu conteúdo.
Login confirmado pelo responsável no navegador. Projeto `passcheck` criado na única
equipe da conta e vinculado por `.vercel/project.json`. O comando `link` gerou
`.env.local` na raiz com apenas `VERCEL_OIDC_TOKEN`; seu conteúdo é privado e está
excluído do Git e do upload. Não confundir esse arquivo com `backend/.env`.
Não há deployment nem segredos da aplicação enviados à Vercel.

Identificação para conferir o destino: projeto `prj_8AUTalYVty4wNgB0EtHxZY2IB524`,
equipe `team_9qA0v5IgACl6D3P4VpChbMX1`. Configurações iniciais conferidas: raiz do
repositório, Framework Other, Node 24.x, instalação `npm --prefix backend ci && npm
--prefix frontend ci`, build `npm --prefix frontend run build`, saída `frontend/dist`.
O padrão inicial era Node 26.x, com comandos/saída automáticos; foi ajustado para
corresponder ao código preparado, sem deployment ou mudança de plano.

`.vercel/` está excluído do Git e do upload. A pasta privada de ferramentas já está
excluída pelas regras de backups. Cópias anteriores de `.gitignore` e `.vercelignore`
estão na pasta da CLI. Para desfazer esse lote: encerrar a sessão com `logout` usando
o mesmo `--global-config`, remover somente o vínculo local e `.env.local` criados neste lote e a pasta isolada,
preservando outras alterações. A exclusão de eventual projeto remoto vazio deve
conferir o projeto exato antes da ação. A autorização atual não inclui publicação.

## Pooler validado em 2026-11-05

Endpoint informado pelo responsável: `aws-0-us-east-1.pooler.supabase.com:6543`.
Conexão com a credencial existente de `passcheck_runtime` aprovada, usando o
formato de usuário do pooler `passcheck_runtime.<project-ref>`, sem exibir a URI.
TLS com validação de cadeia e hostname passou com a CA já disponível no projeto.
A camada PostgreSQL da aplicação também passou em transação somente de leitura:
schema `passcheck`, statement timeout 15s, lock timeout 5s e acesso aos eventos.
DELETE no histórico de recebimentos e TRUNCATE de usuários continuam sem permissão.

A comparação integral das 11 tabelas de negócio com SQLite passou, incluindo a
proveniência da importação. Migrations 001–006 têm nomes e checksums iguais aos
arquivos locais; naquele momento somente 007 estava pendente e `login_limites` não existia.
Nenhum `.env`, dado ou configuração remota foi alterado por essa verificação.
Ela comprova acesso a partir deste computador; acesso a partir da Vercel ainda
precisa ser confirmado no deployment autorizado.

## Implementação

- `vercel.json`: raiz do repositório como Root Directory, instalação dos dois
  pacotes, build Vite e saída `frontend/dist`. Framework Preset: Other; Node.js 24.x.
- `api/index.js`: função única, reescrita de `/api/:path*` para `/api/index.js`.
  O frontend usa rotas com hash, sem necessidade de reescrever todas as URLs.
  Estáticos são servidos pela plataforma; `express.static` não é usado na função.
- `backend/src/vercel.js`: inicialização única por instância, readiness antes do
  atendimento, somente PostgreSQL e produção. Falha retorna 503 sem dados internos.
  A função não carrega arquivos `.env`, executa migrations ou cria usuários.
- `@vercel/functions` fixado em **3.10.6** e lockfile atualizado. O pool é associado
  a `attachDatabasePool` uma vez, usa timeout ocioso de 5 segundos por padrão e
  permanece reutilizável entre requisições.
- `.vercelignore` exclui ambientes, backups, bancos locais e arquivos privados.
  O bundle inclui o certificado **público** e as migrations, necessárias ao readiness.
- O contador PostgreSQL permite 10 tentativas por IP em 15 minutos, compartilhadas
  por instâncias que usam o mesmo schema e JWT_SECRET. IPv6 é agrupado por /64.
  Guarda HMAC do IP, quantidade e expiração; não guarda IP puro ou credenciais.
  Usa lock transacional e até 1.000 chaves ativas. Entradas expiradas são removidas
  na próxima tentativa; não há tarefa agendada. Falha no contador retorna 503.
- A entrada hospedada usa `x-vercel-forwarded-for`, validado como um único IP.
  Esse cabeçalho só é confiado no adaptador exclusivo da Vercel; o servidor local
  mantém sua configuração explícita de proxy. Ausência ou formato inválido fecha o login.

## Banco: migration 007 aplicada em 2026-11-06

`007_login_limites.sql` criou uma tabela operacional com índice de expiração e RLS.
O bloco final de `deploy/postgres-runtime-grants.sql` concede SELECT/INSERT/UPDATE/DELETE
somente nessa tabela a `passcheck_runtime`, com policy para a mesma role.
Não amplia DELETE nas tabelas de negócio. A policy cobre todas as linhas do contador
porque esse serviço precisa compartilhar o limite global entre instâncias.

Os dados importados do SQLite e seus checksums excluem esse contador efêmero.
O Supabase está na versão 007. Migration, grants e policy foram aplicados na mesma
transação. A nova tabela não concede acesso a PUBLIC, anon, authenticated ou
service_role. A verificação de prontidão passou com `passcheck_runtime` pelo pooler.

O teste funcional permitiu dez tentativas e recusou a 11ª, usando a função real de
controle de login. Toda a transação desse teste foi revertida; o contador ficou vazio.
As 11 tabelas de negócio, a proveniência da importação, as oito sequências e as
permissões preexistentes permaneceram iguais. `.env` e `.env.postgres-runtime`
foram comparados byte a byte e permaneceram inalterados.

Backup anterior à mudança: `backend/backups/migration-007-bf3c7ca0-ca3e-4b8e-8c59-75a16214d43c/before-007.dump`
(62.354 bytes, SHA-256 `9adf76dec72b6362f80a6c2c41996c12db543abe13eb98d501d2bbc2b1ecb4b6`).
Relatório sanitizado: `verification.json` no mesmo diretório privado, ignorado pelo Git.
Este dump teve exportação e listagem do arquivo validadas; não foi restaurado neste
lote. O ensaio de restauração anterior continua registrado na documentação da etapa 3.

Não executar seed ou repetir a importação sobre o destino preenchido. Manter
`passcheck` fora dos schemas selecionados em Exposed schemas, pois esta aplicação
usa SQL pelo backend. Em 2026-11-07, o responsável confirmou que ele não está
selecionado; apenas aparece entre as opções disponíveis.

## Valores para configurar após criar o projeto

Não colocar segredos em `vercel.json`, no Git, no chat ou em variáveis `VITE_*`.
Configurar segredos somente nas variáveis privadas da função. Não usar a URI
administrativa do `.env` como credencial da aplicação hospedada.

| Variável | Valor/origem |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_ENGINE` | `postgres` |
| `DATABASE_SCHEMA` | `passcheck` |
| `DATABASE_URL` | URI do Transaction pooler validado acima, com a credencial restrita; guardar somente em ambiente privado |
| `PG_SSL_MODE` | `verify-full` |
| `PG_SSL_CA_FILE` | Omitir para usar o certificado empacotado, já validado neste pooler a partir do computador |
| `PG_POOL_MAX` | `2` como ponto de partida; revisar capacidade do pooler e limite da role antes do tráfego real |
| `PG_IDLE_TIMEOUT_MS` | `5000` |
| `PG_CONNECT_TIMEOUT_MS` | `5000` |
| `PG_STATEMENT_TIMEOUT_MS` | `15000` |
| `PG_LOCK_TIMEOUT_MS` | `5000` |
| `JWT_SECRET` | Segredo privado existente, igual entre instâncias da mesma aplicação |
| `JWT_TTL_SECONDS` | `900` |
| `CORS_ORIGINS` | Origem HTTPS exata escolhida para o projeto, sem barra final e sem curinga |

`VERCEL=1` é fornecido pela plataforma. Não copiar o caminho Windows de certificado
para o ambiente Linux. Se a cadeia do pooler exigir outra CA, revisar os certificados
aceitos antes da publicação; não desativar a validação TLS.

Preview não deve herdar acesso de escrita ao banco de produção. Definir banco/schema
isolado antes de habilitar uma aplicação funcional de preview. Até isso ocorrer,
manter credenciais de produção apenas no ambiente Production. A origem confirmada
em 2026-11-07 é `https://passcheck-mocha.vercel.app`; reconferir a atribuição antes
de configurar o ambiente. Não usar o nome não confirmado `passcheck.vercel.app`.

## Validação local concluída

- Build Vite aprovado (`npm run build`).
- 226 testes backend e 8 frontend aprovados, nenhum ignorado. A execução completa
  usou PostgreSQL 18.4 local em loopback, com credencial aleatória, schemas e roles
  exclusivos; servidor encerrado ao final. Não utilizou a conexão remota.
- Concorrência em dois pools: exatamente dez permissões entre vinte chamadas;
  expiração, teto de mil chaves, duas APIs, reinicialização, RLS e falha fechada validados.
- Relatório privado: `backend/backups/vercel-tests-84b36e2a-383a-403d-9b0f-27918fb6f97c/verification.json`.

## Validação de publicação, ainda pendente

Os testes locais não comprovam empacotamento Linux, rewrites e cabeçalhos reais da
Vercel nem o acesso ao Transaction pooler a partir dela. A CLI e o projeto estão
prontos; nenhum deployment foi criado.

Depois de autorizar e preparar o destino: conferir exclusões do upload, build remoto,
`/`, `/sw.js`, assets, `/api/health` e `/api/ready`; validar CORS, certificado, login,
logout e persistência com conta de teste em ambiente isolado. Conferir que arquivos
privados não são publicados. Testes que escrevem, inclusive tentativas de login que
alteram o contador, devem respeitar a autorização do destino escolhido.

O limite de 10 tentativas inclui logins bem-sucedidos e é compartilhado por pessoas
atrás do mesmo IP público. O teto global de 1.000 chaves protege armazenamento, mas
pode impedir novos logins durante ataque distribuído; não substitui proteção de borda.
Backups externos e rotina de recuperação continuam pendentes conforme o relatório
da etapa 3. Novas escritas no SQLite exigem nova reconciliação antes do corte.

## Retorno do lote local

Originais preservados em
`backend/backups/pre-vercel-local-20261104-52ccdcbb-fe7a-49d2-8f7b-a7b356c8f0f0`,
com `manifest.json`. Para reverter, comparar arquivo a arquivo com esse snapshot,
restaurar somente os trechos deste lote e remover somente arquivos novos listados
no manifesto que não receberam alterações posteriores. Não executar reset global:
o repositório já continha trabalho não commitado. Reinstalar dependências pelo lockfile
restaurado quando autorizado. Nenhum `.env` foi modificado por este lote.

Para suspender o uso da nova tabela, manter a aplicação local em SQLite ou uma
versão anterior compatível, conservando a tabela ociosa. Readiness de versões que
exigem exatamente seis migrations pode recusar o banco atualizado: não apagar
histórico para contornar essa proteção. Apagar tabela/histórico exige plano próprio.
Depois de escritas de
negócio em PostgreSQL, voltar ao SQLite exige reconciliar os dados.

## Referências consultadas

- [Funções Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Configuração do projeto](https://vercel.com/docs/project-configuration/vercel-json)
- [Pools de conexão](https://vercel.com/kb/guide/connection-pooling-with-functions)
- [Cabeçalhos de requisição](https://vercel.com/docs/headers/request-headers)
- [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
