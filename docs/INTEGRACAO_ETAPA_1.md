# PassCheck — integração da API com o frontend, etapa 1

**Data:** 30/10/2026, America/Sao_Paulo.  
**Base:** `1f478cf`, incluindo as alterações locais preexistentes de backend,
administração, prontidão e documentação.  
**Autorização:** implementar a etapa 1 e preparar execução/hospedagem, após análise
somente leitura e explicação de impacto, riscos, backup e reversão.

## Resultado

O frontend integrado autentica pela API, usa permissões do servidor, lista eventos
e portões reais, registra a instalação da conta e baixa os ingressos para IndexedDB.
Validação de ingressos continua local, sem consulta por leitura. A aplicação
compilada pode ser servida pelo próprio backend, usando `/api` na mesma origem.

O SQLite existente já continha o schema 001–005. As 12 tabelas foram verificadas;
não foi necessário recriar o banco ou adicionar tabelas nesta etapa. `npm run setup`
retornou `applied: []`, `currentVersion: 5`. Todas as linhas foram preservadas,
incluindo 3 eventos, 6 portões, 22 ingressos, 2 recebimentos e 2 validações.
Continuam existindo zero usuários no banco de trabalho; o primeiro administrador
é provisionado pelo responsável, com senha escolhida no terminal.

## Implementação

| Área | Comportamento entregue |
|---|---|
| Transporte HTTP | Base explícita, Bearer, sem cookies/cache/redirecionamentos, timeout, cancelamento, tratamento de 204 e erros HTTP/rede/contrato |
| Login e sessão | POST `/auth/login` + GET `/auth/me`; token apenas em memória; campos de senha limpos após tentativa; logout remoto com descarte local mesmo sem rede |
| Permissões | Papéis reais ADMINISTRADOR/OPERADOR; eventos autorizados pela API; portões filtrados pelas concessões; identidade atualizada antes da seleção e antes/depois do download |
| Preparação | Registro autenticado da instalação e download de todos os portões do evento, incluindo os necessários para reconhecer portão incorreto offline |
| IndexedDB | Mesmos object stores/versão 1; novos campos de proprietário/instalação na operação e nas pendências; uso local preservado ao atualizar download |
| Concorrência local | Preparação e leitura verificam operação/fila dentro da transação; uma operação substituída não pode continuar escrevendo pelo scanner antigo |
| Preservação | Sem descarte de pendências; bloqueio de troca de conta/evento/portão/instalação com fila pendente; registros legados sem proprietário não são adotados |
| Scanner | Usa a operação preparada da conta, admite retomada offline e remove os botões de simulação de resultados |
| Rotas | Telas demo fora do fluxo integrado; roteador cancela requisições ao sair da tela e trata falhas assíncronas |
| PWA | Worker ignora explicitamente `/api` e requisições com Authorization; mantém cache apenas dos arquivos da aplicação |
| Hospedagem | Backend serve build e API em `/api`, preservando rotas anteriores; arquivos privados não são servidos; HTML/worker revalidam cache; assets têm cache imutável |
| Configuração | Caminho do build, origens locais da porta 3000, exposição de Retry-After e opção explícita de proxy único |
| Produção | Inicialização exige schema pronto e build existente; migrações/provisionamento são operações explícitas |
| Operação | Comandos na raiz, setup com backup, provisionamento interativo, backup consistente, Docker/Compose/Caddy e guia de hospedagem |

O administrador atual continua global, conforme contrato existente. Não foi
criado um papel GESTOR nem exposta uma seleção livre de papéis. As telas de
solicitação/convite e a interface de administração aguardam a etapa de gestão.

## Preservação e configuração local

Antes das edições, os 125 arquivos de fonte/documentação/configuração visíveis
ao Git foram preservados, incluindo alterações não commitadas e arquivos novos,
em `backend/backups/pre-integracao-etapa1-20261031T011738Z.zip`, com manifesto
SHA-256 interno. Arquivos ignorados, dependências e o próprio diretório Git não
fazem parte desse ZIP.

