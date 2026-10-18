# PassCheck — backend

Fundação, persistência central, APIs de leitura, sincronização, resumo e autenticação (Etapas 1–7). Stack aprovada por Gabriel: Node.js, Express, SQLite,
JavaScript com ES Modules, Zod, Node.js Test Runner e Supertest.
O PEI IV é referência funcional/conceitual; a escolha técnica está registrada em
[docs/decisoes.md](docs/decisoes.md).

## Instalação

Requer Node.js **24.14 ou superior da linha 24.x**, com npm. Ambiente validado:
Node 24.14.0, npm 11.9.0 e Windows. As versões exatas estão no `package-lock.json`.

Na raiz do repositório:

```sh
cd backend
npm ci
# Configure JWT_SECRET antes dos comandos seguintes (veja Autenticação).
npm run db:migrate
npm run db:seed # opcional, somente banco de desenvolvimento com dados fictícios
npm start
```

No PowerShell com bloqueio de execução do `npm.ps1`, use `npm.cmd` no lugar de
`npm`. Não é necessário alterar a política de execução.

O driver `better-sqlite3` utiliza um módulo nativo. A instalação obtém o binário
compatível quando disponível; uma plataforma sem binário pronto pode precisar
das ferramentas de compilação do driver. Nenhuma dependência global é necessária
no ambiente Windows validado.

## Configuração

O arquivo `.env` é opcional; `JWT_SECRET` é obrigatório, via ambiente ou `.env`. Para personalizar, crie `backend/.env`
usando `.env.example` como referência, preservando qualquer arquivo existente.
O servidor lê esse arquivo na inicialização; variáveis já definidas no processo
têm precedência. Alterações no `.env` exigem reiniciar o comando de desenvolvimento.

| Variável | Padrão local | Validação |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` ou `production` |
| `HOST` | `127.0.0.1` | Endereço IPv4 ou IPv6; somente loopback por padrão |
| `PORT` | `3000` | Inteiro de 1 a 65535 |
| `DATABASE_PATH` | `./data/passcheck.sqlite` | Caminho não vazio; relativo a `backend/`, ou `:memory:` |
| `JWT_SECRET` | Sem padrão | Base64url canônico de 32–64 bytes aleatórios |
| `JWT_TTL_SECONDS` | `900` | Inteiro de 60 a 3600 segundos |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Origens HTTP(S) exatas separadas por vírgula |

`CORS_ORIGINS` não aceita curingas, caminhos, credenciais na URL, barra final ou
itens vazios. Em `production`, é obrigatório defini-la explicitamente. Origem
não autorizada recebe 403; cliente sem `Origin` continua sujeito à autenticação/autorização.
CORS controla acesso entre origens no navegador e **não substitui autenticação**.
O preflight permite Content-Type/Authorization e anuncia GET e POST para as mesmas origens permitidas, sem cookies de sessão.

Configuração inválida encerra o processo com código 1 antes de abrir banco/porta.
A mensagem identifica os nomes das variáveis inválidas, sem imprimir seus valores.

## Comandos

```sh
npm run dev  # Node em modo watch; reinicia quando o código importado muda
npm start    # Inicialização normal
npm test     # Node.js Test Runner + Supertest
npm run db:migrate # aplica somente versões pendentes, em transação
npm run db:seed    # carga de desenvolvimento compatível com os mocks
```

A API informa `PassCheck API em http://127.0.0.1:3000` somente depois de verificar
o banco e abrir a porta. `Ctrl+C` encerra o processo; os handlers de SIGINT/SIGTERM
fecham o servidor e a conexão SQLite. Porta ocupada ou falha ao abrir o banco
interrompem a inicialização com código 1.

Verificação manual no PowerShell:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3000/health
```

Ou com curl:

```sh
curl -i http://127.0.0.1:3000/health
```

Resposta esperada, após uma consulta real `SELECT 1` ao SQLite:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store

{"status":"ok","database":"ok"}
```

O health check verifica a conexão, sem afirmar que tabelas de negócio existem,
que há espaço para gravação ou que o produto está pronto. Falha na consulta
retorna 500 genérico. Rotas desconhecidas retornam 404.

## Autenticação e ativação local

