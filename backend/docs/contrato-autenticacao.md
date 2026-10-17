# Autenticação e autorização — contratos mínimos da Etapa 7

Definidos antes da implementação em 17/10/2026, no escopo autorizado por Gabriel.
Não alteram os JSONs de sucesso dos GETs de negócio ou de POST /sincronizacao.

## Identidade e permissões

- ADMINISTRADOR: leitura e sincronização de todos os eventos/portões cadastrados.
- OPERADOR: leitura somente dos eventos explicitamente vinculados. Pode ler TODOS
  os portões e ingressos desses eventos para reconhecer PORTÃO INCORRETO offline.
  Sincronização exige também concessão explícita para o portão informado.
- Nenhuma concessão implica permissão para evento diferente. Ausência de vínculo
  nega acesso. O resumo é acessível aos mesmos leitores autorizados do evento.
- Instalação tem identificador opaco do contrato anterior e proprietário persistente,
  distinto da identidade do operador. Registro autenticado antes da preparação;
  sincronização exige instalação ativa pertencente ao usuário, inclusive para admin.
  Não há transferência automática de proprietário nem identidade derivada do JWT.
- `usuarios`: login único normalizado, hash com salt, papel, ativo, versão de token.
  `usuarios_eventos` e `usuarios_portoes`: concessões explícitas com FKs compostas.
  `instalacoes`: identificador único, usuário proprietário, ativo e criação UTC.
  Migração 004 aditiva, sem modificar 001–003 ou os recibos existentes.

## Endpoints

### POST /auth/login — público, application/json

Corpo estrito `{ "usuario": "operador", "senha": "senha informada pelo usuário" }`.
Login normalizado com trim/lowercase, 3–64 caracteres ASCII `[a-z0-9._-]`, primeiro
alfanumérico. Senha não é normalizada: 12–128 caracteres, máximo 512 bytes UTF-8.
Resposta 200: `{ "accessToken": "<JWT>", "tokenType": "Bearer", "expiresIn": 900,
"usuario": {"id": 1, "usuario": "operador", "papel": "OPERADOR"} }`.
`expiresIn` segue JWT_TTL_SECONDS; IDs são atribuídos pelo SQLite, exemplo apenas.
Credencial incorreta, conta ausente ou inativa: mesmo 401 CREDENCIAIS_INVALIDAS.
Formato inválido: 400 DADOS_INVALIDOS sem valores. Não devolver hash/salt/senha.

Proteção local: até 10 tentativas por IP a cada 15 minutos, incluindo sucesso,
com memória limitada e no máximo duas verificações simultâneas por processo;
excesso 429 com Retry-After. Sem confiar em X-Forwarded-For; não configurar proxy
confiável automaticamente. Contadores reiniciam com processo e não são distribuídos.

### GET /auth/me — Bearer obrigatório

200: `{ "usuario": {"id":1,"usuario":"operador","papel":"OPERADOR"},
"acessoGlobal": false, "eventos": [{"eventoId":1,"portoesSincronizacao":[1]}] }`.
Admin: acessoGlobal true, eventos []; os cadastros atuais vêm dos GETs existentes.
Permissões são consultadas no banco, não congeladas no JWT.

### POST /auth/logout — Bearer obrigatório

204, sem corpo. Incrementa a versão do usuário e revoga TODOS os seus tokens
online, inclusive de outras instalações. Não exclui instalação, fila ou histórico.
Sem refresh token nesta etapa: renovar acesso significa novo login com credenciais.

### POST /auth/instalacoes — Bearer obrigatório, application/json

Corpo estrito `{ "dispositivo": "UUID-ou-identificador-legado" }`, mesma validação
da sincronização, namespace seed: proibido. 200 `{ "dispositivo": "..." }` ao criar
ou repetir registro próprio ativo. Identificador de outro usuário/inativo: 403
ACESSO_NEGADO. Identificador legado com recibos mas sem proprietário cadastrado:
403, sem adoção automática; requer procedimento futuro explícito de atribuição.

## JWT e senhas

JWT HS256 via biblioteca jose; chave de JWT_SECRET, base64url canônico de 32–64
bytes aleatórios, sem valor padrão. Falta/erro impede inicialização. TTL padrão
900 segundos, configurável de 60 a 3600 por JWT_TTL_SECONDS. Issuer
`passcheck-backend`, audience `passcheck-pwa`, typ JWT; algoritmo, assinatura,
sub, iat, exp, jti e versão são conferidos. Papel e permissões vêm do banco.
Token inválido/ausente/expirado/revogado: 401 NAO_AUTENTICADO com WWW-Authenticate.
Usuário autenticado sem escopo/instalação: 403 ACESSO_NEGADO, sem revelar recibos.
Mudança de senha/papel/ativo revoga tokens por trigger; concessões e instalações
são verificadas novamente, sem cache de permissões. Logout incrementa versão.

