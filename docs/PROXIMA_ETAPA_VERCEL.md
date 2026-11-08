# Retomada — configurar ambiente e publicar o PassCheck

> **Testes posteriores em 2026-11-08:** conta administrativa Gabrielth criada;
> 234 testes locais e testes de navegador aprovados. Testes reais identificaram
> erro 400 na listagem de pendências e falta de integração da gestão e sincronização
> na interface. A próxima etapa é tratar esses achados, não republicar o lote inicial.
> Ver [TESTES_FUNCIONAIS_2026-11-08.md](TESTES_FUNCIONAIS_2026-11-08.md).

> **Estado atual — 2026-11-08:** autorização específica recebida; backups verificados,
> variáveis somente Production e publicação concluídos. Site:
> https://passcheck-mocha.vercel.app. As pendências de autorização/publicação abaixo
> são históricas. Resultados, correção do build e próximos testes em
> [PUBLICACAO_REALIZADA_2026-11-08.md](PUBLICACAO_REALIZADA_2026-11-08.md).

> Revisão de 2026-11-08: sequência confirmada por inspeção local e remota.
> A execução do envio de segredos foi bloqueada pela revisão automática, que exigiu
> aprovação específica de DATABASE_URL/JWT_SECRET para Production de
> `check-pass/passcheck`. Nenhum deployment, variável remota ou backup novo foi
> criado nesta sessão. Evidências, achados e procedimento preparado em
> [REVISAO_PROXIMA_ETAPA_2026-11-08.md](REVISAO_PROXIMA_ETAPA_2026-11-08.md).

Registro atualizado em 2026-11-07, America/Sao_Paulo.
Retomada prevista para 2026-11-08.

## Onde paramos

O projeto Vercel está criado e vinculado, mas **não há deployment**. Os segredos da
aplicação ainda não foram enviados à Vercel. A aplicação local continua usando
**SQLite**; o Supabase já recebeu os dados e as migrations 001–007.

Próxima etapa: obter autorização para o lote de backups, configuração das variáveis
privadas e primeira publicação; executar o lote autorizado e validar o ambiente hospedado.
O usuário encerrou a sessão para continuar depois e pediu somente esta documentação.
**Não houve autorização para publicar nem enviar segredos à Vercel.**

## Confirmações do responsável em 2026-11-07

- `passcheck` **não está selecionado em Exposed schemas**. Ele apenas aparece entre
  as opções do dropdown. A informação anterior de exposição foi corrigida pelo
  responsável após conferir a interface; não é necessário remover nada.
- Essa confirmação veio do responsável, não de leitura automatizada do painel.
  Nenhuma configuração da Data API foi alterada.
- Ninguém está usando o PassCheck; o projeto está apenas em desenvolvimento.
  O responsável esclareceu a dúvida anterior sobre uso local. Não houve inspeção
  individual de dispositivos ou filas offline.
- O “autorizo” desta conversa se referia exclusivamente à retirada de `passcheck`
  de Exposed schemas, que se mostrou desnecessária. **Não estender essa autorização
  para backups, envio de segredos, deployment ou testes que escrevam dados.**
- A edição desta documentação foi solicitada explicitamente. Preservar as demais
  alterações locais e começar a próxima sessão com verificações somente de leitura.

## Verificações realizadas em 2026-11-07

- Vercel: projeto e comandos de build conferidos; **zero deployments e zero variáveis
  de ambiente cadastradas**. A API confirmou o domínio verificado
  `passcheck-mocha.vercel.app`, sem redirecionamento. Domínio atribuído não significa
  site publicado ou validado.
- Origem preparada para `CORS_ORIGINS`: `https://passcheck-mocha.vercel.app`, sem barra
  final. Reconfirmar a atribuição na retomada; não usar `passcheck.vercel.app`.
- `deploy --dry --json`: 116 arquivos selecionados, sem upload ou deployment.
  `.env`, bancos locais, backups e sessão privada ficaram fora da seleção;
  certificado público e migrations PostgreSQL foram incluídos.
