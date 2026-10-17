-- Uma confirmação é a fonte do estado utilizado. A inserção e a atualização
-- abaixo fazem parte da mesma instrução/transação, inclusive em caso de rollback.
CREATE TRIGGER ingressos_inserir_disponivel
BEFORE INSERT ON ingressos
WHEN NEW.utilizado <> 0
BEGIN
  SELECT RAISE(ABORT, 'UTILIZADO_EXIGE_CONFIRMACAO');
END;

CREATE TRIGGER ingressos_preservar_confirmacao
BEFORE UPDATE ON ingressos
WHEN NEW.utilizado <> EXISTS (SELECT 1 FROM validacoes WHERE ingresso_id = OLD.id)
  OR (EXISTS (SELECT 1 FROM validacoes WHERE ingresso_id = OLD.id) AND (
    NEW.id IS NOT OLD.id OR NEW.codigo IS NOT OLD.codigo
    OR NEW.evento_id IS NOT OLD.evento_id OR NEW.portao_id IS NOT OLD.portao_id
  ))
BEGIN
  SELECT RAISE(ABORT, 'INGRESSO_DIVERGE_DA_CONFIRMACAO');
END;

CREATE TRIGGER validacoes_exigir_recibo_confirmado
BEFORE INSERT ON validacoes
WHEN NOT EXISTS (
  SELECT 1 FROM recebimentos WHERE id = NEW.recebimento_id AND status = 'CONFIRMADA'
)
BEGIN
  SELECT RAISE(ABORT, 'RECIBO_NAO_CONFIRMADO');
END;

CREATE TRIGGER validacoes_marcar_utilizado
AFTER INSERT ON validacoes
BEGIN
  UPDATE ingressos SET utilizado = 1 WHERE id = NEW.ingresso_id;
END;

-- Recibos e confirmações são históricos imutáveis. Correção administrativa e
-- resolução de conflitos exigirão modelo próprio em uma etapa autorizada.
CREATE TRIGGER recebimentos_impedir_alteracao
BEFORE UPDATE ON recebimentos
BEGIN
  SELECT RAISE(ABORT, 'RECIBO_IMUTAVEL');
END;

CREATE TRIGGER recebimentos_impedir_exclusao
BEFORE DELETE ON recebimentos
BEGIN
  SELECT RAISE(ABORT, 'RECIBO_IMUTAVEL');
END;

CREATE TRIGGER validacoes_impedir_alteracao
BEFORE UPDATE ON validacoes
BEGIN
  SELECT RAISE(ABORT, 'CONFIRMACAO_IMUTAVEL');
END;

CREATE TRIGGER validacoes_impedir_exclusao
BEFORE DELETE ON validacoes
BEGIN
  SELECT RAISE(ABORT, 'CONFIRMACAO_IMUTAVEL');
END;