Antes do setup, foi salvo um manifesto de contagens e hashes de todas as linhas
das 12 tabelas em `backend/backups/integracao-etapa1-antes.json`. O setup criou
um backup SQLite consistente em
`backend/backups/passcheck-2026-10-31T01-26-56-525Z-b01d9c2d-7110-41aa-b7ce-9a8a94ae77c7.sqlite`.
A comparação posterior foi gravada em `backend/backups/integracao-etapa1-depois.json`.
Os dois manifestos são iguais; `integrity_check=ok`, zero violações de FK.
Os nomes dos artefatos usam UTC, correspondente à noite de 30/10 no fuso local.

Foi criado `backend/.env` com segredo aleatório de 32 bytes em base64url,
origens locais e bind em loopback. O valor não foi impresso nem versionado.
O arquivo e os backups estão ignorados pelo Git. Não foram criadas credenciais
padrão ou contas no banco existente, nem foi executado seed nele.

## Validação executada

| Verificação | Resultado |
|---|---|
| Testes do transporte/sessão do frontend | 8 aprovados, zero falhas |
| Suíte completa do backend | 164 aprovados, zero falhas, zero ignorados |
| Build Vite de produção | Aprovado |
| Conteúdo do build | Sem perfis demo selecionáveis nem botões de simulação |
| Cliente frontend contra HTTP real | Login incorreto/correto, identidade, eventos restritos, portões, ingressos, instalação, 403, logout e revogação aprovados |
| Hospedagem/privacidade | HTML/worker, cabeçalhos, API JSON, `.env` não servido e rotas anteriores aprovados |
| Backup | Cópia inclui WAL, mantém dados e não sobrescreve cópias anteriores |
| Proxy | Cabeçalho encaminhado ignorado por padrão; limite por cliente no modo de um salto explícito |
| Chrome headless com perfil isolado | Login, seleção, preparação e IndexedDB nativo aprovados |
| Concorrência no navegador | Duas leituras simultâneas: um VÁLIDO, um JÁ UTILIZADO e uma pendência |
| Preservação no navegador | Download preserva uso local; trocas proibidas, operação obsoleta e fila legada bloqueadas |
| Offline no navegador | Logout preserva fila; recarga sem rede pelo Service Worker; retomada do scanner sem token e sem simulações |
| Execução em modo de produção com banco de trabalho | `/` e `/sw.js` 200; `/api/health` e `/api/ready` 200; `/api/eventos` sem token 401 |
| Compose | `docker compose config --quiet` aprovado |

Os testes do navegador usaram SQLite em memória e um perfil temporário exclusivo,
sem acessar o perfil/IndexedDB pessoal. A instância de produção usada na conferência
do banco de trabalho foi vinculada a loopback e encerrada ao terminar; nenhuma
conta ou validação foi escrita nesse banco.

Docker Engine não estava ativo na máquina: a imagem e os containers não foram
construídos/iniciados. A configuração Compose foi validada, mas o ambiente Docker
precisa ser exercitado no destino. Não houve publicação externa, commit ou push.

## Limites e sequência

1. Próxima etapa: serialização/envio da fila, processamento individual de
   confirmações/conflitos/rejeições, reenvio idempotente e indicadores centrais.
2. Gestão: gestor por evento, convites, solicitações, aprovação e interface de
   cadastros/importação ainda precisam de contrato, migrações e implementação.
3. Dados legados pendentes continuam preservados e bloqueiam adoção automática;
   é necessário um procedimento explícito de conciliação, sem apagar IndexedDB.
4. Retomada offline usa capacidade local da operação preparada. Não implementa
   autenticação offline criptográfica, criptografia do banco local ou revogação
   imediata de dispositivos desconectados.
5. Câmera física, Android/iOS, carga, perda do aparelho e recuperação de backups
   no servidor de hospedagem não foram demonstrados por este ensaio headless.

Para executar e hospedar, consulte [EXECUCAO_E_HOSPEDAGEM.md](EXECUCAO_E_HOSPEDAGEM.md).
Para reversão, preserve o estado posterior, restaure somente as alterações desta
entrega a partir do ZIP sem apagar trabalho anterior e siga o procedimento
controlado de restauração SQLite do guia. Não substitua banco/WAL em uso.