- Conexão da conta restrita pelo Transaction pooler: TLS `verify-full` e readiness
  aprovados. A configuração local continua em SQLite; nenhum `.env` foi alterado.
- Comparação integral das 11 tabelas de negócio: nenhuma divergência; proveniência
  da importação correspondente e origem estável durante a comparação.
- Histórico das migrations correspondente aos arquivos locais. Sem USAGE do schema
  para PUBLIC, `anon` ou `authenticated`, conforme inspeção de catálogo.
- A conta restrita recebeu SQLSTATE `42501` ao consultar `sqlite_import_history`,
  pois não possui SELECT nessa tabela administrativa. Isso não impediu o readiness.
  A comparação completa foi feita com a conexão administrativa existente em
  transações **READ ONLY**. Não ampliar grants para contornar essa restrição e não
  enviar essa credencial administrativa à Vercel.
- Não foram criados novos backups, executados builds/testes completos ou realizados
  testes de escrita nesta sessão. As evidências de testes e backups abaixo são de
  sessões anteriores. Os resultados de hoje foram retornados pelas ferramentas;
  não foi criado um novo relatório JSON de verificação em disco.

## Lote proposto para aprovação na retomada

1. Criar backups atualizados de SQLite e PostgreSQL em diretório privado, verificar
   os artefatos e repetir a comparação imediatamente antes da publicação.
2. Configurar somente Production com os parâmetros de [PUBLICACAO_VERCEL.md](PUBLICACAO_VERCEL.md),
   usando `passcheck_runtime`, TLS `verify-full`, o JWT_SECRET existente e a origem
   HTTPS confirmada. Não habilitar Preview com credenciais de produção.
3. Fazer a primeira publicação no projeto Vercel já vinculado e conferir build,
   site, API, certificado empacotado, CORS e cabeçalhos reais.
4. Atualizar estes documentos com o deployment, resultados e pendências reais.

**Impacto e risco:** código e segredos privados serão enviados à Vercel, a aplicação
ficará acessível pela internet e poderá escrever no Supabase. Falha no build ou no
runtime pode impedir a primeira ativação. Escritas locais posteriores em SQLite
podem divergir do banco hospedado; manter a cópia local sem escritas de negócio
durante o corte e usar banco isolado para desenvolvimento futuro.

**Retorno:** retirar a publicação criada e remover as variáveis adicionadas nesse
lote, preservando os bancos, backups e alterações anteriores. Remover variáveis
sozinho não desativa um deployment já criado. Antes de novas escritas de negócio,
o SQLite preservado permite retomar o uso local; depois delas, reconciliar os dados
antes de voltar. Não apagar tabelas, migrations ou histórico como forma de retorno.

**Autorização pendente:** apresentar esse lote ao responsável e obter aprovação
explícita antes de executá-lo. A solicitação de documentação não constitui aprovação.
Delimitar também os testes que escrevem: login altera o contador; logout e fluxos
de negócio podem alterar outros registros. Não criar usuários, eventos ou ingressos
de teste em produção sem escopo autorizado. Validar fluxos completos com conta e
ambiente de teste adequados; registrar qualquer validação que ficar pendente.

## O que já foi concluído

- Supabase: schema `passcheck`, conta restrita `passcheck_runtime`, TLS verify-full
  e Transaction pooler `aws-0-us-east-1.pooler.supabase.com:6543` validados.
- Migration 007 aplicada em transação com grants e policy de `login_limites`.
  RLS habilitado; apenas proprietário e conta de runtime têm acesso à nova tabela.
- Readiness aprovado pelo pooler. Teste do contador permitiu dez tentativas e
  bloqueou a 11ª; a transação de teste foi revertida, deixando a tabela vazia.
- Comparação integral SQLite/Supabase aprovada em 2026-11-06: 11 tabelas de negócio,
  proveniência, oito sequências e permissões anteriores preservados.
