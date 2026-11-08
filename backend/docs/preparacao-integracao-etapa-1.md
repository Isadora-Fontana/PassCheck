# PassCheck — Etapa 1: preparação do backend e banco

**Continuação em 30/10/2026:** login real, consultas e preparação do frontend
foram integrados após nova autorização. O estado atual, os testes e a configuração
de execução estão em [integração da etapa 1](../../docs/INTEGRACAO_ETAPA_1.md).
Este documento preserva o histórico da preparação realizada em 25/10.

**Data:** 25/10/2026, America/Sao_Paulo.  
**Base:** commit `1f478cf066cb49864064c13a3d470c6b3f719ef5`, branch `feat/backend-etapas-1-a-7`, incluindo o trabalho local preexistente da administração/Etapa 8.  
**Resultado atualizado:** preparação implementada e validada; após autorização explícita, o banco original recebeu as migrações 004–005, com novo backup consistente e preservação dos registros. Nenhuma conta foi criada. Veja a seção 11. Esta etapa de integração é distinta da numeração histórica de implementação do backend.

As evidências de banco intacto, checksums de arquivos e HTTP 503 nas seções 1–8 registram a preparação anterior à autorização. A seção 11 documenta a intervenção posterior e prevalece quanto ao estado atual do banco original.

## 1. Estado inicial e relação com a auditoria

A revisão incluiu configuração, conexão SQLite, migrações 001–005, middleware, rotas, serviços, repositórios, testes e os apontamentos da [auditoria de 25/10/2026](../../docs/AUDITORIA_TECNICA_SEGURANCA_PASSCHECK_2026-10-25.md).

| Item | Estado inicial |
|---|---|
| Backend | Express, Zod, better-sqlite3 e jose já implementados; sem necessidade de recriação |
| Banco de trabalho | `backend/data/passcheck.sqlite`, migrações 001–003 |
| Dados existentes | 3 eventos, 6 portões, 22 ingressos, 2 recebimentos, 2 validações, 0 divergências |
| Código de migrações | 004 de identidade e 005 de resoluções administrativas já existentes |
| Identidade no banco original | Sem tabelas de usuários, concessões e instalações |
| Configuração de segredo | `.env` ausente e `JWT_SECRET` ausente na sessão examinada |
| CORS padrão | Somente `localhost:5173` e `localhost:4173`, embora o preview estivesse em `127.0.0.1:4173` |
| Dependência vulnerável | `body-parser@2.3.0`, transitiva do Express `5.3.0` |
| Saúde da API | `/health` verificava somente `SELECT 1` |
| Frontend | API simulada, perfis demo, dados locais e scanner IndexedDB sem integração HTTP de negócio |

Tratamento dos apontamentos desta etapa:

- **AUD-001:** versão vulnerável corrigida e regressão de disponibilidade adicionada.
- **AUD-007:** verificação de prontidão implementada; migrações validadas em cópia. A ativação do banco original continua pendente por restrição expressa.
- **AUD-016:** CORS local corrigido com origens exatas.
- **AUD-011:** criado backup consistente e validado para esta intervenção. Não foi implantada rotina completa de backup externo/retenção.
- Demais achados da auditoria permanecem fora desta etapa, especialmente autenticação no frontend, envio da fila, descarte de pendências e simulação no scanner.

## 2. Backup e migrações em cópia isolada

### 2.1 Arquivos produzidos

Os caminhos abaixo são relativos à raiz do projeto e ficam ignorados pelo Git:

| Papel | Arquivo |
|---|---|
| Original, preservado | `backend/data/passcheck.sqlite` |
| Backup anterior às alterações | `backend/backups/pre-etapa1-integracao-20261025-d919fbf9.sqlite` |
| Cópia migrada para validação | `backend/backups/validacao-etapa1-integracao-20261025-d919fbf9.sqlite` |
| Log da suíte completa | `backend/backups/etapa1-integracao-testes-20261025.log` |

O backup foi produzido **antes de modificar código, dependências ou schema da cópia**, pela API nativa de backup do SQLite exposta em `sqlite3.Connection.backup` do Python. A conexão de origem foi aberta com URI `mode=ro` e `query_only=ON`. Não foi usada simples cópia do arquivo principal, que poderia desconsiderar transações no WAL.

