-- Permissões de execução da API; aplicar como proprietário do schema.
-- A role passcheck_runtime deve existir e não ser proprietária de objetos.
-- Não é uma migration de dados. Não concede acesso a anon/authenticated.
GRANT USAGE ON SCHEMA passcheck TO passcheck_runtime;

GRANT SELECT ON TABLE
  passcheck.eventos, passcheck.portoes, passcheck.ingressos,
  passcheck.usuarios, passcheck.usuarios_eventos, passcheck.usuarios_portoes,
  passcheck.instalacoes, passcheck.recebimentos, passcheck.validacoes,
  passcheck.auditoria_divergencias, passcheck.resolucoes_administrativas,
  passcheck.schema_migrations
TO passcheck_runtime;

GRANT INSERT ON TABLE
  passcheck.eventos, passcheck.portoes, passcheck.ingressos,
  passcheck.instalacoes, passcheck.recebimentos, passcheck.validacoes,
  passcheck.auditoria_divergencias, passcheck.resolucoes_administrativas
TO passcheck_runtime;

GRANT UPDATE (nome, data, local) ON passcheck.eventos TO passcheck_runtime;
-- O trigger de confirmação precisa atualizar o ingresso com a identidade do chamador.
GRANT UPDATE (utilizado) ON passcheck.ingressos TO passcheck_runtime;
GRANT UPDATE (versao_token) ON passcheck.usuarios TO passcheck_runtime;

GRANT USAGE ON SEQUENCE
  passcheck.eventos_id_seq, passcheck.portoes_id_seq, passcheck.ingressos_id_seq,
  passcheck.recebimentos_id_seq, passcheck.validacoes_id_seq,
  passcheck.auditoria_divergencias_id_seq, passcheck.resolucoes_administrativas_id_seq
TO passcheck_runtime;

GRANT EXECUTE ON FUNCTION passcheck.data_iso_valida(text),
  passcheck.instante_utc_valido(text) TO passcheck_runtime;

-- PostgreSQL >= 17: necessário ao LOCK TABLE ... SHARE ROW EXCLUSIVE usado
-- pela camada de transações. Evita conceder UPDATE/DELETE/TRUNCATE amplos.
-- Também permite manutenção (VACUUM/ANALYZE/REINDEX/CLUSTER): risco de consumo
-- de recursos/indisponibilidade, limitado às tabelas abaixo. Sem grant option.
GRANT MAINTAIN ON TABLE
  passcheck.eventos, passcheck.portoes, passcheck.ingressos,
  passcheck.recebimentos, passcheck.validacoes, passcheck.auditoria_divergencias,
  passcheck.usuarios, passcheck.usuarios_eventos, passcheck.usuarios_portoes,
  passcheck.instalacoes, passcheck.resolucoes_administrativas
TO passcheck_runtime;

-- Nas tabelas de negócio: sem CREATE, DELETE, TRUNCATE, alteração dos registros de histórico, criação de usuários
-- ou alteração de senhas/papéis. Provisionamento de contas usa conexão administrativa.

-- Após a migration 007: apenas os contadores temporários de proteção do login.
-- Aplicar este arquivo em transação. Bloco aplicado no Supabase em 2026-11-06.
-- No lote remoto também foram revogados acessos à nova tabela de PUBLIC,
-- anon, authenticated e service_role; catálogo confirmou somente owner/runtime.
GRANT SELECT, INSERT, UPDATE, DELETE ON passcheck.login_limites TO passcheck_runtime;
DROP POLICY IF EXISTS login_limites_runtime ON passcheck.login_limites;
CREATE POLICY login_limites_runtime ON passcheck.login_limites
  TO passcheck_runtime USING (true) WITH CHECK (true);
