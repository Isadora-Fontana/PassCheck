// Credenciais entram pelo terminal, sem senha em argumentos ou arquivo.
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { ConfigurationError, loadConfig } from './config.js';
import { openConfiguredDatabase, assertCurrentMigrations } from './db/runtime.js';
import { createProvisionamentoRepository } from './repositories/provisionamento.js';
import { DatabaseTaskError } from './db/errors.js';
import { credenciaisSchema } from './validation/identidade.js';
import { provisionar } from './services/provisionamento.js';

const mensagens = {
  TERMINAL: 'Use um terminal interativo. Para automação, use auth-cli.js com JSON por stdin.',
  COMANDO: 'Use bootstrap para o primeiro administrador ou criar-operador para um operador.',
  ADMIN_EXISTENTE: 'Já existe um administrador. O comando não substitui contas nem redefine senhas.',
  ADMIN_AUSENTE: 'Crie primeiro o administrador com npm run admin.',
  CANCELADO: 'Operação cancelada. Nenhuma conta foi criada.',
};
export class ErroProvisionamentoInterativo extends Error {
  constructor(codigo) { super(mensagens[codigo]); this.codigo = codigo; }
}

export function diagnosticarProvisionamento(error) {
  if (error instanceof ErroProvisionamentoInterativo) return error.message;
  if (error instanceof ConfigurationError) return 'Configuração inválida. Execute npm run setup e confira backend/.env; não compartilhe o segredo JWT.';
  if (error instanceof DatabaseTaskError) return 'Migrações ausentes ou divergentes. Execute npm run setup e verifique o banco configurado.';
  if (error instanceof ZodError) {
    return error.issues.some((issue) => issue.path[0] === 'eventos')
      ? 'Concessões inválidas. Use IDs numéricos positivos e sem repetição, no formato [{"eventoId":1,"portoes":[1]}].'
      : 'Usuário ou senha fora do formato permitido. Usuário: 3–64 caracteres; senha: 8–14 caracteres, uma letra maiúscula e um caractere especial.';
  }
  if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error?.code)) return 'Esse usuário já está cadastrado. Escolha outro login; nenhuma conta foi substituída.';
  if (['SQLITE_CONSTRAINT_FOREIGNKEY', '23503'].includes(error?.code)) return 'Evento ou portão não existe, ou o portão não pertence ao evento indicado. Nenhuma conta foi criada.';
  if (['SQLITE_BUSY', 'SQLITE_LOCKED', '55P03', '57014', '40P01', '40001'].includes(error?.code)) return 'Banco ocupado. Aguarde e tente novamente; nenhuma conta foi criada.';
  return 'Não foi possível criar a conta. Verifique a conexão e as permissões do banco; nenhuma conta foi substituída.';
}

async function perguntar(texto) {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return await rl.question(texto); } finally { rl.close(); }
}
function senhaOculta(texto) {
  stdout.write(texto);
  emitKeypressEvents(stdin);
  const rawAnterior = Boolean(stdin.isRaw);
  stdin.setRawMode(true);
  return new Promise((resolveSenha, reject) => {
    let senha = '';
    function encerrar() {
      stdin.off('keypress', tecla);
      stdin.off('end', cancelar);
      stdin.setRawMode(rawAnterior);
      stdin.pause();
      stdout.write('\n');
    }
    function cancelar() { encerrar(); reject(new ErroProvisionamentoInterativo('CANCELADO')); }
    function tecla(str, key) {
      if (key?.ctrl && ['c', 'd'].includes(key.name)) cancelar();
      else if (['return', 'enter'].includes(key?.name)) { encerrar(); resolveSenha(senha); }
      else if (key?.name === 'backspace') senha = Array.from(senha).slice(0, -1).join('');
      else if (str && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(str)) senha += str;
    }
    // Instala os listeners antes de retomar o fluxo para não perder entrada.
    stdin.on('keypress', tecla);
    stdin.once('end', cancelar);
    stdin.resume();
  });
}

// IO injetável permite verificar as tentativas sem escrever em contas reais.
export async function cadastrarInterativo(database, comando, io) {
  if (!['bootstrap', 'criar-operador'].includes(comando)) throw new ErroProvisionamentoInterativo('COMANDO');
  await assertCurrentMigrations(database);
  const repository = createProvisionamentoRepository(database);
  const admin = await repository.adminExiste();
  if (comando === 'bootstrap' && admin) throw new ErroProvisionamentoInterativo('ADMIN_EXISTENTE');
  if (comando === 'criar-operador' && !admin) throw new ErroProvisionamentoInterativo('ADMIN_AUSENTE');

  let usuario;
  while (!usuario) {
    const resultado = credenciaisSchema.shape.usuario.safeParse(await io.perguntar('Usuário: '));
    if (!resultado.success) {
      io.informar('Usuário inválido: use 3–64 caracteres, apenas letras sem acento, números, ponto, hífen ou sublinhado; comece com letra ou número.');
    } else if (await repository.loginExiste(resultado.data)) {
      io.informar('Esse usuário já está cadastrado. Escolha outro login.');
    } else usuario = resultado.data;
  }
  let senha;
  while (senha === undefined) {
    const candidata = await io.senhaOculta('Senha (8–14 caracteres, uma maiúscula e um especial; oculta): ');
    if (!credenciaisSchema.shape.senha.safeParse(candidata).success) {
      io.informar('Senha inválida: informe de 8 a 14 caracteres, incluindo pelo menos uma letra maiúscula e um caractere especial (ex.: !, @, #). Tente novamente.');
      continue;
    }
    const confirmacao = await io.senhaOculta('Confirme a senha: ');
    if (candidata !== confirmacao) {
      io.informar('As senhas não conferem. Digite a senha e a confirmação novamente.');
      continue;
    }
    senha = candidata;
  }
  const body = { usuario, senha };
  if (comando === 'criar-operador') {
    io.informar('Concessões: array JSON, por exemplo [{"eventoId":1,"portoes":[1]}].');
    try { body.eventos = JSON.parse(await io.perguntar('Eventos e portões: ')); }
    catch { throw new ZodError([{ code: 'custom', path: ['eventos'], message: 'JSON inválido.' }]); }
  }
  return provisionar(database, comando, body);
}

async function main() {
  let database;
  try {
    if (!stdin.isTTY || !stdout.isTTY) throw new ErroProvisionamentoInterativo('TERMINAL');
    const config = loadConfig();
    database = await openConfiguredDatabase(config);
    const criado = await cadastrarInterativo(database, process.argv[2], { perguntar, senhaOculta, informar: (texto) => console.log(texto) });
    console.log('Conta criada:', criado.usuario, '(' + criado.papel + ').');
  } catch (error) {
    console.error(diagnosticarProvisionamento(error));
    process.exitCode = 1;
  } finally {
    try { await database?.close(); }
    catch { console.error('Falha ao encerrar conexão de provisionamento.'); process.exitCode = 1; }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
