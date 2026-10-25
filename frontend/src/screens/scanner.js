// Tela principal de operação (scanner).
// Lê o QR Code pela câmera e valida o ingresso no IndexedDB, sem usar a API.
// Um ingresso VÁLIDO é marcado como utilizado e entra na fila de validações
// pendentes, que será enviada à API na etapa de sincronização.

import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { irPara } from '../router.js';
import { mostrarResultado } from '../components/resultado.js';
import { obterOperacao, validarIngresso, contarValidacoesPendentes } from '../db.js';
import { obterAtribuicao } from '../demo/armazenamentoDemo.js';
import { exigirPerfil, OPERADOR_DEMO, PERFIS } from '../demo/perfilDemo.js';
import { escaparHtml } from '../html.js';

// Depois de fechar um resultado, o mesmo código é ignorado por este tempo,
// para não reabrir o resultado se o QR Code continuar na frente da câmera.
const TEMPO_IGNORAR_MESMO_CODIGO_MS = 3000;

const DICA_PADRAO = 'Aponte a câmera para o QR Code do ingresso.';
const DICA_FALHA_LEITURA =
  'QR Code detectado, mas não foi possível ler. Aproxime o código ou melhore a iluminação.';

export async function telaScanner(app) {
  if (!exigirPerfil(PERFIS.OPERADOR)) return;

  // O scanner só pode ser usado depois que o dispositivo foi preparado
  // para um evento aprovado, com o portão atribuído ao operador nesse evento.
  // Se o gestor alterou o portão, o operador volta para "Meus eventos".
  const operacao = await obterOperacao().catch(() => null);
  const atribuicao = operacao ? obterAtribuicao(OPERADOR_DEMO.id, operacao.eventoId) : null;
  const preparadoParaAtribuicao =
    operacao !== null &&
    atribuicao !== null &&
    operacao.eventoId === atribuicao.evento.id &&
    operacao.portaoId === atribuicao.portao.id;

  if (!preparadoParaAtribuicao) {
    irPara('/operador');
    return;
  }

  app.innerHTML = `
    <header class="cabecalho">
      <h1>Operação</h1>
      <a href="#/dashboard">Dashboard</a>
    </header>

    <div class="barra-status">
      <span class="selo-conexao" id="selo-conexao"></span>
      <span>Pendentes: <span id="pendentes">—</span></span>
      <span>Última sincronização: —</span>
    </div>

    <section class="conteudo">
      <p class="subtitulo">${escaparHtml(operacao.eventoNome)} · ${escaparHtml(operacao.portaoNome)}</p>

      <div class="area-camera">
        <div id="leitor" class="leitor"></div>
        <div id="mensagem-camera" class="mensagem-camera">Iniciando câmera...</div>
      </div>
      <p class="dica-leitura" id="dica-leitura">${DICA_PADRAO}</p>

      <!-- TEMPORÁRIO (etapa 1): botões para visualizar a sobreposição de resultado.
           Serão removidos quando a leitura real do QR Code for implementada. -->
      <div class="simulacao">
        <p>Simular resultado (temporário)</p>
        <div class="grade-botoes">
          <button class="botao botao-secundario" data-status="VALIDO">Válido</button>
          <button class="botao botao-secundario" data-status="JA_UTILIZADO">Já utilizado</button>
          <button class="botao botao-secundario" data-status="INVALIDO">Inválido</button>
          <button class="botao botao-secundario" data-status="PORTAO_INCORRETO">Portão incorreto</button>
        </div>
      </div>

      <a class="botao botao-secundario" href="#/operador">Encerrar operação</a>
    </section>
  `;

  const mensagemCamera = app.querySelector('#mensagem-camera');
  const dicaLeitura = app.querySelector('#dica-leitura');
  const campoPendentes = app.querySelector('#pendentes');
  const seloConexao = app.querySelector('#selo-conexao');

  // Lê somente QR Codes: mais rápido e evita confundir com outros tipos de código.
  const leitor = new Html5Qrcode('leitor', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  });

  // Enquanto uma leitura está sendo consultada ou exibida, novas leituras são ignoradas.
  let processandoLeitura = false;
  let saiuDaTela = false;
  let ultimoCodigo = null;
  let ultimoCodigoFechadoEm = 0;
  let temporizadorDica = null;

  function pausarCamera() {
    if (leitor.getState() === Html5QrcodeScannerState.SCANNING) {
      leitor.pause();
    }
  }

  function retomarCamera() {
    if (leitor.getState() === Html5QrcodeScannerState.PAUSED) {
      leitor.resume();
    }
  }

  /**
   * Mostra uma mensagem abaixo da câmera por alguns instantes.
   * Mensagens de erro ficam em destaque e por mais tempo.
   */
  function mostrarDica(texto, erro = false) {
    dicaLeitura.textContent = texto;
    dicaLeitura.classList.toggle('dica-erro', erro);
    clearTimeout(temporizadorDica);
    temporizadorDica = setTimeout(
      () => {
        dicaLeitura.textContent = DICA_PADRAO;
        dicaLeitura.classList.remove('dica-erro');
      },
      erro ? 5000 : 2000
    );
  }

  /**
   * Mostra se o dispositivo está com ou sem internet.
   * A validação funciona nos dois casos, porque usa apenas o IndexedDB.
   */
  function atualizarConexao() {
    const online = navigator.onLine;
    seloConexao.textContent = online ? 'ONLINE' : 'OFFLINE';
    seloConexao.classList.toggle('selo-offline', !online);
  }

  /**
   * Atualiza o contador de pendências com os registros reais do IndexedDB.
   */
  async function atualizarPendentes() {
    try {
      campoPendentes.textContent = await contarValidacoesPendentes();
    } catch (erro) {
      campoPendentes.textContent = '?';
    }
  }

  /**
   * Mostra o resultado; a câmera continua pausada até a sobreposição ser fechada.
   */
  function exibirResultado(status, codigo) {
    processandoLeitura = true;
    pausarCamera();

    mostrarResultado(status, {
      codigo,
      aoFechar: () => {
        ultimoCodigo = codigo;
        ultimoCodigoFechadoEm = Date.now();
        retomarCamera();
        processandoLeitura = false;
      },
    });
  }

  /**
   * Chamada pela biblioteca quando um QR Code é lido com sucesso.
   * Qualquer texto lido é tratado como código: se não estiver no dispositivo, é INVÁLIDO.
   * A validação (e a gravação, se VÁLIDO) acontece toda no IndexedDB.
   */
  async function aoLerQrCode(textoLido) {
    if (processandoLeitura) return;

    const codigo = textoLido.trim();

    const acabouDeSerExibido =
      codigo === ultimoCodigo && Date.now() - ultimoCodigoFechadoEm < TEMPO_IGNORAR_MESMO_CODIGO_MS;
    if (acabouDeSerExibido) return;

    processandoLeitura = true;
    pausarCamera();

    try {
      const status = await validarIngresso(codigo, operacao);
      exibirResultado(status, codigo);
      if (status === 'VALIDO') atualizarPendentes();
    } catch (erro) {
      // A gravação falhou: nada foi registrado e o ingresso NÃO deve ser aceito.
      mostrarDica('Não foi possível registrar a validação. Não libere a entrada; leia o QR Code novamente.', true);
      retomarCamera();
      processandoLeitura = false;
    }
  }

  /**
   * Chamada pela biblioteca a cada quadro em que nenhum código foi lido.
   * "NotFoundException" significa apenas que não há QR Code no quadro (normal).
   * Outros erros indicam um QR Code visível que não pôde ser decodificado.
   */
  function aoFalharLeitura(mensagemErro) {
    if (processandoLeitura) return;
    if (mensagemErro.includes('ChecksumException') || mensagemErro.includes('FormatException')) {
      mostrarDica(DICA_FALHA_LEITURA);
    }
  }

  /**
   * Liga a câmera traseira e começa a procurar QR Codes.
   * O navegador pede permissão para usar a câmera na primeira vez.
   */
  async function iniciarCamera() {
    mensagemCamera.textContent = 'Iniciando câmera...';
    mensagemCamera.hidden = false;

    try {
      await leitor.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          aspectRatio: 1,
          // Quadrado de leitura com 70% do tamanho da área da câmera.
          qrbox: (largura, altura) => {
            const lado = Math.floor(Math.min(largura, altura) * 0.7);
            return { width: lado, height: lado };
          },
        },
        aoLerQrCode,
        aoFalharLeitura
      );
      mensagemCamera.hidden = true;

      // O operador saiu enquanto a câmera ainda estava abrindo.
      if (saiuDaTela) leitor.stop().catch(() => {});
    } catch (erro) {
      mostrarErroCamera(mensagemCamera, erro, iniciarCamera);
    }
  }

  // Ao sair desta tela, desliga a câmera.
  window.addEventListener(
    'hashchange',
    () => {
      saiuDaTela = true;
      clearTimeout(temporizadorDica);
      window.removeEventListener('online', atualizarConexao);
      window.removeEventListener('offline', atualizarConexao);
      if (leitor.isScanning) {
        leitor.stop().catch(() => {});
      }
    },
    { once: true }
  );

  app.querySelectorAll('[data-status]').forEach((botao) => {
    botao.addEventListener('click', () => {
      if (!processandoLeitura) exibirResultado(botao.dataset.status);
    });
  });

  window.addEventListener('online', atualizarConexao);
  window.addEventListener('offline', atualizarConexao);
  atualizarConexao();
  atualizarPendentes();
  iniciarCamera();
}

/**
 * Explica por que a câmera não abriu e oferece uma nova tentativa.
 */
function mostrarErroCamera(elemento, erro, tentarNovamente) {
  const detalhe = String(erro);
  let mensagem = 'Não foi possível acessar a câmera.';

  if (!window.isSecureContext) {
    mensagem = 'A câmera só funciona em HTTPS ou em localhost.';
  } else if (detalhe.includes('NotAllowedError')) {
    mensagem = 'Permissão da câmera negada. Libere o acesso nas configurações do navegador.';
  } else if (detalhe.includes('NotFoundError')) {
    mensagem = 'Nenhuma câmera encontrada neste dispositivo.';
  } else if (detalhe.includes('NotReadableError')) {
    mensagem = 'A câmera está sendo usada por outro aplicativo.';
  }

  elemento.innerHTML = `
    <p></p>
    <button class="botao" type="button">Tentar novamente</button>
  `;
  elemento.querySelector('p').textContent = mensagem;
  elemento.querySelector('button').addEventListener('click', tentarNovamente);
  elemento.hidden = false;
}
