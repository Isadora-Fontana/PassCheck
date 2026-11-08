# Auditoria técnica e de segurança — PassCheck

**Data:** 25/10/2026 — America/Sao_Paulo  
**Escopo:** frontend, backend, persistência no navegador, SQLite, dependências, configurações, Git, backups e evidências operacionais disponíveis neste diretório.  
**Diretório:** `C:\Users\gabri\Desktop\Integrador 2026.2\PassCheck`  
**Branch:** `feat/backend-etapas-1-a-7`  
**HEAD:** `1f478cf066cb49864064c13a3d470c6b3f719ef5`  
**Estado analisado:** HEAD **mais as alterações locais existentes**, incluindo os arquivos ainda não versionados da administração/Etapa 8. Este relatório não representa apenas a versão publicada na `main`.

## 1. Parecer executivo

O projeto tem uma base de backend com controles relevantes de segurança e integridade, mas **a aplicação completa ainda não está pronta para controlar entradas em um evento real**. O frontend opera como demonstração independente, sem autenticação real e sem enviar suas validações ao backend. O banco local também não está atualizado para todas as funções presentes no código.

A prioridade de segurança mais imediata é uma dependência vulnerável: **`body-parser@2.3.0`**, utilizada pelo Express, tem aviso público de negação de serviço classificado como HIGH. O código habilita o processamento de JSON comprimido antes de algumas decisões de rota, tornando o aviso pertinente à implementação. A exploração que derruba o processo não foi executada.

Os outros bloqueadores principais são a ausência de sincronização no frontend, o descarte autorizado pela interface de validações ainda pendentes, a escolha livre de perfil na demonstração e os botões que exibem um resultado de ingresso válido sem validação. Essas características estão visíveis ou documentadas como protótipo; sua classificação considera o impacto de usar essa versão como controle de acesso real.

O SQLite existente apresentou **integridade válida, nenhuma violação de chave estrangeira e nenhuma divergência entre ingressos utilizados e confirmações**. Foram executados **76 testes do backend, com 76 aprovações e nenhuma falha**. Isso demonstra controles cobertos por esses testes; não comprova integração ponta a ponta, proteção contra todos os ataques ou funcionamento offline em dispositivos reais.

### 1.1 Distribuição dos achados

| Severidade | Quantidade | Interpretação |
|---|---:|---|
| CRITICAL | 0 | Nenhum achado crítico comprovado no escopo examinado. |
| HIGH | 5 | Dependência vulnerável e bloqueadores de integridade/autorização para operação real. |
| MEDIUM | 6 | Concorrência, disponibilidade, monitoramento, abuso de recursos e recuperação. |
| LOW | 5 | Restrições de configuração, renderização, defesa do navegador e automação. |
| **Total** | **16** | Não são 16 vulnerabilidades remotamente exploráveis comprovadas. |

**Critério:** HIGH indica impacto expressivo plausível na disponibilidade, autorização ou registro de entradas. MEDIUM indica risco relevante com condições adicionais ou alcance limitado. LOW indica defesa adicional, exposição restrita ou lacuna de garantia. A gravidade é separada da confiança da evidência e das condições de exploração.

### 1.2 Índice de achados