Os nomes de destino foram reservados exclusivamente, sem sobrescrever arquivos existentes. Primeiro foi criada e conferida a cópia de segurança; depois, uma segunda cópia foi produzida pelo mesmo mecanismo e recebeu as migrações usando o executor Node já existente.

### 2.2 Resultado da validação

| Verificação | Resultado |
|---|---|
| Histórico inicial | 001, 002, 003 |
| Aplicação na cópia | 004_identidade_acesso.sql e 005_resolucoes_administrativas.sql |
| Histórico final da cópia | 001, 002, 003, 004, 005 |
| Histórico/checksums | Aceitos por `assertMigrationsCurrent`; linhas anteriores de histórico preservadas |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | Nenhuma violação |
| Registros anteriores | Comparação integral de todas as linhas das sete tabelas preexistentes aprovada |
| Reexecução do migrador | Nenhuma migração reaplicada; versão 5 |
| Novas tabelas | `usuarios`, `usuarios_eventos`, `usuarios_portoes`, `instalacoes`, `resolucoes_administrativas` |
| Registros nas novas tabelas | Zero em todas elas; nenhum administrador criado na cópia de validação |
| Banco original | Continua nas versões 001–003 |

Os testes usam outros bancos descartáveis para exercitar contas fictícias e endpoints de escrita. Isso não provisiona contas no original nem na cópia de validação preservada.

### 2.3 Verificação HTTP com as três bases em modo somente leitura

Aplicações de teste usaram cada arquivo com conexão somente leitura, `query_only=ON` e proteções SQLite ativadas na conexão:

| Base | GET /health | GET /ready | Histórico |
|---|---:|---:|---|
| Original | 200 | 503 | 001–003 |
| Backup | 200 | 503 | 001–003 |
| Cópia validada | 200 | 200 | 001–005 |

Isso confirma a diferença entre conexão viva e schema pronto. Essas instâncias de teste foram encerradas; não foi iniciado serviço público ou um backend persistente sobre o original.

### 2.4 Condições para aplicação no original

Antes de aplicar 004–005 ao original, era necessário obter autorização específica, confirmar o caminho de destino, verificar se surgiram novos registros e produzir um backup consistente atualizado. Essas condições foram atendidas na intervenção registrada na seção 11.

As migrações são transacionais e o executor já verifica integridade referencial e histórico. Em caso de falha durante o lote, a transação é revertida. Após um lote confirmado, retirar código não desfaz a migração. Restaurar um backup exige interromper acessos, preservar o estado atual e tratar os dados posteriores ao backup; não se deve sobrescrever automaticamente a base.

## 3. Arquivos modificados nesta etapa

| Arquivo | Alteração |
|---|---|
| `backend/package-lock.json` | Somente a entrada de `body-parser` mudou de 2.3.0 para 2.4.0, incluindo metadados exigidos pela nova versão |
| `backend/src/config.js` | Acrescenta as origens exatas por `127.0.0.1` nas portas 5173 e 4173 |
| `backend/.env.example` | Alinha o exemplo às quatro origens locais |
| `backend/src/db/readiness.js` | Novo verificador de prontidão, somente leitura |
| `backend/src/routes/health.js` | Adiciona `/ready`, preservando `/health` |
| `backend/tests/config.test.js` | Atualiza a expectativa de origens locais |
| `backend/tests/readiness.test.js` | Testa ausência de migrações, schema incompatível, checksums, preservação e CORS |
| `backend/tests/body-parser-security.test.js` | Regressão do advisory em processo descartável e banco em memória |
| `backend/README.md` | Documenta prontidão, CORS e a autorização pendente para o original |
| `backend/docs/preparacao-integracao-etapa-1.md` | Este relatório e a proposta de integração |

As alterações locais anteriores foram preservadas. `package.json`, os cinco arquivos SQL de migração, as rotas e serviços de negócio e todos os arquivos do frontend permanecem sem alteração por esta etapa. Não houve commit, push ou merge.

## 4. Ajustes de segurança e prontidão

### 4.1 Correção de GHSA-27r3-jxmh-p828

