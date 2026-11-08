# Administração mínima — contrato da Etapa 8

Definido em 20/10/2026 antes da implementação, no escopo autorizado por Gabriel.
Todos os seis endpoints exigem Bearer JWT válido e papel atual ADMINISTRADOR.
OPERADOR recebe 403, mesmo com concessão para o evento; token ausente/revogado
recebe 401. Autenticação e papel são verificados antes de ler corpos ou recursos;
escritas repetem a autorização dentro de transação IMMEDIATE. Sem prefixo /api.
Cache-Control: no-store em todas as respostas. Não há exclusão.

## JSON, IDs e cadastro

JSON estrito application/json UTF-8, máximo 102400 bytes. Campos desconhecidos,
tipos incorretos, nulos e PATCH vazio: 400 DADOS_INVALIDOS. IDs de URL seguem os
GETs existentes: dígitos, inteiro positivo seguro, zeros à esquerda normalizados.
IDs não são fornecidos nos corpos; são atribuídos pelo SQLite. Nome tem 1–200
caracteres; local, 1–300; ambos com trim, sem caracteres de controle. Data é uma
data real YYYY-MM-DD, ano 0001–9999. Horários não são aceitos nesses campos.

POST /eventos:

```json
{"nome":"Encontro acadêmico","data":"2026-11-21","local":"Auditório"}
```

201 (IDs dos exemplos são ilustrativos):

```json
{"id":4,"nome":"Encontro acadêmico","data":"2026-11-21","local":"Auditório"}
```

PATCH /eventos/4 aceita qualquer subconjunto não vazio de nome/data/local:

```json
{"local":"Auditório central"}
```

200 devolve o evento completo com o mesmo id. Evento inexistente: 404
EVENTO_NAO_ENCONTRADO. É permitido corrigir metadados de evento com confirmações;
isso não muda IDs, vínculos, recibos, validações ou seus horários. Não é possível
mover ingresso/portão, alterar utilizado ou atribuir IDs via PATCH.

POST /eventos/4/portoes:

```json
{"nome":"Entrada principal"}
```

201:

```json
{"id":7,"eventoId":4,"nome":"Entrada principal"}
```

Evento inexistente recebe 404. Nomes não são chaves únicas; códigos dos ingressos
continuam globalmente únicos. Não há concessão automática a operadores ao criar
eventos/portões; aplica-se a política da Etapa 7.

## Importação CSV

POST /eventos/4/ingressos/importar recebe o CSV diretamente no corpo, não JSON
nem multipart. Content-Type: text/csv; charset=utf-8 (charset omitido assume UTF-8).
Content-Encoding só identity/ausente; bytes UTF-8 inválidos são rejeitados, sem
substituição silenciosa. BOM UTF-8 inicial é aceito. Não há upload para disco.

```csv
codigo,eventoId,portaoId
ACADEMICO-001,4,7
ACADEMICO-002,4,7
```

Cabeçalho exatamente codigo,eventoId,portaoId, nessa ordem, sem extras, duplicatas
ou espaços. Separador vírgula, quebra LF ou CRLF. Campos podem ser envolvidos em
aspas duplas e aspas internas são escapadas como ""; não são aceitos campos com
quebra de linha, comentários, linhas vazias intermediárias ou delimitador ';'.
Uma quebra final é opcional. Linha 1 é o cabeçalho; erros usam linhas físicas.

Até 102400 bytes e 1000 registros. Arquivo vazio ou só cabeçalho: 400 CSV_VAZIO;
cabeçalho incorreto: 400 CSV_CABECALHO_INVALIDO; UTF-8 inválido: 400
CSV_CODIFICACAO_INVALIDA; quantidade/tamanho excessivos: 413. Tipo/encoding
incorreto: 415 TIPO_DE_CONTEUDO_INVALIDO.

Código segue a sincronização: 1–128 caracteres, sem espaços nas extremidades nem
controles; caixa preservada. IDs das células são decimais canônicos positivos
seguros, sem sinal, espaços ou zeros iniciais. eventoId da linha deve coincidir
com a URL e o portão deve pertencer a esse evento. Não aceitar coluna utilizado.
O evento da URL precisa existir (404); o arquivo não cria eventos/portões.

201:

```json
{"eventoId":4,"importados":2}
```

Erros por linha: 422 CSV_INVALIDO, nada importado. Validar todas as linhas antes
das inserções. Cada linha inválida aparece uma vez, motivos podem ser múltiplos:
CSV_SINTAXE_INVALIDA, COLUNAS_INVALIDAS, CODIGO_INVALIDO, EVENTO_ID_INVALIDO,
PORTAO_ID_INVALIDO, EVENTO_INCOMPATIVEL, PORTAO_INCOMPATIVEL,
CODIGO_DUPLICADO_NO_ARQUIVO, CODIGO_JA_CADASTRADO. Duplicatas marcam todas as
ocorrências. Não retornar o código/payload nas mensagens de erro.

```json
{"erro":"CSV_INVALIDO","mensagem":"Importação recusada; nenhuma linha foi gravada.","linhas":[{"linha":2,"motivos":["CODIGO_JA_CADASTRADO"]},{"linha":3,"motivos":["PORTAO_INCOMPATIVEL"]}]}
```

Conferência de códigos/vínculos e inserções ocorrem na mesma transação IMMEDIATE.
Falha em qualquer inserção reverte tudo, inclusive linhas válidas anteriores.
Não há upsert, sobrescrita nem importação parcial. Reenvio de arquivo já importado
recebe duplicidades; em resposta perdida, consultar ingressos antes de repetir.
Nenhum código cadastrado, confirmado ou não, é substituído.

