# Relatório de entrega — Etapa 3

Data de referência: **17/10/2026**, America/Sao_Paulo.
Resultado: três APIs de leitura implementadas e verificadas. Etapa 4 não iniciada.

## Pré-requisitos cumpridos antes das alterações

1. Inspecionados app, servidor, middleware, modelo relacional, migrações, conexão,
   estrutura de repositórios/serviços, testes, instruções locais e contratos reais
   em `frontend/src/api.js`, preparação e mocks.
2. `npm.cmd test` executado **antes de modificar qualquer arquivo**: **42 testes
   aprovados, 0 falhas, 0 ignorados**, saída 0, duração 1403,7952 ms.
3. Banco de desenvolvimento aberto em modo readonly; histórico conferido pelo
   verificador de checksums existente. Migrações aplicadas:
   `001_modelo_central.sql` e `002_integridade_confirmacoes.sql`.
4. Integridade inicial: `ok`. Dados: 3 eventos, 6 portões, 22 ingressos, 2 recibos,
   2 confirmações e 2 registros de migração.

A implementação só começou após os pré-requisitos passarem. Não houve necessidade
de corrigir a fundação nem de migrar/semear novamente o banco de desenvolvimento.

## Arquivos criados

Todos os caminhos são relativos a `backend/`:

```text
src/repositories/eventos.js
src/services/eventos.js
src/routes/eventos.js
tests/leitura.test.js
tests/leitura-http.test.js
docs/api-leitura.md
docs/validacao-etapa-3.md
```

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/app.js` | Composição das novas rotas com serviço e repositório |
| `src/middleware/errors.js` | URL com escape inválido retorna 400 padronizado, sem detalhes internos |
| `tests/app.test.js` | Atualiza a expectativa antiga de ausência dos três GETs; mantém 404 para funcionalidades fora do escopo |
| `README.md` | Comandos HTTP, arquitetura atual e limites da entrega |
| `docs/decisoes.md` | D05 registra a autorização e as decisões desta etapa |

Não foram alterados schema, migrações, seed, conexão, testes de integridade da
Etapa 2, dependências ou lockfile. Os `.gitkeep` existentes foram preservados.
Nenhum arquivo do frontend foi alterado. Não houve instalação, alteração de
credenciais, commit, push, deploy ou criação de endpoint de escrita.

## Endpoints e arquitetura

| Endpoint | Contrato |
|---|---|
| `GET /eventos` | Array direto de `{id,nome,data,local}` |
| `GET /eventos/:eventoId/portoes` | Array direto de `{id,eventoId,nome}` |
| `GET /eventos/:eventoId/portoes/:portaoId/ingressos` | Array direto de `{id,codigo,eventoId,portaoId,utilizado}` |

As barras duplicadas nos títulos do pedido foram interpretadas conforme os
parâmetros já presentes no contrato do frontend. Não existe prefixo `/api`.

As rotas validam parâmetros com Zod e fazem o papel de controllers HTTP simples.
O serviço verifica se o evento existe e se o portão pertence a ele. O repositório
usa SELECTs com parâmetros vinculados, colunas explícitas e ordenação por ID.
As consultas não interpolam entrada do usuário no SQL.

IDs são números seguros; datas preservam `YYYY-MM-DD`; `utilizado` é convertido
de 0/1 para booleano. Ingressos usados não são filtrados. Nenhuma escrita ocorre
nas leituras. Mantidos CORS, `no-store` e o tratamento central de erros.

ID inválido retorna 400. Evento inexistente retorna 404. Portão inexistente ou
pertencente a outro evento recebe o mesmo 404. Coleção vazia de recurso existente
retorna 200 com `[]`, incluindo portão sem ingressos.

## Testes executados

Comando: **`npm.cmd test`**, executado na pasta `PassCheck/backend/`.

| Execução | Aprovados | Falhas | Ignorados | Saída |
|---|---:|---:|---:|---:|
| Antes de qualquer edição | 42 | 0 | 0 | 0 |
| Após implementar código e testes | **59** | **0** | **0** | **0** |

Duração informada na execução final: **1773,5985 ms**. Não houve execução com
falhas nesta etapa. Foram acrescentados 17 testes; um teste anterior foi adaptado
para deixar de exigir 404 nas três rotas agora autorizadas.

Cobertura nova:

- listagem completa e vazia de eventos, IDs numéricos e datas sem horário;
- consulta ao estado atual do SQLite, incluindo alteração isolada e confirmação
  criada no teste, para demonstrar que a resposta não vem de mocks/cache;
- portões restritos ao evento e evento inexistente;
- IDs zero, negativos, fracionários, alfanuméricos, espaços, sinais, expoentes,
  hexadecimal, valores não finitos, overflow e conteúdo de tentativa de SQL;
- escapes inválidos de URL com erro 400 sem detalhes internos;
- evento existente sem portões e portão existente sem ingressos;
- portão inexistente ou de outro evento;
- ingressos utilizados e disponíveis, booleanos e somente campos do contrato;
- recuperação dos 22 ingressos pelos seis portões sem vazamento nem duplicação;
- query strings incapazes de alterar o escopo do caminho;
- CORS, `no-store`, erro SQL centralizado e ausência de escrita nos GETs;
- HTTP real e persistência após reinicialização do processo da API.

## Evidência de reinicialização real

`tests/leitura-http.test.js` migrou e semeou um arquivo temporário isolado e
iniciou o entrypoint real `node src/server.js` em dois processos distintos:

- ciclo 1: PID **18576**;
- ciclo 2, após encerrar o primeiro: PID **4712**.

Em **cada ciclo** foram verificados por HTTP real: `/health`, `/eventos`, três
consultas de portões e seis consultas de ingressos, todos com HTTP 200. As
respostas foram comparadas integralmente aos mocks; 22 ingressos conferidos.
Não houve saída de erro na inicialização ou nas consultas. Após a segunda
execução, os registros do banco continuavam iguais ao snapshot anterior.
Processos foram encerrados e arquivos temporários removidos pelo teste.

## Evidência HTTP adicional e respostas reais

Foi criada uma cópia temporária do banco de desenvolvimento pela API de backup
do SQLite, com a origem aberta em **readonly**. O servidor foi inicializado
nessa cópia usando o `startServer` real, em `http://127.0.0.1:57292`.

