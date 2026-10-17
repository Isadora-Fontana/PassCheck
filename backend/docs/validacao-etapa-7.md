# Validação da Etapa 7 — autenticação e controle de acesso

Data: 17/10/2026. Escopo autorizado por Gabriel: backend, sem modificar frontend,
credenciais existentes ou dados permanentes de desenvolvimento. Implementação
e validação concluídas em bancos isolados. Etapa 8 não iniciada.

## Pré-requisitos e referências

Antes de alterar arquivos, `npm.cmd test`: **97 aprovados, 0 falhas**, duração
16208,5625 ms. Inspecionados app/config/server, rotas GET, resumo, sincronização,
serviços, repositórios, migrações, testes, modelo relacional, contrato aprovado,
D01–D07, plano local e código real de login/preparação/scanner/IndexedDB/API.

O login do frontend apenas navega; api.js ainda usa mocks. A preparação baixa
todos os portões do evento, comportamento necessário para PORTÃO INCORRETO.
A fila não registra proprietário autenticado. Nenhum desses arquivos foi alterado.
Os documentos originais backend v0.2 e PEI não estão no workspace; essa ausência
já era registrada nas etapas anteriores. Não se presumiu integração funcionando.

Banco de desenvolvimento aberto somente em readonly: migrações 001–003 aplicadas,
checksums correspondentes aos arquivos, `integrity_check = ok`,
`foreign_key_check = []`. Hashes normalizados das migrações anteriores:

| Versão | SHA-256 |
|---|---|
| 001 | f4a3ac4aa51e2df743f0ff8c61e4851d4304c99893bad4e1428cd59c4a6d1271 |
| 002 | 954ced7e340478b8604bb37227921ab29e91031848c3bf86c749d6173f92efed |
| 003 | 37eea0ba120836a8302a1dbbcee56cd399d7a78991511b88c89e5fbadb1352cf |

## Arquivos criados

- `src/db/migrations/004_identidade_acesso.sql`.
- `src/auth-cli.js`.
- `src/validation/identidade.js`.
- `src/routes/auth.js`.
- `src/middleware/autenticacao.js`.
- `src/repositories/identidade.js`.
- `src/services/identidade.js`, `senhas.js`, `tokens.js`, `provisionamento.js`.
- `tests/helpers/config.js`, `tests/helpers/auth.js`.
- `tests/auth.test.js`, `tests/auth-http.test.js`.
- `docs/contrato-autenticacao.md` e este relatório.

## Arquivos alterados

- `package.json`, `package-lock.json`, `.env.example`, `README.md`.
- `src/app.js`, `src/config.js`.
- `src/middleware/cors.js`, `src/middleware/errors.js`.
- `src/routes/eventos.js`, `src/routes/sincronizacao.js`.
- `src/services/sincronizacao.js`.
- `tests/app.test.js`, `config.test.js`, `leitura.test.js`, `leitura-http.test.js`,
  `migrations.test.js`, `resumo.test.js`, `resumo-http.test.js`, `seed.test.js`,
  `server.test.js`, `sincronizacao.test.js`, `sincronizacao-processos.test.js`.
- `tests/helpers/sync-worker.mjs`.
- `docs/decisoes.md`, `api-leitura.md`, `modelo-relacional.md`,
  `contrato-sincronizacao.md`.

As adaptações dos 97 testes anteriores fornecem segredo aleatório e identidades
de teste, assinam JWTs reais e usam o verificador de produção. Não foi adicionado
modo de pular autenticação. Asserções de negócio foram preservadas; expectativas
de versão passaram a incluir 004. O teste de rollback injeta falhas no repositório
e também passa pela autorização real.

Os arquivos do backend já estavam não rastreados no Git; `git diff` sozinho não
representa esta entrega. Nenhum commit, push ou deploy foi executado.

## Modelo, acesso e contratos

Migração 004 aditiva, sem contas ou segredos: `usuarios` (login único, hash,
papel, ativo, versão de token), `usuarios_eventos`, `usuarios_portoes` e
`instalacoes`. FKs compostas impedem concessão de portão de outro evento ou sem
concessão do evento. Instalação tem proprietário próprio; UPDATE não transfere
identidade. Trigger revoga JWTs ao alterar login/hash/papel/ativo.

ADMINISTRADOR tem acesso global. OPERADOR lê somente eventos concedidos, mas
pode baixar todos os seus ingressos/portões. Sincronização exige concessão de
portão e instalação ativa do usuário, inclusive para administradores. Uma
identidade legada com recibos não é automaticamente adotada pelo primeiro login.