A fonte oficial informa que a linha 2.x está corrigida em `body-parser 2.4.0`. O Express instalado declara `^2.3.0`, que admite essa versão. O pacote corrigido requer Node >=18, compatível com o Node 24.14.0 do projeto.

Foi utilizado:

```powershell
# Executado em backend/, após o backup.
npm.cmd update body-parser --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000
```

O npm informou **um pacote alterado**. Não houve alteração das dependências diretas, `npm audit fix --force` ou execução de scripts de instalação. A nova entrada exige faixas mais recentes de `content-type`, `iconv-lite` e `qs`, já satisfeitas pelas versões presentes; nenhum outro pacote precisou mudar.

Foi preservada a aceitação de JSON comprimido para não modificar esse comportamento de transporte desnecessariamente. O teste de regressão envia gzip válido e gzip com bytes adicionais a um **processo descartável**, verifica que há resposta e confirma que `/health` ainda responde depois. Uma exceção não capturada faz o processo filho falhar e reprova o teste, sem atingir a API de trabalho.

A consulta `npm audit --json --package-lock-only --ignore-scripts` retornou **zero vulnerabilidades reportadas** para as 91 dependências registradas do backend. Isso é o resultado do catálogo na data, não garantia de ausência de falhas desconhecidas. [Advisory oficial do mantenedor](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).

### 4.2 Novo GET /ready

`/health` mantém integralmente seu contrato: `200 {"status":"ok","database":"ok"}` após `SELECT 1`; falhas continuam no tratamento existente.

`/ready` é um endpoint adicional, público, sujeito ao mesmo CORS e `Cache-Control: no-store`:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store

{"status":"ready","database":"ok"}
```

Quando não há prontidão:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
Retry-After: 5

{"status":"not_ready"}
```

O verificador confere:

1. `foreign_keys` e `recursive_triggers` ativos na conexão.
2. Histórico completo e consecutivo, nomes e checksums de todas as migrações disponíveis.
3. Existência das tabelas obrigatórias como tabelas STRICT e presença das colunas exigidas pela API.
4. Presença dos índices e triggers requeridos para o modelo atual.

As consultas de histórico/schema usam uma transação de leitura, sem mudar dados. Falhas de banco, arquivos de migração ou estrutura produzem 503 sem expor caminhos, SQL, checksums ou detalhes internos. Não há cache de resultado positivo que esconda alterações posteriores.

**Limites:** trata-se de prontidão estrutural, não de ensaio de escrita ou auditoria completa de DDL. Ela não atesta espaço livre, backup, configuração de contas, equivalência textual de cada constraint/trigger ou integridade de todas as linhas. A checagem de colunas exige presença; não reconstrói toda a definição de tipos/defaults/constraints. As verificações extensivas de integridade pertencem ao procedimento de migração/backup e aos testes.

O monitor ou processo de ativação deve usar `/ready` para liberar tráfego de negócio. Não foi adicionado middleware global que troque respostas 401/403 ou outros contratos existentes por 503. O processo pode manter `/health` disponível para diagnóstico enquanto `/ready` sinaliza indisponibilidade. Nenhum migrador é chamado durante inicialização ou requisição de prontidão.

## 5. Autenticação e configuração preparadas

| Variável | Valor/política de desenvolvimento | Cuidados |
|---|---|---|
| `NODE_ENV` | `development` | `production` exige lista explícita de CORS |
| `HOST` | `127.0.0.1` | Não foi habilitado `0.0.0.0`, túnel ou acesso público |
| `PORT` | `3000` | Escolher outra somente se necessário e alinhar a URL do cliente |
| `DATABASE_PATH` | `./data/passcheck.sqlite` | Relativo a `backend/`; confirmar destino antes de comandos de escrita |
| `JWT_SECRET` | Sem padrão; 32–64 bytes aleatórios em base64url canônico | Guardar de forma protegida e reutilizar; não expor ao frontend |
| `JWT_TTL_SECONDS` | `900` | Faixa aceita: 60–3600; sem refresh endpoint nesta versão |
| `CORS_ORIGINS` | Quatro origens HTTP exatas abaixo | Sem wildcard, caminho, barra final ou origem `null` |

