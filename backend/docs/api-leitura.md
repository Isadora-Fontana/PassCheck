# APIs de leitura — Etapa 3

Atualização da Etapa 7: todas estas leituras, inclusive resumo, exigem
`Authorization: Bearer <JWT>`. Operadores listam somente eventos concedidos e
podem baixar todos os seus portões/ingressos; evento sem concessão retorna 403
antes da consulta do recurso. Administrador mantém acesso global e 404 de
inexistência. JSONs de sucesso preservados. Veja [autenticação](contrato-autenticacao.md).
As referências abaixo à ausência de autenticação descrevem a Etapa 3.

Base local padrão: `http://127.0.0.1:3000`. Consultas SQL reais, sem paginação,
sem prefixo `/api` e sem envelope na resposta. As listas são ordenadas por ID.
Todas as respostas passam pelo CORS existente e recebem `Cache-Control: no-store`.

## GET /eventos

HTTP 200 com array de `{id, nome, data, local}`; banco migrado sem eventos retorna
`[]`. `id` é numérico e `data` é `YYYY-MM-DD`.

Resposta real da carga de desenvolvimento:

```json
[
  {"id":1,"nome":"Festival UNIVAG","data":"2026-11-20","local":"Campus UNIVAG"},
  {"id":2,"nome":"Show de Formatura","data":"2026-12-12","local":"Centro de Eventos"},
  {"id":3,"nome":"Feira de Tecnologia","data":"2027-03-05","local":"Pavilhão de Exposições"}
]
```

## GET /eventos/:eventoId/portoes

HTTP 200 com array de `{id, eventoId, nome}`, restrito ao evento. Evento inexistente
retorna 404. Evento existente sem portões retorna `[]`.

Resposta real de `/eventos/1/portoes`:

```json
[
  {"id":1,"eventoId":1,"nome":"Portão A"},
  {"id":2,"eventoId":1,"nome":"Portão B"},
  {"id":3,"eventoId":1,"nome":"Portão C"}
]
```

## GET /eventos/:eventoId/portoes/:portaoId/ingressos

HTTP 200 com array de `{id, codigo, eventoId, portaoId, utilizado}`. IDs numéricos;
`utilizado` é JSON boolean, convertido de INTEGER 0/1. Retorna ingressos usados
e disponíveis, somente do par evento/portão solicitado.

Evento inexistente, portão inexistente ou de outro evento retorna 404. Portão
existente do evento, sem ingressos, retorna `[]`. Portão de outro evento usa a
mesma resposta que portão inexistente; não retorna dados desse outro evento.

Resposta real de `/eventos/1/portoes/1/ingressos`:

```json
[
  {"id":1,"codigo":"PC-A7X9K2","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":2,"codigo":"PC-B3M8Q1","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":3,"codigo":"PC-C5T2W7","eventoId":1,"portaoId":1,"utilizado":false},
  {"id":4,"codigo":"PC-D9R4L6","eventoId":1,"portaoId":1,"utilizado":true},
  {"id":5,"codigo":"PC-E1H6Z3","eventoId":1,"portaoId":1,"utilizado":false}
]
```

Os códigos acima são exclusivamente os mocks fictícios já existentes.

## IDs e erros

Parâmetros aceitam somente dígitos decimais que representem inteiros de 1 a
9007199254740991. Zeros à esquerda são normalizados (`01` equivale a `1`). Não são
aceitos sinal, espaços, fração, expoente, hexadecimal, conteúdo SQL ou valores
acima do intervalo seguro. Todos os parâmetros da rota são validados antes de
consultar existência; IDs inválidos recebem 400 mesmo se outro ID não existir.

| Situação | HTTP | `erro` |
|---|---|---|
| ID inválido ou escape de URL inválido | 400 | `PARAMETRO_INVALIDO` |
| Evento não existe | 404 | `EVENTO_NAO_ENCONTRADO` |
| Portão não existe no evento | 404 | `PORTAO_NAO_ENCONTRADO` |
| Origem não permitida | 403 | `ORIGEM_NAO_PERMITIDA` |
| Erro interno/SQLite indisponível | 500 | `ERRO_INTERNO` |
| Caminho não implementado | 404 | `ROTA_NAO_ENCONTRADA` |

Exemplo para `/eventos/1/portoes/4/ingressos`:

```json
{"erro":"PORTAO_NAO_ENCONTRADO","mensagem":"Portão não encontrado neste evento."}
```

Campos vazios que deixam um segmento da rota ausente não correspondem à rota
parametrizada e recebem 404. Query strings não substituem os parâmetros do caminho
e não filtram `utilizado`. Não existe filtro adicional implícito.

## Compatibilidade e limites

As respostas de sucesso conferem campo a campo com os mocks. Durante a preparação,
o frontend consulta todos os portões do evento e combina as respostas. Cada GET
de ingressos deve continuar retornando apenas seu portão, evitando duplicação.

O frontend ainda usa mocks. As funções simuladas devolvem `[]` para IDs ausentes
ou vínculo incorreto; a API agora retorna os erros HTTP explicitamente exigidos.
A futura integração deve tratar `response.ok` e mensagens de erro. Nenhuma tela
ou função de frontend foi alterada nesta etapa.

As leituras não exigem autenticação nesta entrega. O filtro relacional não é
autorização por operador: saber um ID válido permite consultar esse escopo.
CORS também não autentica o cliente. Autenticação/autorização, sincronização,
dashboard e administração estão fora desta etapa.

As migrações devem ser aplicadas previamente pelo comando explícito existente.
Um banco sem tabelas não é confundido com uma lista vazia: falha SQL retorna 500.
Não há escrita, migração ou seed implícito em nenhuma dessas leituras.