## Consulta de pendências

GET /eventos/1/pendencias?estado=TODAS&apos=0&limite=50

Query estrita e opcional: estado PENDENTE (padrão), RESOLVIDA ou TODAS; apos é
cursor inteiro seguro >=0 (padrão 0); limite 1–100 (padrão 50). Ordenar por id de
recibo crescente. Cursor é o último id retornado quando há mais resultados;
proximoCursor null encerra a consulta. Query inválida: 400 PARAMETRO_INVALIDO.
Evento inexistente: 404. Evento sem resultados: pendencias [] e cursor null.

```json
{"pendencias":[{"recebimentoId":3,"dispositivo":"instalacao-exemplo","idLocal":"17","eventoId":1,"portaoId":1,"ingressoId":4,"statusOriginal":"CONFLITO","motivo":"INGRESSO_JA_UTILIZADO","recebidoEm":"2026-10-20T12:00:00.000Z","statusAdministrativo":"PENDENTE","resolucao":null}],"proximoCursor":null}
```

O evento é o declarado no conteúdo original do recibo, não o evento atual do
ingresso. Isso inclui rejeições de vínculo sem mover o recibo para outro evento.
Não devolver QR/payload completo. IDs internos ausentes/inválidos em registros
legados aparecem como null. Recibos de evento inexistente não aparecem numa rota
de evento existente; podem ser resolvidos por recebimentoId conhecido pelo admin.

IDEMPOTENCIA_DIVERGENTE é uma tentativa na auditoria 003, não um novo recibo
REJEITADA. Não encerrar um recibo CONFIRMADA em nome dessa tentativa: esta etapa
trata somente recibos cujo status persistido seja CONFLITO ou REJEITADA.

## Resolução

POST /pendencias/3/resolver:

```json
{"justificativa":"Duplicidade revisada; mantida a confirmação original."}
```

Justificativa obrigatória, trim, 10–1000 caracteres, sem controles. Administrador
e horário vêm da autenticação e do servidor; campos enviados para substituí-los
são rejeitados. 201:

```json
{"recebimentoId":3,"statusOriginal":"CONFLITO","statusAdministrativo":"RESOLVIDA","resolucao":{"id":1,"administradorId":1,"dataHora":"2026-10-20T12:05:00.000Z","justificativa":"Duplicidade revisada; mantida a confirmação original."}}
```

Resolução significa encerramento administrativo após revisão, SEM nova entrada.
Não confirmar rejeição, desfazer utilização, transferir ingresso ou mudar o
resultado original. Dashboard e POST /sincronizacao continuam iguais: reenvio
retorna JA_PROCESSADA com o resultado original, mesmo após resolução.

Recibo inexistente: 404 PENDENCIA_NAO_ENCONTRADA. Recibo CONFIRMADA: 409
RECIBO_NAO_RESOLVIVEL. Resolução já existente, até com justificativa idêntica:
409 PENDENCIA_JA_RESOLVIDA, sem nova linha ou alteração. Se a resposta se perder,
consultar TODAS/RESOLVIDA e correlacionar recebimentoId/dispositivo/idLocal.

Migração aditiva 005_resolucoes_administrativas.sql: tabela STRICT
resolucoes_administrativas com PK, UNIQUE recebimento_id, FKs de recibo/admin,
status_administrativo RESOLVIDA, justificativa e data_hora_servidor UTC. Trigger
exige recibo elegível e administrador ativo. UPDATE/DELETE/REPLACE são bloqueados
para preservar a auditoria. Índice parcial de recibos por evento declarado/id
suporta a consulta. Nenhuma migração 001–004 é alterada.

## HTTP e frontend

Erros seguem {erro,mensagem}; somente CSV_INVALIDO adiciona linhas estruturadas.
400 parâmetros/JSON inválidos; 401 autenticação; 403 papel; 404 recurso;
409 estado da resolução; 413 limites; 415 mídia; 422 conteúdo CSV; 500 erro
técnico sem SQL/stack/dados; 503 banco ocupado com Retry-After: 1. CORS acrescenta
PATCH às mesmas origens configuradas. Nenhuma rota DELETE é implementada.

A futura interface administrativa identifica resolução por statusAdministrativo
e objeto resolucao da listagem; statusOriginal nunca vira CONFIRMADA. Essa é uma
consulta administrativa, não uma permissão adicional do operador. Não apagar
IndexedDB nem marcar conflitos como sincronizados com confirmação por inferência.
O backend não limpa filas locais. A reconciliação automática da fila do operador
precisará de contrato autenticado próprio e autorização na Etapa 9; o operador
nesta etapa continua recebendo 403 na consulta de pendências. Não trocar usuário
ou instalação da operação para contornar isso. Nenhuma interface é implementada.

## Validação prevista

Preservar os 123 cenários anteriores, adaptando somente expectativas de rotas
agora existentes, CORS PATCH e versão 005. Novos testes: papéis e revogação,
cadastros estritos, datas, importação/codificação/aspas/cabeçalhos/limites,
duplicidades e vínculos, rollback após inserção, preservação de confirmados,
paginação e escopo das pendências, responsável/justificativa/data, resolução
duplicada/concorrente, imutabilidade, dashboard/reenvio inalterados, HTTP real,
reinício, integridade e preservação integral do banco de desenvolvimento.