```text
http://localhost:5173
http://localhost:4173
http://127.0.0.1:5173
http://127.0.0.1:4173
```

O arquivo `.env` continua opcional: a configuração pode vir do ambiente do processo. A chave é obrigatória. **Não foi criado `.env`, emitida chave operacional ou substituído segredo nesta etapa.** As chaves dos testes são aleatórias, efêmeras e não são impressas.

Para uma primeira configuração futura, gerar a chave sem eco e guardá-la em mecanismo protegido fora do Git. O comando abaixo atribui o resultado à sessão; não imprime a chave no terminal:

```powershell
# Somente para configuração inicial, após verificar que não existe chave em uso.
# Não repetir a geração a cada inicialização.
if (Test-Path Env:JWT_SECRET) { throw 'Já existe JWT_SECRET nesta sessão; preserve a chave vigente.' }
$env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Antes desse procedimento, conferir também se existe `.env` ou segredo no mecanismo de implantação; a presença somente no arquivo não é detectada pelo teste de variável da sessão. A variável em memória será perdida ao fechar o terminal: definir armazenamento protegido e recuperação antes de emitir tokens operacionais. Nunca colocar a chave em variável `VITE_*`, commit, log ou parâmetro de linha de comando. Se utilizar `.env`, manter arquivo ignorado pelo Git e restringir seu acesso local.

### 5.1 Primeiro administrador: procedimento para execução futura

**Não executado no original nesta etapa.** Pré-condições:

1. Autorização específica para migração do original e para provisionamento.
2. Backup consistente atualizado e migrações 001–005 aplicadas no destino confirmado.
3. Chave JWT estável configurada e verificações de prontidão aprovadas.
4. Operador responsável em terminal local confiável, sem transcrição de dados sensíveis.

Usar o comando existente `auth:bootstrap`: ele recebe JSON por stdin, valida os campos, usa scrypt e recusa a criação se já houver administrador, inclusive inativo. Não redefine conta ou senha. O login deve ter 3–64 caracteres ASCII no formato aceito; a senha, 12–128 caracteres, no máximo 512 bytes UTF-8, escolhida pelo responsável.

Exemplo controlado, executado em `backend/` somente após essas pré-condições:

```powershell
$usuarioInicial = Read-Host 'Login do primeiro administrador'
$senhaSegura = Read-Host 'Senha do primeiro administrador' -AsSecureString
$ponteiroSenha = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSegura)
$codificacaoAnterior = $OutputEncoding
$OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  $senhaInicial = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroSenha)
  @{ usuario = $usuarioInicial; senha = $senhaInicial } |
    ConvertTo-Json -Compress | node src/auth-cli.js bootstrap
  if ($LASTEXITCODE -ne 0) { throw 'Provisionamento recusado; não repetir sem verificar o motivo e o destino.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroSenha)
  $OutputEncoding = $codificacaoAnterior
  $senhaInicial = $null
  $senhaSegura.Dispose()
}
```

A senha existe transitoriamente na memória para envio ao processo, mas não é colocada no histórico como literal nem em argumentos do comando. A saída bem-sucedida contém somente ID, usuário e papel. Não incluir credenciais reais em documentação ou testes. Após provisionar, validar login e `/auth/me` sem imprimir o token.

## 6. Endpoints e contratos preparados para integração

As rotas abreviadas com `//` no pedido correspondem aos parâmetros nomeados abaixo. Não foram criadas rotas com segmentos vazios nem alterados os contratos existentes.

| Endpoint | Entrada e autenticação | Saída/comportamento existente |
|---|---|---|
| `POST /auth/login` | JSON `{usuario, senha}` | 200 `{accessToken, tokenType, expiresIn, usuario}`; credenciais inválidas 401; limite 429 |
| `GET /auth/me` | `Authorization: Bearer <token>` | Identidade, `acessoGlobal` e eventos com `portoesSincronizacao` |
| `POST /auth/logout` | Bearer | 204 sem JSON; revoga todos os tokens do usuário |
| `POST /auth/instalacoes` | Bearer; JSON `{dispositivo}` | `{dispositivo}`; exige propriedade e instalação ativa |
| `GET /eventos` | Bearer | Array direto dos eventos permitidos |
| `GET /eventos/:eventoId/portoes` | Bearer e concessão ao evento | Array direto de portões |
| `GET /eventos/:eventoId/portoes/:portaoId/ingressos` | Bearer e concessão ao evento | Array direto; `utilizado` booleano |
| `GET /eventos/:eventoId/resumo` | Bearer e concessão ao evento | `{evento, totalIngressos, entradas, restantes, portoes}` |
| `POST /sincronizacao` | Bearer, evento/portão permitido e instalação própria | `{resultados}` por item; até 100 itens e corpo de 100 KB |
| `GET /health` | Público | Contrato anterior preservado |
| `GET /ready` | Público | Novo sinal estrutural 200/503 |

