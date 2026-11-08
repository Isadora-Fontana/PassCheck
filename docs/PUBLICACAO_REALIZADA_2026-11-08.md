# Publicação realizada — 2026-11-08

> **Validação funcional posterior:** login e fluxos de escrita foram exercitados
> após nova autorização, com conta/evento de teste próprios. Surgiram três achados;
> consultar [TESTES_FUNCIONAIS_2026-11-08.md](TESTES_FUNCIONAIS_2026-11-08.md).
> O Supabase passou a conter registros adicionais de teste, mantendo os originais.

O responsável autorizou explicitamente os backups, o envio da DATABASE_URL restrita
e do JWT_SECRET existente somente para Production de `check-pass/passcheck` e a
publicação. Essa autorização resolveu o bloqueio da revisão automática anterior.

## Resultado

- Site: https://passcheck-mocha.vercel.app
- Deployment: `dpl_4QVgxzhNwjoKHG6K9WRnVhSCNTm3`, estado READY, Production.
- Inspeção: https://vercel.com/check-pass/passcheck/4QVgxzhNwjoKHG6K9WRnVhSCNTm3
- URL imutável: https://passcheck-cjzf39cdx-check-pass.vercel.app
- Projeto: `prj_8AUTalYVty4wNgB0EtHxZY2IB524`, equipe `check-pass`, Node 24.x.
- Treze variáveis cadastradas e reconferidas somente em Production. DATABASE_URL
  e JWT_SECRET armazenados como sensitive. Preview não recebeu essas credenciais.
- API hospedada usa `passcheck_runtime` pelo Transaction pooler com TLS verify-full
  e certificado empacotado. A URI administrativa não foi enviada à Vercel.
- Aplicação local permanece em SQLite; arquivos `.env` preservados.

## Backups e preservação

Diretório privado, ignorado pelo Git e excluído do upload:
`backend/backups/production-20261108-3ede991f-dfb8-4f89-927b-0f6a6dcb7694/`.

- Backup SQLite independente: integridade, chaves estrangeiras e comparação aprovadas.
- `before-production.dump`: 64.655 bytes; exportação e listagem verificadas,
  incluindo `usuarios` e `login_limites`; SHA-256 registrado em `verification.json`.
- O dump novo não foi restaurado neste lote. O ensaio de restauração anterior
  permanece como evidência histórica, não como ensaio deste arquivo.
- Comparação integral e proveniência SQLite/Supabase aprovadas antes e depois
  da publicação; origem estável e nenhuma divergência nas 11 tabelas de negócio.
- Arquivo temporário de senha do pg_dump removido ao concluir o backup.

## Correção necessária no build

A primeira tentativa, `dpl_7DPjn8y1YCZea5nT9skRp9Jko9H4`, falhou com
`vite: command not found` (exit 127). NODE_ENV=production omitiu devDependencies
do frontend. Nenhum site funcional foi publicado por essa tentativa.

O `installCommand` de `vercel.json` passou a ser:

```text
npm --prefix backend ci && npm --prefix frontend ci --include=dev
```

A segunda tentativa concluiu o build e foi associada ao domínio de produção.
Não foram alterados versões de pacotes, lockfiles ou regras de negócio.
O comando explícito no arquivo é a configuração usada por esse deployment.
Referência: https://docs.npmjs.com/cli/v11/commands/npm-ci/#include

## Validação real

Foram aprovadas 14 verificações HTTP sem autenticação Vercel no domínio de produção:

| Verificação | Resultado |
| --- | --- |
| `/`, `/sw.js`, JavaScript e CSS referenciados pelo HTML | 200 |
| `/api/health`, `/api/ready` | 200, banco ok / ready |
| `/api/eventos` sem token | 401 |
| CORS com origem de produção | 200 e origem exata |
| CORS com origem não permitida | 403, sem allow-origin |
| Preflight OPTIONS de login | 204 |
| Quatro caminhos de ambientes/banco/backup privados | 404 |

Cabeçalhos reais confirmados: nosniff, DENY, no-referrer, Permissions-Policy e HSTS.
API retorna Cache-Control: no-store; página e service worker retornam no-cache.
O readiness funcional confirma também que a função conseguiu carregar a CA e as
migrations necessárias no ambiente Linux e acessar o Supabase.

Relatório sanitizado: `verification.json` no diretório privado acima. Scripts
`prepare-production-20261108.mjs` e `verify-production-20261108.mjs` em
`backend/backups/`. Nenhum valor secreto está registrado neste documento.

## Pendências e limites

- Login, logout, limite de tentativas real e fluxos autenticados de escrita ainda
  precisam de validação com conta/ambiente de teste adequados. OPTIONS não testa login.
- Não houve teste visual de navegador, câmera, operação offline ou dispositivos.
- Backups externos, retenção, agendamento e novo ensaio de restauração continuam pendentes.
- Caminho local antigo da CA e Node local 26 versus Node 24 declarado permanecem
  como achados operacionais do relatório de revisão; não impediram a hospedagem.
- Manter a cópia SQLite sem novas escritas de negócio para evitar divergência.
  Usar banco isolado no desenvolvimento futuro.
- Não houve commit, push, seed, importação, mudança de grants ou criação de usuários.

## Retorno

Retirar especificamente o deployment de produção acima e remover as variáveis
criadas neste lote, cujos IDs constam no relatório privado. Remover variáveis sozinho
não desativa o deployment. Preservar projeto, bancos, dumps e histórico de migrations.
O deployment com falha anterior pode permanecer como histórico, sem promoção.
Antes de qualquer exclusão, confirmar o ID e o estado atual; estas instruções não
são uma execução de rollback. Após novas escritas PostgreSQL, reconciliar dados
antes de retomar SQLite. Reverter apenas o comando de instalação volta a quebrar
o build enquanto NODE_ENV=production omitir o Vite.