Contrato completo e política offline: [contrato-autenticacao.md](docs/contrato-autenticacao.md).
Relatório executado: [validacao-etapa-7.md](docs/validacao-etapa-7.md).

A Etapa 7 preservou o banco de desenvolvimento em 001–003. Para ativá-la nesse
banco, o responsável deve guardar backup consistente, configurar uma chave
aleatória estável e executar a migração 004 e o provisionamento. Nada disso é
automático no startup. Remover código não reverte migrações; uma restauração
exige preservar primeiro os dados posteriores, que seriam perdidos no backup.

Para gerar uma chave na sessão PowerShell sem imprimi-la:

```powershell
$env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
npm.cmd run db:migrate
```

Guarde a chave de forma protegida fora do Git e reutilize-a nas próximas sessões.
Gerar outra chave invalida todos os JWTs existentes. Não substitua segredo já
configurado sem planejar a renovação do acesso. Senhas/JWTs não devem ir para
argumentos de linha de comando, histórico, logs ou arquivos versionados. Use
HTTPS fora de localhost; o servidor local permanece HTTP, sem alterar infraestrutura.

Primeiro administrador: o comando abaixo pede senha sem eco e envia JSON por
stdin. Execute em terminal local confiável, sem transcrição de conteúdo sensível.
O comando recusa se já existir administrador, inclusive inativo; nunca redefine
contas. Nome de usuário 3–64 caracteres ASCII; senha de 12–128 caracteres.

```powershell
$usuarioInicial = Read-Host 'Login do primeiro administrador'
$senhaSegura = Read-Host 'Senha' -AsSecureString
$ponteiroSenha = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSegura)
$codificacaoAnterior = $OutputEncoding
$OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  $senhaInicial = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroSenha)
  @{ usuario = $usuarioInicial; senha = $senhaInicial } |
    ConvertTo-Json -Compress | npm.cmd run auth:bootstrap
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroSenha)
  $OutputEncoding = $codificacaoAnterior
  $senhaInicial = $null
  $senhaSegura.Dispose()
}
```

Para criar operador, use o mesmo procedimento de entrada segura com
`npm.cmd run auth:criar-operador` e objeto:
`{ usuario, senha, eventos: [{ eventoId: 1, portoes: [1] }] }`.
Os IDs devem existir e corresponder; falha reverte a conta e todas as concessões.
Essa ferramenta só insere usuários/concessões, sem redefinição ou CRUD HTTP.

| Endpoint | Acesso e resultado |
|---|---|
| POST /auth/login | Público; JSON estrito usuario/senha; JWT e identidade |
| GET /auth/me | Bearer; identidade e concessões atuais |
| POST /auth/logout | Bearer; 204, revoga todos os JWTs do usuário |
| POST /auth/instalacoes | Bearer; registra dispositivo próprio antes da preparação |
| GET /health | Público; conexão SQLite |
| GET /eventos e subordinados | Bearer; somente eventos concedidos ao operador |
| POST /sincronizacao | Bearer; evento/portão concedidos e instalação própria ativa |

Administradores têm escopo global, mas também sincronizam somente por instalação
própria. Operadores podem ler todos os portões/ingressos do evento autorizado,
mesmo sem permissão de sincronizar todos os portões. Sucessos de negócio mantêm
os JSONs anteriores; token ausente/inválido/expirado/revogado gera 401 e falta de
permissão, 403, no formato {erro,mensagem}. Login incorreto não distingue conta
inexistente/inativa. Limite local de login: 10 tentativas/IP/15 minutos e duas
verificações scrypt simultâneas; 429 inclui Retry-After.

Nos exemplos GET seguintes, `$cabecalhos` representa o cabeçalho
`Authorization: Bearer <accessToken obtido no login>`. Não imprimir o token.
Expiração padrão é 15 minutos; renovar por novo login. Scanner previamente
preparado continua local durante queda de rede/expiração; 401/403 nunca autorizam
apagar fila. A PWA ainda precisa implementar identidade da operação, renovação
e bloqueio de troca de usuário/instalação com pendências. Nenhum frontend foi alterado.

## APIs de leitura

As três consultas usam SQLite e retornam arrays JSON diretos, sem envelope ou
prefixo `/api`. IDs são números, datas são `YYYY-MM-DD` e `utilizado` é booleano.