- Build frontend e 234 testes locais aprovados em 2026-11-04: 226 backend e oito
  frontend, sem testes ignorados, incluindo PostgreSQL local isolado.
- Entrada `api/index.js`, adaptador `backend/src/vercel.js`, pool reutilizado,
  `@vercel/functions` 3.10.6, contador compartilhado e exclusões de upload preparados.
- CLI Vercel 65.12.1 instalada isoladamente; login concluído pelo responsável no
  navegador. Projeto criado, vinculado e conferido com zero deployments.

Essas verificações não substituem um build e um teste reais na Vercel.

## Destino Vercel

| Item | Valor |
| --- | --- |
| Painel | https://vercel.com/check-pass/passcheck |
| Equipe | CheckPass, slug `check-pass`, plano Hobby |
| Projeto | `passcheck` |
| Project ID | `prj_8AUTalYVty4wNgB0EtHxZY2IB524` |
| Team ID | `team_9qA0v5IgACl6D3P4VpChbMX1` |
| Root Directory | Raiz do repositório |
| Framework | Other |
| Node | 24.x |
| Install | `npm --prefix backend ci && npm --prefix frontend ci` |
| Build | `npm --prefix frontend run build` |
| Output | `frontend/dist` |

Domínio atribuído confirmado em 2026-11-07: `passcheck-mocha.vercel.app`.
Reconfirmar antes de definir `CORS_ORIGINS`; ainda não há site publicado.

## Como retomar sem recriar a configuração

Executar na raiz do repositório. A CLI não foi instalada globalmente.

```powershell
$env:VERCEL_TELEMETRY_DISABLED = '1'
$vercelCli = 'backend/backups/vercel-cli-65.12.1/node_modules/vercel/dist/vc.js'
$vercelSession = 'backend/backups/vercel-cli-65.12.1/session'

node $vercelCli project inspect passcheck --json --scope check-pass --global-config $vercelSession
node $vercelCli list passcheck --json --scope check-pass --global-config $vercelSession
```

Essas duas consultas são somente de leitura. Se a sessão tiver expirado, iniciar
novamente `login` usando o mesmo `--global-config` e pedir ao responsável para
concluir o fluxo no navegador. Não pedir token ou senha pelo chat.

Não executar a CLI sem subcomando: o comando padrão pode iniciar um deployment.
Consultar `--help` antes de usar novos comandos.

Para repetir a inspeção dos arquivos sem upload, após conferir a ajuda:

```powershell
node $vercelCli deploy --dry --json --project prj_8AUTalYVty4wNgB0EtHxZY2IB524 --scope check-pass --global-config $vercelSession
```

Usar `--global-config $vercelSession` também nos comandos de ajuda: sem essa opção,
a CLI tentou criar uma pasta global e recebeu EPERM nesta sessão. Consultas remotas
falharam no sandbox com `fetch failed`/`EACCES` e funcionaram após liberação de rede
para leitura; isso não indicava sessão expirada ou senha inválida.
Não reinstalar ferramentas nem recriar o projeto por causa desse bloqueio.

Para consultas autenticadas de domínios/nomes de variáveis, a sessão existente foi
usada somente em memória; os valores não foram exibidos. Não copiar tokens para
argumentos de comandos ou relatórios. Uma integração Supabase foi sugerida, mas
não houve confirmação de instalação/conexão; não presumir acesso ao painel.

## Próximos passos, na ordem

1. Conferir o projeto e o estado atual do repositório em modo de leitura. Há muitas
   alterações anteriores não commitadas: preservar todo esse trabalho; não usar reset,
   commit, push ou importação Git sem autorização própria.
2. Considerar a confirmação de 2026-11-07: `passcheck` não está selecionado em
   Exposed schemas. Não executar a remoção que havia sido proposta. O projeto
   está somente em desenvolvimento, sem usuários; verificar se houve novas
   escritas desde a última comparação antes do corte.
3. Preparar os valores de produção conforme a tabela em
   [PUBLICACAO_VERCEL.md](PUBLICACAO_VERCEL.md). Montar a URI do pooler com a
   credencial restrita existente, nunca com a conta administrativa. Manter TLS
   verify-full e usar o certificado público empacotado, sem caminho Windows.
