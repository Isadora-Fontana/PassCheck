# Testes funcionais — 2026-11-08

## Resultado

Testes concluídos com achados: a suíte automatizada local passou, mas a aplicação
publicada ainda não oferece todas as funcionalidades pela interface e a listagem
de pendências falha na Vercel. Não considerar o produto integralmente homologado.

O responsável autorizou os testes, informou uma nova senha compatível com a política
e escolheu explicitamente o perfil ADMINISTRADOR para Gabrielth. A conta foi criada
no Supabase pelo repositório de provisionamento, com hash scrypt da aplicação,
sem alterar contas anteriores ou ampliar permissões da role de runtime.
O comando bootstrap não foi reutilizado, pois já existia um administrador.

- Site: https://passcheck-mocha.vercel.app
- Login: `Gabrielth` (normalizado internamente para `gabrielth`).
- ID da conta: 2; perfil: ADMINISTRADOR.
- Senha: a última informada pelo responsável; não registrada neste relatório.
- Login e novo login após logout aprovados na API real; sessões dos testes revogadas.

## Cobertura executada

| Área | Ambiente / resultado |
| --- | --- |
| Suíte backend | 226 testes aprovados, zero falhas ou ignorados |
| Suíte frontend | 8 testes aprovados, zero falhas ou ignorados |
| PostgreSQL, concorrência, RLS, limites, contratos e rollback | Cluster local isolado, encerrado ao final |
| Build Vite | Aprovado |
| Login e preparação pela interface | Chromium headless local, perfil temporário, SQLite em memória |
| IndexedDB, validação concorrente e duplicidade | Aprovados no navegador |
| Proteção de conta/portão/instalação e fila legada | Aprovada no navegador |
| Logout preservando fila, reload offline e retomada sem token | Aprovados no navegador |
| Login administrativo, senha errada, identidade, logout e revogação | Aprovados na Vercel |
| Criar/editar evento, criar portão, listar eventos/portões e baixar ingressos | Aprovados na API Vercel |
| CSV válido e duplicado | HTTP 201 / 422 na Vercel |
| Confirmar ingresso, reenvio idempotente e conflito de uso | CONFIRMADA / JA_PROCESSADA / CONFLITO na Vercel |
| Divergência do mesmo identificador | IDEMPOTENCIA_DIVERGENTE na Vercel |
| Listar pendências | FALHOU na Vercel: HTTP 400 PARAMETRO_INVALIDO |
| Resolver pendência e recusar repetição | HTTP 201 / 409 na Vercel |
| Resumo do evento de teste | Dois ingressos e uma entrada, valores esperados |

A resolução foi testada usando o ID do recebimento de conflito obtido por consulta
administrativa somente de leitura e restrita ao dispositivo de teste. Isso permitiu
testar o endpoint de resolução sem fingir que a listagem de pendências funcionou.

O limite de tentativas foi exercitado pela suíte local isolada; não foi esgotado
deliberadamente na produção compartilhada. A suíte local rodou com Node 26.13.0,
enquanto a publicação usa Node 24.x: permanece a limitação de reprodutibilidade.

## Dados e evidências

- Backup prévio: `backend/backups/functional-production-d7e7572c-e27a-45a0-af26-f48a1ef12ab9/before-functional-tests.dump`.
  Exportação e listagem aprovadas; sem novo ensaio de restauração desse dump.
- Relatório HTTP sanitizado: `verification.json` no mesmo diretório privado.
- Suíte completa: `backend/backups/vercel-tests-9dd0a20e-5d4d-4437-b2cf-3aad3274d664/verification.json`.
  Cluster local encerrado; artefatos privados preservados.
- Teste de navegador: `scripts/verificar-navegador.mjs`, exit 0; perfil temporário
  próprio, sem usar sessão ou IndexedDB pessoais.
- Evento criado: ID 4, `TESTE Gabrielth - validacao funcional`.
- Portão criado: ID 7, `Portao de teste`; dois ingressos, um confirmado e outro disponível.
- Instalação: `test-gabrielth-60878455-e7ff-4436-99c4-fc0a3442ddcf`.
- Históricos de recebimento, conflito, divergência e resolução permanecem no banco.
- Comparação final confirmou que todos os registros originais das 11 tabelas de
  negócio, representados pelo SQLite preservado, continuam presentes e inalterados.
  O Supabase agora possui dados adicionais de teste: não esperar igualdade integral
  com SQLite nem repetir importação para tentar eliminar essa diferença.

