# Decisões da fundação — 16/10/2026

## D01 — Stack aprovada

Responsável: Gabriel. Estado: aprovada expressamente na solicitação de retomada
da Etapa 1.

- Node.js, Express, SQLite e JavaScript com ES Modules.
- Zod para validação; Node.js Test Runner e Supertest para testes.
- PEI IV como referência funcional e conceitual, sem impor NestJS/PostgreSQL.
- Documentação atualizada, plano de ação e contratos observados no frontend como
  referências principais; requisitos funcionais não são automaticamente excluídos.

Referência Git observada: `1838a5a64d899b99a0d975cbf3887e13eac5dd10`.
Os dois arquivos do plano em `docs/` já existiam como não rastreados e foram
preservados. Os dois documentos originais ausentes estão identificados no README.

## D02 — Escolhas de implementação dentro da stack aprovada

- Node 24.x, mínimo 24.14.0, correspondente ao ambiente validado.
- Express 5; `better-sqlite3` como driver síncrono SQLite. Lockfile versionável
  fixa dependências. As consultas devem permanecer curtas; não há operações de
  negócio nesta entrega.
- Leitura nativa do `.env` pelo Node, sem dependência adicional.
- Configuração validada antes de qualquer conexão; bind local por padrão.
- `createApp` recebe configuração e banco; `startServer` gerencia os recursos.
- CORS usa origens exatas por variável de ambiente; produção exige lista explícita.
- Erros JSON centralizados, sem detalhes internos; limite de corpo de 100 KB.
- SQLite habilita foreign keys, WAL em arquivo e timeout de 5 segundos.
- `GET /health` retorna `{status: 'ok', database: 'ok'}` após consultar o banco.
- Diretório de migrações reservado, sem modelos de negócio ou executor prematuro.