4. Confirmar domínio/origem HTTPS exatos. Manter variáveis sensíveis somente no
   ambiente Production; Preview precisa de banco/schema isolado antes de receber
   acesso de escrita. Não copiar credenciais de produção para Preview.
5. Preparar um plano concreto de publicação e corte, com escopo, risco, impacto e
   retorno. Obter autorização para envio dos segredos privados à Vercel e para
   ativação/publicação. As autorizações anteriores não incluíram essas ações.
6. Imediatamente antes do corte, repetir a comparação SQLite/Supabase e providenciar
   backup atualizado. Novas escritas no SQLite podem ter desatualizado a cópia remota.
   Planejar o encerramento das escritas locais para evitar dois bancos divergentes.
   Não executar seed ou repetir o importador sobre o destino preenchido.
7. Após autorização, configurar o ambiente e publicar. Conferir build Linux,
   empacotamento do certificado/migrations, rotas `/api`, estáticos e cabeçalhos reais.
8. Validar `/`, `/sw.js`, assets, `/api/health`, `/api/ready`, CORS, TLS, autenticação,
   limite de tentativas e fluxos da aplicação dentro do escopo de testes autorizado.
   Registrar o deployment e o endereço confirmado. Não anunciar conclusão antes
   dessa verificação.

## Segredos e arquivos locais

- `backend/.env`: configuração ativa local, ainda SQLite; contém valores privados.
- `backend/.env.postgres-runtime`: credencial restrita existente; não é carregado
  automaticamente e não ativa PostgreSQL. Sua URI original usa conexão direta;
  para o pooler, usar host/porta acima e usuário `passcheck_runtime.<project-ref>`.
- `backend/certs/prod-ca-2021.crt`: certificado público, validado no endpoint do pooler.
- `backend/backups/vercel-cli-65.12.1/session`: sessão privada da CLI.
- `.vercel/project.json`: vínculo local ao projeto, ignorado pelo Git e pelo upload.
- `.env.local` na raiz: gerado por `vercel link`, contém apenas `VERCEL_OIDC_TOKEN`.
  É privado e está excluído do Git e do upload; não é o ambiente do backend.

Nunca imprimir esses segredos, incluí-los neste documento, gravá-los em `vercel.json`
ou usar variáveis `VITE_*` para valores privados. Conferir as exclusões antes do upload.

## Evidências e recuperação

- Backup anterior à migration 007 e relatório sanitizado:
  `backend/backups/migration-007-bf3c7ca0-ca3e-4b8e-8c59-75a16214d43c/`.
  O arquivo `before-007.dump` teve exportação e listagem verificadas; não foi
  restaurado nesse lote. O ensaio de restauração anterior está no relatório da etapa 3.
- Testes locais: `backend/backups/vercel-tests-84b36e2a-383a-403d-9b0f-27918fb6f97c/verification.json`.
- Estado do projeto criado: `backend/backups/vercel-cli-65.12.1/project-verification.json`.
- Cópia anterior à preparação local:
  `backend/backups/pre-vercel-local-20261104-52ccdcbb-fe7a-49d2-8f7b-a7b356c8f0f0/`.
- Cópias externas de backup, retenção e agendamento ainda pendentes.

Após escritas de negócio no PostgreSQL, voltar ao SQLite exige reconciliação dos
dados. Não apagar migrations ou histórico para fazer código antigo aceitar o banco.
Reverter arquivos locais somente de forma seletiva, preservando alterações posteriores.

## Documentação relacionada

- [Preparação e parâmetros da Vercel](PUBLICACAO_VERCEL.md)
- [Ativação Supabase, permissões e recuperação](../backend/docs/ativacao-supabase-etapa-3.md)

Ao concluir a próxima etapa, atualizar este registro com ações realizadas,
verificações, pendências e autorizações, mantendo-o sem credenciais.
