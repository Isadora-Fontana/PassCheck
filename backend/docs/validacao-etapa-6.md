# Validação da Etapa 6 — resumo e consistência dos indicadores

Data: 17/10/2026. Endpoint entregue: `GET /eventos/:eventoId/resumo`.
Somente backend; Etapa 7 não iniciada.

## Resultado e pré-requisitos

Antes de editar, `npm.cmd test` terminou com **81 testes aprovados, zero falhas**,
em 13720,4857 ms. Foram consultados o modelo relacional, contrato de sincronização,
decisões D01–D06, tabelas/migrações 001–003 e código/testes atuais.

O banco de desenvolvimento foi aberto em readonly: `integrity_check = ok`,
`foreign_key_check = []`. As três migrações estavam aplicadas, com nomes e
checksums conferidos pelo executor existente:

| Migração | SHA-256 do SQL com LF normalizado |
|---|---|
| 001 | `f4a3ac4aa51e2df743f0ff8c61e4851d4304c99893bad4e1428cd59c4a6d1271` |
| 002 | `954ced7e340478b8604bb37227921ab29e91031848c3bf86c749d6173f92efed` |
| 003 | `37eea0ba120836a8302a1dbbcee56cd399d7a78991511b88c89e5fbadb1352cf` |

Execução final: **97 testes aprovados, zero falhas, zero cancelados/ignorados**,
em 13823,4583 ms. São 81 anteriores e 16 novos. Nenhum pré-requisito falhou.

## Arquivos

Caminhos relativos a `backend/`:

| Criados | Finalidade |
|---|---|
| `tests/resumo.test.js` | 15 testes de contrato, contagens, sincronização, erros, isolamento e preservação |
| `tests/resumo-http.test.js` | HTTP real e reinicialização em processos distintos, reutilizando auxiliar da Etapa 5 |
| `docs/validacao-etapa-6.md` | Este relatório, SQL e evidências |

| Alterados | Finalidade |
|---|---|
| `src/repositories/eventos.js` | Consulta agregada parametrizada, retornando só totais e portões |
| `src/services/eventos.js` | 404, verificação das invariantes e cálculo exato de restantes |
| `src/routes/eventos.js` | Nova rota e refinamento de whitespace na validação compartilhada de IDs |
| `src/middleware/errors.js` | Registro sanitizado de INDICADORES_INCONSISTENTES |
| `tests/app.test.js` | Substituir expectativa histórica de resumo ausente pela ausência de `/api/eventos/1/resumo` |
| `README.md` | Documentação de uso e limites do indicador |
| `docs/decisoes.md` | D07: escopo e escolhas da Etapa 6 |

Não foram alterados frontend, IndexedDB, mocks, service worker, migrações, seed,
dependências, configuração ou dados permanentes. O backend já estava não rastreado
no Git; `git diff` sozinho não lista todas as alterações desses arquivos.

## Contrato e origem dos números

Resposta 200 contém exatamente `evento`, `totalIngressos`, `entradas`, `restantes`
e `portoes`, com portões em ordem de ID e somente `id`, `nome`, `entradas` por item.
O nome é consultado no banco. Evento sem ingressos tem contagens zero; portões sem
entradas aparecem com zero; evento sem portões retorna `portoes: []`.

IDs inválidos retornam 400 PARAMETRO_INVALIDO; evento inexistente, 404
EVENTO_NAO_ENCONTRADO. Zod exige inteiro positivo seguro. Zeros à esquerda seguem
a política anterior; whitespace final não é aceito. O teste inclui `1%0A`, pois
a âncora `$` do regex anterior podia aceitar uma quebra de linha antes da conversão
numérica. O refinamento compartilhado corrige isso sem alterar IDs válidos.

`totalIngressos` conta ingressos cadastrados para o evento. `entradas` conta
linhas de `validacoes` vinculadas aos ingressos desse evento; a tabela guarda
confirmações e possui unicidade por ingresso. Recibos, conflitos, rejeições,
reenvios, auditorias, horários do celular e dados locais não são fonte da contagem.
Um recibo CONFIRMADA sem validação não acrescenta entrada. O endpoint não é uma
auditoria integral do banco: verifica as invariantes do resumo e preserva os dados.

`restantes` é a subtração exata. Antes de responder, o serviço exige contagens
inteiras seguras não negativas, entradas <= total e soma dos portões = entradas.
Falha retorna 500 INDICADORES_INCONSISTENTES e registra:

```text
INDICADORES_INCONSISTENTES: resumo não emitido; dados preservados.
```

Não há clamp, arredondamento, correção automática ou exclusão de histórico.
Falhas SQL continuam como 500 ERRO_INTERNO pelo middleware central. Respostas
mantêm `Cache-Control: no-store`; CORS e métodos anteriores permanecem iguais.

### Confirmações sintéticas