Fontes técnicas consultadas:
[Express](https://expressjs.com/en/5x/api/),
[CORS](https://expressjs.com/en/resources/middleware/cors/),
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md),
[Zod](https://zod.dev/basics).

## D03 — Limite da entrega

Não implementar eventos, portões, ingressos, resumo, sincronização, autenticação,
seeds ou administração. Não alterar frontend, credenciais ou infraestrutura.
Não executar commit, push ou deploy. A aprovação da stack não resolve por si só
os contratos de sincronização nem as divergências funcionais do PEI IV.

Os contratos existentes permanecem intactos: três consultas com arrays diretos,
IDs numéricos e `utilizado` booleano. Não foi introduzido prefixo `/api`.

Próximo passo registrado em 16/10: obter autorização específica para a Etapa 2.
Essa autorização foi recebida em 17/10, conforme D04 abaixo. D01–D03 permanecem
como registro do escopo original, sem reescrever a decisão histórica.

## D04 — Persistência central autorizada em 17/10/2026

Gabriel autorizou exclusivamente a Etapa 2: migrações para cinco entidades,
restrições de integridade, seed compatível com os mocks, banco de desenvolvimento
e testes. A proibição de seeds na D03 descrevia a Etapa 1 e foi superada por essa
autorização específica. Continuam proibidos endpoints de negócio, sincronização,
autenticação, mudanças no frontend, commit, push e deploy nesta entrega.

O pré-requisito foi executado antes de implementar: os 16 testes da fundação
passaram. A documentação backend atualizada e o PEI original continuam ausentes;
o plano local, os mocks reais e os requisitos expressos desta etapa fundamentaram
o modelo. Isso não equivale à aprovação dos contratos HTTP propostos no plano.

Escolhas de implementação dentro deste escopo:

- Duas migrações SQL versionadas; checksum SHA-256 e aplicação atômica do lote
  pendente com `BEGIN IMMEDIATE`. Nenhuma migração automática no startup.
- Tabelas STRICT, código globalmente único, chave composta evento/portão,
  identidade única `(dispositivo, id_local)` e uma confirmação por ingresso/recibo.
- `validacoes` é a fonte de confirmação; trigger mantém `ingressos.utilizado`.
  A ordem de escrita será recibo → confirmação → atualização automática do uso,
  todos na mesma transação. O passo de atualizar primeiro o booleano, proposto
  no plano, é substituído por essa ordem para preservar a invariância no banco.
- Recibos e confirmações imutáveis, sem apagamento em cascata. Correções e
  resolução administrativa futura devem preservar o fato original.
- `CONFIRMADA`, `CONFLITO` e `REJEITADA` são resultados persistidos; `JA_PROCESSADA`
  não é um novo fato. A lógica de decidir resultados/reenvios não foi implementada.
- Seed executado apenas em development, em transação única. Nunca sobrescreve
  cadastros incompatíveis, não desfaz usos e não duplica confirmações.
- IDs/códigos de eventos, portões e ingressos são exatamente os dos mocks. IDs
  de recibos/confirmações são PKs atribuídas pelo SQLite, pois não existem nos mocks.
  Identidade sintética e ausência de horário de leitura estão documentadas no modelo.

Detalhes e pendências: [modelo-relacional.md](modelo-relacional.md).
Evidências: [validacao-etapa-2.md](validacao-etapa-2.md).

## D05 — APIs de leitura autorizadas em 17/10/2026

Gabriel autorizou exclusivamente os três GETs existentes no contrato do frontend,
sem alterações no modelo relacional. A D04 permanece como registro histórico da
Etapa 2; sua limitação de endpoints foi superada somente para estas leituras.

- `/eventos`, `/eventos/:eventoId/portoes` e
  `/eventos/:eventoId/portoes/:portaoId/ingressos`, sem prefixo `/api`.
- As barras duplicadas no título do pedido foram interpretadas como os locais
  dos parâmetros já documentados em `frontend/src/api.js`, sem criar novas rotas.
- Arrays diretos, IDs numéricos, datas sem horário, campos camelCase e booleanos
  conforme os mocks; resultados ordenados por ID para saída determinística.
- Zod valida parâmetros antes das consultas. IDs usam dígitos decimais, precisam
  ser positivos e caber em um inteiro seguro JavaScript. Zeros à esquerda são
  normalizados; query strings não modificam o escopo do caminho.
- Rotas concentram o pequeno controller HTTP; serviços tratam existência e vínculo;
  repositórios executam SQL parametrizado. Sem camada intermediária artificial.
- Recurso inexistente ou vínculo inválido gera 404; coleção vazia válida gera
  200 com `[]`; ID inválido gera 400. Erros usam o middleware central existente.
- Nenhuma migração, seed ou regra de integridade foi alterada. Banco de
  desenvolvimento foi inspecionado em readonly; testes usam bancos isolados.
- Não foram implementados sincronização, dashboard, autenticação ou administração.

Pré-requisito: 42 testes aprovados antes de editar arquivos, migrações 001/002
conferidas por checksum. Resultado final: 59 testes aprovados, incluindo HTTP real
com duas inicializações de processos. Contrato: [api-leitura.md](api-leitura.md).
Evidências: [validacao-etapa-3.md](validacao-etapa-3.md).

## D06 — Sincronização e auditoria autorizadas na Etapa 5

Gabriel aprovou expressamente a versão proposta 1 do contrato da Etapa 4 e
autorizou `POST /sincronizacao` e a migração `003_auditoria_divergencias.sql`.
A pendência de destino durável foi resolvida com tabela SQLite própria, sem
alterar recibos/validações originais nem as migrações 001/002.

- Schema Zod estrito; 1–100 itens, 102400 bytes, tipos/IDs seguros, datas UTC
  normalizadas e campos/IDs locais repetidos recusados antes de gravar.
- Chave global `(dispositivo, idLocal)`; conteúdo canônico com evento, portão,
  ingresso, código literal e horário normalizado. Reenvio recupera resultado
  original; divergência grava hashes, correlação UUID do servidor, FK e horário.
- Uma transação IMMEDIATE por item. Recibo → validação → trigger de utilização.
  Erros técnicos interrompem o lote preservando commits anteriores. Sem retry
  ilimitado; SQLITE_BUSY recebe 503 e Retry-After: 1.
- Auditoria imutável, sem QR/payload duplicado; cada tentativa divergente gera
  evento próprio. Falha de auditoria é erro técnico, não confirmação.
- CORS passa a anunciar GET/POST nas mesmas origens configuradas. Tipo de mídia
  JSON/UTF-8 exigido no POST; erros continuam centralizados e sanitizados.
- Migração 003 aplicada localmente após backup consistente. As cinco tabelas
  anteriores e o histórico 001/002 foram comparados integralmente com o backup.
- Preservados frontend, IndexedDB, mocks e service worker. Não há autenticação,
  dashboard, administração, resolução de conflitos, commit, push ou deploy.

Pré-requisitos: 59 testes aprovados; checksums 001/002 e integridade do banco
conferidos antes de editar. Evidências finais, testes T01–T24 e limitações de
integração: [validacao-etapa-5.md](validacao-etapa-5.md).

A Etapa 6 exige nova autorização; D06 não autoriza alterações no frontend.

## D07 — Resumo e consistência dos indicadores autorizados na Etapa 6

Gabriel autorizou `GET /eventos/:eventoId/resumo`, exclusivamente com dados do
banco central. A autorização não abrange frontend, autenticação, administração,
CSV ou resolução de conflitos. Nenhuma migração é necessária.

- Reutilizar rota/controller, serviço e repositório de eventos, sem camada nova.
- Zod valida ID positivo seguro; manter zeros à esquerda conforme D05 e recusar
  whitespace, incluindo quebra de linha final. Evento inexistente responde 404.
- Uma consulta SQL com agregações de ingressos e validações e LEFT JOIN de
  portões produz todos os números no mesmo estado de leitura, sem listar ingressos
  em memória. Usar índices existentes e quatro parâmetros vinculados ao evento.
- `entradas` conta validações vinculadas ao ingresso/evento, sem usar booleano
  `utilizado`, quantidade de recibos ou horário do celular como fonte de contagem.
- Conferir inteiros seguros não negativos, entradas <= total e soma dos portões.
  Inconsistência gera log sanitizado e HTTP 500 INDICADORES_INCONSISTENTES, sem
  limitar números artificialmente ou modificar registros.
- Preservar contrato JSON exato. As duas confirmações iniciais do evento 1 são
  sintéticas do seed, com data_hora_cliente NULL; não comprovam presença física.
  Não excluir essas linhas da contagem nem acrescentar campos ao contrato.
- Banco de desenvolvimento apenas lido; todas as escritas e simulações de
  corrupção ocorreram em bancos isolados de teste. Migrações 001–003 preservadas.

Pré-requisitos: 81 testes aprovados e integridade/checksums conferidos antes de
editar. Validação final: 97 testes aprovados, incluindo resumo antes/depois de
sincronização, conexão independente, rollback e reinício em outro processo.
Evidências, SQL e limitações: [validacao-etapa-6.md](validacao-etapa-6.md).

A Etapa 7 depende de nova autorização e definição de escopo por Gabriel.

## D08 — Autenticação e autorização autorizadas na Etapa 7

Gabriel autorizou autenticação real, papéis ADMINISTRADOR/OPERADOR, concessões
por evento/portão e identidade de instalação distinta do usuário. Os contratos
mínimos foram documentados antes do código em [contrato-autenticacao.md](contrato-autenticacao.md).

- JWT HS256 via jose, segredo obrigatório externo, expiração padrão de 15 minutos.
  Sem refresh token: novo login renova o acesso. Scrypt com salt individual,
  parâmetros OWASP e limite local de tentativas/custo de login.
- Administrador tem escopo global. Operador lê todos os ingressos de seus eventos,
  mas sincroniza somente portões concedidos. Autorização antecede recibos e é
  reavaliada dentro de cada transação, inclusive em reenvios idempotentes.
- Instalação persistente pertence a um único usuário; administradores também
  precisam ser proprietários para enviar. Legados com recibos não são adotados
  automaticamente. Identificador não é credencial nem atestado físico do aparelho.
- Migração 004 aditiva: usuarios, usuarios_eventos, usuarios_portoes e instalacoes.
  Versão de token no banco permite revogação; mudanças de senha/papel/ativo/login
  revogam tokens por trigger. Logout revoga todos os tokens do usuário.
- Provisionamento exclusivamente por CLI local e entrada padrão; sem conta fixa,
  substituição de credenciais ou CRUD administrativo HTTP.
- Autenticação online antes de preparar/sincronizar. Scanner permanece local;
  expiração offline preserva operação e fila. Revogação só é observável ao conectar.
  Integração da PWA e bloqueio transacional de troca de identidade ficam documentados.
- Banco de desenvolvimento e credenciais existentes permanecem intactos, conforme
  restrição expressa da etapa. Migração 004/provisionamento executados somente em
  bancos isolados; ativação local depende de configurar chave e aplicar a migração.

Sucessos de negócio preservam seus JSONs. Novos 401/403 são a mudança necessária
de acesso solicitada. Health permanece público. CORS admite Authorization apenas
nas origens configuradas. Frontend, mocks, IndexedDB e Service Worker preservados.

Evidências e continuidade: [validacao-etapa-7.md](validacao-etapa-7.md).
Nenhuma autorização para iniciar a Etapa 8 está implícita nesta entrega.