| Endpoint | Política |
|---|---|
| POST /auth/login | Público; JSON usuario/senha; 200 com JWT/identidade; 401 genérico para credenciais incorretas |
| GET /auth/me | Bearer; identidade e concessões atuais |
| POST /auth/logout | Bearer; 204; revoga todos os tokens do usuário |
| POST /auth/instalacoes | Bearer; registro idempotente de instalação própria; 403 para instalação alheia/inativa/legado sem proprietário |
| GET /health | Público |
| GET /eventos | Bearer; lista filtrada para operador |
| GET /eventos/:eventoId/portoes | Bearer e leitura autorizada do evento |
| GET /eventos/:eventoId/portoes/:portaoId/ingressos | Bearer e leitura autorizada do evento; mantém conferência do vínculo |
| GET /eventos/:eventoId/resumo | Bearer e leitura autorizada do evento |
| POST /sincronizacao | Autenticação antes do corpo; autorização por item antes de consultar recibo |

JSONs de sucesso de negócio mantidos. Erros usam `{erro,mensagem}`, sem dados
internos. 401 inclui WWW-Authenticate; 403 não revela recibos. Cache-Control
no-store preservado. CORS permite Authorization nas mesmas origens configuradas.

JWT HS256 via jose 6.2.12; JWT_SECRET obrigatório, 32–64 bytes aleatórios em
base64url. TTL padrão 900 s, configurável entre 60 e 3600. Assinatura, algoritmo,
issuer/audience/typ, claims e versão persistente são verificados. Papel/permissões
vêm do banco. Não há refresh token; renovar exige login.

Scrypt assíncrono com N=131072, r=8, p=1, salt de 16 bytes e derivação de 64 bytes;
timingSafeEqual. Login inexistente executa o mesmo custo. Limite local de dez
tentativas/IP/15 minutos, duas derivações simultâneas e mapa limitado a mil IPs.
Respostas 429 incluem Retry-After. Não há confiança automática em cabeçalhos de
proxy. Senhas/JWTs não são registrados pelo logger.

## Comandos e resultados reais

Executados em `PassCheck/backend`, além das leituras de arquivos com Get-Content,
rg e inspeção de Git/SQLite:

| Comando/operação | Resultado |
|---|---|
| `npm.cmd test` antes das alterações | 97 aprovados / 0 falhas |
| `npm.cmd install jose --save-exact --ignore-scripts --no-audit --no-fund` | Primeira tentativa EACCES de acesso ao registry; repetida com acesso autorizado: 1 dependência local instalada, jose 6.2.12 |
| `npm.cmd test` após adaptação da regressão | 97 aprovados / 0 falhas, 15689,7408 ms |
| `node --test tests/auth.test.js` | 22 aprovados / 0 falhas na primeira bateria |
| `node --test tests/auth.test.js tests/auth-http.test.js` | 25 aprovados / 0 falhas após testes HTTP e limite concorrente |
| `npm.cmd test` com upgrade 004 incluído | **123 aprovados / 0 falhas / 0 ignorados**, 17676,0337 ms |
| `node --test --test-name-pattern='upgrade' tests/auth.test.js` | 1 aprovado / 0 falhas após corrigir acento do nome de portão no fixture; nenhuma mudança de lógica |
| `npm.cmd ls --depth=0` | Dependências locais resolvidas; Express 5.3.0, better-sqlite3 13.0.3, jose 6.2.12, Zod 4.6.7, cors 2.8.6, Supertest 7.3.1 |
| `git diff --check` | Sem saída de erro; limitação: arquivos do backend não rastreados |
| Comparação SHA-256 dos 36 arquivos protegidos | Nenhuma alteração |
| PRAGMAs finais readonly no banco de desenvolvimento | integrity_check ok; foreign_key_check vazio |

Os testes invocam `node src/auth-cli.js bootstrap` e `criar-operador` em processos
filhos com JSON por stdin, senhas aleatórias e SQLite temporário. Confirmaram
criação, recusa de segundo administrador, segredo ausente impedindo startup,
rollback completo de concessão inválida e ausência de senhas nas saídas.
Não se executou migração, seed ou criação de usuário no banco de desenvolvimento.

Os 26 novos testes cobrem credenciais válidas/inválidas, salts, JWT ausente,
inválido/expirado/assinatura/algoritmo/audience/claims incorretos, escopos, leitura
de todos os portões, proprietário da instalação, idempotência, revogação,
negação sem alterações, concorrência de login, CORS, CLI, HTTP, reinício e upgrade.
O upgrade de 001–003 para 004 preserva snapshot de negócio, auditoria e histórico
dos checksums, sem criar usuário. Integridade/FKs verificadas.

## Evidências HTTP e persistência

