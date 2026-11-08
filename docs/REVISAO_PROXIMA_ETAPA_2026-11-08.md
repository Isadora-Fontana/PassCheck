# Revisão da próxima etapa — 2026-11-08

> **Continuidade concluída após esta revisão:** o responsável autorizou explicitamente
> o lote; backups, variáveis Production e publicação foram executados e validados.
> O bloqueio descrito abaixo é histórico e foi resolvido pela autorização posterior.
> Ver [PUBLICACAO_REALIZADA_2026-11-08.md](PUBLICACAO_REALIZADA_2026-11-08.md).

## Conclusão

A próxima etapa é criar backups atualizados, configurar somente Production e fazer
a primeira publicação na Vercel, conforme `PROXIMA_ETAPA_VERCEL.md`. A etapa descrita
em `backend/docs/ativacao-supabase-etapa-3.md` registra trabalho já concluído e
pendências de ativação; não se deve recriar roles, reaplicar migrations ou importar
novamente os dados.

O usuário autorizou continuar caso a análise confirmasse a sequência. A revisão
automática, porém, rejeitou a execução do lote que enviaria DATABASE_URL e JWT_SECRET
à Vercel, por exigir autorização específica dos segredos e do destino. O script
não iniciou: nenhum backup novo, variável remota ou deployment foi criado neste lote.

## Evidências verificadas nesta sessão

- Projeto remoto `check-pass/passcheck`, ID `prj_8AUTalYVty4wNgB0EtHxZY2IB524`:
  Node 24.x, comandos de instalação/build e diretório de saída correspondentes
  ao `vercel.json`; zero deployments e zero variáveis Production.
- Domínio `passcheck-mocha.vercel.app` verificado, sem redirecionamento.
- SQLite ativo, integridade e chaves estrangeiras aprovadas.
- Comparação integral das 11 tabelas SQLite/Supabase aprovada: nenhum campo
  divergente, proveniência correspondente e origem estável entre snapshots.
- Histórico PostgreSQL correspondente às sete migrations locais; PostgreSQL 17.11.
- Sem USAGE do schema para PUBLIC, anon ou authenticated na consulta de catálogo.
  A lista Exposed schemas não foi relida no painel; sua ausência continua baseada
  na confirmação do responsável registrada em 07/11.
- Conta restrita pelo Transaction pooler: conexão TLS verify-full e readiness
  aprovados. A conta administrativa foi usada apenas em transações READ ONLY
  para conferir dados e proveniência, não como credencial de hospedagem.
- Simulação `deploy --dry`: 116 arquivos; ambientes privados, dados, backups e
  sessão Vercel excluídos; certificado público e migrations incluídos.
- 30 testes direcionados de configuração, implantação PostgreSQL, conexão e
  adaptador Vercel aprovados, zero falhas/ignorados, usando Node local 26.13.0.
  Esses testes não substituem a suíte completa sob Node 24 nem o build Linux.
- Relatório histórico de 04/11 conferido: 226 testes backend e oito frontend
  aprovados com PostgreSQL local isolado. Não foram repetidos integralmente hoje.

## Achados operacionais

### REV-001 — Caminho local do certificado inexistente — LOW

- Componente: `backend/.env`, parâmetro PG_SSL_CA_FILE.
- Evidência: arquivo configurado inexistente; readPostgresConfig recusou a
  configuração antes de conectar. O certificado em `backend/certs/prod-ca-2021.crt`
  existe e passou na validação TLS remota quando usado por caminho absoluto atual.
- Risco: verificações, backups ou futura ativação local que dependam do `.env`
  falham. A aplicação SQLite atual não depende dessa conexão.
- Cenário: executar o diagnóstico documentado após mover o repositório produz
  falha de configuração; não é necessário um atacante para causar indisponibilidade.
- Remediação recomendada: atualizar seletivamente o caminho local quando autorizado;
  na Vercel, omitir esse parâmetro para usar o certificado empacotado pelo adaptador.
- Validação: confirmar existência do arquivo e repetir conexão/readiness com
  verify-full. Validação com substituição apenas em memória já passou; `.env` intacto.

### REV-002 — Node local difere da versão declarada — LOW

- Componente: ambiente de desenvolvimento e `package.json` raiz/backend.
- Evidência: executável local 26.13.0; engines exige >=24.14.0 <25;
  projeto Vercel configurado corretamente para 24.x.
- Risco: resultados locais podem não reproduzir produção, inclusive dependências nativas.
- Cenário: uma mudança funciona no computador e falha no build/runtime da Vercel.
  Não foi demonstrado vetor de exploração.
- Remediação recomendada: usar Node 24 compatível para validação reproduzível;
  não alterar a versão de produção para acomodar o computador.
- Validação: verificar versão e repetir suíte/build com Node 24, além de conferir
  o build e os endpoints reais após publicação.

### REV-003 — Recuperação operacional externa ainda pendente — MEDIUM

- Componente: política de backups e recuperação.
- Evidência: documentação registra ensaio local aprovado e ausência de conclusão
  para retenção, agendamento e cópia externa. Nesta sessão não se verificou
  armazenamento externo nem se produziu novo dump.
- Risco: backups apenas no computador podem ser perdidos junto com a origem local.
- Cenário: falha do disco ou ransomware compromete também as cópias locais.
- Remediação recomendada: definir destino privado externo, retenção e rotina de
  restauração; manter backup verificado imediatamente antes da primeira publicação.
- Validação: comprovar cópia externa acessível e ensaio de recuperação em ambiente
  isolado. O destino externo ainda precisa ser definido; não presumir que existe.

## Continuidade preparada

Script privado e fora do upload:
`backend/backups/prepare-production-20261108.mjs`.

O script cria backups independentes de SQLite e PostgreSQL, verifica integridade,
listagem do dump e comparação, valida a conta restrita e cadastra 13 variáveis
somente em Production. Não restaura o dump nesse lote, não altera o `.env`,
não aplica migrations, não faz seed e não publica sozinho.

Os únicos segredos enviados são DATABASE_URL com `passcheck_runtime` pelo pooler
e JWT_SECRET existente. São cadastrados como sensitive na Vercel. Nenhuma URI
administrativa é enviada. O script recusa sobrescrever ambiente já configurado.

Após aprovação específica, executar esse lote e então publicar no projeto existente,
validando `/`, `/sw.js`, assets, `/api/health`, `/api/ready`, CORS, cabeçalhos e
negação de rotas protegidas sem token. Testes de negócio com escrita e contas reais
não estão preparados neste lote e devem ter escopo próprio.

Impacto: código e segredos privados hospedados na Vercel; aplicação acessível pela
internet e apta a escrever no Supabase. Manter SQLite sem novas escritas de negócio
durante o corte e repetir comparação imediatamente antes de publicar.

Retorno: retirar apenas o deployment criado e remover as variáveis deste lote,
preservando bancos e backups. Remover variáveis sozinho não desativa deployment.
Após novas escritas PostgreSQL, reconciliar dados antes de retomar SQLite.

## Limites

Esta é uma revisão dos pré-requisitos da próxima etapa, não uma auditoria completa
de OWASP, dependências/CVEs, infraestrutura e dispositivos offline. Não houve
alteração de código da aplicação, dados remotos, grants, senhas, firewall ou serviços,
nem commit/push. Há alterações anteriores não commitadas, que foram preservadas.

Referências oficiais consultadas:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables
