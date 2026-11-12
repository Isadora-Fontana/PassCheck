import { iniciarRouter } from './router.js';
import { registrarServiceWorker } from './pwa.js';
import { iniciarSincronizacaoAutomatica } from './sincronizacao.js';

iniciarRouter();
registrarServiceWorker();
iniciarSincronizacaoAutomatica();
