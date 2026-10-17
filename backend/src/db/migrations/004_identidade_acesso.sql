CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  usuario TEXT NOT NULL UNIQUE CHECK (length(usuario) BETWEEN 3 AND 64 AND usuario = lower(trim(usuario))),
  senha_hash TEXT NOT NULL CHECK (length(senha_hash) > 0),
  papel TEXT NOT NULL CHECK (papel IN ('ADMINISTRADOR', 'OPERADOR')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  versao_token INTEGER NOT NULL DEFAULT 0 CHECK (versao_token >= 0),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE usuarios_eventos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE RESTRICT,
  PRIMARY KEY (usuario_id, evento_id)
) STRICT;

CREATE TABLE usuarios_portoes (
  usuario_id INTEGER NOT NULL,
  evento_id INTEGER NOT NULL,
  portao_id INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, evento_id, portao_id),
  FOREIGN KEY (usuario_id, evento_id) REFERENCES usuarios_eventos(usuario_id, evento_id) ON DELETE CASCADE,
  FOREIGN KEY (portao_id, evento_id) REFERENCES portoes(id, evento_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE instalacoes (
  dispositivo TEXT PRIMARY KEY NOT NULL CHECK (length(dispositivo) BETWEEN 1 AND 128
    AND dispositivo NOT GLOB '*[^A-Za-z0-9._:-]*' AND substr(dispositivo, 1, 5) <> 'seed:'),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_instalacoes_usuario ON instalacoes(usuario_id);
CREATE INDEX idx_usuarios_eventos_evento ON usuarios_eventos(evento_id);
CREATE INDEX idx_usuarios_portoes_portao ON usuarios_portoes(portao_id, evento_id);

CREATE TRIGGER usuarios_revogar_tokens
AFTER UPDATE OF usuario, senha_hash, papel, ativo ON usuarios
WHEN NEW.usuario <> OLD.usuario OR NEW.senha_hash <> OLD.senha_hash
  OR NEW.papel <> OLD.papel OR NEW.ativo <> OLD.ativo
BEGIN
  UPDATE usuarios SET versao_token = versao_token + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER instalacoes_preservar_identidade
BEFORE UPDATE OF dispositivo, usuario_id ON instalacoes
WHEN NEW.dispositivo <> OLD.dispositivo OR NEW.usuario_id <> OLD.usuario_id
BEGIN
  SELECT RAISE(ABORT, 'Identidade da instalacao imutavel');
END;
