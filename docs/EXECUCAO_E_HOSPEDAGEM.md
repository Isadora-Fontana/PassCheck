# PassCheck — execução e hospedagem

Atualizado em 30/10/2026, America/Sao_Paulo.

## O que esta entrega executa

Login real → identidade/permissões → eventos autorizados → seleção de portão
autorizado → registro da instalação → download dos ingressos → preparação local
→ leitura offline. Frontend e API podem usar o mesmo domínio, com API em `/api`.
As rotas originais do backend continuam disponíveis com seus contratos anteriores.

O envio da fila do navegador, indicadores centrais na interface e os fluxos de
gestor/convites/solicitações ainda são próximas etapas. Os módulos de demonstração
permanecem no fonte, mas não são importados pelas rotas da aplicação integrada.
Não usar esta entrega isolada como controle de entrada de um evento real antes
de concluir sincronização e validar câmeras/dispositivos físicos.

## Execução local

Requisitos: Node.js >=24.14.0 e <25, npm e um terminal interativo.
Em instalação nova, na raiz:

```sh
npm run deps
npm run setup
npm run admin
npm run build
npm start
```

Endereço: `http://localhost:3000`. O processo continua no terminal; Ctrl+C encerra
a API e fecha a conexão SQLite. Em Windows com restrição ao `npm.ps1`, use
`npm.cmd` nos mesmos comandos.

`setup` cria `backend/.env` somente se não existir, com chave aleatória, host
loopback e origens locais. Nunca imprime o segredo. Se o banco já existir, cria
um backup consistente antes das migrações. Executa apenas migrações pendentes,
sem seed, criação de contas ou substituição de configurações existentes.
Um `.env` existente com configuração inválida deve ser corrigido explicitamente.

`admin` pede login e senha oculta com confirmação. Recusa outro bootstrap se já
existir administrador. Senhas: 8–14 caracteres, com pelo menos uma letra maiúscula
e um caractere especial; os detalhes de normalização e
hash estão em `backend/docs/contrato-autenticacao.md`. Não colocar a senha em
argumentos de comandos, código ou arquivos versionados.
Senha fora do tamanho permitido ou confirmação diferente são informadas no
terminal e permitem nova tentativa. O comando verifica a existência do administrador
antes de pedir credenciais; erros de banco/configuração não exibem valores sensíveis.

O SQLite desta cópia já tem eventos de desenvolvimento. Uma instalação nova cria
as tabelas vazias. Para exemplos **somente em desenvolvimento**, execute
`npm --prefix backend run db:seed` explicitamente. O seed não cria usuários e é
recusado em produção. Para dados reais, o administrador utiliza os endpoints
existentes de cadastro/importação documentados em
`backend/docs/contrato-administracao.md`; a interface administrativa será integrada
na etapa de gestão.

Criar operador: `npm run operador`. Informe usuário, senha e concessões como
`[{"eventoId":1,"portoes":[1]}]`, usando IDs reais. A conta só verá eventos vinculados
e só poderá preparar os portões concedidos. Administrador tem acesso global.

## Desenvolvimento

Em dois terminais:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Vite usa `/api` como proxy para `http://127.0.0.1:3000`. O Service Worker é gerado
no build de produção; para ensaiar PWA/offline, utilize o build servido pelo backend.
O Vite não autoriza domínios de túneis por curinga.

## Docker e HTTPS

Arquivos: `Dockerfile`, `compose.yaml` e `deploy/Caddyfile`. Requer Docker Engine
ativo e Docker Compose. A imagem usa Node 24, dependências instaladas por lockfile,
build do frontend e usuário sem privilégios. Dados ficam no volume
`passcheck_data`, separado da imagem. O volume usa SQLite com WAL; mantenha apenas
uma instância da API e armazenamento persistente local ao servidor.

Para Docker local:

```sh
npm run setup:docker
docker compose build
docker compose run --rm app node src/db/cli.js migrate
docker compose run --rm app node src/provisionar-interativo.js bootstrap
docker compose up -d app
```

Abra `http://localhost:3000`. `setup:docker` gera `.env` na raiz somente se ainda
não existir; é diferente do `backend/.env` usado fora do Docker. Não copie chaves
de desenvolvimento para produção. Para criar operador no volume do Docker:

```sh
docker compose run --rm app node src/provisionar-interativo.js criar-operador
```

Para publicar num domínio, aponte seu DNS ao servidor e disponibilize as portas
80/443 no provedor. Em servidor novo, gere a configuração com sua origem real:

```sh
npm run setup:docker -- https://passcheck.seudominio.com
docker compose build
docker compose run --rm app node src/db/cli.js migrate
docker compose run --rm app node src/provisionar-interativo.js bootstrap
docker compose --profile publico up -d
```

Se já existe `.env`, ajuste `PUBLIC_ORIGIN` e `DOMAIN` nesse arquivo preservando
`JWT_SECRET`; o gerador recusa sobrescrever. Caddy faz a terminação TLS e encaminha
as chamadas à API. Não registrar corpo de login nem cabeçalho Authorization no
proxy. O navegador exige HTTPS fora de localhost para câmera/PWA.

