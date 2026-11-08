# Verificação de instalação PWA — 2026-11-08

Resultado: pré-requisitos de instalação aprovados no site publicado
https://passcheck-mocha.vercel.app. Não equivale a instalação comprovada em
Android/iOS físicos nem a homologação das funcionalidades de negócio.

## Ambiente e método

Edge/Chromium 157.0.4341.42 headless no Windows, perfil descartável e viewport
móvel 390 × 844 com emulação de toque. User agent permanece desktop; não se
trata de um navegador Android nem Safari. Consultas via Chrome DevTools Protocol,
sem login, sem acesso ao perfil pessoal e sem escritas no banco remoto.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Contexto seguro HTTPS | Aprovado |
| Manifesto detectado pelo navegador | Sem erros de leitura/validação |
| Nome, start_url, scope e display | PassCheck, /, /, standalone |
| Ícones PNG 192 × 192 e 512 × 512 | HTTP 200; dimensões reais correspondentes |
| Apple touch icon 180 × 180 | HTTP 200; dimensões reais correspondentes |
| Meta apple-mobile-web-app-capable | yes |
| Service worker da publicação | Ativo, controlando a página, /sw.js |
| Page.getInstallabilityErrors | Lista vazia |
| Evento beforeinstallprompt | Recebido; prompt não aceito pelo teste |
| Cache da aplicação | HTML, JS, CSS, manifesto e imagens presentes |
| Reload com rede desligada e cache HTTP ignorado | Tela de login renderizada pelo service worker |
| Largura da tela de login | 390 px de viewport e conteúdo; sem overflow horizontal |

O teste interceptou beforeinstallprompt apenas no perfil descartável para registrar
sua ocorrência. Não adicionou botão de instalação ao site nem alterou o código da
aplicação. Abrir a tela offline não significa poder autenticar sem conexão; o login
continua dependendo do servidor, e a operação offline exige preparação prévia.

Evidência privada: `backend/backups/pwa-install-80cb0276-35ad-43d6-8771-9b51f583e788/verification.json`.
Script privado: `backend/backups/verify-pwa-install.mjs`. Perfil isolado preservado
nessa pasta de backups; processo principal do navegador encerrado ao final.

## Validação manual ainda necessária

- Android/Chrome real: instalar pelo menu, conferir ícone e abertura standalone.
- iPhone/Safari real: adicionar à Tela de Início e abrir pelo ícone.
- Em ambos: preparar dados online, fechar e abrir offline e conferir câmera/permissões.

Não foram encontrados bloqueios de instalabilidade no ambiente testado. Permanecem
as limitações funcionais independentes descritas em `TESTES_FUNCIONAIS_2026-11-08.md`.

Referências consultadas:
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://developer.chrome.com/blog/update-install-criteria