| Endpoint | Resultado |
|---|---|
| `GET /eventos` | Eventos em ordem de ID; `[]` quando não houver eventos |
| `GET /eventos/:eventoId/portoes` | Portões do evento; 404 se evento não existir; `[]` se não houver portões |
| `GET /eventos/:eventoId/portoes/:portaoId/ingressos` | Ingressos do par informado, utilizados ou não; 404 se evento/portão não existir ou vínculo for incorreto |

IDs inválidos recebem 400. Portão existente sem ingressos recebe `[]`. CORS e
`Cache-Control: no-store` continuam aplicados. Bearer JWT é obrigatório; operadores
recebem 403 para eventos sem concessão, antes de consultar sua existência.

```powershell
Invoke-RestMethod -Headers $cabecalhos http://127.0.0.1:3000/eventos
Invoke-RestMethod -Headers $cabecalhos http://127.0.0.1:3000/eventos/1/portoes
Invoke-RestMethod -Headers $cabecalhos http://127.0.0.1:3000/eventos/1/portoes/1/ingressos
```

Contrato completo, erros e exemplos: [API de leitura](docs/api-leitura.md).
Aplicar as migrações antes de consultar as tabelas. A existência de `/health`
sozinha não verifica o esquema; a inicialização continua sem migração automática.

## Resumo do evento

`GET /eventos/:eventoId/resumo` retorna um objeto com `evento`, `totalIngressos`,
`entradas`, `restantes` e `portoes: [{id, nome, entradas}]`. IDs usam a mesma
validação Zod dos GETs; inválidos recebem 400 e eventos inexistentes, 404.
Portões sem entradas permanecem na resposta; evento vazio tem totais zero.

Uma única consulta SQL parametrizada agrega ingressos e confirmações de
`validacoes`, mantendo os indicadores no mesmo estado de leitura. Nenhum ingresso
é carregado individualmente para contagem no JavaScript. Reenvios, conflitos,
rejeições, horários do celular e pendências locais não acrescentam entradas.

No seed, o evento 1 tem 12 ingressos, duas confirmações e dez restantes, com
entradas por portão `[1, 0, 1]`. As confirmações dos ingressos 4/12 são sintéticas:
o indicador representa registros centrais, não prova entradas físicas. Sua origem
e horário de leitura desconhecido permanecem no banco, sem mudar o formato JSON.

Se as contagens forem inválidas ou não fecharem, a API registra o problema e
retorna 500 `INDICADORES_INCONSISTENTES`, sem ajustar números ou alterar dados.
`Cache-Control: no-store` e o tratamento centralizado de erros são preservados.

```powershell
Invoke-RestMethod -Headers $cabecalhos http://127.0.0.1:3000/eventos/1/resumo
```

SQL, exemplos reais, testes de consistência e reinicialização:
[relatório da Etapa 6](docs/validacao-etapa-6.md).

## Sincronização

`POST /sincronizacao` recebe JSON estrito em UTF-8, com 1–100 validações e corpo de
até 102400 bytes. O contrato aprovado está em
[contrato-sincronizacao.md](docs/contrato-sincronizacao.md).

```json
{
  "eventoId": 1,
  "portaoId": 1,
  "dispositivo": "971b6382-28ad-4f06-9d71-97ef1ada8df0",
  "validacoes": [
    {"idLocal":"17","ingressoId":1,"codigo":"PC-A7X9K2","dataHora":"2026-11-20T22:03:27Z"}
  ]
}
```

HTTP 200 devolve `resultados` na ordem enviada, com CONFIRMADA, JA_PROCESSADA,
CONFLITO ou REJEITADA. Reenvios preservam `resultadoOriginal`, `validacaoId` ou
`motivo`, conforme o resultado original. Só confirmação direta ou recuperada
autoriza o cliente a marcar a pendência como sincronizada.

Cada item usa uma transação IMMEDIATE: recibo e validação são gravados juntos,
e o trigger mantém `utilizado`. Falha técnica interrompe o lote e reverte somente
o item em andamento; commits anteriores permanecem. Reenviar as mesmas chaves é
seguro. Banco ocupado retorna 503 com `Retry-After: 1`; erros estruturais 400,
limites 413, tipo de mídia 415 e falhas internas 500, sem conteúdo sensível.

