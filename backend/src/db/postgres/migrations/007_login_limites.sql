-- Estado operacional temporário; não faz parte da importação de dados SQLite.
-- Não armazena IP, login, senha ou token. A chave é um HMAC gerado pelo backend.
CREATE TABLE login_limites (
  chave TEXT PRIMARY KEY CHECK (chave ~ '^[0-9a-f]{64}$'),
  tentativas INTEGER NOT NULL CHECK (tentativas BETWEEN 1 AND 10),
  expira_em TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_login_limites_expira_em ON login_limites(expira_em);
ALTER TABLE login_limites ENABLE ROW LEVEL SECURITY;
-- A política e os grants da conta de runtime são aplicados separadamente,
-- quando essa role existir; não são concedidos acessos à Data API.
