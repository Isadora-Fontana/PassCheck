# PassCheck

## Sobre o projeto

PassCheck é uma PWA de controle de acesso para eventos.

O principal diferencial do sistema é permitir a validação de ingressos por QR Code mesmo sem conexão com a internet.

O dispositivo baixa previamente os ingressos do evento e os armazena localmente. Durante uma queda de conexão, as validações continuam acontecendo localmente e são sincronizadas com o servidor quando a internet retorna.

Este projeto é um MVP acadêmico. Priorize simplicidade, clareza e funcionamento. Não adicione funcionalidades desnecessárias.

---

## Equipe

- Isadora: Front-end e slides
- Gabriel: Back-end, banco de dados e apresentação
- Álefe: Documentação e pesquisa

Este repositório contém:

- `frontend/`: PWA, desenvolvida principalmente pela responsável pelo FRONT-END.
- `backend/`: API e banco de dados, desenvolvidos pelo Gabriel.
- `docs/`: documentos gerais do projeto (ex.: plano de ação do back-end).

As instruções deste arquivo tratam principalmente do front-end.

Não implementar o back-end dentro do front-end.

Não alterar arquivos do back-end, banco de dados, autenticação ou endpoints sem solicitação explícita.

---

## Stack do Front-end

Utilizar:

- HTML
- CSS
- JavaScript vanilla
- Vite
- IndexedDB
- PWA e Service Worker
- Biblioteca gratuita para leitura de QR Code (`html5-qrcode@2.3.8`, versão fixa)
- Biblioteca gratuita para gerar QR Code (`qrcode@1.5.4`, versão fixa), usada na gestão de ingressos

Evitar frameworks como React, Vue ou Angular.

Não instalar novas dependências sem autorização.

O código deve ser simples o suficiente para uma estudante universitária compreender, explicar e modificar.

---

## Identidade visual

Paleta oficial:

- Azul principal: #2563EB
- Verde: #22C55E
- Preto: #000000
- Branco: #FFFFFF

Uso recomendado:

- Azul: identidade visual, ações principais e botões.
- Verde: ingresso válido, sucesso e sincronização.
- Preto: textos e elementos de contraste.
- Branco: fundos, superfícies e contraste.

Não utilizar o verde excessivamente como cor decorativa, pois ele possui significado de sucesso/validação.

---

## Perfis e acesso

O sistema terá dois perfis: **GESTOR** e **OPERADOR**.

### GESTOR

- Cria eventos e cadastra os portões de cada evento.
- Cada evento possui um **código exclusivo**, que o gestor pode compartilhar com os operadores.
- Recebe as solicitações de acesso dos operadores ao evento.
- Aprova ou rejeita cada solicitação. **Ao aprovar, deve obrigatoriamente atribuir um portão ao operador.**
- Pode alterar posteriormente o portão atribuído a um operador.

### OPERADOR

- Autenticado, informa o código do evento e solicita acesso.
- Aguarda a aprovação do gestor.
- Somente pode acessar o evento e o portão autorizados pelo gestor.
- Opera o scanner no portão autorizado.

### Situação atual (12/11/2026)