A migração 003 acrescenta auditoria durável de IDEMPOTENCIA_DIVERGENTE, com hashes
SHA-256, correlação gerada pelo servidor e referência ao recibo. Não duplica QR ou
payload. Cada tentativa divergente deixa um registro, inclusive reenvios dessa
tentativa; o recibo e a confirmação originais permanecem imutáveis. A auditoria
participa da transação; uma falha nela não produz reconhecimento de sucesso.

Aplicar `npm.cmd run db:migrate` antes de usar o POST. JWT válido, concessão de
evento/portão e instalação própria registrada são obrigatórios. Sem integração
do frontend nesta entrega. Exemplos HTTP realmente executados,
concorrência, rollback e cobertura T01–T24 estão no
[relatório da Etapa 5](docs/validacao-etapa-5.md).

## Organização

```text
backend/
  src/
    app.js                 composição Express, sem abrir porta
    server.js              inicialização e encerramento
    config.js              leitura de ambiente e validação Zod
    db/
      connection.js        abertura do SQLite
      migrate.js           executor e conferência do histórico
      cli.js               comandos de migração e seed
      errors.js            erros operacionais sem dados sensíveis
      migrations/          SQL versionado e imutável
      seeds/               mocks e carga de desenvolvimento
    routes/health.js       verificação da conexão
    routes/eventos.js      listagens, resumo e validação dos parâmetros com Zod
    routes/sincronizacao.js POST e schema estrito do lote
    middleware/            CORS, 404 e erros centralizados
    services/eventos.js    existência do evento e vínculo do portão
    services/sincronizacao.js idempotência, regras e transação por item
    repositories/eventos.js consultas SELECT parametrizadas e mapeamento de campos
    repositories/sincronizacao.js persistência e auditoria parametrizadas
  tests/                   configuração, HTTP, SQLite, migrações, seed e integridade
  docs/                    decisões e evidências da etapa
  .env.example
  .gitignore
  package.json
  package-lock.json
```

Os `.gitkeep` preexistentes foram preservados. As rotas fazem o papel de
controllers HTTP simples; o serviço verifica existência/vínculos e o repositório
executa consultas parametrizadas. Não há um arquivo de controller intermediário
que apenas repasse chamadas. O health check mantém sua implementação original.

## SQLite e migrações

O diretório do banco é criado se necessário. A conexão habilita chaves estrangeiras,
triggers recursivos, WAL para banco em arquivo e espera de até 5 segundos por locks. O banco em memória
usado nos testes não mantém WAL. Banco e arquivos auxiliares ficam ignorados pelo
Git, assim como `node_modules`, cache npm, `.env` e backups.

Há quatro migrações: modelo central, integridade das confirmações, auditoria de divergências e identidade/acesso. Elas criam
`eventos`, `portoes`, `ingressos`, `recebimentos`, `validacoes`, `auditoria_divergencias` e a tabela técnica
`schema_migrations`. A 004 acrescenta `usuarios`, `usuarios_eventos`,
`usuarios_portoes` e `instalacoes`, sem contas automáticas. O executor registra checksum e horário; arquivos já aplicados
não devem ser editados. Todas as migrações pendentes de uma execução são atômicas.
Um erro reverte o lote, preservando versões já confirmadas. A API não migra ao
iniciar. Não há exclusão, reset nem recriação automática de dados existentes.

O seed só aceita `NODE_ENV=development` e exige migrações completas. Em banco
vazio, insere **3 eventos, 6 portões, 22 ingressos, 2 recibos e 2 confirmações**,
copiados dos mocks de `1838a5a`. Apenas ingressos 4 e 12 começam utilizados.
O seed não importa o frontend durante a execução; testes comparam sua cópia com
os mocks originais. A execução dos testes requer o checkout completo do projeto.

Repetir o seed não altera registros nem horários. Cadastros incompatíveis causam
rollback da carga inteira; usos adicionais são preservados. Nunca é executado
`INSERT OR REPLACE` nem reset de `utilizado`. Um ingresso preexistente disponível
que deveria estar usado segundo o mock também causa erro, sem alteração silenciosa.
Use sempre um banco de desenvolvimento separado: `NODE_ENV` é uma configuração,
não comprovação de que um arquivo não contém dados reais.

