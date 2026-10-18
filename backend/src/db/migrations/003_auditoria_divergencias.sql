CREATE TABLE auditoria_divergencias (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  recebimento_id INTEGER NOT NULL REFERENCES recebimentos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  correlacao_id TEXT NOT NULL CHECK (length(correlacao_id) = 36),
  motivo TEXT NOT NULL CHECK (motivo = 'IDEMPOTENCIA_DIVERGENTE'),
  hash_original TEXT NOT NULL CHECK (length(hash_original) = 64 AND hash_original NOT GLOB '*[^0-9a-f]*'),
  hash_apresentado TEXT NOT NULL CHECK (length(hash_apresentado) = 64 AND hash_apresentado NOT GLOB '*[^0-9a-f]*'),
  data_hora_servidor TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (julianday(data_hora_servidor) IS NOT NULL AND substr(data_hora_servidor, -1) = 'Z')
) STRICT;

CREATE INDEX idx_auditoria_recebimento ON auditoria_divergencias(recebimento_id);
CREATE INDEX idx_auditoria_correlacao ON auditoria_divergencias(correlacao_id);

CREATE TRIGGER auditoria_divergencias_impedir_alteracao
BEFORE UPDATE ON auditoria_divergencias
BEGIN
  SELECT RAISE(ABORT, 'AUDITORIA_IMUTAVEL');
END;

CREATE TRIGGER auditoria_divergencias_impedir_exclusao
BEFORE DELETE ON auditoria_divergencias
BEGIN
  SELECT RAISE(ABORT, 'AUDITORIA_IMUTAVEL');
END;