- **Login real** com JWT (`/auth/login`, `/auth/me`). O token fica só na memória da aba: depois de recarregar ou fechar o app é preciso entrar de novo (a operação preparada e a fila continuam no aparelho).
- O back-end tem os papéis **ADMINISTRADOR** (acesso global) e **OPERADOR** (concessões por evento/portão, criadas por linha de comando com `npm run operador` ou pela aprovação do gestor no app, ver D11 abaixo). Contas são criadas só por linha de comando (`npm run admin`, `npm run operador`); não há cadastro pelo app.
- O papel **GESTOR ainda não existe no back-end**. **Solução provisória:** o ADMINISTRADOR (`acessoGlobal`) faz o papel de gestor. Quando o GESTOR existir, as telas devem passar a respeitar o escopo dele.
- **Painel do gestor** (`#/gestor`, botão em "Meus eventos"): ações **exclusivas do gestor**, com a API real: criar evento (portões e quantidade de ingressos por portão), ver o código do evento, aprovar/rejeitar operadores atribuindo um portão, alterar o portão e gerar ingressos com QR Code.
- **Em "Meus eventos", o gestor também pode operar**: escolhe o evento, qualquer portão, baixa os ingressos e usa o scanner como um operador.
- **Aprovação real (D11, autorizada pelo Gabriel em 12/11/2026):** "Aprovar" e "Alterar portão" chamam `POST /eventos/:eventoId/operadores` `{ usuarioId, portaoId }`, que grava a concessão (evento + um portão; outro portão substitui o anterior). Só depois da confirmação do servidor a solicitação muda de situação. Na Vercel depende das permissões do bloco D11 de `deploy/postgres-runtime-grants.sql` no Supabase.
- **Código do evento e solicitações ainda são demonstração**: ficam no `localStorage` do navegador (`frontend/src/acessoEvento.js`), ligados aos eventos reais pelo id; gestor e operador precisam usar o mesmo navegador. O formato **não é contrato da API**. O operador vê em "Meus eventos" o campo "Vincular-se a um novo evento", suas solicitações e os "Eventos liberados para operar".
- As telas antigas de **demonstração** do fluxo do gestor/operador continuam no código (`screens/gestor-*.js`, `screens/operador.js`, `src/demo/`), **fora das rotas**, com dados no `localStorage`. Servem só de referência visual; o formato desses dados **não é contrato da API**.

---

## Fluxo principal

1. Operador acessa o sistema e se autentica.
2. Acessa o evento autorizado (após informar o código do evento e ter a solicitação aprovada pelo gestor).
3. Utiliza o portão atribuído pelo gestor.
4. Prepara o dispositivo.
5. O front solicita à API os ingressos de **todos os portões** do evento.
6. Os ingressos são armazenados no IndexedDB.
7. O dispositivo fica preparado para trabalhar offline.
8. O operador escaneia o QR Code.
9. O código é procurado no IndexedDB.
10. O ingresso é validado localmente. **Somente ingressos do portão autorizado podem ser validados**; os dos outros portões servem para identificar PORTÃO INCORRETO.
11. Se válido, é marcado imediatamente como utilizado.
12. A validação fica pendente de sincronização.
13. Quando a conexão retorna, as validações pendentes são enviadas à API.
14. O servidor confirma a sincronização.

Hoje os passos 1 a 3 são: login real → o operador informa o código em "Meus eventos" (solicitação no navegador) → o gestor aprova com portão (concessão real no servidor) → o evento aparece em "Eventos liberados para operar" → o operador escolhe o portão autorizado. Os passos 13 e 14 estão implementados (ver "Sincronização").

---

## Portões

Cada ingresso pertence a um portão específico.

Exemplo:

Festival UNIVAG

- Portão A
- Portão B
- Portão C

No MVP, considerar preferencialmente:

1 dispositivo = 1 portão.

Um ingresso apresentado no portão incorreto deve ser recusado.

### Troca de evento ou portão

**Comportamento atual do código** (`salvarPreparacao` em `frontend/src/db.js` e tela de preparação):

- A troca de evento, portão, conta ou instalação é **bloqueada enquanto houver validações aguardando envio** ao servidor. Nenhum dado é apagado.
- Validações já respondidas pelo servidor como **CONFLITO** ou **REJEITADA** ficam guardadas no aparelho para revisão e **não bloqueiam** a troca (decisão da Isadora em 12/11/2026).
- Ao preparar de novo o mesmo evento, ingressos utilizados localmente continuam utilizados.

**A alinhar com o Gabriel:**

- Em 24/10/2026 foi decidido permitir a troca com aviso e confirmação, descartando os dados locais (inclusive pendências). Essa regra **não está implementada**: o código atual segue o contrato do back-end, que pede bloquear.
- O contrato (`backend/docs/contrato-sincronizacao.md`, seção 9, item 6) pede bloquear também com CONFLITO/REJEITADA; o front não bloqueia nesses casos (decisão acima).

---

## Estados da validação

O scanner deve conseguir apresentar:

- VÁLIDO
- JÁ UTILIZADO
- INVÁLIDO
- PORTÃO INCORRETO

O sistema também deve informar claramente:

- ONLINE
- OFFLINE
- quantidade de validações pendentes
- última sincronização

---

## QR Code

