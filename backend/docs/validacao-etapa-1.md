# Relatório de entrega e validação — Etapa 1

Data de referência do usuário: **16/10/2026**, America/Sao_Paulo.
Resultado: fundação implementada e validada localmente. Etapa 2 não iniciada.

## Ambiente e autorização

- Stack aprovada expressamente por Gabriel; decisão em `decisoes.md`.
- Windows/PowerShell, Node **24.14.0**, npm **11.9.0**.
- Express **5.3.0**, better-sqlite3 **13.0.3**, Zod **4.6.7**, cors **2.8.6**,
  Supertest **7.3.1**. SQLite fornecido pelo driver: **3.53.4**.
- HEAD preservado: `1838a5a64d899b99a0d975cbf3887e13eac5dd10`.

## Arquivos criados

Todos os caminhos abaixo são relativos a `backend/`:

```text
.env.example
.gitignore
package.json
package-lock.json
README.md
src/app.js
src/server.js
src/config.js
src/db/connection.js
src/db/migrations/README.md
src/routes/health.js
src/middleware/cors.js
src/middleware/errors.js
src/services/.gitkeep
src/repositories/.gitkeep
tests/app.test.js
tests/config.test.js
tests/database.test.js
tests/server.test.js
docs/decisoes.md
docs/validacao-etapa-1.md
```

Gerados localmente e ignorados pelo Git: `node_modules/`, `.npm-cache/` e
`data/passcheck.sqlite` (e auxiliares SQLite quando aplicáveis). O banco foi
criado para verificar a execução normal e permanece sem tabelas de negócio.
Não foi criado `.env` com credenciais.

Preservados: `backend/.gitkeep`, frontend inteiro, arquivos da raiz e os planos
Markdown/DOCX preexistentes em `PassCheck/docs/`. Nenhum arquivo rastreado mudou.
Os novos arquivos desta entrega permanecem não rastreados, pois não houve commit
nem preparação do índice Git.

## Comandos e resultados reais

Comandos npm executados em `PassCheck/backend/`; `npm.cmd` evita o bloqueio do
`npm.ps1` no PowerShell deste ambiente.

| Comando/procedimento | Resultado |
|---|---|
| `git --no-optional-locks status --short`, `rg --files`, `Get-ChildItem`, `Get-Content` | Estado e orientações locais conferidos; backend continha apenas `.gitkeep` |
| `node --version`, `npm.cmd --version` | 24.14.0 e 11.9.0 |
| `npm.cmd view <pacote> version` (e `engines` para o driver) | Versões consultadas no registro, sem depender de suposição |
| `npm.cmd install --cache .npm-cache --fetch-retries=0 --fetch-timeout=30000 --no-fund` | Saída 0; 90 pacotes adicionados, 91 auditados; npm informou 0 vulnerabilidades naquele momento |
| `npm.cmd test` | Saída 0; **16 testes, 16 aprovados, 0 falhas, 0 ignorados**, duração informada 1023,0953 ms |
| `npm.cmd run dev` | Executou `node --watch src/server.js`; informou URL local sem erro de inicialização |
| `Invoke-WebRequest http://127.0.0.1:3000/health -UseBasicParsing` com dev ativo | HTTP **200**, `{"status":"ok","database":"ok"}`, `Cache-Control: no-store` |
| `npm.cmd start` após encerrar dev | Executou `node src/server.js`; informou URL local sem erro de inicialização |
| Mesma requisição HTTP com start ativo | HTTP **200**, mesmo JSON e política de cache |
| Requisição real com `Origin: http://localhost:5173` | HTTP **200**, `Access-Control-Allow-Origin: http://localhost:5173` |
| `npm.cmd ls --depth=0` | As cinco dependências nas versões declaradas, sem erro |
| Consulta SQLite em modo `readonly` | Versão 3.53.4, `journal_mode=wal`, lista de tabelas vazia |
| `git diff --exit-code HEAD` | Saída 0; nenhum arquivo rastreado alterado |
| `git check-ignore --no-index` para banco, WAL, cache, módulos e `.env` | Todos os artefatos locais consultados são ignorados |
| `git check-ignore --no-index -- .env.example` | Saída 1 esperada: exemplo não ignorado, pode ser versionado |
| Sondagem TCP após encerramento dos processos | `ECONNREFUSED` em 127.0.0.1:3000; nenhum servidor de teste ficou escutando |

