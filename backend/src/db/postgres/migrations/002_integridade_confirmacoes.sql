CREATE FUNCTION ingresso_inserir_disponivel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.utilizado <> 0 THEN RAISE EXCEPTION 'UTILIZADO_EXIGE_CONFIRMACAO' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ingressos_inserir_disponivel BEFORE INSERT ON ingressos
  FOR EACH ROW EXECUTE FUNCTION ingresso_inserir_disponivel();

CREATE FUNCTION ingresso_preservar_confirmacao() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE confirmado BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM validacoes WHERE ingresso_id = OLD.id) INTO confirmado;
  IF NEW.utilizado <> confirmado::integer OR (confirmado AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.codigo IS DISTINCT FROM OLD.codigo
    OR NEW.evento_id IS DISTINCT FROM OLD.evento_id OR NEW.portao_id IS DISTINCT FROM OLD.portao_id
  )) THEN RAISE EXCEPTION 'INGRESSO_DIVERGE_DA_CONFIRMACAO' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ingressos_preservar_confirmacao BEFORE UPDATE ON ingressos
  FOR EACH ROW EXECUTE FUNCTION ingresso_preservar_confirmacao();

CREATE FUNCTION validacao_exigir_recibo_confirmado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM recebimentos WHERE id = NEW.recebimento_id AND status = 'CONFIRMADA') THEN
    RAISE EXCEPTION 'RECIBO_NAO_CONFIRMADO' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validacoes_exigir_recibo_confirmado BEFORE INSERT ON validacoes
  FOR EACH ROW EXECUTE FUNCTION validacao_exigir_recibo_confirmado();

CREATE FUNCTION validacao_marcar_utilizado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ingressos SET utilizado = 1 WHERE id = NEW.ingresso_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validacoes_marcar_utilizado AFTER INSERT ON validacoes
  FOR EACH ROW EXECUTE FUNCTION validacao_marcar_utilizado();

CREATE FUNCTION impedir_mutacao_historico() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER recebimentos_impedir_alteracao BEFORE UPDATE ON recebimentos
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_historico('RECIBO_IMUTAVEL');
CREATE TRIGGER recebimentos_impedir_exclusao BEFORE DELETE ON recebimentos
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_historico('RECIBO_IMUTAVEL');
CREATE TRIGGER validacoes_impedir_alteracao BEFORE UPDATE ON validacoes
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_historico('CONFIRMACAO_IMUTAVEL');
CREATE TRIGGER validacoes_impedir_exclusao BEFORE DELETE ON validacoes
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_historico('CONFIRMACAO_IMUTAVEL');
-- TRUNCATE não dispara triggers por linha no PostgreSQL.
CREATE TRIGGER recebimentos_impedir_truncate BEFORE TRUNCATE ON recebimentos
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_historico('RECIBO_IMUTAVEL');
CREATE TRIGGER validacoes_impedir_truncate BEFORE TRUNCATE ON validacoes
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_historico('CONFIRMACAO_IMUTAVEL');
