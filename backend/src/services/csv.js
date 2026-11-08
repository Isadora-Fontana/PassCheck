import { HttpError } from '../middleware/errors.js';
import { codigoSchema, csvIdSchema } from '../validation/administracao.js';

function camposDaLinha(line) {
  if (line.includes('\r')) return null;
  const fields = [];
  let i = 0;
  while (true) {
    let value = '';
    if (line[i] === '"') {
      i++;
      let closed = false;
      while (i < line.length) {
        if (line[i] !== '"') value += line[i++];
        else if (line[i + 1] === '"') { value += '"'; i += 2; }
        else { i++; closed = true; break; }
      }
      if (!closed || (i < line.length && line[i] !== ',')) return null;
    } else {
      while (i < line.length && line[i] !== ',') {
        if (line[i] === '"') return null;
        value += line[i++];
      }
    }
    fields.push(value);
    if (i === line.length) return fields;
    i++;
  }
}

export function lerCsv(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new HttpError(400, 'CSV_CODIFICACAO_INVALIDA', 'CSV deve usar UTF-8 válido.'); }
  if (!text.length) throw new HttpError(400, 'CSV_VAZIO', 'CSV deve conter cabeçalho e registros.');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== 'codigo,eventoId,portaoId') {
    throw new HttpError(400, 'CSV_CABECALHO_INVALIDO', 'Cabeçalho esperado: codigo,eventoId,portaoId.');
  }
  if (lines.length === 1) throw new HttpError(400, 'CSV_VAZIO', 'CSV deve conter cabeçalho e registros.');
  if (lines.length > 1001) throw new HttpError(413, 'CSV_MUITOS_REGISTROS', 'CSV excede o limite de 1000 registros.');
  return lines.slice(1).map((line, index) => {
    const row = { linha: index + 2, motivos: [] };
    const fields = camposDaLinha(line);
    if (!fields) return { ...row, motivos: ['CSV_SINTAXE_INVALIDA'] };
    if (fields.length !== 3) return { ...row, motivos: ['COLUNAS_INVALIDAS'] };
    for (const [position, key, schema, reason] of [
      [0, 'codigo', codigoSchema, 'CODIGO_INVALIDO'],
      [1, 'eventoId', csvIdSchema, 'EVENTO_ID_INVALIDO'],
      [2, 'portaoId', csvIdSchema, 'PORTAO_ID_INVALIDO'],
    ]) {
      const result = schema.safeParse(fields[position]);
      if (result.success) row[key] = result.data;
      else row.motivos.push(reason);
    }
    return row;
  });
}

export function rejeitarLinhas(linhas) {
  const error = new HttpError(422, 'CSV_INVALIDO', 'Importação recusada; nenhuma linha foi gravada.');
  error.linhas = linhas.map(({ linha, motivos }) => ({ linha, motivos }));
  throw error;
}
