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

### Situação atual

- As novas interfaces de gestor e operador serão desenvolvidas inicialmente **com mocks**.
- A autenticação real e a integração com o back-end ainda são etapas pendentes no front-end. Hoje o login é apenas visual.
- O papel GESTOR é **novo e ainda não existe no back-end**. O back-end atual possui os papéis ADMINISTRADOR (acesso global) e OPERADOR, com concessões por evento/portão provisionadas por linha de comando (ver `backend/docs/contrato-autenticacao.md`). Não há endpoints para criar eventos, gerar o código do evento, solicitar acesso ou aprovar/rejeitar solicitações.
- O papel GESTOR, o código do evento e os endpoints de solicitação/aprovação/alteração de portão serão definidos e implementados posteriormente pelo Gabriel. No front-end, os mocks dessas telas não devem ser tratados como contrato da API.

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

Hoje, enquanto perfis e autenticação não existem no front, os passos 1 a 3 são feitos escolhendo evento e portão nas telas de seleção (dados mockados).

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

- A troca de evento ou portão é **permitida mediante aviso e confirmação** do operador.
- No MVP, a troca pode **descartar os dados locais da operação anterior** (ingressos, operação e validações pendentes).
- Se houver validações pendentes, o aviso deve mostrar de forma destacada a **quantidade de validações pendentes** que serão descartadas. Entradas descartadas antes de sincronizar se perdem e não podem ser recuperadas pelo servidor.
- **Situação atual do código:** `salvarPreparacao` (`frontend/src/db.js`) e a tela de preparação ainda **bloqueiam** a troca enquanto houver pendências. A adaptação para a nova regra é uma etapa futura.
- O contrato do back-end (`backend/docs/contrato-autenticacao.md`) recomenda bloquear a troca com pendências e não limpar o IndexedDB. Essa divergência precisa ser alinhada com o Gabriel antes da implementação.

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
- ultimaSincronizacao

A mesma store guarda o identificador do dispositivo na chave `'dispositivo'`.

### validacoesPendentes

Chave `id` autoincremental.

- ingressoId
- codigo
- eventoId
- portaoId
- dataHora
- dispositivo
- sincronizado

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

Enquanto o back-end não estiver integrado, utilizar mocks que respeitem o mesmo formato da API.

### Documentação do back-end

Os contratos detalhados estão em `backend/docs/` e são mantidos pelo Gabriel. Consultar antes de integrar:

- `api-leitura.md`: os três GETs (arrays diretos, IDs numéricos, sem prefixo `/api`).
- `contrato-sincronizacao.md`: formato do `POST /sincronizacao` (agrupamento por evento/portão/dispositivo, `idLocal`, reenvio idempotente).
- `contrato-autenticacao.md`: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/instalacoes`, JWT e regras offline.
- `decisoes.md`: registro das decisões do back-end.

Segundo `api-leitura.md` e `decisoes.md` (D05), os GETs seguem o mesmo formato dos mocks atuais do front (arrays diretos, IDs numéricos, campos camelCase, datas sem horário e `utilizado` booleano). Assim, o formato das respostas e o download de todos os portões do evento, antes pendentes de confirmação, estão definidos pelo back-end.

Segundo essa documentação, o back-end já implementa os GETs, o `POST /sincronizacao`, o resumo e a autenticação com JWT. O front-end ainda não está integrado a nenhum deles.

---

## Telas do MVP

Existentes:

1. Login (apenas visual)
2. Eventos
3. Seleção de evento/portão
4. Preparação do dispositivo
5. Operação / Scanner
6. Resultado da validação (sobreposição)
7. Dashboard (somente com "—")

Planejadas, inicialmente com mocks:

- Gestor: criar evento, cadastrar portões, ver o código do evento, solicitações de acesso (aprovar atribuindo portão / rejeitar) e alterar o portão de um operador.
- Operador: informar o código do evento e aguardar aprovação.

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
13. Nova regra de troca de evento/portão com aviso e confirmação (após alinhar com o Gabriel).
14. Autenticação real e integração dos perfis com o back-end (depende dos endpoints a serem criados pelo Gabriel).

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

## Progresso atual (atualizado em 24/10/2026)

### Etapas

| # | Etapa | Situação |
|---|---|---|
| 1 | Estrutura do front | Concluída. Repositório com `frontend/` e `backend/` separados. |
| 2 | Interface e navegação | Concluída. Router por hash (`#/login`, `#/eventos`, ...). |
| 3 | Dados mockados | Concluída. `frontend/src/mocks/eventos.js` e `frontend/src/mocks/ingressos.js`. |
| 4 | Integração com API | **Pendente.** `frontend/src/api.js` ainda devolve os mocks; trocar o corpo das funções por `fetch`. O back-end já oferece os GETs, mas exige JWT. |
| 5 | IndexedDB | Implementada. `frontend/src/db.js`. |
| 6 | Scanner QR | Implementado. Leitura confirmada no iPhone pela equipe. |
| 7 | Service Worker/PWA | Implementado; **verificação pendente**. Abertura offline testada apenas no Chrome (computador). Instalação como PWA e funcionamento offline completo no iPhone ainda não verificados. |
| 8 | Validação offline | Implementada; **verificação pendente** no iPhone offline. Regras testadas com IndexedDB simulado e no Chrome. |
| 9 | Sincronização | **Pendente no front.** O back-end já implementa `POST /sincronizacao`; o front ainda não envia as pendências. |
| 10 | Dashboard | **Pendente.** Tela existe só com "—". |
| 11 | Testes e acabamento | **Pendente.** |
| 12 | Interfaces de gestor e operador | **Pendente.** |
| 13 | Nova regra de troca de evento/portão | **Pendente.** Código atual ainda bloqueia com pendências. |
| 14 | Autenticação real e integração dos perfis | **Pendente.** |

