// Integração em Chromium instalado, com perfil novo e SQLite em memória.
// Não acessa o perfil ou o IndexedDB de uso diário.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../backend/src/db/connection.js';
import { migrate } from '../backend/src/db/migrate.js';
import { seedDevelopment } from '../backend/src/db/seeds/development.js';
import { provisionar } from '../backend/src/services/provisionamento.js';
import { createHostingApp } from '../backend/src/hosting.js';
import { readConfig } from '../backend/src/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserPath = [process.env.PASSCHECK_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => path && existsSync(path));
if (!browserPath) throw new Error('Informe PASSCHECK_BROWSER com o executável Chromium/Chrome/Edge.');
if (!existsSync(join(root, 'frontend/dist/index.html'))) throw new Error('Execute npm run build antes da verificação.');
const profile = mkdtempSync(join(tmpdir(), 'passcheck-browser-'));
const database = openDatabase(':memory:');
let browser;
let server;
let socket;
try {
  migrate(database);
  seedDevelopment(database, 'development');
  const senha = randomBytes(6).toString('hex') + 'A!';
  await provisionar(database, 'bootstrap', { usuario: 'admin-browser', senha });
  const operador = await provisionar(database, 'criar-operador', { usuario: 'operador-browser', senha,
    eventos: [{ eventoId: 1, portoes: [1] }] });
  let app;
  server = createServer((request, response) => {
    if (request.url === '/__verificacao/db.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(readFileSync(join(root, 'frontend/src/db.js')));
    } else app(request, response);
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const origin = 'http://127.0.0.1:' + server.address().port;
  app = createHostingApp({ config: readConfig({ NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('base64url'),
    CORS_ORIGINS: origin }), database });
  browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolveDebugger, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chromium não abriu a depuração em 20 segundos.')), 20000);
    browser.once('error', (error) => { clearTimeout(timeout); reject(error); });
    browser.once('exit', () => { clearTimeout(timeout); reject(new Error('Chromium encerrou antes da depuração.')); });
    browser.stderr.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolveDebugger(match[1]); }
    });
  });
  const debugOrigin = new URL(debuggerUrl).origin.replace('ws:', 'http:');
  const targets = await (await fetch(debugOrigin + '/json/list')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => { socket.addEventListener('open', resolveSocket, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const waiting = new Map();
  socket.addEventListener('message', ({ data }) => {
    const item = JSON.parse(data);
    const callback = waiting.get(item.id);
    if (callback) { waiting.delete(item.id); item.error ? callback.reject(new Error(item.error.message)) : callback.resolve(item.result); }
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolveCommand, reject) => {
      const timeout = setTimeout(() => { waiting.delete(id); reject(new Error('Tempo excedido em ' + method)); }, 20000);
      waiting.set(id, { resolve: (value) => { clearTimeout(timeout); resolveCommand(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Falha no navegador.');
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error('Condição não satisfeita no navegador: ' + expression);
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: origin });
  await waitFor('Boolean(document.querySelector("#form-login"))');
  const politicaFormulario = await evaluate(`(() => {
    const input = document.querySelector('#senha');
    const conferir = (senha) => { input.value = senha; return input.checkValidity(); };
    return ['Abcdefg!', 'Abcdefghijklm!', 'Ábcdefg@'].every(conferir)
      && ['Abcdef!', 'Abcdefghijklmn!', 'abcdefg!', 'Abcdefgh', 'Abcdefg '].every((senha) => !conferir(senha));
  })()`);
  assert.equal(politicaFormulario, true);
  console.log('OK: formulário exige 8–14 caracteres, letra maiúscula e caractere especial.');
  await evaluate('document.querySelector("#usuario").value="operador-browser";document.querySelector("#senha").value=' + JSON.stringify(senha) + ';document.querySelector("#form-login").requestSubmit();true');
  await waitFor('Boolean(document.querySelector("#eventos [data-id]"))');
  assert.equal(await evaluate('document.querySelectorAll("#eventos [data-id]").length'), 1);
  await evaluate('document.querySelector("#eventos [data-id]").click();true');
  await waitFor('Boolean(document.querySelector("#portoes [data-id]"))');
  assert.equal(await evaluate('document.querySelectorAll("#portoes [data-id]").length'), 1);
  await evaluate('document.querySelector("#portoes [data-id]").click();true');
  await waitFor('Boolean(document.querySelector("#preparar:not([disabled])"))');
  await evaluate('document.querySelector("#preparar").click();true');
  await waitFor('Boolean(document.querySelector("#continuar:not([hidden])"))');
  console.log('OK: login real, evento autorizado, portão autorizado e preparação pela interface.');
  const resultado = await evaluate(`(async () => {
    const db = await import('/__verificacao/db.js');
    const op = await db.obterOperacao();
    if (op.usuarioId !== ${operador.id}) throw new Error('Proprietário incorreto');
    const banco = await new Promise((resolve, reject) => { const r=indexedDB.open('passcheck',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    const todos = await new Promise((resolve,reject)=>{const r=banco.transaction('ingressos').objectStore('ingressos').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const ticket=todos.find(i=>i.portaoId===op.portaoId&&!i.utilizado);
    const statuses=await Promise.all([db.validarIngresso(ticket.codigo,op),db.validarIngresso(ticket.codigo,op)]);
    if(statuses.sort().join(',')!=='JA_UTILIZADO,VALIDO') throw new Error('Duplicidade local');
    if(await db.contarValidacoesPendentes()!==1) throw new Error('Fila duplicada');
    let bloqueios=0;
    for(const acao of [()=>db.verificarUsuarioOperacao(op.usuarioId+100),()=>db.obterIdDispositivo(op.usuarioId+100),
      ()=>db.salvarPreparacao({id:op.eventoId,nome:op.eventoNome},{id:2,eventoId:op.eventoId,nome:'Outro portão'},todos,{usuarioId:op.usuarioId,dispositivo:op.dispositivo})]){
      try{await acao()}catch{bloqueios++}
    }
    if(bloqueios!==3) throw new Error('Troca não bloqueada');
    await db.salvarPreparacao({id:op.eventoId,nome:op.eventoNome},{id:op.portaoId,eventoId:op.eventoId,nome:op.portaoNome},todos,{usuarioId:op.usuarioId,dispositivo:op.dispositivo});
    if(await db.validarIngresso(ticket.codigo,op)!=='JA_UTILIZADO') throw new Error('Uso local perdido no download');
    try{await db.validarIngresso(ticket.codigo,{...op,dispositivo:'obsoleto'});throw new Error('stale-accepted')}catch(e){if(e.message==='stale-accepted')throw e}
    const fila=await new Promise((resolve,reject)=>{const r=banco.transaction('validacoesPendentes').objectStore('validacoesPendentes').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const original=fila[0];
    await new Promise((resolve,reject)=>{const tx=banco.transaction('validacoesPendentes','readwrite');const legado={...original};delete legado.usuarioId;tx.objectStore('validacoesPendentes').put(legado);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    let legadoBloqueado=false;try{await db.verificarUsuarioOperacao(op.usuarioId)}catch{legadoBloqueado=true}
    if(!legadoBloqueado)throw new Error('Fila legada adotada');
    await new Promise((resolve,reject)=>{const tx=banco.transaction('validacoesPendentes','readwrite');tx.objectStore('validacoesPendentes').put(original);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    banco.close();
    return {pendentes:await db.contarValidacoesPendentes(),ingressos:await db.contarIngressos(),bloqueios};
  })()`);
  assert.equal(resultado.pendentes, 1);
  assert.equal(resultado.bloqueios, 3);
  console.log('OK: IndexedDB nativo, leitura concorrente sem duplicidade, uso preservado, conta/portão/instalação bloqueados e fila legada protegida.');
  await evaluate('location.hash="/eventos";true');
  await waitFor('Boolean(document.querySelector("#sair"))');
  await evaluate('document.querySelector("#sair").click();true');
  await waitFor('Boolean(document.querySelector("#continuar-offline:not([hidden])"))');
  await evaluate('navigator.serviceWorker.ready.then(()=>true)');
  await waitFor('Boolean(navigator.serviceWorker.controller)');
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp('Page.reload');
  await waitFor('Boolean(document.querySelector("#continuar-offline:not([hidden])"))');
  await evaluate('document.querySelector("#continuar-offline").click();true');
  await waitFor('document.querySelector("#pendentes")?.textContent==="1"');
  assert.equal(await evaluate('document.querySelectorAll("[data-status]").length'), 0);
  console.log('OK: logout preserva fila; PWA recarrega sem rede e retoma scanner sem token e sem botões de simulação.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    const exited = new Promise((resolveExit) => browser.once('exit', resolveExit));
    browser.kill();
    await Promise.race([exited, delay(5000)]);
  }
  if (server) await new Promise((resolveClose) => { server.close(resolveClose); server.closeAllConnections(); });
  database.close();
  // Apenas o perfil temporário criado acima, nunca o perfil pessoal do navegador.
  const target = resolve(profile);
  assert.equal(target.startsWith(resolve(tmpdir()) + '\\') || target.startsWith(resolve(tmpdir()) + '/'), true);
  try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch { console.log('Perfil de teste temporário mantido em diretório passcheck-browser- no temporário do sistema.'); }
}