Cada ingresso possui um código único.

Exemplo:

PC-A7X9K2

O QR Code representa esse identificador.

O QR não decide se o ingresso é válido.

Fluxo:

QR Code
→ leitura do código
→ consulta ao IndexedDB
→ validação local.

---

## IndexedDB

O IndexedDB funciona como banco local do front-end (banco `passcheck`, versão 1, acessado somente por `frontend/src/db.js`).

Deve armazenar pelo menos:

### ingressos

Ingressos de todos os portões do evento preparado (chave `id`, índice único `codigo`).

- id
- codigo
- eventoId
- portaoId
- utilizado

### operacao

Registro da operação na chave `'atual'`:

- eventoId
- eventoNome
- portaoId
- portaoNome
- ultimaSincronizacao (horário da última resposta do servidor ao envio da fila)
- usuarioId, dispositivo e preparadoEm

A mesma store guarda o identificador do dispositivo (UUID) na chave `'dispositivo'` e o usuário dono dessa instalação na chave `'dispositivoUsuario'`.

### validacoesPendentes

Chave `id` autoincremental.

- ingressoId
- codigo
- eventoId
- portaoId
- dataHora
- dispositivo
- usuarioId
- sincronizado
- statusEnvio, motivo, validacaoId, respondidoEm (resultado do envio ao servidor)

Situação de cada registro: sem `statusEnvio` = aguardando envio; `CONFIRMADA` = aceito pelo servidor (`sincronizado: true`); `CONFLITO`/`REJEITADA` = recusado pelo servidor, guardado para revisão, não é reenviado. Os campos novos ficam dentro dos registros; a estrutura do banco continua na versão 1.

---

## API

Front-end e back-end devem permanecer desacoplados.

O front se comunica com o back exclusivamente através da API.

Contrato inicial:

### GET /eventos

Lista os eventos.

### GET /eventos/:eventoId/portoes

Lista os portões do evento.

### GET /eventos/:eventoId/portoes/:portaoId/ingressos

Obtém os ingressos necessários para preparar o dispositivo para operação offline.

### POST /sincronizacao

Envia validações pendentes.

### GET /eventos/:eventoId/resumo

Obtém informações para o dashboard.

Não alterar endpoints ou formatos do contrato da API sem solicitar confirmação.

Quando uma funcionalidade nova ainda não tiver endpoint, usar mocks que respeitem o mesmo formato da API e deixar claro que não são contrato.

### Documentação do back-end

Os contratos detalhados estão em `backend/docs/` e são mantidos pelo Gabriel. Consultar antes de integrar:

- `api-leitura.md`: os três GETs (arrays diretos, IDs numéricos, sem prefixo `/api`).
- `contrato-sincronizacao.md`: formato do `POST /sincronizacao` (agrupamento por evento/portão/dispositivo, `idLocal`, reenvio idempotente).
- `contrato-autenticacao.md`: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/instalacoes`, JWT e regras offline.
- `decisoes.md`: registro das decisões do back-end.

Segundo `api-leitura.md` e `decisoes.md` (D05), os GETs seguem o mesmo formato dos mocks atuais do front (arrays diretos, IDs numéricos, campos camelCase, datas sem horário e `utilizado` booleano). Assim, o formato das respostas e o download de todos os portões do evento, antes pendentes de confirmação, estão definidos pelo back-end.

- `contrato-administracao.md`: criar/editar evento, criar portão, importar ingressos por CSV, listar/resolver pendências (somente ADMINISTRADOR).

### Endpoints usados pelo front hoje

O front chama a API em `/api` (mesma origem na hospedagem; no desenvolvimento, o Vite faz proxy para `http://127.0.0.1:3000`). Todo acesso passa por `frontend/src/api.js` e `frontend/src/http.js`.