### Arquivos principais (`frontend/src/`)

- `router.js`: rotas por hash.
- `api.js`: único ponto de acesso à API (hoje usa mocks com atraso simulado em `buscarIngressos`).
- `selecao.js`: evento/portão escolhidos, no `sessionStorage`.
- `db.js`: todo acesso ao IndexedDB.
- `screens/`: uma tela por arquivo.
- `components/resultado.js`: sobreposição de resultado (aceita `codigo` e `aoFechar`).
- `service-worker.js`: modelo do SW; o `/sw.js` final é gerado no build pelo plugin em `frontend/vite.config.js`.
- `pwa.js`: registra o Service Worker (somente em produção).

### Decisões já tomadas

- **Preparação baixa os ingressos de TODOS os portões do evento** (chamando o endpoint de ingressos uma vez por portão). Os ingressos dos outros portões servem para identificar PORTÃO INCORRETO. O contrato de autenticação do back-end permite essa leitura dentro do evento autorizado.
- **Classificação** (`classificarIngresso` em `db.js`): não encontrado → INVÁLIDO; outro evento → INVÁLIDO; mesmo evento e outro portão → PORTÃO INCORRETO; já utilizado → JÁ UTILIZADO; senão → VÁLIDO. Somente ingressos do portão autorizado podem ser validados.
- **Validação atômica** (`validarIngresso` em `db.js`): em uma única transação, marca `utilizado: true` e cria a pendência. O resultado só é devolvido após a transação concluir; se falhar, VÁLIDO não é exibido.
- **Identificador do dispositivo**: UUID salvo na store `operacao` com a chave `'dispositivo'` (o registro da operação usa a chave `'atual'`).
- **Proteções atuais da preparação** (`salvarPreparacao`): nunca apaga validações pendentes; bloqueia troca de evento/portão com pendências (também na interface); ao preparar de novo o mesmo evento, ingressos utilizados localmente continuam utilizados. O bloqueio de troca será substituído pela nova regra (ver "Troca de evento ou portão").
- **`ultimaSincronizacao`** é preenchida com a hora da preparação.
- **Scanner**: lê só QR Code; pausa durante o resultado; ignora o mesmo código por 3 s após fechar; diferencia falha de leitura (dica abaixo da câmera) de código não cadastrado (INVÁLIDO).
- **Service Worker**: cache-first para os arquivos do app; não faz cache de API nem de outros domínios; a versão do cache muda a cada build e o cache antigo é apagado na ativação; nunca mexe no IndexedDB.
- **ONLINE/OFFLINE** usa `navigator.onLine` com os eventos `online`/`offline`.

### A definir com o back-end (Gabriel)

- Papel GESTOR, código exclusivo do evento e endpoints de criação de eventos/portões, solicitação de acesso, aprovação/rejeição e alteração de portão.
- Regra de troca de evento/portão com pendências (front: permitir descartando; contrato do back-end: bloquear).
- Integração da autenticação na PWA (login online, `/auth/me`, registro da instalação), conforme `backend/docs/contrato-autenticacao.md`.

### Como testar

- Desenvolvimento: `cd frontend && npm run dev` (sem Service Worker), em `http://127.0.0.1:5173/`.
- Offline/PWA: `cd frontend && npm run build && npm run preview` e túnel HTTPS (`cloudflared tunnel --url http://127.0.0.1:4173`). O `vite.config.js` aceita qualquer `*.trycloudflare.com`.
- No iPhone, o app instalado na Tela de Início tem dados separados do Safari, e cada túnel novo é um endereço (origem) diferente.

### Pendências conhecidas

- Botões "Simular resultado (temporário)" no scanner ainda existem; o botão "Válido" não grava nada. Remover no acabamento.
- "Última sincronização" no scanner ainda mostra "—".
- Login é apenas visual; não há perfis de gestor/operador.
- O identificador do dispositivo usa `Math.random` como alternativa quando `crypto.randomUUID` não está disponível; o contrato de sincronização do back-end pede gerador criptográfico e criação atômica (ver `backend/docs/contrato-sincronizacao.md`).