O Compose mantém a porta 3000 vinculada a `127.0.0.1`. O backend aceita exatamente
um salto de proxy nessa configuração, e Caddy substitui `X-Forwarded-For` pelo IP
do cliente. Isso evita que todos compartilhem o limite de login do proxy. Não
exponha essa origem diretamente nem coloque outro proxy/CDN na frente sem revisar
a política de IP/limitação. Fora do Compose, `TRUST_PROXY_HOPS` é `0` por padrão.

Uma primeira inicialização em produção exige schema atualizado e build existente;
o processo falha antes de atender se essas condições não forem satisfeitas. O
start não executa migrações nem cria contas automaticamente.

## Hospedagem sem Docker

Compile o frontend com `npm run build` e instale as dependências do backend com
`npm --prefix backend ci --omit=dev` no servidor. Configure as variáveis abaixo
no ambiente da hospedagem ou em `backend/.env` protegido:

| Variável | Uso |
|---|---|
| `NODE_ENV=production` | Ativa verificações de produção |
| `HOST` / `PORT` | Endereço/porta aceitos pelo provedor; `PORT` é lido do ambiente |
| `DATABASE_PATH` | Caminho absoluto num disco persistente, gravável pela API |
| `JWT_SECRET` | 32–64 bytes aleatórios em base64url, estáveis entre reinícios |
| `JWT_TTL_SECONDS` | 60–3600 segundos; padrão 900 |
| `CORS_ORIGINS` | Origem exata do frontend, sem barra final ou curingas |
| `FRONTEND_DIST` | Caminho do build; padrão relativo ao backend: `../frontend/dist` |
| `TRUST_PROXY_HOPS` | `0` direto; `1` somente com um proxy sanitizado e origem restrita |

Execute migrações explicitamente antes da inicialização e provisione o primeiro
administrador por terminal seguro. O comando de início é `npm start` na raiz
ou `node src/server.js` dentro do backend. Configure HTTPS no provedor. Armazenamento
efêmero e múltiplas réplicas com arquivos SQLite independentes não atendem a este
modelo. Não há deploy remoto executado por estes comandos de preparação.

Para frontend hospedado separadamente, defina `VITE_API_URL` com a URL HTTPS da
API **antes do build**, incluindo `/api` se usar o servidor conjunto. CORS deve
conter a origem exata do frontend. Não há senha ou segredo em variáveis `VITE_*`.

## Verificação e operação

- `/api/health`: processo e conexão SQLite respondendo.
- `/api/ready`: migrações, colunas, índices e triggers necessários presentes.
- `/api/eventos` sem Bearer: 401; isso confirma a proteção, não uma falha do banco.
- No navegador: entrar, selecionar evento e portão, preparar e continuar a operação.
- A preparação é download; não significa envio de validações pendentes.

`npm test` executa os testes do transporte/sessão e a suíte do backend.
`npm run test:browser`, após o build, usa Chrome/Edge/Chromium instalado com um perfil
temporário e SQLite em memória. Pode-se selecionar o binário com
`PASSCHECK_BROWSER`. O ensaio não acessa o perfil pessoal nem sua operação real.

## Backups, atualização e reversão

Backup local: `npm run backup`. Usa SQLite Online Backup, inclui commits do WAL,
valida integridade e chaves estrangeiras e nunca sobrescreve um backup existente.
Os arquivos em `backend/backups` são privados e ignorados pelo Git.

No Docker:

```sh
docker compose exec app node src/db/backup-cli.js /app/data/backups
```

Retire cópias desses backups para armazenamento separado do servidor/volume,
com acesso restrito e política de retenção. Guardar o backup só no mesmo volume
não protege contra perda desse volume.

Antes de atualizar, faça backup consistente e preserve a versão anterior da
imagem/fontes e a configuração. Aplique migrações explicitamente, suba a versão
nova e verifique `/api/ready`. Não use `docker compose down -v` em dados que precisam
ser preservados: essa opção apaga volumes.

Para reverter código, restaure os arquivos/imagem preservados, respeitando as
alterações que já existiam no checkout. Para reverter dados, primeiro interrompa
as escritas numa janela autorizada e faça outro backup do estado atual; restaure
o backup escolhido num caminho/volume novo, valide integridade e só então mude
`DATABASE_PATH`. Não sobrescreva o banco ou WAL/SHM enquanto estiverem abertos.
Reconcilie registros posteriores ao backup. Não há downgrade automático de schema.

## Sessão e dados offline

JWT fica apenas em memória. Recarregar a página exige novo login para consultar
a API; uma operação preparada pode ser retomada offline sem JWT. Isso é uma
capacidade local do dispositivo, não uma nova autenticação no servidor. Mantenha
o aparelho sob controle do operador; revogação remota não invalida imediatamente
um aparelho desconectado. O armazenamento local não foi criptografado nesta etapa.

Logout tenta revogar todos os tokens daquele usuário no servidor e descarta a
sessão em memória, inclusive quando a rede falha. Na falha de rede, o token remoto
permanece válido até expirar ou ser revogado; a fila e a operação ficam preservadas.

Com pendências, a troca de usuário, evento, portão ou instalação é bloqueada.
Pendências antigas sem proprietário são preservadas e impedem sua adoção por
outra conta. Não limpar o IndexedDB para liberar a troca; é necessário um futuro
procedimento de conciliação. Com a fila resolvida, uma troca de proprietário cria
uma instalação nova, sem transferir a instalação anterior no servidor.
