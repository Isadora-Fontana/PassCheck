# Etapa 3 — preparação do destino Supabase

## Atualização em 2026-11-04 — TLS e recuperação validados

TLS `verify-full` configurado; conta `passcheck_runtime` criada; backup PostgreSQL
restaurado e conferido em instância local isolada. A aplicação permanece em SQLite.
Os testes locais identificaram necessidade de MAINTAIN para os locks da API.
Após autorização específica do responsável, a permissão foi aplicada nas 11 tabelas
e o lock passou com a conta remota restrita. As proibições de escrita sensível foram
conferidas, sem alteração dos dados de negócio nem das sequências.
Detalhes, evidências e reversão em [TLS, runtime e recuperação](ativacao-supabase-etapa-3.md).

Os registros abaixo descrevem os estados anteriores.

## Atualização em 2026-11-03 — migrations e importação executadas

Após autorização explícita do responsável, foram executados backup SQLite,
seis migrations PostgreSQL e importação das onze tabelas no projeto identificado
pelo responsável como CheckPass, usando a conexão privada já configurada e o
schema `passcheck`. Não foram alterados código da aplicação, `.env`, credenciais
ou motor ativo. Não houve seed, publicação na Vercel ou reinício de serviços.

### Evidências da execução

- A inspeção local imediatamente anterior não encontrou processos Node nem
  serviços escutando nas portas 3000, 5173 e 4173. Isso não substitui controle
  permanente de escritores; a estabilidade da origem também foi conferida.
- Preflight inicial: PostgreSQL 17.11, schema ausente, origem íntegra e compatível.
- Backup criado em
  `backend/backups/passcheck-2026-11-04T01-09-43-965Z-84b2c3aa-227c-44c8-96d6-f9e1aa8ef585.sqlite`.
  O nome usa UTC; a data local da execução é 03/11/2026, America/Sao_Paulo.
  A pasta já é ignorada pelo Git e o arquivo contém dados sensíveis.
- `db:verify-backup` passou antes e depois da carga: `matches=true` e
  `sourceStable=true`, comparando conteúdo e histórico com uma cópia independente.
- `db:pg:migrate` aplicou migrations 001 a 006. `db:pg:check` confirmou histórico,
  tabelas/colunas, triggers habilitados e índices válidos.
- Preflight após migrations: `empty_with_current_history`,
  `publicSchemaUsage=false`, `apiRolesWithSchemaUsage=[]`.
- `db:pg:import-sqlite` concluiu com `verified=true`.
- `db:pg:verify-import` passou: `matches=true`, `sourceStable=true`,
  `provenanceMatches=true`, `mismatchedTables=[]`.

| Tabela | Registros conferidos |
| --- | ---: |
| eventos | 3 |
| portoes | 6 |
| ingressos | 22 |
| usuarios | 1 |
| usuarios_eventos | 0 |
| usuarios_portoes | 0 |
| instalacoes | 1 |
| recebimentos | 2 |
| validacoes | 2 |
| auditoria_divergencias | 0 |
| resolucoes_administrativas | 0 |

### Limites e pendências para ativação

O motor configurado permanece `sqlite`. O Supabase contém uma cópia validada,
não está recebendo as novas operações da aplicação. Novas escritas no SQLite
podem tornar essa cópia desatualizada; repetir a comparação antes de ativar.
O importador recusa destino preenchido: não repetir a carga nem apagar o schema
para contornar divergências sem revisar e autorizar a estratégia de reconciliação.

- **DEP-003 — MEDIUM — TLS sem autenticação do servidor em desenvolvimento.**
  Componente: conexão PostgreSQL. Evidência: `NODE_ENV=development`,
  `PG_SSL_MODE=require`, sem CA configurada. Risco/cenário: um intermediário
  pode se passar pelo servidor e interceptar a conexão. Remediação: configurar
  cadeia de confiança e `verify-full` antes de produção. Validação: preflight
  com validação de certificado habilitada; o código recusa `require` em produção.
- **DEP-004 — MEDIUM — Conta de migração ainda sem alternativa de runtime.**
  Componente: privilégios PostgreSQL. Evidência: `privilegedConnection=true`.
  Risco/cenário: usar essa conta na API amplia o impacto de comprometimento da
  aplicação. Remediação: criar e configurar conta com privilégios mínimos antes
  da ativação. Validação: conferir grants e testar os fluxos com essa conta,
  incluindo recusa de DDL e acesso a schemas alheios à aplicação.
