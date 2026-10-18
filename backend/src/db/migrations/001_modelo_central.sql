CREATE TABLE eventos (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  data TEXT NOT NULL CHECK (
    data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(data, '+0 days') IS NOT NULL AND date(data, '+0 days') = data
  ),
  local TEXT NOT NULL CHECK (length(trim(local)) > 0)
) STRICT;

CREATE TABLE portoes (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  UNIQUE (id, evento_id)
) STRICT;

CREATE INDEX idx_portoes_evento ON portoes(evento_id);

CREATE TABLE ingressos (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0 AND codigo = trim(codigo)),
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  portao_id INTEGER NOT NULL,
  utilizado INTEGER NOT NULL DEFAULT 0 CHECK (utilizado IN (0, 1)),
  FOREIGN KEY (portao_id, evento_id) REFERENCES portoes(id, evento_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX idx_ingressos_evento_portao ON ingressos(evento_id, portao_id);
CREATE INDEX idx_ingressos_portao_evento ON ingressos(portao_id, evento_id);

-- O recibo guarda o conteúdo apresentado, inclusive quando o ingresso não existe.
-- Não há FK dos identificadores dentro desse JSON para as tabelas de negócio.
CREATE TABLE recebimentos (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  dispositivo TEXT NOT NULL CHECK (length(trim(dispositivo)) > 0 AND dispositivo = trim(dispositivo)),
  id_local TEXT NOT NULL CHECK (length(trim(id_local)) > 0 AND id_local = trim(id_local)),
  conteudo_normalizado TEXT NOT NULL CHECK (
    json_valid(conteudo_normalizado) AND json_type(conteudo_normalizado) = 'object'
  ),
  status TEXT NOT NULL CHECK (status IN ('CONFIRMADA', 'CONFLITO', 'REJEITADA')),
  motivo TEXT,
  recebido_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (julianday(recebido_em) IS NOT NULL AND substr(recebido_em, -1) = 'Z'),
  UNIQUE (dispositivo, id_local),
  CHECK (
    (status = 'CONFIRMADA' AND motivo IS NULL)
    OR (status IN ('CONFLITO', 'REJEITADA') AND motivo IS NOT NULL AND length(trim(motivo)) > 0)
  )
) STRICT;

CREATE TABLE validacoes (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  ingresso_id INTEGER NOT NULL UNIQUE REFERENCES ingressos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  recebimento_id INTEGER NOT NULL UNIQUE REFERENCES recebimentos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Os mocks não fornecem horário de leitura: NULL representa desconhecido no seed.
  data_hora_cliente TEXT CHECK (
    data_hora_cliente IS NULL
    OR (julianday(data_hora_cliente) IS NOT NULL AND substr(data_hora_cliente, -1) = 'Z')
  ),
  data_hora_servidor TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (julianday(data_hora_servidor) IS NOT NULL AND substr(data_hora_servidor, -1) = 'Z')
) STRICT;

CREATE INDEX idx_validacoes_data_servidor ON validacoes(data_hora_servidor);