Na sincronização, o lote tem `{eventoId, portaoId, dispositivo, validacoes}`; cada item tem `{idLocal, ingressoId, codigo, dataHora}`. `idLocal` é string decimal positiva e estável. Não enviar o objeto atual do IndexedDB sem adaptação: ele tem outros campos e o schema da API rejeita extras. Registrar a instalação no servidor antes do primeiro envio.

Resultados de item incluem `CONFIRMADA`, `JA_PROCESSADA`, `CONFLITO` e `REJEITADA`. Um HTTP 200 não implica que todo item foi confirmado. Em falha técnica no meio de um lote, commits anteriores podem existir; reenvio deve preservar a mesma chave e o mesmo conteúdo.

401 e 403 são falhas de identidade/permissão, não justificam limpar armazenamento. Ausência de `Origin` não dispensa Bearer. CORS permite cabeçalhos Content-Type/Authorization e métodos GET/POST/PATCH, sem credenciais de cookies.

## 7. Mapeamento do frontend e proposta HTTP

**Somente proposta nesta etapa. Nenhum arquivo do frontend ou schema do IndexedDB foi modificado.**

### 7.1 Funções existentes e destinos

| Função/fluxo atual | Origem atual | Destino real/proposta |
|---|---|---|
| `api.buscarEventos()` / `demo.listarEventos()` | Eventos em localStorage, inicialmente mocks | `GET /eventos` |
| `api.buscarPortoes(eventoId)` / `demo.listarPortoesDoEvento(eventoId)` | Portões demo | `GET /eventos/:eventoId/portoes` |
| `api.buscarIngressos(eventoId, portaoId)` | `ingressosMock` | `GET /eventos/:eventoId/portoes/:portaoId/ingressos` |
| `demo.obterEvento(eventoId)` | Busca local | Filtrar o array autorizado de `GET /eventos`; não existe GET individual de evento nessa versão |
| `perfilDemo.entrarComo(perfil)` | Gravação de perfil em sessionStorage | `POST /auth/login`, seguido de `GET /auth/me`; perfil deve derivar da identidade real |
| `obterPerfil()` / `exigirPerfil()` / `irParaInicioDoPerfil()` | Perfil selecionável | Estado de autenticação derivado de `/auth/me`; autorização final permanece na API |
| `perfilDemo.sair()` | Remove somente seleção demo | `POST /auth/logout` quando online; descartar token de memória sem apagar filas; definir política de saída offline |
| `demo.criarEvento({nome,data,local,nomesPortoes})` | Uma escrita local de evento e portões | `POST /eventos`, depois `POST /eventos/:eventoId/portoes` por portão |
| `demo.listarEventosDoOperador()` | Solicitações aprovadas/pendentes/rejeitadas | Eventos autorizados via `GET /eventos` e `/auth/me`; estados de solicitação não têm endpoint equivalente |
| `demo.obterAtribuicao()` | Solicitação demo aprovada | Concessões de `/auth/me` + nomes via GET de portões; servidor pode conceder mais de um portão |
| `gerarCodigoEvento()` e `solicitarAcesso()` | Código/solicitações locais | Sem endpoint/modelo equivalente: exige decisão de contrato futura |
| `listarSolicitacoes()`, `contarSolicitacoesPendentes()`, `aprovarSolicitacao()`, `rejeitarSolicitacao()`, `alterarPortaoAtribuido()` | localStorage | Sem API equivalente de gestão de solicitações nesta versão |
| Dashboard com placeholders | Sem consulta | `GET /eventos/:eventoId/resumo` |
| `db.obterIdDispositivo()` | ID persistido no IndexedDB | Reutilizar identidade estável, coordenando registro via `POST /auth/instalacoes`; função não é exportada hoje |
| `db.validarIngresso()` / `registrarValidacao()` | Transação local | Permanecem locais; envio posterior por adaptador de `POST /sincronizacao` |
| `db.salvarPreparacao()` / `obterOperacao()` / contagens | IndexedDB | Preservar responsabilidade local; etapa futura troca a fonte do download sem limpar filas |
| Seleção de evento/portão | sessionStorage | Estado de navegação local, sem endpoint próprio |

