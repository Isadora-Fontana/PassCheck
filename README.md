# PassCheck

PassCheck é uma PWA de controle de acesso para eventos. O principal diferencial é validar ingressos por QR Code mesmo sem conexão com a internet: o dispositivo baixa previamente os ingressos do evento/portão, valida localmente durante a operação e sincroniza com o servidor quando a conexão retorna.

Projeto acadêmico (MVP).

## Integração atual e execução

A primeira etapa de integração está implementada: login real, permissões,
eventos/portões da API e preparação do dispositivo com ingressos reais.
A operação preparada continua offline. O envio da fila de validações e a gestão
por evento são as próximas etapas; esta entrega ainda não completa esses fluxos.

Requer Node.js **24.14 ou superior da linha 24.x**. Na raiz:

```sh
npm run deps
npm run setup
npm run admin
npm run build
npm start
```

Abra **http://localhost:3000**. `setup` gera uma chave JWT privada em
`backend/.env`, faz backup de um banco existente e aplica migrações pendentes.
`admin` solicita usuário e senha pelo terminal; a senha não é exibida.
Se já existir administrador, o provisionamento é recusado sem substituir contas.
Não há credenciais padrão. Neste checkout as dependências e o build já foram
verificados; `npm run deps` é necessário em uma instalação nova.

Para desenvolvimento com atualização automática, execute `npm run dev:api`
e `npm run dev:web` em terminais separados. Para criar operadores com concessões
explícitas, use `npm run operador`.

O [guia de execução e hospedagem](docs/EXECUCAO_E_HOSPEDAGEM.md) contém Docker,
HTTPS, volume persistente, provisionamento, backup e reversão. A
[validação da integração](docs/INTEGRACAO_ETAPA_1.md) descreve o que foi testado
e os limites desta entrega.

## Estrutura

```
PassCheck/
├── frontend/   → PWA (HTML, CSS, JavaScript, Vite, Service Worker, IndexedDB)
├── backend/    → API e banco de dados
├── .gitignore
└── README.md
```

Front-end e back-end são desacoplados e se comunicam apenas pela API.

## Como rodar o front-end

```bash
cd frontend
npm install
npm run dev
```

## Equipe

- **Isadora** — Front-end e slides
- **Gabriel** — Back-end, banco de dados e apresentação
- **Álefe** — Documentação e pesquisa