Senhas: scrypt assíncrono nativo, N=131072, r=8, p=1, salt aleatório de 16 bytes,
chave derivada de 64 bytes, comparação timingSafeEqual. Verificação de login
inexistente executa o mesmo custo criptográfico. Não usar SHA-256 como hash de
senha. Parâmetros seguem [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

TLS é necessário fora de localhost. Não colocar JWT em URL, logs, payload de
sincronização ou cache do service worker. CORS permite Authorization somente
nas origens configuradas; UUID e CORS não autenticam ninguém.

## Rotas de negócio e ordem de autorização

Health público. GET /eventos exige JWT e filtra eventos do operador. Demais GETs
validam ID, autorizam evento e só então consultam dados. Escopo não concedido
recebe 403 mesmo se o recurso informado não existir; admin mantém 404 de inexistência.
Todos os portões podem ser baixados dentro do evento autorizado, independentemente
dos portões concedidos para sincronizar.

POST /sincronizacao autentica antes de processar o corpo. Após validar estrutura,
confere usuário ativo/versão, concessões e proprietário da instalação dentro da
transação de CADA item, ANTES de consultar recibos. Até reenvios exigem autorização
atual. Se acesso for revogado entre itens, itens anteriores podem estar confirmados;
401/403 não autorizam limpar a fila e permitem reenvio quando acesso for regularizado.
Recusado por autorização não cria recibo, auditoria ou confirmação para aquele item.

## Offline e integração necessária com Isadora

Hoje login.js apenas navega para eventos, api.js usa mocks e a preparação baixa
todos os portões. IndexedDB guarda operação, dispositivo e pendências, mas não
possui identidade de usuário nem fluxo de login/renovação. Nada disso será alterado
nesta etapa. O backend protegido não torna essas telas autenticadas automaticamente.

Fluxo futuro: login online → /auth/me → registrar instalação → escolher evento e
portão autorizado para sincronização → baixar todos os ingressos do evento →
persistir operação com usuário/instalação/permissões observadas → scanner local.
JWT preferencialmente em memória; novo login após recarga quando precisar da API.
Não guardar senha. A operação/fila persistida deve sobreviver a logout e recarga.

Durante queda de rede, uma operação já preparada pode continuar lendo QR e
registrando pendências localmente, inclusive após expiração do token. Expiração
controla acesso à API, não apaga cache nem exige consulta por leitura. Ao reconectar,
renovar login com o mesmo usuário antes de enviar; 401/403 preservam tudo.
Revogação remota só pode ser observada online. Não há garantia de revogação imediata
de cache desconectado nem comprovação criptográfica de presença física offline.

Troca de usuário/evento/portão ou rotação da identidade deve ser bloqueada enquanto
existirem pendências não resolvidas. Guardar proprietário em cada pendência/operação,
manter dispositivo/idLocal originais e verificar a troca em transação IndexedDB
abrangendo operação e fila. Não reenviar pendências de A como B, não gerar novos IDs
para contornar 403 e não limpar IndexedDB para liberar login. Revogação com pendências
exige regularização ou fluxo administrativo futuro; não existe resolução aqui.

Com fila inteiramente resolvida, uma futura troca de operador precisa encerrar
explicitamente a preparação e iniciar outro ciclo de instalação, com novo ID
criptográfico registrado para o novo proprietário. Não transferir o ID antigo.
O backend preserva o vínculo anterior; esse fluxo de interface não foi implementado.

## Provisionamento e limites

Não criar contas por migração/seed. Primeiro administrador via comando local
`npm.cmd run auth:bootstrap`, recebendo JSON por stdin, sem senha em argumento ou
arquivo versionado; recusar se já existir administrador. O comando usa hash real,
transação e migrações atuais. `auth:criar-operador` será ferramenta local mínima
para criar operador com concessões explícitas, não CRUD HTTP. Acesso ao arquivo
SQLite/CLI é privilégio administrativo do sistema operacional.

Comandos aceitam somente inserção, não redefinem senha nem substituem conta.
Procedimento detalhado e testes serão registrados no relatório da etapa. Nenhuma
conta, segredo ou migração será aplicada ao desenvolvimento nesta entrega: somente
bancos isolados serão escritos. Configurar segredo e aplicar 004 serão passos
explícitos de ativação pelo responsável, preservando credenciais existentes.