Os ingressos 4 e 12 contribuem com duas confirmações no evento 1. São registros
sintéticos de desenvolvimento, identificados por
`recebimentos.dispositivo = seed:frontend:1838a5a` e
`validacoes.data_hora_cliente = NULL`. O teste confere essas características e sua
preservação após a leitura. O resumo indica confirmações registradas, **não prova
entradas físicas**. O contrato não possui campo de procedência; essa distinção
fica documentada e preservada nos registros, sem acrescentar campos ao JSON.

## SQL utilizado

Uma única instrução no repositório; os quatro `?` recebem o mesmo `eventoId`
validado, por binding do driver:

```sql
WITH totais AS (
  SELECT COUNT(*) AS totalIngressos FROM ingressos WHERE evento_id = ?
), confirmadas AS (
  SELECT COUNT(*) AS entradas FROM validacoes v
  JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = ?
), por_portao AS (
  SELECT i.portao_id, COUNT(*) AS entradas FROM validacoes v
  JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = ?
  GROUP BY i.portao_id
)
SELECT e.nome AS evento, t.totalIngressos, c.entradas,
  p.id AS portaoId, p.nome AS portaoNome, COALESCE(pp.entradas, 0) AS entradasPortao
FROM eventos e CROSS JOIN totais t CROSS JOIN confirmadas c
LEFT JOIN portoes p ON p.evento_id = e.id
LEFT JOIN por_portao pp ON pp.portao_id = p.id
WHERE e.id = ? ORDER BY p.id
```

Totais globais e por portão são agregados independentemente no mesmo SELECT;
assim a conferência da soma detecta vínculos que deixem confirmações sem portão
correspondente. Não há consultas por portão nem carga de todos os ingressos no
JavaScript. O resultado intermediário tem uma linha por portão, ou uma linha com
portão nulo quando o evento não possui portões.