| ID | Severidade | Título | Natureza da evidência |
|---|---|---|---|
| [AUD-001](#aud-001--body-parser-vulnerável-a-negação-de-serviço) | HIGH | `body-parser` vulnerável a negação de serviço | Aviso público, lockfile, instalação e caminho de execução |
| [AUD-002](#aud-002--perfil-e-permissões-do-frontend-são-apenas-demonstrativos) | HIGH | Perfil e permissões apenas demonstrativos | Código confirmado; impacto condicionado ao uso real |
| [AUD-003](#aud-003--validações-do-frontend-não-chegam-ao-backend) | HIGH | Validações não chegam ao backend | Ausência de implementação confirmada no frontend |
| [AUD-004](#aud-004--troca-de-operação-permite-apagar-validações-pendentes) | HIGH | Descarte de validações pendentes | Caminho explícito na interface e no IndexedDB |
| [AUD-005](#aud-005--scanner-permite-exibir-válido-sem-validar-ingresso) | HIGH | Simulação de sucesso no scanner | Caminho explícito no código distribuído |
| [AUD-006](#aud-006--preparação-e-validação-têm-janela-de-concorrência-entre-abas) | MEDIUM | Concorrência entre preparação e scanner | Análise estática; reprodução em navegador pendente |
| [AUD-007](#aud-007--banco-local-incompleto-e-health-sem-verificação-de-prontidão) | MEDIUM | Banco incompleto e prontidão não verificada | Inspeção do arquivo e reprodução em memória |
| [AUD-008](#aud-008--auditoria-de-segurança-e-alterações-administrativas-incompleta) | MEDIUM | Auditoria de segurança incompleta | Código, esquema e testes existentes |
| [AUD-009](#aud-009--ausência-de-cotas-para-crescimento-e-tráfego-autenticado) | MEDIUM | Ausência de cotas e limites cumulativos | Código confirmado; impacto de carga não medido |
| [AUD-010](#aud-010--limite-de-login-depende-do-ip-da-conexão-e-do-processo) | MEDIUM | Limite de login inadequado para certos proxies | Comportamento reproduzido em aplicação isolada |
| [AUD-011](#aud-011--backups-locais-sem-evidência-de-recuperação-operacional) | MEDIUM | Recuperação e backups sem validação operacional | Arquivos presentes e lacunas no repositório |
| [AUD-012](#aud-012--lista-de-hosts-confia-em-todo-trycloudflarecom) | LOW | Lista de hosts excessivamente ampla | Configuração e requisição local de leitura |
| [AUD-013](#aud-013--escape-de-html-incompleto-e-dados-locais-sem-schema) | LOW | Renderização parcialmente protegida | Pontos de inserção identificados; ataque remoto não demonstrado |
| [AUD-014](#aud-014--cabeçalhos-de-defesa-do-navegador-ausentes-no-ambiente-examinado) | LOW | Cabeçalhos de defesa ausentes | HTTP local e aplicação isolada |
| [AUD-015](#aud-015--frontend-sem-testes-automatizados-e-sem-pipeline-no-repositório) | LOW | Ausência de testes do frontend e pipeline local | Arquivos e scripts examinados |
| [AUD-016](#aud-016--origens-cors-padrão-não-incluem-o-endereço-local-utilizado) | LOW | CORS incompatível com o endereço usado | Reproduzido: origem por IP recebe 403 |

## 2. Método, preservação e limites

### 2.1 Procedimentos executados

1. Inventário da estrutura, dos manifests, dos lockfiles e das alterações locais.
2. Leitura de rotas, middleware, serviços, repositórios, migrações, documentação e testes pertinentes.
3. Rastreamento dos fluxos de autenticação, autorização, preparação, scanner, persistência e sincronização.
4. Inspeção do SQLite e dos backups usando Python/SQLite com URI `mode=ro&immutable=1` e `PRAGMA query_only=ON`.
5. Consulta pública de vulnerabilidades com `npm audit`, sem `audit fix`, instalação ou atualização de pacotes.
6. Varredura por padrões de segredos em **115 arquivos textuais atuais** e **151 blobs textuais do histórico Git local alcançável**.
7. Execução de seis arquivos de testes do backend e verificações complementares em bancos isolados.
8. Requisições de leitura ao frontend já em execução e verificação de disponibilidade da API local.
9. Comparação SHA-256 de **129 arquivos preexistentes** do projeto, dados e backups, excluindo `.git`, `node_modules`, `dist` e `.npm-cache`: nenhum conteúdo alterado antes da escrita deste relatório.

Não foram aplicadas correções, migrações ou seeds no banco existente. Não foram criadas contas no banco existente, alteradas credenciais, iniciada a API de trabalho, reiniciados serviços, modificadas regras de firewall, feitos commits ou enviados arquivos ao Git remoto.

Os testes usam dados fictícios em bancos em memória e, em alguns casos, diretórios temporários descartáveis. Esses recursos são criados e encerrados pelos próprios testes. As consultas do npm podem usar cache/logs da ferramenta fora dos arquivos da aplicação. **O único novo artefato intencional no projeto é este relatório.**

### 2.2 Limitações explícitas

- A API de trabalho em `127.0.0.1:3000` não estava disponível durante a verificação. Seus controles HTTP foram examinados por código e instâncias de teste isoladas.
- Não houve teste de exploração de negação de serviço, força bruta em volume, alteração dos dados reais ou restauração sobre o banco existente.
- Não houve automação de navegador, leitura do IndexedDB real do usuário, acesso à câmera, instalação da PWA ou ensaio offline em Android/iOS.
- A condição de concorrência do IndexedDB foi identificada estaticamente; sua reprodução em navegador permanece pendente.
- A varredura de segredos é baseada em padrões, não cobre todos os formatos e não analisou conteúdo binário de DOCX/imagens. Abrange somente histórico alcançável pelas referências Git locais, não todo dado já existente no GitHub.
- As configurações efetivas de hospedagem pública, proteção de branches, CI externo, conta GitHub, TLS externo, firewall, criptografia de disco e backup fora deste diretório não foram inspecionadas.
- Os resultados de dependências representam o catálogo consultado nesta data. Ausência de avisos não equivale a ausência de vulnerabilidades.
- O build bem-sucedido do frontend foi observado na etapa anterior desta sessão. Não foi refeito durante esta auditoria.

## 3. Arquitetura e estado real da implementação

### 3.1 Tecnologias identificadas

| Camada | Tecnologia/versão verificada | Estado |
|---|---|---|
| Runtime | Node.js `24.14.0` | Compatível com o intervalo declarado pelo backend |
| Frontend | HTML, CSS, JavaScript ES Modules | Aplicação sem framework de UI |
| Build/preview | Vite `8.3.3` | Versão do lockfile e instalada |
| Scanner | `html5-qrcode 2.3.8` | Versão do lockfile e instalada |
| Navegador | IndexedDB, localStorage, sessionStorage | Persistência e demonstração locais |
| PWA | Manifest e Service Worker próprios | Worker gerado no build |
| API | Express `5.3.0`, `cors 2.8.6` | Código disponível; API local não ativa na verificação |
| Validação | Zod `4.6.7` | Schemas de entrada e limites |
| Tokens | `jose 6.2.12`, JWT HS256 | Backend somente |
| Senhas | `node:crypto.scrypt` | Salt aleatório e comparação resistente a diferenças de tempo |
| Banco central | `better-sqlite3 13.0.3` | Versão instalada e fixada |
| Motor SQLite do backend | `3.53.4` | Obtido em conexão isolada em memória |
| Testes | Node Test Runner e Supertest `7.3.1` | Cobertura relevante do backend |

Todos os pacotes enumerados coincidiram entre instalação local e lockfile. Os lockfiles usam versão 3; os registros de pacote examinados têm integridade e não apontam para origens de download diferentes de `https://registry.npmjs.org/`.

### 3.2 Fluxos presentes

```text
Frontend servido pelo Vite preview
  ├─ sessionStorage: perfil de demonstração e seleção
  ├─ localStorage: eventos, portões e solicitações demonstrativas
  ├─ mocks: ingressos fictícios
  ├─ IndexedDB: ingressos, operação e validações pendentes
  └─ Service Worker/Cache Storage: arquivos estáticos para abertura offline

              Integração HTTP de negócio ainda ausente

Backend Express
  ├─ autenticação JWT e concessões por evento/portão
  ├─ leitura de eventos, portões, ingressos e resumo
  ├─ sincronização idempotente com instalação vinculada a usuário
  ├─ administração, CSV e resolução de pendências
  └─ SQLite: código prevê migrações 001–005

SQLite local existente
  └─ somente migrações 001–003 aplicadas
```

### 3.3 Matriz de funcionalidades

| Função | Frontend | Backend/código | Banco local existente |
|---|---|---|---|
| Login real | Ausente; seleção de perfil demo | Implementado | Tabela de usuários ausente |
| Autorização por evento/portão | Simulada em armazenamento local | Implementada | Tabelas de concessões ausentes |
| Cadastro de evento/portão | Demo em localStorage | Endpoints administrativos presentes | Tabelas de negócio existem |
| Código de convite e solicitação de operador | Demo implementada | Não localizados endpoints/modelo equivalentes | Sem estruturas equivalentes |
| Download de ingressos | Lê mocks | API implementada e autenticada | 22 ingressos existentes |
| Validação offline | Implementada no IndexedDB | Confirmação central ocorre na sincronização | 2 confirmações sintéticas existentes |
| Envio de validações | Ausente | Endpoint implementado | Base de recibos existe; identidade ainda ausente |
| Resumo/dashboard | Tela com valores `—` | Resumo implementado | Dados de negócio suficientes, acesso real depende da identidade |
| Importação CSV | Interface não localizada | Implementada para administrador | Tabela de ingressos existe |
| Resolução administrativa | Interface não localizada | Implementada | Migração 005 ausente |
| PWA | Manifest, cache e worker presentes | Não se aplica | Independente do SQLite central |

O papel `GESTOR` da demonstração não pode ser automaticamente equiparado a `ADMINISTRADOR`: no backend, administrador tem escopo global. O fluxo de solicitações por código também exige definição de contrato e modelo antes da integração. Isso é uma divergência de produto a resolver, não evidência de bypass da autorização já implementada no servidor.

## 4. Superfície de ataque e controles existentes

### 4.1 Rotas do backend

| Rota | Controle observado | Observações |
|---|---|---|
| `GET /health` | Pública | Executa apenas `SELECT 1`; não atesta schema/prontidão |
| `POST /auth/login` | Pública, limite por IP, validação de entrada | Derivação de senha limitada a duas simultâneas por instância |
| `GET /auth/me` | Bearer válido e usuário atual | Retorna identidade e concessões |
| `POST /auth/logout` | Bearer válido | Incrementa versão, revogando os tokens do usuário |
| `POST /auth/instalacoes` | Bearer válido, vínculo de proprietário | Não adota instalação de outro usuário |
| `GET /eventos` | Bearer válido | Operador vê eventos concedidos; administrador vê todos |
| `GET /eventos/:eventoId/portoes` | Bearer e acesso ao evento | Não exige concessão individual de cada portão para leitura |
| `GET /eventos/:eventoId/portoes/:portaoId/ingressos` | Bearer e acesso ao evento | Permite preparar reconhecimento de portão incorreto |
| `GET /eventos/:eventoId/resumo` | Bearer e acesso ao evento | Indicadores calculados a partir das confirmações |
| `POST /sincronizacao` | Bearer, evento, portão e instalação própria | Até 100 itens, 100 KB; autorização reavaliada por transação |
| `POST /eventos` e `PATCH /eventos/:eventoId` | Administrador ativo | Schemas estritos e SQL parametrizado |
| `POST /eventos/:eventoId/portoes` | Administrador ativo | Confere existência do evento |
| `POST /eventos/:eventoId/ingressos/importar` | Administrador ativo | CSV UTF-8, 100 KB, até 1.000 registros, sem compressão |
| `GET /eventos/:eventoId/pendencias` | Administrador ativo | Paginação limitada a 100 |
| `POST /pendencias/:recebimentoId/resolver` | Administrador ativo | Justificativa e registro imutável |

### 4.2 Controles positivos observados

- **SQL parametrizado:** valores de entrada são vinculados com placeholders nos repositórios. A interpolação de SQL nas migrações utiliza arquivos locais da aplicação, não parâmetros HTTP.
- **Autorização no servidor:** verificação de evento, portão de sincronização e proprietário da instalação. O UUID da instalação não é tratado como credencial.
- **JWT restrito:** algoritmo HS256 permitido explicitamente; emissor, audiência, tipo e claims exigidos; TTL entre 60 e 3.600 segundos; segredo de 32–64 bytes em base64url canônico. A validação de formato não demonstra aleatoriedade de um segredo fornecido manualmente.
- **Revogação:** usuário ativo e versão do token conferidos no banco. Mudanças de senha, papel, usuário ou estado incrementam a versão por trigger; logout também revoga tokens.
- **Senhas:** scrypt com `N=131072`, `r=8`, `p=1`, salt aleatório de 16 bytes e `timingSafeEqual`. Usuário inexistente também percorre derivação de senha fictícia.
- **Entradas limitadas:** validação estrita, controle de tamanho, IDs inteiros seguros, formatos de data e recusa de campos extras nos contratos principais.
- **CSV:** buffer limitado, UTF-8 estrito, validação de todas as linhas, verificação de duplicados e transação que impede importação parcial.
- **Sincronização:** chave idempotente por dispositivo e ID local, detecção de conteúdo divergente, unicidade da confirmação por ingresso e autorização reavaliada dentro da transação.
- **SQLite:** tabelas STRICT, chaves estrangeiras compostas, índices, transações e triggers de preservação do histórico.
- **IndexedDB:** a leitura e o consumo de um ingresso, com criação da pendência, ocorrem na mesma transação de escrita; o sucesso só é devolvido após conclusão. Isso protege leituras concorrentes do mesmo ingresso enquanto a preparação não substitui o estado.
- **Saída do QR Code:** usa `textContent` em `frontend/src/components/resultado.js:32`; o QR lido não é interpretado como HTML.
- **Erros:** respostas não expõem stack trace, SQL, senha ou token. API usa `Cache-Control: no-store` e desabilita `x-powered-by`.
- **Configuração local:** bind padrão em loopback, CORS por origem exata e ausência de cookies de autenticação.
- **PWA:** cache de arquivos identificado por versão; limpeza limitada ao prefixo do aplicativo. O worker não apaga IndexedDB.

### 4.3 Cobertura das áreas de segurança

| Área | Resultado da revisão |
|---|---|
| Autenticação/autorização/IDOR | Controles relevantes no backend, com testes aprovados; frontend ainda demonstrativo |
| SQL injection | Nenhum caminho explorável identificado nos repositórios examinados; valores parametrizados |
| Command injection | Não localizado uso de entrada HTTP para executar shell/processos; processos aparecem em testes |
| XSS | QR protegido e vários textos escapados; proteção incompleta em outros campos e telas antigas — AUD-013 |
| CSRF | API usa Bearer explícito, sem cookie de sessão; não foi identificado fluxo de autenticação ambiental que justifique afirmar CSRF clássico |
| SSRF | Não localizada funcionalidade de backend que busque URL fornecida pelo cliente |
| Path traversal | Não localizada rota que use caminho fornecido pelo cliente para ler arquivos |
| Uploads | Importação CSV em memória; não grava arquivo enviado nem utiliza nome de arquivo do cliente |
| JWT/senhas | Implementação defensiva; tabelas ainda ausentes no banco de trabalho |
| CORS | Lista exata e preflight restrito; incompatibilidade local descrita em AUD-016 |
| HTTPS/TLS | HTTP local por loopback é esperado; terminador HTTPS externo não examinado |
| Headers | Defesa do navegador incompleta no ambiente examinado — AUD-014 |
| Dependências | Um aviso HIGH no backend; nenhum retornado no frontend |
| Logs/monitoramento | Auditoria de divergências e resoluções; faltam eventos de segurança e monitoramento operacional |
| Backups | Duas cópias locais íntegras estruturalmente; sem restauração operacional comprovada — AUD-011 |
| Git/CI | Dados locais ignorados; não localizado pipeline versionado; configurações remotas não examinadas |
| Docker/Kubernetes | Não encontrados artefatos de implantação no escopo inventariado |
| PostgreSQL/MySQL/Redis | Não identificados; o banco central utilizado é SQLite |
| Linux/SSH/firewall | Não aplicável à implementação local Windows examinada; infraestrutura externa não auditada |

## 5. Banco de dados, armazenamento e backups

### 5.1 SQLite de trabalho

Arquivo: `backend/data/passcheck.sqlite`, **90.112 bytes**. O WAL tinha **0 bytes** no momento da leitura. Por isso, a leitura imutável do arquivo principal representava o estado persistido observado sem omitir transações pendentes no WAL. O arquivo SHM já existia; nenhum checkpoint foi executado.

| Tabela presente | Registros |
|---|---:|
| `schema_migrations` | 3 |
| `eventos` | 3 |
| `portoes` | 6 |
| `ingressos` | 22 |
| `recebimentos` | 2 |
| `validacoes` | 2 |
| `auditoria_divergencias` | 0 |

Resultados de leitura:

- `PRAGMA integrity_check`: `ok`.
- `PRAGMA foreign_key_check`: **0 violações**.
- Ingressos cujo estado `utilizado` diverge da existência de confirmação: **0**.
- Recibos `CONFIRMADA` sem correspondente validação: **0**.
- Checksums das migrações 001, 002 e 003: **iguais aos arquivos atuais**, normalizadas as quebras de linha conforme o executor de migrações.
- Migrações pendentes: **004_identidade_acesso.sql** e **005_resolucoes_administrativas.sql**.
- Tabelas ausentes esperadas pelo código atual: `usuarios`, `usuarios_eventos`, `usuarios_portoes`, `instalacoes` e `resolucoes_administrativas`.

Os números são compatíveis com a carga demonstrativa documentada. Não foram reproduzidos códigos de ingressos, conteúdo integral de recibos, senhas ou tokens no relatório.

### 5.2 Modelo previsto após todas as migrações

| Grupo | Relações e proteções |
|---|---|
| Eventos e portões | Portão pertence a evento; exclusão/alteração de vínculos restrita |
| Ingressos | Código globalmente único; portão e evento coerentes por FK composta |
| Recibos | Unicidade de `(dispositivo, id_local)`; payload normalizado; status restrito |
| Validações | Um ingresso e um recibo não podem gerar duas confirmações |
| Auditoria de divergências | Guarda hashes e correlação, sem duplicar o payload apresentado |
| Usuários e concessões | Papéis restritos, hash de senha, estado ativo e versão de token |
| Instalações | Dispositivo vinculado a usuário; identidade não pode ser alterada por UPDATE |
| Resoluções administrativas | Administrador ativo, justificativa, timestamp e imutabilidade |

As proteções do banco impedem várias inconsistências por DML normal. Elas **não substituem a proteção do arquivo no sistema operacional**: um usuário com controle suficiente sobre o SQLite pode substituir o arquivo, alterar o schema ou remover triggers.

### 5.3 Persistência no navegador

| Armazenamento | Conteúdo | Observação |
|---|---|---|
| sessionStorage | Perfil demo, seleção de evento/portão | É controlável pelo usuário e não autentica ninguém |
| localStorage | Eventos demo, solicitações, aprovações e atribuições | Compartilhado por abas da mesma origem; sem servidor central |
| IndexedDB `passcheck`, versão 1 | `ingressos`, `operacao`, `validacoesPendentes` | Dados necessários ao offline e fila ainda sem envio |
| Cache Storage | HTML, JS, CSS e recursos estáticos | Mantido pelo Service Worker de build |

Não foi lido o perfil real do navegador do usuário. As descrições acima derivam do código. O pedido de armazenamento persistente em `pwa.js` depende de concessão do navegador; não garante recuperação após perda do aparelho, limpeza manual ou remoção do perfil.

A operação salva no IndexedDB não contém identidade real de usuário, concessões autenticadas ou uma sessão offline com política de validade. Essa definição deve preceder a integração. Revogação central não pode ser instantaneamente conhecida por um dispositivo desconectado; é necessário definir a política de negócio para esse intervalo.

### 5.4 Backups encontrados

| Arquivo | Tamanho | Migrações | Integridade | Conteúdo observado |
|---|---:|---|---|---|
| `backend/backups/pre-etapa2-20261017.sqlite` | 4.096 bytes | Nenhuma | `ok` | Banco anterior à modelagem, sem tabelas |
| `backend/backups/pre-etapa5-20261017.sqlite` | 77.824 bytes | 001–002 | `ok` | 3 eventos, 6 portões, 22 ingressos, 2 recibos e 2 validações |

O primeiro backup vazio é coerente com sua finalidade documentada e não foi considerado arquivo corrompido. O segundo tem checksums válidos para seu próprio histórico, mas não contém o schema atual completo.

As ACLs do banco de trabalho e do segundo backup são herdadas do diretório. Incluem proprietário, SYSTEM, administradores e identidades/grupo do sandbox de desenvolvimento com capacidade de modificação. Isso descreve o ambiente de trabalho; não comprova acesso público nem deve ser automaticamente tratado como configuração de produção. Não foram alteradas ACLs nem verificados BitLocker ou cópias externas.

## 6. Achados detalhados

### AUD-001 — `body-parser` vulnerável a negação de serviço

- **Severidade:** HIGH.
- **Componente afetado:** backend; dependência transitiva do Express e parsers JSON.
- **Evidência:** `backend/package-lock.json:86` contém `body-parser@2.3.0`; a mesma versão está instalada. `npm audit` retornou GHSA-27r3-jxmh-p828 / CVE-2026-111181, CVSS 7.5. `backend/src/app.js:36` usa `express.json({ limit: 102400 })` sem desabilitar `inflate`; `backend/src/routes/administracao.js:27` também. O parser global antecede a decisão final de rota.
- **Risco de segurança:** indisponibilidade da API quando uma requisição comprimida malformada provoca exceção não capturada. O limite do JSON não elimina a condição descrita no aviso.
- **Cenário possível:** quando a API estiver acessível, um cliente sem autenticação alcança o parser global por um caminho não protegido e provoca encerramento do processo. CORS não impede clientes que omitem `Origin`. O bind local reduz a exposição atual, mas não corrige a dependência.
- **Remediação recomendada:** atualizar a resolução da dependência para versão corrigida compatível, no mínimo `2.4.0` na linha 2.x, revisar o lockfile e executar regressão. Se JSON comprimido não for necessário, considerar também `inflate: false` em todos os parsers JSON pertinentes. Não executar atualização automática sem revisão.
- **Validação:** conferir versão resolvida e instalada, repetir `npm audit` e validar que pedidos comprimidos são tratados conforme a política. Testes específicos do aviso devem ocorrer em processo descartável, nunca na API de trabalho. Nenhum payload de exploração foi enviado nesta auditoria.
- **Confiança/condições:** versão e caminho de processamento confirmados. Um gzip benigno contendo `{}` foi aceito pelo parser em aplicação isolada e chegou ao 404 de rota desconhecida. A queda do processo não foi reproduzida.

O aviso do mantenedor identifica a falha e as versões corrigidas; foi publicado em 22/10/2026. [Advisory oficial do body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).

### AUD-002 — Perfil e permissões do frontend são apenas demonstrativos

- **Severidade:** HIGH, como bloqueador para uso operacional real.
- **Componente afetado:** login, telas de gestor/operador e autorização local.
- **Evidência:** `frontend/src/screens/login.js:15` informa a demonstração e oferece ambos os perfis; `frontend/src/demo/perfilDemo.js:15` grava o perfil em sessionStorage; `:46` confere somente esse valor. `frontend/src/demo/armazenamentoDemo.js:205` aprova solicitações apenas no localStorage.
- **Risco de segurança:** as telas administrativas e permissões locais não estabelecem identidade nem autorização confiável.
- **Cenário possível:** alguém com acesso à aplicação escolhe gestor, aprova o operador demonstrativo e muda atribuições, sem credencial ou aprovação de um responsável real.
- **Remediação recomendada:** integrar login e concessões reais; definir o relacionamento entre gestor de evento e administrador global; manter o modo demo explicitamente separado da implantação operacional. Decisões de autorização de operações centrais devem continuar no backend.
- **Validação:** em ambiente integrado, abrir uma sessão sem credenciais e tentar acessar as telas/ações protegidas; manipular o perfil local não deve conceder permissões na API. Confirmar resposta 401/403 e preservação de filas offline ao renovar a sessão.
- **Confiança/condições:** comportamento intencional de protótipo, comprovado no código. Não significa que um perfil demo consiga forjar um JWT ou ultrapassar a autorização do backend atual.

### AUD-003 — Validações do frontend não chegam ao backend

- **Severidade:** HIGH, como bloqueador de integridade operacional.
- **Componente afetado:** `frontend/src/api.js`, IndexedDB, scanner e dashboard.
- **Evidência:** `frontend/src/api.js:12` importa dados demo/mocks; `:32` filtra ingressos fictícios. `frontend/src/db.js:218` cria pendências com `sincronizado: false`, mas o módulo não implementa envio/acknowledgement. Não foram encontradas chamadas de negócio `fetch`/XHR no frontend; os `fetch` localizados são do Service Worker. `frontend/src/screens/dashboard.js:13` mostra placeholders.
- **Risco de segurança:** confirmações ficam restritas ao dispositivo, a central não consolida entradas e não existe tratamento de conflitos/reenvios na interface.
- **Cenário possível:** um dispositivo aceita uma entrada e perde seus dados antes de qualquer envio; a central não recebe o registro. Dois dispositivos independentes podem aceitar a mesma cópia de ingresso, sem reconciliação posterior implementada no frontend.
- **Remediação recomendada:** implementar o contrato de sincronização já existente, autenticação, registro da instalação, IDs locais estáveis, reenvio idempotente e persistência das respostas por item. Remover uma pendência somente conforme resultado central reconhecido e política de resolução. Tratar 401/403 sem descartar a fila.
- **Validação:** em ambiente isolado, validar ingresso offline, voltar à rede, observar confirmação central e repetir envio após perda de resposta. Simular conflito, rejeição, expiração do token e falha parcial; a fila deve permanecer recuperável.
- **Confiança/condições:** ausência de integração confirmada. Mesmo com sincronização implementada, dois aparelhos totalmente offline não têm exclusão global instantânea; o MVP documenta preferência por um dispositivo por portão.

### AUD-004 — Troca de operação permite apagar validações pendentes

- **Severidade:** HIGH.
- **Componente afetado:** preparação do dispositivo e IndexedDB.
- **Evidência:** `frontend/src/screens/preparacao.js:108` oferece troca com aviso e confirmação do descarte; `:141` define `descartarOperacaoAnterior = true`. `frontend/src/db.js:285` autoriza o descarte e `:308` executa `validacoesPendentes.clear()`; `:312` substitui os ingressos locais.
- **Risco de segurança:** perda definitiva de evidência de entradas e do estado de consumo mantido apenas naquele aparelho.
- **Cenário possível:** por engano ou intencionalmente, o operador confirma a troca com pendências. Depois, ao preparar novamente a operação anterior a partir de dados desatualizados, pode voltar a aceitar ingresso já utilizado localmente.
- **Remediação recomendada:** bloquear troca enquanto existirem pendências, ou manter operações e filas segregadas, sem limpeza destrutiva. Qualquer procedimento excepcional deve preservar/exportar evidência de forma protegida e exigir responsabilidade administrativa definida.
- **Validação:** criar uma pendência em perfil descartável de navegador, tentar mudar evento/portão e conferir que ela permanece íntegra e vinculada à operação original. Voltar ao evento anterior não deve reabilitar o ingresso já consumido.
- **Confiança/condições:** caminho de exclusão explícito e confirmado por leitura. Não foi executado contra o IndexedDB do usuário. A confirmação visual reduz enganos, mas não recupera a evidência apagada.

### AUD-005 — Scanner permite exibir “Válido” sem validar ingresso

- **Severidade:** HIGH no contexto de liberação física de entrada.
- **Componente afetado:** scanner e sobreposição de resultado.
- **Evidência:** `frontend/src/screens/scanner.js:62` inclui os botões de simulação; `:252` chama `exibirResultado(botao.dataset.status)` diretamente, sem passar por `validarIngresso`. `frontend/src/components/resultado.js:7` usa a mesma apresentação de sucesso.
- **Risco de segurança:** a indicação visual de autorização pode existir sem leitura de QR, consumo de ingresso ou criação de pendência.
- **Cenário possível:** alguém toca em “Válido” e mostra a tela verde ao responsável pela entrada, que a interpreta como confirmação de uma leitura real.
- **Remediação recomendada:** retirar o acionamento de simulação da versão operacional; se necessário para demonstração, isolá-lo e identificar a sobreposição como simulação de forma inequívoca.
- **Validação:** inspecionar o build operacional e confirmar ausência desses controles. Toda indicação real de sucesso deve exigir conclusão da transação de validação e registro correspondente.
- **Confiança/condições:** o bloco é rotulado como temporário, mas está no mesmo fluxo e não há condição de build que o exclua da distribuição atual.

### AUD-006 — Preparação e validação têm janela de concorrência entre abas

- **Severidade:** MEDIUM.
- **Componente afetado:** `frontend/src/db.js`, preparação e scanner compartilhando IndexedDB.
- **Evidência:** `salvarPreparacao` lê operação/pendências/ingressos em transações anteriores (`:276`, `:287`, `:296`) e só depois abre a transação de substituição (`:303`). O conjunto `idsUtilizados` pode ficar desatualizado antes de `clear()`/`put()`. `registrarValidacao`, em `:203`, não inclui `operacao` no escopo da transação; recebe a operação capturada pela tela.
- **Risco de segurança:** uma substituição com estado antigo pode reverter o indicador local de consumo, apesar de uma validação já ter sido registrada; outra aba pode operar com contexto antigo.
- **Cenário possível:** a aba A lê a lista de utilizados para preparar novamente; a aba B confirma um ingresso ainda disponível; a aba A substitui a lista com o snapshot anterior e marca esse ingresso como disponível. A serialização individual das escritas não torna atômicas as leituras preliminares.
- **Remediação recomendada:** validar operação e pendências e mesclar o estado de consumo dentro da mesma transação de escrita; incluir contexto/versionamento da operação na validação. Definir coordenação de preparação entre abas e comportamento de scanners já abertos.
- **Validação:** teste automatizado com duas páginas no mesmo perfil/origem, intercalando preparação e validação; verificar que um ingresso nunca retorna a disponível e que o scanner rejeita contexto obsoleto.
- **Confiança/condições:** janela identificada no código; reprodução em navegador não executada. Requer concorrência no mesmo armazenamento, não um atacante remoto sem acesso à aplicação.

### AUD-007 — Banco local incompleto e health sem verificação de prontidão

- **Severidade:** MEDIUM.
- **Componente afetado:** banco de trabalho, inicialização e monitoramento de saúde.
- **Evidência:** banco contém somente migrações 001–003, com ausência das cinco tabelas citadas na seção 5. `backend/src/db/connection.js:13` verifica `SELECT 1`; `backend/src/routes/health.js:7` faz o mesmo. `backend/src/server.js:8` não chama `assertMigrationsCurrent`. Em memória com schema 001–003, `/health` retornou 200 e login válido em formato retornou 500 `ERRO_INTERNO`.
- **Risco de segurança:** aplicação pode parecer saudável enquanto autenticação e operações de negócio estão indisponíveis. Uma implantação pode direcionar tráfego a uma instância não pronta.
- **Cenário possível:** após configurar a chave JWT e iniciar o backend sem atualizar o banco, o monitor aprova o health, mas os usuários não conseguem entrar. Não foi identificado bypass de autenticação nesse caso; o efeito observado é falha.
- **Remediação recomendada:** planejar backup consistente e migração autorizada 004–005, configurar segredo estável e provisionar contas. Separar vivacidade de prontidão; verificar schema/checksums requeridos na prontidão ou falhar de forma clara na inicialização, sem migrar silenciosamente.
- **Validação:** em cópias isoladas, testar banco antigo, vazio, atualizado e histórico divergente. A prontidão deve falhar nos estados incompatíveis e liberar serviço apenas quando os requisitos de operação estiverem atendidos.
- **Confiança/condições:** confirmado. `backend/.env` não existe e `JWT_SECRET` não está presente na sessão examinada; por isso, também falta configuração para ativar o backend por seu caminho padrão. Isso não significa segredo exposto.

### AUD-008 — Auditoria de segurança e alterações administrativas incompleta

- **Severidade:** MEDIUM.
- **Componente afetado:** identidade, administração, logs e observabilidade.
- **Evidência:** `backend/src/services/identidade.js:29` processa login sem evento de auditoria; `backend/src/middleware/errors.js:17` não registra recusas 401/403/429. `backend/src/repositories/administracao.js:10` cria/atualiza eventos e portões sem trilha de autor/antes/depois. Existem auditorias específicas de divergências e resoluções, mas não uma trilha geral dessas ações. Testes de autenticação verificam lista de logs vazia em alguns cenários de login.
- **Risco de segurança:** dificuldade de detectar abuso, atribuir ações administrativas, investigar incidentes e correlacionar falhas.
- **Cenário possível:** uma conta válida altera eventos ou realiza muitas tentativas recusadas; após o incidente, o banco contém o estado final, mas não a trilha suficiente para reconstruir quem alterou quais dados.
- **Remediação recomendada:** eventos estruturados de autenticação, autorização, limitação e mudanças administrativas; identificar ator, resultado, recurso e correlação. Definir retenção, acesso, rotação e alertas. Preservar a prática atual de não registrar senhas, JWTs, payloads completos ou QR Codes em logs.
- **Validação:** executar cenários permitidos/negados em ambiente isolado e conferir eventos correlacionáveis e sem segredos; testar coleta, retenção e um alerta de falha recorrente.
- **Confiança/condições:** lacuna confirmada no código e artefatos disponíveis; não foi examinado eventual coletor externo. A recomendação segue a seleção de eventos e exclusão de dados sensíveis da [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

### AUD-009 — Ausência de cotas para crescimento e tráfego autenticado

- **Severidade:** MEDIUM.
- **Componente afetado:** instalações, recibos, auditoria e consultas de ingressos.
- **Evidência:** `backend/src/services/identidade.js:57` registra instalações sem cota por usuário; `backend/src/repositories/identidade.js:17` insere cada identificador novo. Recibos e divergências são acrescentados por `backend/src/repositories/sincronizacao.js:26` e `:38`. `backend/src/repositories/eventos.js:48` lista todos os ingressos do portão sem paginação. Há limites por requisição, mas não foram localizados limites cumulativos nessas rotas.
- **Risco de segurança:** conta comprometida ou cliente defeituoso pode consumir armazenamento, CPU e tempo de banco; consultas grandes podem afetar o processo Node que usa acesso síncrono ao SQLite.
- **Cenário possível:** operador autorizado registra muitas instalações ou envia repetidamente itens divergentes no seu escopo, acumulando dados de auditoria. Um evento grande também amplia o custo de listagens repetidas.
- **Remediação recomendada:** limites de tráfego por usuário/instalação, cotas administrativas, alertas de disco e volume e estratégia consistente de download em lotes/snapshot. Definir retenção/arquivamento de auditoria sem apagar evidência indiscriminadamente.
- **Validação:** testes de carga limitados em ambiente descartável, com orçamento de recursos, verificando 429/cotas e estabilidade do serviço; não inundar o banco de trabalho. Conferir desempenho com o volume real esperado para eventos.
- **Confiança/condições:** ausência de cotas identificada; indisponibilidade por volume não foi reproduzida. A autorização existente reduz o alcance de uma conta ao seu escopo, mas não define seu orçamento de recursos.

### AUD-010 — Limite de login depende do IP da conexão e do processo

- **Severidade:** MEDIUM.
- **Componente afetado:** middleware de login e implantação atrás de proxy/NAT.
- **Evidência:** `backend/src/middleware/autenticacao.js:10` mantém um `Map` local por `request.ip`, com dez requisições em quinze minutos; conta inclusive requisições inválidas. `trust proxy` permanece `false`. Em teste isolado, onze pedidos com onze valores diferentes de `X-Forwarded-For` e mesma conexão de origem retornaram dez vezes 400 e depois 429.
- **Risco de segurança:** se um proxy concentrar os clientes em um único IP observado, o limite passa a bloquear coletivamente usuários legítimos. Em múltiplos processos, os contadores são independentes; reinício elimina o histórico local.
- **Cenário possível:** atrás de proxy sem configuração de confiança adequada, dez pedidos malformados esgotam o limite disponível aos demais usuários desse proxy. Usuários de uma mesma rede NAT também compartilham a cota de IP.
- **Remediação recomendada:** definir limites combinados por origem e identificador de conta, com cuidado para não criar bloqueio arbitrário de contas; adequar a confiança no proxy à topologia real. Compartilhar estado quando houver múltiplas instâncias. Não usar `trust proxy=true` indiscriminadamente.
- **Validação:** simular clientes distintos através da topologia autorizada e verificar que não há bloqueio global; confirmar que cabeçalhos forjados de clientes diretos não mudam o IP confiável. Testar os efeitos de reinício e de múltiplas instâncias quando aplicáveis.
- **Confiança/condições:** comportamento de agregação reproduzido; presença de proxy em produção não demonstrada. A configuração deve seguir a topologia descrita na [documentação oficial do Express sobre proxies](https://expressjs.com/en/guide/behind-proxies/).

### AUD-011 — Backups locais sem evidência de recuperação operacional

- **Severidade:** MEDIUM.
- **Componente afetado:** SQLite, backups e continuidade.
- **Evidência:** as duas cópias encontradas estão em `backend/backups`, no mesmo workspace/volume do banco, datadas pelo nome em 17/10/2026. A mais completa contém schema 001–002. Não foram localizados scripts de rotina, retenção, cópia externa, alertas de backup ou ensaio de recuperação operacional neste diretório.
- **Risco de segurança:** falha do disco, exclusão acidental, comprometimento da conta local ou perda do computador pode afetar banco e backups juntos. Cópia estruturalmente íntegra não comprova que a aplicação pode voltar a operar com ela.
- **Cenário possível:** após perda do armazenamento, as cópias do mesmo diretório também desaparecem; ou uma restauração de cópia antiga sobe com schema incompatível e sem os dados posteriores necessários.
- **Remediação recomendada:** definir RPO/RTO, backup consistente pela API do SQLite, destino separado e protegido, retenção e ensaios de restauração em diretório isolado. Em WAL, não copiar somente o arquivo principal de um banco ativo sem procedimento consistente.
- **Validação:** restaurar uma cópia em ambiente separado, conferir integridade, FKs, schema, autenticação, contagens e operações de leitura. Registrar duração e perda máxima de dados; verificar recuperação das credenciais de configuração sem expô-las.
- **Confiança/condições:** somente as cópias locais foram verificadas. Não se afirma inexistência de backup externo não visível. A relevância do WAL para o estado persistente é descrita na [documentação oficial do SQLite](https://www.sqlite.org/wal.html).

### AUD-012 — Lista de hosts confia em todo `trycloudflare.com`

- **Severidade:** LOW no ambiente local examinado.
- **Componente afetado:** Vite dev/preview e configuração de túnel.
- **Evidência:** `frontend/vite.config.js:71` inclui `.trycloudflare.com`, além de um hostname específico. Requisição local para `127.0.0.1:4173`, com `Host: auditoria-passcheck.trycloudflare.com`, recebeu 200; outro host não listado recebeu 403.
- **Risco de segurança:** a proteção por hostname confia em um domínio compartilhado mais amplo que o necessário para o túnel específico.
- **Cenário possível:** se houver um caminho de encaminhamento até o Vite usando hostname não previsto desse domínio, o filtro não o rejeitará. A auditoria não demonstrou esse caminho, controle de DNS necessário a rebinding nem exposição externa do serviço.
- **Remediação recomendada:** permitir apenas hosts efetivamente usados e sob controle da implantação, preferencialmente via configuração local específica; remover entradas de túnel quando não necessárias. Usar hospedagem apropriada para a versão operacional.
- **Validação:** repetir os GETs locais com hostname autorizado e não autorizado; o host arbitrário deve receber 403. Confirmar separadamente quais interfaces/túneis estão expostos.
- **Confiança/condições:** amplitude da lista confirmada. `allowedHosts` não cria túnel nem autentica usuários; o bind em loopback permanece um controle positivo. Ver [orientação oficial do Vite sobre allowedHosts](https://vite.dev/config/server-options.html#server-allowedhosts).

### AUD-013 — Escape de HTML incompleto e dados locais sem schema

- **Severidade:** LOW; não classificado como XSS remoto comprovado.
- **Componente afetado:** renderização de eventos e leitura de armazenamento local.
- **Evidência:** `frontend/src/screens/gestor-painel.js:45` insere `formatarData(evento.data)` e `:46` insere `evento.codigo` em HTML; `frontend/src/screens/gestor-evento.js:40` e `:45` fazem o mesmo. `frontend/src/html.js:13` apenas rearranja partes da data. `frontend/src/demo/armazenamentoDemo.js:30` usa `JSON.parse` sem validar schema. Telas antigas em `screens/eventos.js:35` e `screens/portoes.js:24` também interpolam textos sem escape, mas estão desativadas no roteador atual.
- **Risco de segurança:** dados fora dos tipos/formatos esperados podem virar marcação HTML ou quebrar a tela. Um futuro caminho de entrada externo pode tornar os mesmos pontos exploráveis entre usuários.
- **Cenário possível:** armazenamento local adulterado ou futura resposta da API sem validação fornece HTML em campo considerado seguro; a renderização o interpreta. Hoje, códigos são gerados internamente e o formulário de data limita a entrada normal, reduzindo a exposição demonstrável.
- **Remediação recomendada:** validar schema na fronteira de armazenamento/API; tratar dados locais como não confiáveis; usar `textContent` ou escape apropriado em todos os contextos. Corrigir ou retirar as telas antigas antes de reativá-las. Tratar JSON corrompido sem apagar a fila operacional.
- **Validação:** em perfil descartável, usar marcadores HTML inofensivos em todos os campos e confirmar apresentação como texto, sem criação de elementos. Testar dados malformados e recuperação de leitura. Não alterar o perfil real do usuário para validar isso.
- **Confiança/condições:** sinks identificados; nenhum vetor remoto de entrada foi comprovado. A independência entre segurança e armazenamento no navegador é discutida na [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

### AUD-014 — Cabeçalhos de defesa do navegador ausentes no ambiente examinado

- **Severidade:** LOW para a exposição local atual.
- **Componente afetado:** frontend servido pelo preview e configuração de resposta da API.
- **Evidência:** GET local da página não retornou `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ou `Permissions-Policy`. `frontend/index.html` também não define CSP em meta. Aplicação isolada do backend não retornou esses cabeçalhos; retornou corretamente `Cache-Control: no-store`.
- **Risco de segurança:** faltam barreiras adicionais contra enquadramento indevido, interpretação de conteúdo e consequências de eventual injeção de script.
- **Cenário possível:** se o mesmo conjunto de respostas for exposto publicamente, a interface pode ser enquadrada por outro site ou executar conteúdo que uma CSP bem definida restringiria. Não foi executado ataque de clickjacking ou XSS.
- **Remediação recomendada:** configurar headers no servidor de hospedagem/API de acordo com sua função; definir CSP compatível com scanner, worker e assets, política de câmera e política de enquadramento. Habilitar HTTPS e HSTS na camada pública apropriada após validar HTTPS; não exigir HSTS no HTTP de loopback.
- **Validação:** consultar as respostas na origem final e testar login, scanner, permissões de câmera e offline com as políticas ativas. A política de enquadramento deve ser validada na página HTML, não apenas no JSON da API.
- **Confiança/condições:** ausência confirmada localmente. Um proxy externo pode acrescentar esses cabeçalhos, mas não foi examinado.

### AUD-015 — Frontend sem testes automatizados e sem pipeline no repositório

- **Severidade:** LOW; lacuna de prevenção de regressões.
- **Componente afetado:** frontend e processo de entrega.
- **Evidência:** `frontend/package.json:7` contém somente scripts de dev, build e preview. Não foram localizados testes do frontend ou configuração de testes de navegador no inventário. Não há arquivos versionados de workflow em `.github` no checkout examinado. O backend tem suíte própria, da qual seis arquivos foram executados nesta auditoria.
- **Risco de segurança:** regressões de fila, concorrência, permissões da interface e atualização offline podem chegar à distribuição sem detecção automática.
- **Cenário possível:** uma alteração na preparação permite reusar ingresso ou perde pendências; o build continua aprovando porque ele não testa essas invariantes de negócio.
- **Remediação recomendada:** acrescentar testes focados nas garantias do IndexedDB, preparação concorrente, fluxo de autenticação integrado, sincronização idempotente, fila após falha e atualização de PWA. Automatizar verificações já úteis do backend, build e auditoria de dependências.
- **Validação:** demonstrar que uma regressão representativa de cada garantia faz o teste falhar e bloqueia a entrega. Não usar apenas testes que repetem a estrutura da implementação.
- **Confiança/condições:** ausência no repositório confirmada; processos externos não foram verificados. Não foi atribuído percentual de cobertura sem medição.

### AUD-016 — Origens CORS padrão não incluem o endereço local utilizado

- **Severidade:** LOW; risco de integração/configuração.
- **Componente afetado:** configuração do backend e frontend local em preview.
- **Evidência:** `backend/src/config.js:10` permite `http://localhost:5173,http://localhost:4173`; o frontend está sendo acessado em `http://127.0.0.1:4173`. Em aplicação isolada, `/health` com essa origem por IP retornou 403; a origem `http://localhost:4173` retornou 200.
- **Risco de segurança:** a integração falhará no navegador com os padrões atuais, podendo incentivar contornos inseguros como liberar qualquer origem.
- **Cenário possível:** a equipe troca mocks por chamadas à API mantendo a URL por IP e interpreta as recusas como falha de autenticação ou rede, abrindo CORS excessivamente para contornar o problema.
- **Remediação recomendada:** escolher uma origem local canônica ou adicionar explicitamente as origens por IP realmente necessárias na configuração de desenvolvimento. Manter lista restrita e separada em produção.
- **Validação:** testar preflight e requisições autenticadas a partir da origem escolhida; origens não autorizadas devem continuar recebendo 403 e sem liberação CORS.
- **Confiança/condições:** confirmado; não afeta as telas atuais porque elas ainda não chamam a API.

## 7. Dependências, segredos e configuração operacional

### 7.1 Resultado da consulta de dependências

Comando executado em cada projeto, sem alteração de versões:

```powershell
npm.cmd audit --json --package-lock-only --ignore-scripts --fetch-retries=0 --fetch-timeout=15000
```

| Projeto | Registros de dependências informados pelo npm | Resultado |
|---|---:|---|
| Frontend | 41, incluindo variantes/opcionais de plataforma no lockfile | 0 avisos retornados |
| Backend | 91 | 1 HIGH: `body-parser@2.3.0` |

A contagem do lockfile não significa que todas as variantes opcionais estão instaladas nesta máquina. O catálogo de advisories também não cobre automaticamente todos os componentes nativos internos de pacotes.

As primeiras tentativas de consulta no sandbox falharam por acesso ao endpoint/cache. A consulta autorizada fora dessa restrição foi concluída e produziu os resultados acima. Nenhum `npm audit fix`, `npm install` ou `npm ci` foi executado durante esta auditoria.

### 7.2 Segredos e histórico Git

- Padrões procurados: chaves privadas PEM/OpenSSH, tokens GitHub, identificadores AWS, JWTs literais, URLs com credenciais e atribuições literais de campos de segredo selecionados.
- Resultado: um candidato no arquivo atual `backend/tests/config.test.js:32`, também presente em um blob histórico. A inspeção confirmou que é uma URL fictícia usada para testar recusa de origem com credenciais.
- Não foi identificado segredo real pelos padrões aplicados. **Não se declara que todo segredo possível foi descartado.**
- `backend/.env.example` tem `JWT_SECRET` vazio e instruções de geração; isso é esperado para um exemplo.
- Não há `backend/.env` no diretório examinado. Não foi impresso valor de segredo de ambiente; apenas sua presença/ausência foi verificada.
- Consulta aos arquivos versionados não encontrou bancos SQLite ou `.env` real; o exemplo de ambiente é versionado intencionalmente.
- `.gitignore` e `backend/.gitignore` excluem dependências, builds, bancos, auxiliares de SQLite, backups e arquivos de ambiente.

### 7.3 Infraestrutura, containers e operação

Não foram encontrados manifests Docker/Kubernetes, configuração de proxy reverso ou infraestrutura como código no inventário. Isso não é uma vulnerabilidade por si só: a arquitetura atual pode ser executada localmente sem containers.

Para hospedagem futura, faltam evidências verificáveis de conta de serviço dedicada, HTTPS público, supervisão do processo, coleta de logs, alerta de disco, política de backup e prontidão. O relatório recomenda definir esses itens antes de operar; não presume que serviços externos desconhecidos estejam mal configurados.

O ambiente usa HTTP em loopback. Não foram alteradas nem avaliadas integralmente regras do firewall Windows, serviços SSH, ACLs do computador inteiro ou outras aplicações. Nenhum serviço novo ficou em execução como resultado da auditoria.

## 8. Validações executadas e resultados

### 8.1 Testes existentes do backend

Foram executados os arquivos:

- `backend/tests/config.test.js`;
- `backend/tests/app.test.js`;
- `backend/tests/integrity.test.js`;
- `backend/tests/leitura.test.js`;
- `backend/tests/auth.test.js`;
- `backend/tests/resumo.test.js`.

Resultado efetivo do Node Test Runner: **76 testes, 76 pass, 0 fail, 0 skipped**, duração aproximada de **15,7 segundos**. A execução foi sequencial por arquivo, com reporter TAP. Os cenários usaram bancos em memória e recursos temporários isolados, sem alterar o banco de trabalho ou os backups existentes.

Esses testes cobrem configuração, CORS, tratamento de erro, limites de corpo, consultas, unicidade/FKs, integridade de confirmações, JWT, revogação, permissões, idempotência autorizada e resumo. Não foram executados todos os demais arquivos de administração, migração, carga e concorrência entre processos. Resultados de relatórios antigos não foram contabilizados como execução atual.

### 8.2 Verificações complementares

| Verificação | Resultado | Alcance |
|---|---|---|
| Página local `127.0.0.1:4173` | HTTP 200 | Preview já existente |
| API local `127.0.0.1:3000/health` | Indisponível na verificação | Não foi iniciada para a auditoria |
| Host arbitrário dentro de `.trycloudflare.com` | HTTP 200 | GET para loopback com cabeçalho Host controlado |
| Host fora da lista | HTTP 403 | Mesmo serviço local |
| `/health` em banco em memória com schema 001–003 | HTTP 200 | Demonstra limite do health atual |
| Login com formato válido no mesmo schema antigo | HTTP 500 `ERRO_INTERNO` | Sem conta real ou dados de trabalho |
| CORS com `Origin: http://127.0.0.1:4173` | HTTP 403 | Configuração padrão isolada |
| CORS com `Origin: http://localhost:4173` | HTTP 200 | Configuração padrão isolada |
| Onze logins inválidos com X-Forwarded-For distintos e mesma origem de conexão | Dez 400, depois 429 | Demonstra uso do IP da conexão; não força bruta |
| JSON gzip benigno em caminho inexistente | HTTP 404 após parsing | Confirma alcance do parser sem autenticação |
| Checksums/migrações do banco e backups | Correspondentes aos arquivos das versões aplicadas | Leitura sem migração |
| Hashes de 129 arquivos preexistentes | Nenhuma diferença | Verificação de preservação |

A verificação de compressão usou bytes gzip válidos enviados diretamente por HTTP a um servidor descartável em loopback, retornando o 404 esperado após o parsing. Nenhuma requisição continha o payload malicioso descrito no advisory.

### 8.3 O que ainda deve ser validado

1. Fluxo completo com identidade real, concessão, preparação, leitura, sincronização e resumo.
2. Duas abas concorrentes com preparação durante uma leitura.
3. Interrupção de energia/fechamento durante gravação e envio, em perfil descartável.
4. Reenvio após resposta perdida, conflito e rejeição administrativa.
5. Atualização do Service Worker enquanto uma operação está ativa e offline.
6. Evicção de armazenamento, concessão negada de persistência e limite de espaço.
7. Câmera, instalação e reabertura offline em dispositivos reais suportados.
8. Restauração operacional a partir de backup separado.
9. Desempenho com a quantidade prevista de ingressos/dispositivos, em ambiente de carga limitado.

## 9. Prioridades de remediação propostas

**Esta seção é um plano para revisão. Nenhuma medida foi aplicada.**

| Prioridade | Ação | Critério de conclusão |
|---|---|---|
| P0 — antes de expor a API | Corrigir AUD-001 | Dependência corrigida, política de compressão definida, regressão e nova consulta de advisories |
| P0 — antes de evento real | Resolver AUD-002 a AUD-005 | Identidade real, fila durável com envio, sem descarte e sem sucesso simulado na operação |
| P1 — ativação controlada | Resolver AUD-007 e AUD-016 | Banco compatível, segredo estável, contas provisionadas, readiness e CORS coerentes |
| P1 — integridade offline | Resolver AUD-006 | Teste de concorrência entre abas e operação consistente |
| P1 — continuidade | Resolver AUD-011 | Backup separado e restauração funcional comprovada |
| P2 — operação | Resolver AUD-008 a AUD-010 | Eventos auditáveis, cotas e política de login adequada à topologia |
| P2 — defesa e entrega | Resolver AUD-012 a AUD-015 | Hosts restritos, renderização consistente, headers e verificações automatizadas |

### 9.1 Mudanças que exigem preparação e autorização própria

| Mudança proposta | Impacto/risco | Preparação e rollback a revisar antes de executar |
|---|---|---|
| Atualizar dependência/lockfile | Pode alterar parsing e compatibilidade HTTP | Preservar versão anterior; validar instalação limpa e regressão; rollback do código/lockfile reintroduz o risco e deve ser temporário |
| Aplicar migrações 004–005 | Modifica o schema persistente | Backup consistente, validação em cópia, janela definida; restauração exige preservar dados posteriores, pois pode perdê-los |
| Configurar JWT/provisionar contas | Introduz identidade operacional | Não substituir segredo existente sem plano; guardar segredo de modo protegido; remover configuração nova não desfaz contas/migrações |
| Mudar política de filas/troca de operação | Pode afetar dados já presentes em aparelhos | Testar migração compatível do IndexedDB; preservar filas e IDs; não usar limpeza do navegador como rollback |
| Alterar hosts/CORS/proxy/headers | Pode bloquear acessos legítimos | Registrar valores anteriores e testar topologia; reverter somente configuração específica em caso de incompatibilidade |
| Automatizar backup/retenção | Envolve cópias sensíveis e possível expurgo | Definir destino/permissões; validar restauração; autorizar separadamente qualquer exclusão por retenção |

## 10. Referências e evidências para acompanhamento

As referências externas apoiam conceitos e o aviso de dependência. As conclusões sobre este projeto derivam dos arquivos e verificações locais identificados em cada achado.

- [Advisory oficial do body-parser — GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
- [GitHub Advisory Database — CVE-2026-111181](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- [Express — configuração atrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
- [Vite — server.allowedHosts](https://vite.dev/config/server-options.html#server-allowedhosts).
- [SQLite — Write-Ahead Logging](https://www.sqlite.org/wal.html).
- [OWASP — segurança de armazenamento e APIs HTML5](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).
- [OWASP — eventos e proteção de logs](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- [README do backend](../backend/README.md).
- [Contrato de autenticação](../backend/docs/contrato-autenticacao.md).
- [Contrato de sincronização](../backend/docs/contrato-sincronizacao.md).
- [Contrato de administração](../backend/docs/contrato-administracao.md).
- [Modelo relacional](../backend/docs/modelo-relacional.md).

**Status da entrega:** auditoria documentada; nenhuma remediação aplicada. Código, configurações de aplicação, banco de trabalho e backups preexistentes preservados.
