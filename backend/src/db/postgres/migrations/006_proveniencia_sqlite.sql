-- Metadados de transferência; não substituem o histórico PostgreSQL.
CREATE TABLE sqlite_import_history (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  imported_at TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  source_migrations JSONB NOT NULL CHECK (jsonb_typeof(source_migrations) = 'array'),
  table_counts JSONB NOT NULL CHECK (jsonb_typeof(table_counts) = 'object'),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TRIGGER sqlite_import_impedir_mutacao BEFORE UPDATE OR DELETE ON sqlite_import_history
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_historico('PROVENIENCIA_IMUTAVEL');
CREATE TRIGGER sqlite_import_impedir_truncate BEFORE TRUNCATE ON sqlite_import_history
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_historico('PROVENIENCIA_IMUTAVEL');