`GET /eventos/:eventoId/pendencias` trata conflitos/rejeições de **sincronização**, não pedidos de acesso de operadores. Não deve ser usado como substituto de `listarSolicitacoes()`.

O `GESTOR` demo não corresponde automaticamente ao `ADMINISTRADOR`: administrador tem acesso global. Essa decisão de autorização precisa ser explícita antes de integrar as telas de gestão. A criação atual via várias chamadas também não é atômica entre evento e portões; o cliente deve reconhecer e recuperar criação parcial, sem tentar apagar o evento automaticamente ou repetir POSTs cegamente.

### 7.2 Camada HTTP centralizada proposta

Criar em etapa futura um módulo pequeno, por exemplo `frontend/src/http.js`, consumido por `api.js` e por um serviço de autenticação. Responsabilidades propostas:

1. URL base explícita, por exemplo `VITE_API_URL=http://127.0.0.1:3000`; não é segredo. HTTPS na hospedagem externa, sem URL fornecida arbitrariamente pelo usuário.
2. Uma função `requisitar(caminho, {method, body, autenticado, signal})` com caminhos relativos validados contra a base conhecida. Não anexar Bearer a URL externa.
3. `Accept: application/json`, `Content-Type: application/json` somente quando houver corpo JSON; `Authorization` apenas para requisição autenticada.
4. Usar `credentials: 'omit'`, pois a API usa Bearer e não cookie. Token somente em memória nesta primeira integração; não persistir senha ou JWT em localStorage/IndexedDB. Recarregar a página exige nova autenticação online, sem apagar dados operacionais.
5. Tratar 204 sem tentar ler JSON; validar formato das respostas essenciais antes de atualizar estado. Mensagens de erro sempre renderizadas como texto.
6. Erros tipados por categoria: rede/timeout, HTTP, sessão, permissão, limite, contrato inesperado e resultado por item. Não registrar corpo de login, token ou QR completo.
7. Timeout com AbortController e cancelamento ao abandonar a tela. Um timeout de escrita não comprova que o servidor não gravou.
8. 401 solicita nova autenticação; 403 indica permissão negada; 429/503 preservam dados e respeitam `Retry-After` quando disponível. Falha CORS pode aparecer como erro de rede no navegador, sem código HTTP acessível.
9. Sem repetição automática de POST/PATCH de negócio em geral. Sincronização pode repetir somente com a mesma instalação, IDs locais e conteúdo, conforme contrato idempotente.
10. Manter scanner e fila independentes de `navigator.onLine`; esse indicador não confirma alcance real da API. Ausência de rede não autoriza apagar ou substituir a operação.

**Detalhe de CORS a decidir na implementação:** `Retry-After` não é cabeçalho de resposta exposto automaticamente ao JavaScript entre origens, e o CORS atual não define `exposedHeaders`. Quando o cliente for implementado, propor a exposição explícita apenas desse cabeçalho ou usar espera conservadora. Não foi modificado esse contrato de transporte adicional nesta etapa.

Não implementar renovação silenciosa com senha armazenada: não existe endpoint de refresh. A política de renovação/offline e de associação de usuário à operação precisa preservar a fila e impedir que a troca de usuário adote pendências alheias. Essa associação exige desenho próprio; não alterar IndexedDB implicitamente ao introduzir login.

## 8. Resultado dos testes

### 8.1 Verificação focada

```powershell
node --test --test-concurrency=1 tests/readiness.test.js tests/config.test.js tests/body-parser-security.test.js
```

