export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(_request, _response, next) {
  next(new HttpError(404, 'ROTA_NAO_ENCONTRADA', 'Rota não encontrada.'));
}

export function errorHandler(logger = console) {
  return (error, _request, response, next) => {
    if (response.headersSent) return next(error);

    if (error instanceof HttpError) {
      if (error.code === 'INDICADORES_INCONSISTENTES') logger.error('INDICADORES_INCONSISTENTES: resumo não emitido; dados preservados.');
      if ([400, 413, 415].includes(error.status)) logger.error('Requisição rejeitada por formato ou limite inválido.');
      if (error.status === 503) response.set('Retry-After', '1');
      if (error.status === 429) response.set('Retry-After', String(error.retryAfter ?? 1));
      if (error.status === 401) response.set('WWW-Authenticate', 'Bearer');
      return response.status(error.status).json({ erro: error.code, mensagem: error.message });
    }

    if (error instanceof URIError && error.status === 400) {
      return response.status(400).json({ erro: 'PARAMETRO_INVALIDO', mensagem: 'Parâmetro de URL inválido.' });
    }

    if (error.type === 'entity.parse.failed') {
      logger.error('Requisição rejeitada por formato ou limite inválido.');
      return response.status(400).json({ erro: 'JSON_INVALIDO', mensagem: 'Corpo JSON inválido.' });
    }
    if (error.type === 'entity.too.large') {
      logger.error('Requisição rejeitada por formato ou limite inválido.');
      return response.status(413).json({ erro: 'CORPO_MUITO_GRANDE', mensagem: 'Corpo excede o limite de 100 KB.' });
    }
    if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      logger.error('Requisição rejeitada por formato ou limite inválido.');
      return response.status(415).json({ erro: 'TIPO_DE_CONTEUDO_INVALIDO', mensagem: 'Envie o corpo como application/json em UTF-8.' });
    }

    // Não registrar corpo, SQL, caminhos, tokens ou a mensagem interna do erro.
    logger.error('Erro interno ao processar requisição.');
    return response.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  };
}
