CREATE TABLE resolucoes_administrativas (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  recebimento_id INTEGER NOT NULL UNIQUE REFERENCES recebimentos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  administrador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status_administrativo TEXT NOT NULL DEFAULT 'RESOLVIDA' CHECK (status_administrativo = 'RESOLVIDA'),
  justificativa TEXT NOT NULL CHECK (length(justificativa) BETWEEN 10 AND 1000 AND justificativa = trim(justificativa)),
  data_hora_servidor TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (julianday(data_hora_servidor) IS NOT NULL AND substr(data_hora_servidor, -1) = 'Z')
) STRICT;

CREATE INDEX idx_resolucoes_administrador ON resolucoes_administrativas(administrador_id);
CREATE INDEX idx_recebimentos_evento_pendencia
  ON recebimentos(json_extract(conteudo_normalizado, '$.eventoId'), id)
  WHERE status IN ('CONFLITO', 'REJEITADA');

CREATE TRIGGER resolucoes_exigir_recibo_e_administrador
BEFORE INSERT ON resolucoes_administrativas
WHEN NOT EXISTS (SELECT 1 FROM recebimentos WHERE id = NEW.recebimento_id AND status IN ('CONFLITO', 'REJEITADA'))
  OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.administrador_id AND papel = 'ADMINISTRADOR' AND ativo = 1)
BEGIN
  SELECT RAISE(ABORT, 'RESOLUCAO_NAO_PERMITIDA');
END;

CREATE TRIGGER resolucoes_impedir_alteracao
BEFORE UPDATE ON resolucoes_administrativas
BEGIN
  SELECT RAISE(ABORT, 'RESOLUCAO_IMUTAVEL');
END;

CREATE TRIGGER resolucoes_impedir_exclusao
BEFORE DELETE ON resolucoes_administrativas
BEGIN
  SELECT RAISE(ABORT, 'RESOLUCAO_IMUTAVEL');
END;
