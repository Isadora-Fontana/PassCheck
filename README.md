# PassCheck

PassCheck é uma PWA de controle de acesso para eventos. O principal diferencial é validar ingressos por QR Code mesmo sem conexão com a internet: o dispositivo baixa previamente os ingressos do evento/portão, valida localmente durante a operação e sincroniza com o servidor quando a conexão retorna.

Projeto acadêmico (MVP).

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
