# PassCheck

## Sobre o projeto

PassCheck é uma PWA de controle de acesso para eventos.

O principal diferencial do sistema é permitir a validação de ingressos por QR Code mesmo sem conexão com a internet.

O dispositivo baixa previamente os ingressos do evento/portão e os armazena localmente. Durante uma queda de conexão, as validações continuam acontecendo localmente e são sincronizadas com o servidor quando a internet retorna.

Este projeto é um MVP acadêmico. Priorize simplicidade, clareza e funcionamento. Não adicione funcionalidades desnecessárias.

---

## Equipe

- Isadora: Front-end e slides
- Gabriel: Back-end, banco de dados e apresentação
- Álefe: Documentação e pesquisa

Este diretório é desenvolvido principalmente pela responsável pelo FRONT-END.

Não implementar o back-end dentro do front-end.

---

## Stack do Front-end

Utilizar:

- HTML
- CSS
- JavaScript
- Vite
- PWA
- Service Worker
- IndexedDB
- Biblioteca gratuita para leitura de QR Code

Evitar frameworks como React, Vue ou Angular.

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

## Fluxo principal

1. Usuário acessa o sistema.
2. Seleciona um evento.
3. Seleciona um portão.
4. Prepara o dispositivo.
5. O front solicita os ingressos daquele evento/portão à API.
6. Os ingressos são armazenados no IndexedDB.
7. O dispositivo fica preparado para trabalhar offline.
8. O operador escaneia o QR Code.
9. O código é procurado no IndexedDB.
10. O ingresso é validado localmente.
11. Se utilizado, é marcado imediatamente como utilizado.
12. A validação fica pendente de sincronização caso não exista internet.
13. Quando a conexão retorna, as validações pendentes são enviadas à API.
14. O servidor confirma a sincronização.

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

O IndexedDB funciona como banco local do front-end.

Deve armazenar pelo menos:

### ingressos

- id
- codigo
- eventoId
- portaoId
- utilizado

### operacao

- eventoId
- eventoNome
- portaoId
- portaoNome
- ultimaSincronizacao

### validacoesPendentes

- ingressoId
- codigo
- portaoId
- eventoId
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

Enquanto o back-end não estiver disponível, utilizar mocks que respeitem o mesmo formato da API.

---

## Telas do MVP

Criar inicialmente:

1. Login
2. Eventos
3. Seleção de evento/portão
4. Preparação do dispositivo
5. Operação / Scanner
6. Resultado da validação
7. Dashboard

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

Ao encontrar uma decisão que dependa do back-end, informar antes de assumir um comportamento.

Não alterar arquivos do back-end sem solicitação explícita.

---

## Progresso atual (atualizado em 16/10/2026)

### Etapas

| # | Etapa | Situação |
|---|---|---|
| 1 | Estrutura do front | Concluída. Repositório com `frontend/` e `backend/` separados. |
| 2 | Interface e navegação | Concluída. Router por hash (`#/login`, `#/eventos`, ...). |
| 3 | Dados mockados | Concluída. `src/mocks/eventos.js` e `src/mocks/ingressos.js`. |
| 4 | Integração com API | **Pendente.** `src/api.js` ainda devolve os mocks; trocar o corpo das funções por `fetch`. |
| 5 | IndexedDB | Concluída. `src/db.js`. |
| 6 | Scanner QR | Concluída. `html5-qrcode@2.3.8` (versão fixa), testado no iPhone. |
| 7 | Service Worker/PWA | Concluída. Testado offline no Chrome; falta teste completo no iPhone instalado. |
| 8 | Validação offline | Concluída. |
| 9 | Sincronização | **Pendente.** Próxima etapa. |
| 10 | Dashboard | **Pendente.** Tela existe só com "—". |
| 11 | Testes e acabamento | **Pendente.** |

### Arquivos principais (`frontend/src/`)

- `router.js`: rotas por hash.
- `api.js`: único ponto de acesso à API (hoje usa mocks com atraso simulado em `buscarIngressos`).
- `selecao.js`: evento/portão escolhidos, no `sessionStorage`.
- `db.js`: todo acesso ao IndexedDB (banco `passcheck`, versão 1).
- `screens/`: uma tela por arquivo.
- `components/resultado.js`: sobreposição de resultado (aceita `codigo` e `aoFechar`).
- `service-worker.js`: modelo do SW; o `/sw.js` final é gerado no build pelo plugin em `vite.config.js`.
- `pwa.js`: registra o Service Worker (somente em produção).

### Decisões já tomadas

- **Preparação baixa os ingressos de TODOS os portões do evento** (chamando o endpoint de ingressos uma vez por portão). Os ingressos dos outros portões servem para identificar PORTÃO INCORRETO.
- **Classificação** (`classificarIngresso` em `db.js`): não encontrado → INVÁLIDO; outro evento → INVÁLIDO; mesmo evento e outro portão → PORTÃO INCORRETO; já utilizado → JÁ UTILIZADO; senão → VÁLIDO.
- **Validação atômica** (`validarIngresso` em `db.js`): em uma única transação, marca `utilizado: true` e cria a pendência. O resultado só é devolvido após a transação concluir; se falhar, VÁLIDO não é exibido.
- **Identificador do dispositivo**: UUID salvo na store `operacao` com a chave `'dispositivo'` (o registro da operação usa a chave `'atual'`).
- **Proteções da preparação** (`salvarPreparacao`): nunca apaga validações pendentes; não troca de evento/portão com pendências (também bloqueado na interface); ao preparar de novo o mesmo evento, ingressos utilizados localmente continuam utilizados.
- **`ultimaSincronizacao`** é preenchida com a hora da preparação.
- **Scanner**: lê só QR Code; pausa durante o resultado; ignora o mesmo código por 3 s após fechar; diferencia falha de leitura (dica abaixo da câmera) de código não cadastrado (INVÁLIDO).
- **Service Worker**: cache-first para os arquivos do app; não faz cache de API nem de outros domínios; a versão do cache muda a cada build e o cache antigo é apagado na ativação; nunca mexe no IndexedDB.
- **ONLINE/OFFLINE** usa `navigator.onLine` com os eventos `online`/`offline`.

### A confirmar com o back-end (Gabriel)

- Formato das respostas de `GET /eventos`, `GET /eventos/:eventoId/portoes` e `GET .../ingressos` (os mocks assumem arrays com `id` numérico; evento com `data` em `AAAA-MM-DD` e `local`).
- Permitir que o operador baixe os ingressos de todos os portões do evento.
- Formato do `POST /sincronizacao` (o front enviará os registros de `validacoesPendentes`).

### Como testar

- Desenvolvimento: `npm run dev` (sem Service Worker).
- Offline/PWA: `npm run build && npm run preview` e túnel HTTPS (`cloudflared tunnel --url http://localhost:4173`). O `vite.config.js` aceita qualquer `*.trycloudflare.com`.
- No iPhone, o app instalado na Tela de Início tem dados separados do Safari, e cada túnel novo é um endereço (origem) diferente.

### Pendências conhecidas

- Botões "Simular resultado (temporário)" no scanner ainda existem; o botão "Válido" não grava nada. Remover no acabamento.
- "Última sincronização" no scanner ainda mostra "—".
- Login é apenas visual; não há perfis de administrador/operador.