**12 testes aprovados, zero falhas**, aproximadamente 1,9 segundo. Casos novos: prontidão vazia/antiga/atualizada, histórico divergente, versão futura, coluna/tabela/índice/trigger ausente, conexão fechada, proteções desligadas, CORS local e regressão do gzip.

### 8.2 Suíte completa

```powershell
npm.cmd test -- --test-concurrency=1 --test-reporter=tap
```

**160 testes aprovados, zero falhas, zero ignorados**, aproximadamente **38,3 segundos**. O log foi preservado no caminho da seção 2.1. A suíte usa bancos em memória e diretórios temporários próprios; não aplica suas cargas ou mudanças no banco de trabalho.

Os testes incluem autenticação, claims/assinatura/expiração JWT, revogação, instalação, autorização de evento/portão, leitura, resumo, sincronização, idempotência, concorrência, administração, CSV, migrações e integridade. Os contratos de sucesso e erro existentes continuaram passando. Não foram encontradas falhas que exigissem reescrever funcionalidades já implementadas.

### 8.3 Verificação de preservação e limites

Comparações do backup e da cópia aprovaram preservação integral dos registros anteriores, inclusive histórico 001–003. Nenhuma migração SQL original foi editada. Os arquivos do frontend e seus lockfiles permanecem inalterados; não houve build novo, limpeza de armazenamento ou teste contra o perfil real do navegador.

A comparação SHA-256 dos arquivos preexistentes confirmou que o arquivo original
`backend/data/passcheck.sqlite`, seus auxiliares existentes, os backups antigos e
todos os arquivos do frontend permanecem byte a byte iguais ao início desta etapa.
Somente os seis arquivos preexistentes indicados na seção 3 foram modificados;
os demais itens dessa seção são arquivos novos. As cópias novas podem ter arquivos
auxiliares `-wal`/`-shm` criados pelo SQLite, também ignorados pelo Git.

O sucesso desta etapa não comprova integração de login no navegador, scanner com API ou sincronização real da PWA. Esses fluxos ainda usam demonstração/mocks e não foram substituídos.

## 9. Pendências que exigem autorização ou decisão

1. **Concluído após autorização: aplicar 004–005 no banco original.** Backup atualizado, validação isolada e conferência dos registros documentados na seção 11.
2. **Configurar o segredo operacional estável e criar o primeiro administrador** no destino aprovado. Nenhuma credencial fixa foi introduzida.
3. **Iniciar a API de trabalho**, após configuração e prontidão, em loopback; exposição pública continua fora de escopo.
4. **Iniciar a Etapa 2**, com autorização para integrar login e estado de sessão do frontend.
5. Definir gestor por evento versus administrador global e o destino do fluxo demonstrativo de convites/solicitações, antes de integrar essas telas.
6. Definir identidade da operação offline, renovação de sessão e tratamento de pendências ao sair/trocar usuário, sem apagar dados existentes.

## 10. Próximo passo recomendado: login real

Após autorização para ativar o banco e provisionar a conta, integrar somente o fluxo de login: formulário de credenciais → `POST /auth/login` → token em memória → `GET /auth/me` → navegação conforme identidade e concessões reais. Exercitar credencial incorreta, limite, indisponibilidade, expiração e logout 204 com uma conta de teste autorizada.

Preservar o modo de demonstração de forma explícita até definir a transição. Não usar o token para atribuir automaticamente a um novo usuário a operação já salva no dispositivo. Não alterar scanner, schema do IndexedDB ou filas como efeito colateral desse passo.

**A Etapa 2 não foi iniciada.**

## 11. Aplicação autorizada no banco original — 25/10/2026

O usuário respondeu **“Sim, autorizo as migrações no original”** à solicitação que identificava `backend/data/passcheck.sqlite`, exigia novo backup consistente e explicava a restauração controlada em caso de reversão. A autorização não incluiu criação de contas.

### 11.1 Backup e validação antes da alteração

Novo backup criado às **13:42:10, America/Sao_Paulo**, usando `sqlite3.Connection.backup`, com origem aberta em `mode=ro` e `query_only=ON`. Os destinos foram reservados exclusivamente, sem sobrescrever backups anteriores. Outra cópia consistente foi criada a partir desse backup e recebeu primeiro as migrações.

