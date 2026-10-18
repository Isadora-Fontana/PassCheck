# Relatório de entrega — Etapa 2

Data: **17/10/2026**, America/Sao_Paulo. Escopo: exclusivamente modelagem e
implementação da persistência central. Etapa 3 não iniciada.

## Pré-requisito obrigatório

Antes de alterar código ou aplicar migrações, foi executado `npm.cmd test` na
fundação existente. Resultado: **16 testes aprovados, 0 falhas, 0 ignorados**,
duração informada de **1577,1776 ms**, saída 0. Incluiu inicialização em porta
livre, requisição HTTP real a `/health`, fechamento dos recursos, SQLite,
persistência, erros e porta ocupada. A Etapa 2 só começou após esse resultado.

O banco `data/passcheck.sqlite` foi inspecionado em modo readonly: esquema vazio e
`integrity_check = ok`. Stack e arquitetura da Etapa 1 foram preservadas.

## Fontes e decisões

Consultados: decisões D01/D02/D03, README e arquivos existentes do backend,
Plano de Ação Backend local, `frontend/src/api.js`, `db.js` e mocks reais. A
documentação `PassCheck_Documentacao_Backend_Atualizada.md` continua ausente do
workspace; não foi alegada consulta direta a esse arquivo. A autorização atual,
o plano disponível e o código real definiram esta entrega. O plano preexistente
e o frontend não foram alterados.

A D04 foi acrescentada ao registro histórico: modelagem e seed agora estão
autorizados, sem antecipar APIs, autenticação ou sincronização. O esquema é
documentado em [modelo-relacional.md](modelo-relacional.md).

## Arquivos alterados

Caminhos relativos a `backend/`:

| Arquivo | Alteração |
|---|---|
| `package.json` | Scripts `db:migrate` e `db:seed` |
| `src/db/connection.js` | Habilita `recursive_triggers`, preservando FK, WAL e timeout |
| `src/db/migrations/README.md` | Procedimento real de migração, checksums e recuperação |
| `README.md` | Execução, modelo, seed, limites e continuidade da Etapa 2 |
| `docs/decisoes.md` | D04, sem apagar as decisões históricas |

## Arquivos criados

```text
src/db/cli.js
src/db/errors.js
src/db/migrate.js
src/db/migrations/001_modelo_central.sql
src/db/migrations/002_integridade_confirmacoes.sql
src/db/seeds/mock-data.js
src/db/seeds/development.js
tests/helpers/database.js
tests/migrations.test.js
tests/integrity.test.js
tests/seed.test.js
docs/modelo-relacional.md
docs/validacao-etapa-2.md
```

Artefatos locais ignorados pelo Git:

- `data/passcheck.sqlite`: banco preexistente, agora migrado e populado com mocks;
- `backups/pre-etapa2-20261017.sqlite`: cópia consistente do banco vazio anterior,
  criada sem sobrescrever arquivo existente e verificada com `integrity_check`.

Não houve instalação de dependências, alterações de versões ou necessidade de
modificar o lockfile. Nenhuma credencial foi criada ou alterada. Nenhum arquivo
do frontend, serviço externo, configuração de infraestrutura, commit, push ou
deploy foi modificado/executado. Os arquivos do backend continuam não rastreados,
como já estavam ao iniciar esta etapa; não houve `git add`.

## Comandos e resultados

Comandos npm executados em `PassCheck/backend/`. Foi usado `npm.cmd` por causa da
política de execução do PowerShell; os scripts também podem ser chamados com npm.

| Comando/procedimento | Resultado real |
|---|---|
| `git status`, `git diff --exit-code HEAD`, `rg --files`, `Get-Content` | Estrutura, instruções, fontes e estado inicial/final conferidos |
| `npm.cmd test` antes da implementação | 16/16 aprovados, saída 0 |
| Primeira execução ampliada de `npm.cmd test` | 40/42 aprovados; duas expectativas de código de erro nos testes novos foram corrigidas |
| Execução ampliada após ajuste | **42/42 aprovados**, 0 falhas, 0 ignorados; **1403,5677 ms**, saída 0 |
| `node --input-type=module` com API `database.backup` | Backup anterior criado; íntegro e sem tabelas |
| `npm.cmd run db:migrate` | Aplicadas versões 001 e 002; `currentVersion: 2`, saída 0 |
| `npm.cmd run db:seed` | Inseridos 3 eventos, 6 portões, 22 ingressos, 2 recebimentos e 2 validações, saída 0 |
| Segunda execução de `npm.cmd run db:migrate` | `applied: []`, versão 2; nenhuma reaplicação |
| Segunda execução de `npm.cmd run db:seed` | Zero inserções em todas as tabelas |
| SHA-256 dos registros antes/depois da repetição | Igual em todas as cinco tabelas e no histórico de migração |
| Comparação integral do banco local com os mocks | Igualdade de IDs, códigos, nomes, datas, locais, vínculos e estados iniciais |
| `PRAGMA foreign_key_check` | Nenhuma violação: `[]` |
| `PRAGMA integrity_check` | `ok` |
| Consulta de divergência entre utilizado e confirmação | **0** divergências |
| Inicialização real com banco migrado e porta dinâmica | `/health` respondeu HTTP **200**, `{"status":"ok","database":"ok"}` |
| Requisição `/eventos` nessa mesma execução | HTTP **404**; endpoint de negócio não implementado |
| Encerramento programático após verificação | Servidor e conexão fechados; nenhum processo de teste deixado aberto |
| Hash dos mocks ao final | Iguais aos hashes anteriores à implementação |
| Dependências do package.json versus lockfile | Iguais; nenhum pacote adicionado |
| `git check-ignore` para banco e backup | Ambos ignorados |

As duas falhas intermediárias ocorreram somente em **testes novos da Etapa 2**,
depois do pré-requisito aprovado. SQLite recusou as operações inválidas com a
mensagem correta de chave estrangeira, mas retornou `SQLITE_CONSTRAINT_TRIGGER`
nas ações RESTRICT em vez do código específico esperado pelos testes. As
asserções passaram a conferir a mensagem e a preservação dos dados. Nenhuma
restrição foi removida para fazer os testes passarem. Essas execuções foram em
bancos descartáveis; o banco de desenvolvimento só foi migrado após os 42 testes
passarem.

## Estado do banco entregue

| Tabela | Quantidade |
|---|---|
| `eventos` | 3 |
| `portoes` | 6 |
| `ingressos` | 22 |
| `recebimentos` | 2 |
| `validacoes` | 2 |
| `schema_migrations` (técnica) | 2 |

Ingressos utilizados: IDs **4 e 12**, exatamente como nos mocks. As confirmações
são sintéticas, identificadas por `seed:frontend:1838a5a`; horário de leitura
desconhecido é NULL. A data de carga não é apresentada como entrada física.

Digest lógico antes/depois da repetição dos comandos, incluindo PKs, horários e
histórico (não é hash do arquivo físico SQLite):

```text
9a17f23c061c4acfd2fa09fae4660b90f5845a83aada321349cdec53ac922fee
```

## Cobertura acrescentada

Foram acrescentados **26 testes**, somados aos 16 da fundação:

- migração repetível, checksum, compatibilidade LF/CRLF, versões inválidas,
  recusa de adoção silenciosa de tabelas e rollback de DDL/dados/histórico;
- unicidade global de código e da identidade do recibo, confirmação única por
  ingresso e por recibo, FKs e correspondência evento/portão/ingresso;
- rejeições que mencionam recursos inexistentes sem criar validação;
- estado utilizado controlado por confirmação e histórico imutável;
- rollback conjunto de recibo, confirmação e utilização;
- checks de campos obrigatórios, datas, JSON e status;
- fidelidade total aos mocks, repetição sem alterações, preservação de usos
  posteriores e rollback de seed com colisões;
- restrição do seed a development, migrações como pré-requisito e recusa em
  produção antes de criar o banco;
- persistência completa após reabertura e execução real da CLI.

Testes negativos usam identificadores inválidos apenas em operações que devem
falhar, em bancos descartáveis. Não foram introduzidos códigos/IDs alternativos
nos dados de desenvolvimento entregues.

## Pendências e limites

1. Disponibilizar a documentação backend atualizada original para conferência
   funcional futura. O PEI original também segue ausente; sua stack não é obrigatória.
2. Definir a canonicalização e validação de conteúdo para a sincronização futura.
   UNIQUE prepara a idempotência, mas não implementa reenvio nem autenticação.
3. A futura operação deve inserir recibo e validação na mesma transação e validar
   o JSON contra as entidades reais. A estrutura permite registrar rejeições de
   recursos inexistentes; não atribui confiança aos IDs enviados por clientes.
4. Decidir como registrar correções administrativas mantendo o histórico original.
   Não há rota de exclusão nem modelo de resolução de conflito nesta etapa.
5. Não foram feitas medições de carga, piloto offline ou validação de entrada física.
   O funcionamento da persistência central não comprova esses requisitos.

Para repetir a preparação em um banco novo de desenvolvimento:

```sh
npm run db:migrate
npm run db:seed
npm test
```

Para recuperação, preservar o estado atual antes de restaurar o backup; qualquer
restauração descartaria na cópia restaurada as alterações posteriores ao backup.
Não há comando destrutivo automático de rollback.

**Entrega concluída. Aguardar autorização de Gabriel para a Etapa 3.**