- **DEP-002 — MEDIUM — Recuperação PostgreSQL ainda não ensaiada.**
  Componente: continuidade operacional. Evidência: backup SQLite validado, mas
  sem exportação/restauração PostgreSQL, retenção confirmada ou cópia externa
  realizada nesta execução. Risco/cenário: falha futura no destino após novas
  escritas sem cópia recuperável. Remediação: definir política e testar restauração
  em destino isolado. Validação: conferir dados, histórico, sequências, permissões
  e funcionamento do banco restaurado.

A consulta de privilégios confirmou ausência de USAGE para PUBLIC/anon/authenticated
no schema. A lista de schemas expostos pela Data API ainda exige revisão no painel;
não foi afirmada ausência de exposição com base apenas no SQL.
[Referência: segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).

A conta Vercel foi informada como criada, mas a hospedagem não foi configurada
nem publicada. Será necessário preparar a aplicação para esse ambiente e verificar
TLS, conta de runtime e recuperação antes da ativação operacional.

**Retorno:** a aplicação continua configurada para SQLite e a origem foi preservada.
O schema importado deve ser conservado para revisão. Se houver futuras escritas
no PostgreSQL, voltar ao SQLite exigirá reconciliação; não basta trocar o motor.

**Estado atual: backup verificado, migrations aplicadas e dados importados/conferidos;
ativação da API no PostgreSQL e publicação na Vercel pendentes.**

As seções abaixo preservam o registro histórico anterior à execução autorizada.

## Atualização em 2026-11-03 — conexão de desenvolvimento validada

O responsável identificou o projeto como CheckPass e configurou a URI privadamente.
Após falha `SELF_SIGNED_CERT_IN_CHAIN`, autorizou usar uma conexão funcional sem
validação do certificado para desenvolvimento. O backend agora aceita `PG_SSL_MODE=require`
somente com `NODE_ENV=development/test`: a conexão permanece criptografada, mas não
autentica o certificado do servidor, permitindo interceptação por um servidor não confiável.
O modo é recusado em produção e quando o ambiente não está explicitamente definido.
O padrão continua `verify-full`; para reverter, configurar a CA confiável e voltar a esse modo.

O `.env` local recebeu apenas a alteração de `PG_SSL_MODE`; `DATABASE_ENGINE=sqlite`
foi preservado. O preflight remoto passou em transação somente leitura: PostgreSQL 17.11,
schema `passcheck` ausente, permissão de criação disponível e conexão privilegiada.
Origem SQLite íntegra, com as mesmas contagens registradas abaixo. Nenhuma migration,
importação, backup real ou ativação do PostgreSQL foi executada. Revisão da conta de
runtime, exposição pela Data API e restauração continuam pendentes antes do corte.

As seções seguintes registram a preparação original e o plano ainda não executado.

Data: 2026-11-02. O responsável informou que **o projeto Supabase ainda precisa ser criado**.
A etapa remota não foi executada: não há projeto identificado, conexão configurada,
migrations remotas, importação ou alteração do motor local. Os registros SQLite permanecem preservados.

## Preparação implementada

| Comando, executado na raiz | Comportamento |
| --- | --- |
| `npm.cmd --prefix backend run db:pg:preflight` | Inspeciona origem e, quando configurado, destino; somente leitura |
| `npm.cmd --prefix backend run db:verify-backup -- "CAMINHO_ABSOLUTO_DO_BACKUP"` | Compara conteúdo e histórico de um backup SQLite independente com a origem |
| `npm.cmd --prefix backend run db:pg:verify-import` | Confere todos os campos das onze tabelas, contagens e proveniência da importação |

Implementação em `src/db/postgres/deployment.js` e `deployment-cli.js`, scripts em
`package.json`, testes em `tests/postgres-deployment.test.js` e casos PostgreSQL reais
acrescentados a `tests/postgres-integration.test.js`. Os comandos não alteram configuração
nem criam tabelas, contas, backups ou dados de negócio. Relatórios não exibem linhas,
hashes de senha, tokens ou strings de conexão.

O diagnóstico do destino usa uma transação `REPEATABLE READ READ ONLY`. Distingue schema
ausente, vazio, incompatível, histórico divergente e destino já preenchido. Mostra privilégios
e uso do schema por PUBLIC/anon/authenticated; não altera grants. Um destino ocupado
produz saída de atenção e código 1: o importador exige destino vazio.
Privilégios elevados da conexão são informados para revisão da conta de runtime, mas
podem ser esperados na conta usada para migração.