Arquivos relativos à raiz do projeto, ignorados pelo Git:

| Evidência | Arquivo |
|---|---|
| Backup imediatamente anterior | `backend/backups/pre-migracao-original-20261025-134210-473aa75b.sqlite` |
| Manifesto com contagens e SHA-256 das linhas por tabela | `backend/backups/pre-migracao-original-20261025-134210-473aa75b.json` |
| Cópia isolada migrada | `backend/backups/validacao-migracao-original-20261025-134210-473aa75b.sqlite` |
| Resultado da cópia | `backend/backups/resultado-migracao-original-20261025-134210-473aa75b-validation.json` |
| Resultado do original | `backend/backups/resultado-migracao-original-20261025-134210-473aa75b-source.json` |
| Verificação HTTP do original | `backend/backups/http-migracao-original-20261025-134210-473aa75b.json` |

### 11.2 Execução e preservação

Foi utilizado o executor existente `migrate(database)`, sem editar SQL ou executar seed. A chamada ficou dentro de uma transação externa `BEGIN IMMEDIATE`, que também verificou os dados antes e depois da migração. Antes de alterar o schema, todas as linhas existentes foram comparadas integralmente com o backup; divergência teria interrompido a operação. A verificação de preservação, integridade e prontidão ocorreu antes do commit externo.

As migrações **004_identidade_acesso.sql** e **005_resolucoes_administrativas.sql** foram confirmadas no original às **13:42:35, America/Sao_Paulo**. Resultado, tanto na cópia quanto no original:

| Verificação | Resultado |
|---|---|
| Histórico final | 001–005; nomes e checksums aceitos pelo executor |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | Zero violações |
| Linhas anteriores das sete tabelas | Preservadas integralmente, inclusive histórico 001–003 |
| Eventos / portões / ingressos | 3 / 6 / 22, sem alteração |
| Recebimentos / validações / divergências | 2 / 2 / 0, sem alteração |
| Usuários / concessões de eventos / concessões de portões | 0 / 0 / 0 |
| Instalações / resoluções administrativas | 0 / 0 |
| Reexecução explícita do migrador | `applied: []`, `currentVersion: 5` |

O arquivo do banco original e seus auxiliares SQLite podem mudar como consequência desta migração autorizada. Os backups anteriores foram mantidos; nenhum registro foi apagado.

### 11.3 Validação posterior e estado operacional

Uma instância HTTP temporária, vinculada somente a `127.0.0.1` em porta efêmera, usou o banco original **somente para leitura** e uma chave JWT aleatória mantida em memória. A instância foi encerrada após as verificações; essa chave não configura o serviço de trabalho.

| Requisição | Resultado |
|---|---|
| `GET /health` | 200, `status: ok` |
| `GET /ready` | 200, `status: ready` |
| `GET /auth/me`, sem token | 401, `NAO_AUTENTICADO` |
| `GET /eventos`, sem token | 401, `NAO_AUTENTICADO` |
| Origem `http://127.0.0.1:4173` nas quatro requisições | Cabeçalho CORS com essa origem exata |

Também foram executados novamente:

```powershell
cd backend
node --test --test-concurrency=1 tests/migrations.test.js tests/readiness.test.js
```

**14 testes aprovados, zero falhas**, aproximadamente 1 segundo. Os 160 testes da suíte completa relatados na seção 8 pertencem à preparação anterior; não foi necessária nova execução integral, pois esta intervenção não alterou código ou dependências.

Além do banco e dos novos artefatos de backup/evidência, apenas este relatório e `backend/README.md` foram atualizados nesta continuação. Não houve criação de conta, configuração de segredo operacional, alteração de frontend/IndexedDB, commit, push, merge ou exposição pública da API.

O schema está pronto. Continuam pendentes a configuração operacional, o provisionamento seguro do primeiro administrador e a integração do login. **A Etapa 2 permanece não iniciada.** Para reverter a migração confirmada, preservar primeiro o estado atual, interromper acessos em uma janela autorizada e restaurar o backup por procedimento controlado, reconciliando eventuais registros posteriores; não sobrescrever automaticamente o banco ou seus arquivos WAL/SHM.