Recibos e confirmações são históricos imutáveis. Inserir uma confirmação marca o
ingresso como utilizado por trigger; alterar esse booleano diretamente para um
estado sem confirmação é rejeitado. Como não há horário de leitura nos mocks,
as confirmações sintéticas usam `data_hora_cliente = NULL`. O horário do servidor
é o da carga; não representa uma entrada física. O dispositivo sintético é
`seed:frontend:1838a5a` e o ID local deriva do ID original do ingresso.

Detalhes: [modelo relacional](docs/modelo-relacional.md) e
[migrações](src/db/migrations/README.md). Os comandos de banco exigem arquivo
persistente; `:memory:` permanece disponível para testes programáticos.

## Testes e erros

Os testes usam SQLite em memória e um banco temporário descartável para verificar
persistência. Nunca usam `data/passcheck.sqlite`. Os testes de servidor escolhem
uma porta livre; Supertest exercita a aplicação sem depender de servidor externo.

Cobertura funcional: configuração, health, rotas ausentes, CORS/preflight, JSON
inválido (400), corpo acima de 100 KB (413), erro interno (500), chaves estrangeiras,
persistência, abertura/fechamento HTTP, porta ocupada e processo com configuração
inválida. A Etapa 2 também cobre integridade relacional, unicidades, migrações,
checksums, rollback, repetição segura de seed e persistência do modelo completo.
Na Etapa 3 foram acrescentados contratos de leitura, filtros, erros, conversão de
booleanos, conferência integral dos 22 ingressos e HTTP real antes/depois de uma
reinicialização do processo. Todos usam bancos isolados. Resultados executados:
[Etapa 1](docs/validacao-etapa-1.md), [Etapa 2](docs/validacao-etapa-2.md) e
[Etapa 3](docs/validacao-etapa-3.md), [Etapa 5](docs/validacao-etapa-5.md) e
[Etapa 6](docs/validacao-etapa-6.md).
Os testes da sincronização incluem processos independentes disputando o mesmo
arquivo, timeout de lock, rollback em três pontos, resposta perdida, repetição
de resultados e persistência de auditoria após reinicialização.

Formato de erro: `{"erro":"CODIGO","mensagem":"Descrição"}`. Respostas não incluem
stack trace, SQL, caminhos ou valores de ambiente. Erros internos geram mensagem
genérica no console; recusas estruturais também usam log sanitizado. Divergências
de idempotência possuem auditoria no SQLite; monitoramento operacional fica para
etapa própria.

## Limites e continuidade

Estão disponíveis health, as três listagens GET, o resumo por evento e POST de
sincronização, além de login, identidade, logout e registro de instalação.
Não há CRUD administrativo HTTP. O frontend continua usando seus
mocks e não foi modificado. A compatibilidade dos dados foi verificada, mas a
integração nas telas, operação offline e desempenho em campo não foram testados.

Os documentos originais `PassCheck_Documentacao_Backend_Atualizada.md` v0.2 e
`PassCheck_PEI_IV.docx` não estavam presentes no workspace. O plano disponível e o
código real foram utilizados, junto da decisão expressa de Gabriel. Os originais
continuam necessários para conferir requisitos nas próximas etapas; isso não
impediu a fundação nem a modelagem expressamente autorizadas.

Antes da aplicação local da Etapa 2, foi criado o backup consistente
`backups/pre-etapa2-20261017.sqlite`, contendo o banco vazio da Etapa 1. Para
reverter o banco, interromper seus acessos, preservar o arquivo atual e restaurar
o backup em procedimento explícito. A restauração perderia, na cópia restaurada,
os dados incluídos depois desse backup. Não há reversão automática nem script
destrutivo; simplesmente retirar arquivos de código não desfaz uma migração.

Antes da migração 003, foi criado `backups/pre-etapa5-20261017.sqlite`, com o estado
das migrações 001/002 e os dados existentes. A migração foi aplicada sem alterar
os registros das cinco tabelas anteriores. Não executar os exemplos de escrita
ou testes destrutivos contra o banco de desenvolvimento compartilhado.

**Etapa 7 concluída em bancos isolados. Etapa 8 depende de nova autorização de Gabriel.**