O resultado do audit npm é uma consulta pontual ao registro, não certificação
completa de segurança do projeto.

## Testes executados

1. Health 200 com SQLite real, JSON esperado e cache desabilitado.
2. Ausência dos endpoints de negócio e resposta 404 padronizada.
3. Origem permitida e preflight restrito a GET.
4. Rejeição de origens diferentes, similares e `null`, incluindo preflight.
5. JSON inválido retorna 400 sem ecoar o conteúdo.
6. Corpo maior que 100 KB retorna 413.
7. Banco fechado causa 500 genérico, sem falso positivo de health.
8. Padrões de configuração e resolução do caminho do banco.
9. Conversão da porta e normalização de origens.
10. Rejeição de configuração inválida sem exposição dos valores.
11. Origem explícita obrigatória em produção.
12. Chaves estrangeiras habilitadas e vínculo inválido rejeitado.
13. WAL e persistência após reabertura de banco temporário.
14. Inicialização em porta livre, requisição HTTP e fechamento dos recursos.
15. Porta ocupada rejeita o segundo servidor e preserva o primeiro.
16. Processo com ambiente inválido encerra com código 1 antes de iniciar.

Não foram executados testes de endpoints de negócio, autenticação, integração
com frontend, câmera, navegador offline, carga ou hospedagem, pois não pertencem
a esta fundação. Não foi verificado o reinício automático após edição em modo
watch; o comando dev foi validado por inicialização e requisição HTTP real.

## Intercorrências da execução

- As consultas npm inicialmente falharam com `EACCES` devido à rede restrita do
  sandbox. Foram repetidas com a permissão de execução necessária; a instalação
  local terminou com sucesso. Nenhuma dependência global foi instalada.
- `Ctrl+C` enviado ao terminal de teste não encerrou o watcher. Duas tentativas
  de `npm start` enquanto o dev ainda ocupava a porta retornaram código 1 e
  `Falha ao iniciar a API. Porta já está em uso. Verifique PORT.`
- A inspeção de processos via CIM precisou de execução fora do sandbox.
  `Stop-Process` falhou no ambiente; a chamada de encerramento do watcher pela
  API de processos liberou a porta. A tentativa subsequente de encerrar seu filho
  reportou acesso negado, mas a nova inicialização e a sondagem final comprovaram
  a liberação. O servidor de `npm start` foi encerrado ao final com `taskkill`
  direcionado exclusivamente ao PID identificado como pertencente ao teste.
- Essas ocorrências foram operacionais do terminal de validação. As execuções
  válidas de dev/start não apresentaram erro de inicialização. O fechamento
  programático do servidor e do banco foi aprovado pelo teste automatizado;
  encerramento gracioso por Ctrl+C neste terminal não foi demonstrado.

## Pendências e próxima etapa

- Migrações: somente estrutura e orientação, conforme pedido de preparação para
  migrações futuras; ainda não há modelo, seeds ou comando de migração.
- Os dois documentos originais ausentes devem ser disponibilizados para a revisão
  funcional seguinte. O plano disponível foi preservado; suas propostas de
  sincronização não foram transformadas silenciosamente em contrato aprovado.
- Autenticação, autorização, modelo de dados e endpoints de negócio continuam
  fora desta entrega. CORS não substitui os controles de acesso futuros.
- A API local não foi publicada. Todos os processos usados na validação foram
  encerrados; iniciar novamente com `npm.cmd start` ou `npm.cmd run dev`.

**Aguardar autorização de Gabriel para iniciar a Etapa 2.**