## Achados

### FUNC-001 — Listagem de pendências indisponível na publicação — MEDIUM

- Componente: `GET /api/eventos/:eventoId/pendencias`, adaptador Vercel e validação
  `pendenciasQuery` em `backend/src/validation/administracao.js`.
- Evidência: evento 4 retornou 400 PARAMETRO_INVALIDO sem query, com estado=TODAS
  e com estado=PENDENTE, apos=0 e limite=50. Autenticação e outras rotas funcionaram.
  A mesma funcionalidade passa na suíte PostgreSQL local.
- Risco: administrador não consegue consultar as pendências pela API hospedada.
- Cenário operacional: um ingresso entra em conflito, mas sua pendência não pode
  ser listada para tratamento. Não foi demonstrado vazamento ou bypass de autorização.
- Causa: ainda não confirmada. Investigar parâmetros efetivamente recebidos após
  o rewrite da Vercel e sua interação com a validação estrita; não relaxar validação
  indiscriminadamente nem registrar tokens/corpos privados.
- Remediação recomendada: reproduzir a transformação de rota/query em teste e
  corrigir o adaptador/rewrite ou contrato conforme a causa comprovada.
- Validação: consultas válidas devem retornar 200 com filtros/paginação corretos;
  parâmetros inválidos devem continuar retornando 400, e falta de autorização 401/403.

### FUNC-002 — Validações do navegador ainda não sincronizam — HIGH

- Componente: `frontend/src/screens/scanner.js`, `dashboard.js` e `frontend/src/api.js`.
- Evidência: scanner exibe “Envio ao servidor: próxima etapa”; dashboard confirma
  integração pendente; cliente de API implementa leitura e instalação, sem fluxo
  integrado de envio da fila. Backend de sincronização passou nos testes.
- Risco: confirmações locais não chegam ao banco central pelo fluxo normal do usuário.
- Cenário: dispositivos independentes podem aceitar o mesmo ingresso offline sem
  que o conflito seja enviado e tratado centralmente; indicadores ficam desatualizados.
- Remediação recomendada: integrar envio idempotente, tratamento por item, erros e
  conflitos, preservando fila até confirmação e vínculo de usuário/instalação.
- Validação: leitura real offline, reconexão, sincronização via interface, reenvio
  sem duplicidade, conflito entre dispositivos e resumo central consistente.

### FUNC-003 — Gestão administrativa não integrada à interface — MEDIUM

- Componente: `frontend/src/router.js`, `screens/gestor-*.js`, `frontend/src/api.js`.
- Evidência: rota /gestor aponta para telaEventos; telas antigas de gestão usam
  armazenamentoDemo e estão fora das rotas integradas. API de gestão foi testada.
- Risco: login de administrador não oferece pela interface as operações de gestão
  esperadas; não é falha da senha ou do papel da conta criada.
- Cenário: responsável entra como administrador, mas não consegue criar evento,
  importar CSV ou tratar pendências usando os controles do site publicado.
- Remediação recomendada: conectar telas administrativas à API real, respeitando
  autorização, erros, limites de importação e auditoria; não reativar telas demo como produção.
- Validação: fluxo completo pelo navegador com administrador e negativas com operador.

## Limites e próximo passo

Não foram validados câmera física/QR impresso, permissão em celular, instalação da
PWA em Android/iOS nem todos os navegadores. O teste offline é automatizado em
Chromium local e não equivale à homologação em celulares na publicação.

As três pendências acima exigem correção/integração e nova validação antes de uso
operacional completo. Nenhuma correção de aplicação, mudança de política de senha
ou novo deployment foi feito neste lote de testes.

Para suspender a conta de teste, desativar somente gabrielth e revogar suas sessões
em procedimento autorizado; preservar históricos. Não apagar auditoria nem voltar
ao SQLite sem reconciliar os dados adicionais.