Uma única consulta evita combinar contagens de estados diferentes entre commits
concorrentes. O modo WAL existente permite leitura de um estado confirmado enquanto
outra conexão escreve. Isso foi testado com duas conexões independentes; não foram
alterados pragmas de isolamento em produção. [SQLite: isolamento](https://www.sqlite.org/isolation.html).

`EXPLAIN QUERY PLAN` executado contra o desenvolvimento em readonly mostrou:

```text
MATERIALIZE totais
SEARCH ingressos USING COVERING INDEX idx_ingressos_evento_portao (evento_id=?)
MATERIALIZE confirmadas
SEARCH i USING COVERING INDEX idx_ingressos_evento_portao (evento_id=?)
SEARCH v USING COVERING INDEX sqlite_autoindex_validacoes_1 (ingresso_id=?)
MATERIALIZE por_portao
SEARCH i USING COVERING INDEX idx_ingressos_evento_portao (evento_id=?)
SEARCH v USING COVERING INDEX sqlite_autoindex_validacoes_1 (ingresso_id=?)
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
SCAN t
SCAN c
SEARCH p USING INDEX idx_portoes_evento (evento_id=?) LEFT-JOIN
BLOOM FILTER ON pp (portao_id=?)
SEARCH pp USING AUTOMATIC COVERING INDEX (portao_id=?) LEFT-JOIN
USE TEMP B-TREE FOR ORDER BY
```

Os SCANs de `t`/`c` são sobre os resultados agregados de uma linha. A ordenação
temporária opera sobre portões. Foram reutilizados índices existentes; nenhuma
migração foi criada. O plano é evidência da versão instalada, não contrato de
formato nem benchmark de carga. [SQLite: EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html).

## Respostas HTTP reais e reinicialização

Execução direcionada em arquivo temporário: processo 21128, URL
`http://127.0.0.1:51392/eventos/1/resumo`, HTTP 200 e `Cache-Control: no-store`:

```json
{
  "evento": "Festival UNIVAG",
  "totalIngressos": 12,
  "entradas": 2,
  "restantes": 10,
  "portoes": [
    {"id":1,"nome":"Portão A","entradas":1},
    {"id":2,"nome":"Portão B","entradas":0},
    {"id":3,"nome":"Portão C","entradas":1}
  ]
}
```

O POST confirmou o ingresso 1 (`PC-A7X9K2`) no portão 1. A API foi encerrada e
reiniciada em outro processo, 11968, URL
`http://127.0.0.1:51507/eventos/1/resumo`. O reenvio do POST retornou JA_PROCESSADA;
o resumo permaneceu HTTP 200 com:

```json
{
  "evento": "Festival UNIVAG",
  "totalIngressos": 12,
  "entradas": 3,
  "restantes": 9,
  "portoes": [
    {"id":1,"nome":"Portão A","entradas":2},
    {"id":2,"nome":"Portão B","entradas":0},
    {"id":3,"nome":"Portão C","entradas":1}
  ]
}
```

Health e os três GETs anteriores também responderam 200, com ingresso 1 utilizado
no GET correspondente. Snapshot das cinco tabelas permaneceu igual após as
leituras/reenvio; auditoria ficou vazia; `foreign_key_check = []` e
`integrity_check = ok`. Os processos foram encerrados ao final dos testes.

Valores iniciais conferidos nos três eventos:

| Evento | Total | Entradas confirmadas | Restantes | Entradas por portão |
|---|---:|---:|---:|---|
| Festival UNIVAG | 12 | 2 | 10 | 1, 0, 1 |
| Show de Formatura | 6 | 0 | 6 | 0, 0 |
| Feira de Tecnologia | 4 | 0 | 4 | 0 |

## Testes e integridade

| Requisito | Evidência executada |
|---|---|
| Evento existente/inexistente | Contrato exato dos três eventos; 404 para ausente e inteiro seguro máximo inexistente |
| ID inválido | Zero, negativo, fração, texto, expoente, sinal, overflow, whitespace e tentativa SQL recebem 400 |
| Sem ingressos/sem portões | Contagens zero, portões vazios preservados e array vazio quando apropriado |
| Valores dos mocks | 22 ingressos distribuídos por três eventos; origem sintética dos IDs 4/12 conferida |
| Confirmação e reenvio | 2 → 3 entradas; JA_PROCESSADA mantém 3 |
| Conflito e rejeição | Outro dispositivo, ingresso inexistente e chave divergente não aumentam contagens |
| Lote parcialmente confirmado | Só CONFIRMADA incrementa; CONFLITO/REJEITADA e reenvio não incrementam |
| Falha técnica parcial | Trigger de teste falha no segundo item: só o primeiro commit entra no resumo |
| Sem vazamento entre eventos | Confirmar evento 2 altera somente seu resumo |
| Independência do relógio | Datas UTC válidas dos anos 0001 e 9999 não filtram confirmações |
| Totalmente confirmado | 12 entradas, zero restantes, portões 5/4/3 |
| Recibo sem validação | Recibo CONFIRMADA isolado não é contado; dados preservados |
| Invariantes e erro | Contagens impossíveis recusadas; vínculo corrompido em teste gera 500 e log, sem ajustar dados |
| Isolamento/rollback | Leitor separado não vê confirmação sem commit; rollback mantém contagens; commit posterior incrementa |
| Reinício/HTTP real | Processos distintos mantêm resumo; GETs/POST e health preservados |

Os testes normais verificam integridade após os cenários. A simulação de vínculo
corrompido desabilita FK **somente em banco de teste isolado**, comprova a violação
e verifica que o GET não a encobre nem a repara. Esse banco é descartado ao final;
não se declara que a corrupção proposital passou no foreign_key_check.

## Comandos e resultados

| Comando/ação | Resultado |
|---|---|
| `npm.cmd test` antes de editar | 81/81, zero falhas; 13720,4857 ms |
| `Get-Content -Encoding UTF8`, `rg`, `git status --short` | Inspeção de código, decisões, migrações e testes |
| Scripts em memória `node --input-type=module` | Conferência readonly das migrações/integridade, hash de arquivos protegidos e EXPLAIN QUERY PLAN |
| `node --test tests/resumo.test.js tests/resumo-http.test.js` | 16/16, zero falhas; 1196,7618 ms |
| `npm.cmd test` final | 97/97, zero falhas; 13823,4583 ms |

O banco permanente não recebeu POST, seed, migração ou alteração. O hash SHA-256
agregado de 42 arquivos de frontend, `src/db/` e `data/`, excluindo dependências e
builds, foi capturado antes da implementação:
`8977d85faee0a66b0cd3eeb8dd2735a9842b454100d436ed1203a35177d79519`.
A conferência final manteve exatamente o mesmo valor; integridade continuou `ok`,
sem violações de FK e com migrações 001–003 atuais. Também foram validados três
blocos JSON, 18 links locais e a igualdade entre o SQL documentado e o executado
pelo repositório. Os cenários HTTP de escrita e as
simulações usaram bancos isolados temporários, removidos pelos próprios testes.

## Incompatibilidades e continuidade

Não há incompatibilidade entre o JSON solicitado e o modelo central. O exemplo
do pedido corresponde aos valores iniciais do seed. A limitação semântica é que
`entradas` significa confirmações centrais, incluindo seed: o JSON não distingue
origem sintética nem comprova presença física. A procedência continua preservada
nos registros e documentada, sem mudança de contrato.

O frontend não foi integrado nem modificado; ainda usa seus mocks. Não há novos
endpoints administrativos, autenticação, importação CSV ou resolução de conflitos.
Os documentos backend/PEI originais continuam ausentes do workspace, conforme os
relatórios anteriores. Não houve commit, push, deploy ou instalação de dependências.

Para a Etapa 7: Gabriel deve definir e autorizar o próximo escopo. Permanecem
pendentes a integração e os testes de navegador do frontend, autenticação e
autorização, resolução administrativa e validação operacional de desempenho,
conforme a priorização futura. Nenhuma dessas funcionalidades foi iniciada aqui.