| Requisição real | HTTP | Evidência |
|---|---:|---|
| `/health` | 200 | `{"status":"ok","database":"ok"}` |
| `/eventos` | 200 | 3 eventos, iguais aos mocks |
| `/eventos/1/portoes` | 200 | 3 portões do evento 1 |
| `/eventos/1/portoes/1/ingressos` | 200 | 5 ingressos; ID 4 utilizado |
| `/eventos/abc/portoes` | 400 | ID inválido rejeitado |
| `/eventos/1/portoes/4/ingressos` | 404 | Vínculo incorreto rejeitado |

Respostas de sucesso incluíram `Content-Type: application/json; charset=utf-8`
e `Cache-Control: no-store`. O servidor e a conexão foram encerrados ao terminar;
a cópia temporária foi removida. A porta acima é evidência da execução, não uma
configuração permanente.

Corpo real de `GET /eventos`:

```json
[
  {"id":1,"nome":"Festival UNIVAG","data":"2026-11-20","local":"Campus UNIVAG"},
  {"id":2,"nome":"Show de Formatura","data":"2026-12-12","local":"Centro de Eventos"},
  {"id":3,"nome":"Feira de Tecnologia","data":"2027-03-05","local":"Pavilhão de Exposições"}
]
```

Corpo real de `GET /eventos/1/portoes`:

```json
[
  {"id":1,"eventoId":1,"nome":"Portão A"},
  {"id":2,"eventoId":1,"nome":"Portão B"},
  {"id":3,"eventoId":1,"nome":"Portão C"}
]
```

Corpo real de `GET /eventos/1/portoes/1/ingressos` (códigos fictícios dos mocks):

```json
[
  {"id":1,"codigo":"PC-A7X9K2","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":2,"codigo":"PC-B3M8Q1","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":3,"codigo":"PC-C5T2W7","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":4,"codigo":"PC-D9R4L6","eventoId":1,"portaoId":1,"utilizado":true},
  {"id":5,"codigo":"PC-E1H6Z3","eventoId":1,"portaoId":1,"utilizado":false}
]
```

## Preservação e comandos de conferência

Além dos testes, foram executados `git status`, `git diff --exit-code HEAD -- frontend`,
`rg --files`, leituras com `Get-Content` e scripts Node em memória para conferir
checksums, histórico, snapshots e respostas HTTP. Nenhum comando de migração ou
seed foi executado contra o banco de desenvolvimento nesta etapa.

Os 38 arquivos do frontend e de `backend/src/db/` conferidos tiveram o mesmo
digest agregado antes/depois:

```text
666644a3d6430278ff20a6553d79aec184055fedc683078a2db483c3cd52dd3f
```

O snapshot dos dados e histórico de migração do banco de desenvolvimento também
permaneceu idêntico, incluindo IDs, horários e estado de utilização:

```text
9a17f23c061c4acfd2fa09fae4660b90f5845a83aada321349cdec53ac922fee
```

Conferência final: migrações 001/002 intactas, `integrity_check = ok`, mesmas
quantidades 3/6/22/2/2. O digest é lógico; não representa hash do arquivo físico
SQLite. O código backend continua não rastreado, como nas etapas anteriores;
nenhuma preparação do índice ou commit foi feita.

## Compatibilidade e pendências para a Etapa 4

Não foi encontrada incompatibilidade nos **formatos de sucesso**: arrays diretos,
nomes dos campos, IDs, datas, códigos e booleanos são iguais aos mocks. A consulta
por portão preserva a preparação que soma todos os portões de um evento.

Há diferenças esperadas que a futura integração deve tratar:

1. Os mocks devolvem `[]` para recursos inexistentes ou vínculo incorreto; a API
   devolve 400/404 conforme solicitado. O cliente deverá verificar `response.ok`.
2. O frontend ainda usa suas funções simuladas: nenhuma chamada foi trocada por
   fetch. Compatibilidade de contrato não equivale a integração nas telas.
3. Ainda precisam ser acordados URL-base/origens do ambiente de integração e o
   escopo da Etapa 4. Nenhuma alteração de configuração do frontend foi feita.
4. Autenticação/autorização continuam ausentes por restrição desta etapa. O filtro
   por evento e portão é integridade relacional, não permissão por operador.
5. Sincronização, resumo/dashboard e administração seguem não implementados.
   Contratos dessas etapas precisam de autorização própria; este relatório não
   presume que sejam o próximo trabalho autorizado.
6. A documentação backend atualizada original continua indisponível no workspace.
   Nesta etapa os três contratos foram fornecidos expressamente no pedido e
   conferidos com o código real.

**Etapa 3 concluída. Aguardar autorização para continuar.**