`empty_with_current_history` significa somente que tabelas/histórico e contagens passaram
nas verificações do preflight. Execute também `db:pg:check` para conferir triggers e índices.
O preflight não determina a lista de schemas expostos pela Data API: verifique isso no painel.
Consultas SQL não substituem a revisão das configurações do provedor.

O diagnóstico da origem também detecta resoluções históricas cujo administrador está
atualmente inativo ou deixou o papel administrativo; esses casos exigem revisão da estratégia
de carga, pois o importador mantém triggers ativos. A origem atual não contém esses casos.

As comparações de backup e importação leem novamente a origem para detectar mudanças
durante a conferência. Isso não congela escritores: a janela de corte continua necessária.
Após novas operações legítimas no destino, a comparação com a antiga origem poderá divergir;
o comando foi pensado para a conferência imediatamente anterior à ativação.

## Criar e conectar o projeto

1. Abrir o [painel Supabase](https://supabase.com/dashboard) e criar um projeto na organização
   escolhida. Nome sugerido: `passcheck-homologacao`. Conferir o plano, limites e custos
   exibidos antes de confirmar. Não foi selecionado plano pago automaticamente.
2. Escolher a região considerando usuários, backend e residência dos dados. São Paulo
   (`sa-east-1`) consta entre as regiões específicas disponíveis; não foi selecionada
   por automação. [Regiões Supabase](https://supabase.com/docs/guides/platform/regions).
3. Definir e guardar a senha do banco em local privado. Não enviar senha, URI com senha,
   JWT_SECRET, personal access token ou service-role key ao chat.
4. Se desejar acesso assistido ao projeto, instalar a integração Supabase disponibilizada
   na conversa e concluir sua conexão. A busca encontrou a integração disponível, mas
   ela ainda não estava instalada/conectada na verificação desta etapa.
5. No projeto, abrir **Connect** e copiar a string PostgreSQL. Para este backend persistente,
   usar conexão direta quando houver conectividade IPv6 ou **Session pooler** se a rede
   for somente IPv4. Copiar host, usuário e porta do painel; não deduzir o host pela região.
   [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
6. Preencher a URI apenas no `backend/.env` privado em `DATABASE_URL`, sem query string,
   com caracteres reservados da senha codificados para URI. Usar `PG_SSL_MODE=verify-full`;
   se for necessária a CA do provedor, indicar seu arquivo em `PG_SSL_CA_FILE`.
7. **Manter `DATABASE_ENGINE=sqlite`** durante essa preparação. Conservar `DATABASE_PATH`,
   JWT_SECRET e demais valores atuais. Não substituir o `.env` inteiro pelo arquivo de exemplo.

O projeto será usado como PostgreSQL do backend. Não configurar acesso do frontend ao banco,
não trocar autenticação e não executar SQL de exemplos genéricos de frameworks.

Depois da configuração, o diagnóstico de leitura pode ser executado:

```powershell
npm.cmd --prefix backend run db:pg:preflight
```

Sem URL ele ainda inspeciona a origem, informa `connection_not_configured` e sai com código 1.
Conectividade, verificação de certificado e permissões do **Supabase** permanecem sem teste
até que exista um destino configurado.

## Plano do corte — não executado

Antes de solicitar autorização de escrita, registrar projeto/ambiente exatos, resultado
do preflight, schema pretendido, política de backup/restauração e janela sem escritores.
Não enviar credenciais nesse registro.

| Ação | Impacto/risco | Retorno previsto |
| --- | --- | --- |
| Backup SQLite consistente | Cria uma cópia contendo dados e hashes de senha; exige armazenamento privado | Origem não é alterada; conservar o backup verificado |
| Migrations PostgreSQL | Cria schema, funções, tabelas, índices e histórico no destino escolhido | Falha no lote reverte DDL; após sucesso, não apagar schema automaticamente |
| Importação | Copia registros para destino vazio, mantendo IDs e histórico; bloqueia tabelas durante a transação | Falha reverte a carga; origem continua intacta |
| Ativação da API | Novas escritas passam ao PostgreSQL; exige manutenção/coordenar instâncias | Antes de novas escritas, manter origem; depois delas, reconciliar dados antes de voltar |

Sequência prevista, somente após autorização para ações de escrita e manutenção:

1. Suspender os escritores identificados e criar backup com `npm.cmd run backup` enquanto
   o motor ainda é SQLite. Nenhum processo é encerrado automaticamente pelos novos comandos.
2. Conferir a cópia com `db:verify-backup`, preservando uma cópia privada fora da máquina
   conforme a política do responsável.
3. Aplicar `db:pg:migrate` no destino revisado e executar `db:pg:check`/`db:pg:preflight`.
4. Executar `db:pg:import-sqlite`, seguido de `db:pg:verify-import`. **Não executar seed**
   no destino que receberá a origem real.
5. Revisar privilégios da conta de runtime e exposição da Data API; aprovar a ativação.
6. Só então alterar `DATABASE_ENGINE`, reiniciar as instâncias autorizadas e verificar
   login, permissões, leitura, QR, idempotência e indicadores no ambiente de destino.

## Backup PostgreSQL e restauração

A política precisa ser definida antes de uso operacional. A documentação do Supabase
recomenda exportações regulares para projetos Free; backups automáticos e sua retenção
dependem do plano. Não presumir proteção automática sem conferir o projeto.
[Backups Supabase](https://supabase.com/docs/guides/platform/backups).

Além da política do provedor, uma exportação lógica do schema pode ser preparada com
`pg_dump` em formato custom e restaurada em um **banco isolado**, usando `pg_restore` com
`--single-transaction --exit-on-error --no-owner --no-acl`. Host/usuário/banco/TLS devem
ser configurados privadamente; use arquivo de senha protegido em vez de URI na linha de comando.
O dump de um schema não inclui roles globais e a restauração sem ACL exige reaplicar os
grants revisados. [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

`pg_dump` e `pg_restore` não estão disponíveis no PATH deste ambiente. Nenhum dump ou
restore PostgreSQL foi executado nesta etapa. Uma cópia/exportação só será tratada como
restaurável após ensaio de restauração e conferência em destino isolado; não executar
restauração sobre o projeto de origem.

## Evidências e achados

O preflight local consultou a origem real em leitura: integridade ok, cinco migrations,
3 eventos, 6 portões, 22 ingressos, 2 recibos, 2 validações, 1 usuário e 1 instalação.
O destino retornou `connection_not_configured`, coerente com a informação do responsável.

Os testes dedicados da preparação, migrations, transferência e API executaram em
**PostgreSQL 18.6 temporário: 23 passaram, zero falhas e zero ignorados**. Foram reutilizados
os binários já autorizados a partir do cache, sem novo download ou serviço Windows.
Foram exercitados preflight em schema ausente/vazio/preenchido, detecção de USAGE público,
comparação integral após importação e detecção de um usuário adicional no destino.
Testes SQLite verificaram backup divergente mesmo com contagens iguais e rejeição da
própria origem apresentada como se fosse backup. O teste adicional da CLI verifica o
comportamento sem conexão configurada.

A suíte `test:pg:unit`, incluindo esse teste adicional da CLI, terminou com **20 testes
aprovados, zero falhas e zero ignorados**. A instância temporária foi encerrada e seu
diretório isolado, incluindo dados e credenciais de teste, foi removido.

**DEP-001 — INFO — Destino remoto ainda inexistente/configurado.** Componente: implantação
Supabase. Evidência: informação do responsável e ausência de DATABASE_URL. Risco: aplicar
comandos em um destino improvisado ou confundir homologação com produção. Cenário: copiar
uma URI de outro projeto e executar carga sem identificação. Remediação: criar e identificar
o projeto, configurar a conexão privada e revisar preflight antes de autorizar escrita.
Validação: conexão/TLS e metadados do projeto real, seguidos da revisão do schema.

**DEP-002 — MEDIUM — Recuperação PostgreSQL ainda não ensaiada.** Componente: continuidade
operacional. Evidência: sem projeto, política confirmada ou execução de restore. Risco:
indisponibilidade/perda de dados após um incidente no futuro destino. Cenário: ativar o banco
sem backup recuperável e depois remover ou corromper registros. Remediação: definir retenção,
exportação e destino isolado para ensaio. Validação: restaurar e conferir conteúdo, histórico,
sequências, permissões e comportamento antes do corte real.

**Estado: preparação local entregue; criação/conexão do projeto e implantação remota pendentes.**
