# Migrações versionadas

Executar em `backend/`: `npm run db:migrate` (ou `npm.cmd` no PowerShell).
A API não aplica migrações automaticamente.

| Versão | Arquivo | Conteúdo |
|---|---|---|
| 1 | `001_modelo_central.sql` | Cinco tabelas de domínio, PKs, FKs, unicidades, checks e índices |
| 2 | `002_integridade_confirmacoes.sql` | Consistência de `utilizado` e preservação do histórico |
| 3 | `003_auditoria_divergencias.sql` | Auditoria imutável, FK para recibo, correlação, hashes SHA-256 e horário do servidor |

O executor `../migrate.js` lê arquivos `NNN_descricao.sql` em ordem numérica.
Versões são únicas, consecutivas e começam em 001. `schema_migrations` registra
versão, nome, checksum SHA-256 e horário UTC de aplicação. CRLF é normalizado para
LF antes do checksum para permitir checkout em Windows e Linux.

Cada execução aplica todas as versões pendentes dentro de uma única transação
`BEGIN IMMEDIATE`, incluindo o histórico. Se qualquer arquivo falhar, todo o lote
pendente é revertido; versões previamente confirmadas continuam intactas. Repetir
o comando apenas verifica o histórico, sem reaplicar arquivos.

**Não editar migrações aplicadas.** Alteração, remoção, renomeação, duplicidade,
lacuna ou histórico incompatível interrompem o comando. Mudanças futuras devem
usar uma nova versão. Tabelas de negócio preexistentes sem histórico não são
adotadas nem substituídas silenciosamente. O executor não usa DROP ou REPLACE
para recriar o modelo e verifica `foreign_key_check` antes de confirmar.

Não há comando `down` destrutivo. Antes de aplicar mudanças em arquivo existente,
gerar backup consistente com a API de backup do SQLite. Para recuperação, parar
os acessos ao banco, preservar uma cópia do estado atual e restaurar o backup em
procedimento explícito: isso também remove da cópia restaurada os registros
posteriores ao backup. Não executar restauração automática.

O modelo e seus limites estão em `../../../docs/modelo-relacional.md`.