- Autenticação: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/instalacoes`.
- Leitura: `GET /eventos`, `GET /eventos/:id/portoes`, `GET /eventos/:id/portoes/:portaoId/ingressos`.
- Sincronização: `POST /sincronizacao`.
- Gestão (ADMINISTRADOR): `POST /eventos`, `POST /eventos/:id/portoes`, `POST /eventos/:id/ingressos/importar` (CSV) e `POST /eventos/:id/operadores` (concessão de operador, D11).

Existem no back-end, mas **ainda não são usados** pelo front: `GET /eventos/:id/resumo`, `PATCH /eventos/:id`, `GET /eventos/:id/pendencias` e `POST /pendencias/:id/resolver`.

Os mocks (`frontend/src/mocks/`) não são mais usados pelo app; ficam como referência e pelas telas de demonstração.

---

## Telas do MVP

Rotas do app (`frontend/src/router.js`):

1. `#/login`: login real (o botão "Cadastrar" é apenas visual, sem ação).
2. `#/eventos`: "Meus eventos" (eventos para operar; o operador também pede acesso por código e vê suas solicitações; o gestor tem o botão "Painel do gestor").
3. `#/portoes`: portões que a conta pode operar.
4. `#/preparacao`: preparação do dispositivo (baixa os ingressos de todos os portões).
5. `#/scanner`: operação/scanner (ONLINE/OFFLINE, pendentes, última sincronização, "Sincronizar agora").
6. Resultado da validação: sobreposição em tela cheia.
7. `#/dashboard`: situação da fila do aparelho (aguardando envio, confirmadas, conflitos, rejeitadas).
8. `#/gestor`, `#/gestor/novo-evento`, `#/gestor/evento`: Painel do gestor: eventos, código, solicitações, portões e ingressos com QR Code (ADMINISTRADOR).

Telas antigas de demonstração fora das rotas: gestor (painel, criar evento com código, solicitações, alterar portão) e operador ("Meus eventos" com solicitações), em `screens/gestor-*.js` e `screens/operador.js`.

A tela de operação/scanner é a principal tela do sistema.

O sistema deve ser responsivo e pensado principalmente para utilização em smartphones durante eventos.

---

## Offline

Funcionamento offline é requisito obrigatório do MVP final.

A implementação deve utilizar:

- Service Worker para disponibilizar a aplicação offline.
- IndexedDB para dados locais.

Não depender da API para validar um ingresso durante a operação.

A API é necessária para preparar/sincronizar o dispositivo, mas a validação durante o evento deve funcionar localmente.

---

## Ordem de desenvolvimento

Seguir esta ordem:

1. Estrutura do front.
2. Interface e navegação.
3. Dados mockados.
4. Integração com API.
5. IndexedDB.
6. Scanner QR.
7. Service Worker/PWA.
8. Validação offline.
9. Sincronização.
10. Dashboard.
11. Testes e acabamento.

Próximas etapas planejadas:

12. Interfaces de gestor e operador (código do evento, solicitação e aprovação de acesso, atribuição de portão) com mocks.
13. Regra de troca de evento/portão (alinhar com o Gabriel).
14. Integração do fluxo do gestor com o back-end (depende do papel GESTOR e dos endpoints a serem criados pelo Gabriel).
15. Gestão de eventos e ingressos com QR Code pela API real.

Não tentar implementar todas as etapas simultaneamente.

---

## Fora do MVP

Não implementar inicialmente:

- pagamentos
- integração com plataformas reais de ingressos
- WebSocket
- criptografia avançada
- assinatura digital avançada
- múltiplos dispositivos offline simultâneos no mesmo portão
- relatórios complexos
- planos comerciais
- microsserviços

Esses recursos podem ser considerados evoluções futuras.

---

## Regras para desenvolvimento

Antes de realizar mudanças grandes na arquitetura, explicar a mudança e pedir confirmação.

Não modificar o contrato da API por conta própria.

Não criar funcionalidades que não foram solicitadas.

Priorizar soluções simples.

Evitar abstrações e estruturas excessivamente complexas.

Separar HTML, CSS e JavaScript de forma organizada.

Evitar arquivos gigantes.

Criar nomes de variáveis e funções claros.

Sempre preservar o funcionamento offline como requisito central.

Preservar o scanner, o IndexedDB, as validações locais e as demais funcionalidades existentes.

Ao encontrar uma decisão que dependa do back-end, informar antes de assumir um comportamento.

Não alterar arquivos do back-end sem solicitação explícita.

Não fazer commit ou push sem solicitação explícita.

---

## Progresso atual (atualizado em 12/11/2026)

Publicado em https://passcheck-mocha.vercel.app (back-end com PostgreSQL/Supabase). As alterações de 11 e 12/11/2026 (sincronização, Painel do gestor, concessão de operador D11, botão "Cadastrar") foram enviadas para a `main` (commit `9c87b26`); **falta validá-las no site publicado e aplicar as permissões D11 no Supabase**.

### Etapas

| # | Etapa | Situação |
|---|---|---|
| 1 | Estrutura do front | Concluída. |
| 2 | Interface e navegação | Concluída. Router por hash. |
| 3 | Dados mockados | Concluída. Hoje usados só pelas telas de demonstração. |
| 4 | Integração com API | Implementada: login/JWT, identidade, eventos, portões, ingressos e registro da instalação. |
| 5 | IndexedDB | Implementada. `frontend/src/db.js`. |
| 6 | Scanner QR | Implementado. Leitura confirmada no iPhone pela equipe. |
| 7 | Service Worker/PWA | Implementado. Instalabilidade aprovada no site publicado em ambiente simulado (`docs/TESTE_INSTALACAO_PWA_2026-11-08.md`); **falta teste em Android/iPhone físicos**. |
| 8 | Validação offline | Implementada; testada no Chrome com câmera simulada; **falta teste em celular real**. |
| 9 | Sincronização | **Implementada no front.** Testada contra o back-end local com dois aparelhos simulados (confirmação, conflito, reenvio). Falta validar na Vercel. |
| 10 | Dashboard | Parcial: mostra a fila do aparelho. O resumo central (`GET /eventos/:id/resumo`) ainda não é usado. |
| 11 | Testes e acabamento | Em andamento. 14 testes automatizados no front (`node --test frontend/tests/`). |
| 12 | Interfaces de gestor e operador | Concluída: Painel do gestor e "Meus eventos" do operador nas rotas reais. |
| 13 | Regra de troca de evento/portão | Bloqueio enquanto houver itens aguardando envio; descarte com confirmação **não** implementado (a alinhar). |
| 14 | Integração do fluxo do gestor | **Parcial.** Aprovação e troca de portão gravam a concessão no servidor (D11). Código do evento e solicitações ainda no navegador; papel GESTOR pendente no back-end. |
| 15 | Gestão de eventos e ingressos com QR Code | **Implementada** para o ADMINISTRADOR. Horário exibido, mas não salvo. |

### Arquivos principais (`frontend/src/`)

- `router.js`: rotas por hash; cada tela recebe `(app, { signal })`.
- `http.js`: transporte da API (JWT, tempo limite, erros; aceita JSON ou texto como CSV).
- `sessao.js`: login, identidade (`/auth/me`) e permissões (`podeOperar`); token só na memória.
- `api.js`: chamadas e conferência das respostas da API.
- `db.js`: todo acesso ao IndexedDB (validação atômica, fila, preparação, montagem dos lotes de envio).
- `sincronizacao.js`: envio da fila ao servidor (gatilhos, um envio por vez, novas tentativas).
- `gestao.js` e `geracaoIngressos.js`: geração de códigos, importação de ingressos e listagem para a gestão.
- `selecao.js`: evento/portão escolhidos, no `sessionStorage`.
- `acessoEvento.js`: código do evento e solicitações dos operadores (demonstração, `localStorage`).
- `screens/`: uma tela por arquivo (as `gestao-*` são as reais; as `gestor-*` e `operador.js` são demonstração).
- `components/resultado.js`: sobreposição de resultado.
- `service-worker.js` e `pwa.js`: Service Worker (gerado no build pelo plugin do `vite.config.js`) e registro.
- `demo/`: dados e perfis de demonstração (fora das rotas).

### Decisões já tomadas

- **Preparação baixa os ingressos de TODOS os portões do evento**; só os do portão autorizado podem ser validados.
- **Classificação** (`classificarIngresso`): não encontrado → INVÁLIDO; outro evento → INVÁLIDO; outro portão do evento → PORTÃO INCORRETO; já utilizado → JÁ UTILIZADO; senão → VÁLIDO.
- **Validação atômica** (`validarIngresso`): uma transação confere a operação vigente, marca `utilizado: true` e cria a pendência; VÁLIDO só é exibido após a transação concluir.
- **Identificador do dispositivo**: UUID (`crypto.randomUUID`) por usuário dono da instalação, registrado no servidor na preparação. Sem HTTPS/localhost, a preparação é recusada.
- **Sincronização**: lotes por evento + portão + dispositivo de cada registro (até 100), `idLocal` = id local; resposta conferida item a item antes de gravar; reenvio seguro (servidor responde `JA_PROCESSADA`). Gatilhos: login, volta da internet, app visível, após cada VÁLIDO e botão "Sincronizar agora". 401 aguarda login; erros temporários tentam de novo (1, 2, 4, 8, 16, 30 s); um envio por vez entre abas (Web Locks). No iPhone, só com o app aberto.
- **Conflitos e rejeições** ficam guardados, não são reenviados e não bloqueiam a troca.
- **Gestão de ingressos**: o front sorteia códigos `PC-XXXXXXXX` (8 caracteres, gerador criptográfico, sem caracteres ambíguos) e importa por CSV (até 1000 por importação, tudo ou nada). Se o servidor recusar por código repetido, sorteia de novo; se a conexão cair, não repete sozinho. O QR Code contém só o código.
- **Scanner**: lê só QR Code; pausa durante o resultado; ignora o mesmo código por 3 s; diferencia falha de leitura de código não cadastrado; mostra a situação real do envio (nunca "Envio em dia" com itens na fila).
- **Service Worker**: cache-first para os arquivos do app; não faz cache de `/api` nem de requisições com token; versão do cache muda a cada build; nunca mexe no IndexedDB.
- **Armazenamento persistente** é solicitado ao navegador (`navigator.storage.persist`), sem garantia de concessão.

### A definir com o back-end (Gabriel)

Lista completa no relatório `RELATORIO_ESTADO_PASSCHECK_2026-11-11.txt`, na raiz. Principais:

- Papel GESTOR (escopo por evento) × ADMINISTRADOR (global) e formato do `/auth/me`.
- Código do evento e solicitação de acesso pelo servidor (a concessão na aprovação já existe: D11).
- Aplicar no Supabase as permissões do bloco D11 de `deploy/postgres-runtime-grants.sql`.
- Horário do evento (hoje o contrato aceita só a data).
- Cadastro de usuários pelo app.
- FUNC-001: `GET /eventos/:id/pendencias` falha na Vercel.
- Validar a sincronização no ambiente publicado.
- Regra de troca de operação e bloqueio por conflitos/rejeições (ver "Troca de evento ou portão").

### Como testar

- Primeira vez (na raiz): `npm run deps`, `npm run setup` (cria `backend/.env` e o SQLite local), opcional `npm --prefix backend run db:seed` (dados de exemplo), `npm run admin` (primeiro administrador) e `npm run operador` (operador com concessões, ex.: `[{"eventoId":1,"portoes":[1]}]`).
- Desenvolvimento: em dois terminais, `npm run dev:api` (API em `127.0.0.1:3000`) e `npm run dev:web` (app em `http://127.0.0.1:5173`, sem Service Worker).
- Testes automatizados do front: `node --test frontend/tests/`.
- Offline/PWA: build + preview, ou o site publicado. O `vite.config.js` atual aceita só `127.0.0.1`; para testar no celular por túnel é preciso liberar o endereço (`allowedHosts`) ou usar o site publicado (HTTPS).
- No iPhone, o app instalado na Tela de Início tem dados separados do Safari.
- O projeto pede Node 24; o computador da Isadora usa Node 26 (funcionou nos testes).

### Pendências conhecidas

- Código do evento e solicitações só no navegador (gestor e operador no mesmo navegador) até o back-end ter esses endpoints.
- Trocar o portão de um operador com validações ainda não enviadas do portão antigo faz o servidor recusá-las (ficam no aparelho).
- Horário do evento exibido na criação, mas não salvo ("Horário a definir" nos ingressos).
- Botão "Cadastrar" do login sem ação.
- Resumo central, edição de evento e tratamento de pendências ainda sem interface.
- Criar evento + portões + ingressos são chamadas separadas: se a conexão cair no meio, o evento fica incompleto (a tela do evento permite concluir).
- Falta testar em celulares reais e no site publicado.