Na suíte completa, o teste de autenticação iniciou servidores reais em portas
livres; último endereço `http://127.0.0.1:49290`. Foram feitos dois reinícios do
servidor/conexão sobre o mesmo SQLite temporário, mantendo o segredo de teste.

- Login HTTP 200; JWT usado nas chamadas seguintes e omitido do diagnóstico.
- GET /health 200; GET /eventos sem Bearer 401.
- Operador autorizado listou somente evento 1 e baixou ingressos do portão 2,
  embora sua concessão de sincronização fosse somente para portão 1.
- POST para portão sem concessão retornou HTTP 403:

```json
{"erro":"ACESSO_NEGADO","mensagem":"Acesso não permitido."}
```

POST autorizado retornou HTTP 200:

```json
{"resultados":[{"idLocal":"17","status":"CONFIRMADA","validacaoId":3}]}
```

Após reinício, reenvio HTTP 200:

```json
{"resultados":[{"idLocal":"17","status":"JA_PROCESSADA","resultadoOriginal":"CONFIRMADA","validacaoId":3}]}
```

Logout retornou 204. Após outro reinício, token anterior recebeu 401; novo login
do mesmo operador recuperou exatamente a resposta idempotente acima. Snapshot
de negócio permaneceu igual, foreign_key_check vazio e integrity_check ok.

A regressão também executou reinícios em processos independentes: leituras nos
PIDs 8948/20232; resumo nos PIDs 14116/12052. Os 22 ingressos dos mocks foram
conferidos. A concorrência autenticada nos processos 22684/12016 produziu uma
CONFIRMADA e um CONFLITO. Processos 18552/16936 produziram CONFIRMADA/JA_PROCESSADA
para a mesma chave. Lock externo causou HTTP 503 após 5434 ms e reenvio seguro.
Rollback de recibo/validação/trigger/commit e auditoria persistente continuaram
passando. Revogação entre itens preserva o primeiro commit e impede consulta de
recibo/gravação no segundo item.

## Preservação e ativação

Comparados 36 arquivos por SHA-256: 29 do frontend, migrações 001–003 e README
das migrações, banco e auxiliares WAL/SHM. Nenhuma alteração observada.
O banco permanente continua com 3 eventos, 6 portões, 22 ingressos, 2 recibos,
2 confirmações sintéticas e 0 auditorias. Nenhuma credencial existente foi alterada.

Para ativação local, o responsável precisa configurar JWT_SECRET estável, fazer
backup consistente, aplicar `npm.cmd run db:migrate` e provisionar a primeira
conta com `npm.cmd run auth:bootstrap`. Procedimento de entrada de senha sem eco,
UTF-8 e stdin documentado no [README](../README.md#autenticação-e-ativação-local).
Sem segredo o processo falha; sem migração 004 as rotas de identidade não estão
prontas. Health verifica conexão, não substitui conferência das migrações.

## Integração com Isadora, offline e pendências da Etapa 8

1. Conectar login real, Authorization e /auth/me; registrar instalação antes de
   preparar. Os mocks e o login visual atuais não realizam esse fluxo.
2. Selecionar portão entre concessões de sincronização, mantendo download de TODOS
   os ingressos do evento autorizado. O scanner continua inteiramente local.
3. Persistir identidade proprietária na preparação/fila e bloquear troca de
   usuário/evento/portão/instalação com pendências, em transação IndexedDB.
4. Token expirado durante queda de rede não apaga operação/fila. Ao reconectar,
   novo login do mesmo usuário; 401/403 preservam pendências. Confirmações são
   reconciliadas pela mesma chave original. Não reenviar como outro usuário.
5. Revogação online é imediata na próxima verificação; dispositivos offline só a
   conhecem ao reconectar. Não há garantia de revogação remota de cache offline.
6. Instalações legadas com recibos e pendências sem proprietário exigem decisão
   explícita de atribuição/recuperação; não há adoção automática ou resolução aqui.
7. Revisar limites por IP conforme rede do evento: NAT compartilhado pode limitar
   operadores legítimos. Limitação é local ao processo, não distribuída; TLS,
   proxy, operação e eventual política de revogação administrativa exigem escopo
   próprio. Não foram alterados infraestrutura ou proxy.
8. Testar integração offline em navegador/dispositivo real após autorização.
   Esta entrega não afirma que a PWA já aplica a política documentada.

Não implementados CRUD administrativo HTTP, CSV ou resolução de conflitos.
As ferramentas locais só criam a primeira conta/admin e operadores com concessões.
Não há redefinição de senha ou gestão administrativa completa. A Etapa 8 depende
de autorização expressa de Gabriel.

Referências técnicas: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
e [jose](https://github.com/panva/jose). Decisão vigente: D08; contratos mínimos:
[contrato-autenticacao.md](contrato-autenticacao.md).
