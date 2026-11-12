// Serviço do IndexedDB: o banco local do dispositivo.
// Guarda os dados que permitem validar ingressos sem internet.
//
// Estruturas (object stores):
//   ingressos           → ingressos de todos os portões do evento preparado
//                         (chave: id; índice: codigo). Os de outros portões servem
//                         para identificar PORTÃO INCORRETO no scanner.
//   operacao            → evento/portão preparado (chave: 'atual') e o
//                         identificador deste dispositivo (chave: 'dispositivo')
//   validacoesPendentes → validações feitas no dispositivo (chave: id gerado automaticamente).
//                         Cada registro guarda o resultado do envio ao servidor:
//                         - sem statusEnvio            → aguardando envio
//                         - statusEnvio 'CONFIRMADA'   → aceita pelo servidor (sincronizado: true)
//                         - statusEnvio 'CONFLITO' ou  → recusada pelo servidor; fica guardada para
//                           'REJEITADA' (com motivo)     revisão, não é reenviada e não bloqueia trocas

const NOME_BANCO = 'passcheck';
const VERSAO_BANCO = 1;
const CHAVE_OPERACAO = 'atual';
const CHAVE_DISPOSITIVO = 'dispositivo';

/**
 * Validação que ainda precisa ser enviada ao servidor.
 * Conflitos e rejeições já foram registrados pelo servidor: não aguardam envio.
 */
export function aguardaEnvio(item) {
  return !item.sincronizado && !item.statusEnvio;
}

let bancoAberto = null;

/**
 * Abre o banco (e cria as estruturas na primeira vez).
 * A conexão é reaproveitada nas chamadas seguintes.
 * @returns {Promise<IDBDatabase>}
 */
function abrirBanco() {
  if (!bancoAberto) {
    bancoAberto = new Promise((resolve, reject) => {
      const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

      // Executado apenas quando o banco é criado ou a versão aumenta.
      // Cada estrutura e índice só é criado se ainda não existir, para que uma
      // futura versão do banco não falhe em aparelhos que já têm dados.
      // Nada é apagado nem migrado aqui.
      pedido.onupgradeneeded = () => {
        const banco = pedido.result;
        const transacaoAtualizacao = pedido.transaction;

        const ingressos = banco.objectStoreNames.contains('ingressos')
          ? transacaoAtualizacao.objectStore('ingressos')
          : banco.createObjectStore('ingressos', { keyPath: 'id' });
        // Índice para encontrar o ingresso pelo código lido no QR Code.
        if (!ingressos.indexNames.contains('codigo')) {
          ingressos.createIndex('codigo', 'codigo', { unique: true });
        }

        if (!banco.objectStoreNames.contains('operacao')) {
          banco.createObjectStore('operacao');
        }

        if (!banco.objectStoreNames.contains('validacoesPendentes')) {
          banco.createObjectStore('validacoesPendentes', { keyPath: 'id', autoIncrement: true });
        }
      };

      // Outra aba ainda usa uma conexão antiga e impede a atualização da versão.
      // A abertura continua esperando (e conclui assim que a outra conexão fechar);
      // o aviso evita que a espera fique silenciosa.
      pedido.onblocked = () => {
        console.warn(
          'Atualização do banco local aguardando: feche as outras abas ou janelas do PassCheck.'
        );
      };

      pedido.onsuccess = () => {
        const banco = pedido.result;
        // Se o navegador encerrar a conexão (comum no Safari do iPhone ao
        // voltar do segundo plano), a próxima chamada abre uma nova.
        banco.onclose = () => {
          bancoAberto = null;
        };
        // Uma versão mais nova do aplicativo (em outra aba) precisa atualizar o banco:
        // fecha esta conexão para não bloqueá-la. Transações em andamento terminam
        // normalmente antes do fechamento, então nenhuma gravação é interrompida.
        banco.onversionchange = () => {
          banco.close();
          bancoAberto = null;
        };
        resolve(banco);
      };
      pedido.onerror = () => {
        bancoAberto = null;
        reject(pedido.error);
      };
    });
  }
  return bancoAberto;
}

/**
 * Transforma um pedido do IndexedDB (que usa eventos) em uma Promise.
 */
function aguardar(pedido) {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

/**
 * Lê todos os registros de uma estrutura.
 */
async function lerTodos(nomeEstrutura) {
  const banco = await abrirBanco();
  const estrutura = banco.transaction(nomeEstrutura).objectStore(nomeEstrutura);
  return aguardar(estrutura.getAll());
}

/**
 * Devolve a operação preparada neste dispositivo, ou null se ainda não houver.
 * @returns {Promise<{eventoId, eventoNome, portaoId, portaoNome, ultimaSincronizacao} | null>}
 */
export async function obterOperacao() {
  const banco = await abrirBanco();
  const estrutura = banco.transaction('operacao').objectStore('operacao');
  const operacao = await aguardar(estrutura.get(CHAVE_OPERACAO));
  return operacao || null;
}

/**
 * Quantidade de ingressos armazenados no dispositivo (todos os portões do evento).
 */
export async function contarIngressos() {
  const banco = await abrirBanco();
  const estrutura = banco.transaction('ingressos').objectStore('ingressos');
  return aguardar(estrutura.count());
}

/**
 * Quantidade de ingressos armazenados de um portão específico.
 */
export async function contarIngressosDoPortao(portaoId) {
  const ingressos = await lerTodos('ingressos');
  return ingressos.filter((ingresso) => ingresso.portaoId === portaoId).length;
}

/**
 * Devolve o identificador deste dispositivo, criando-o na primeira vez.
 * Fica salvo no IndexedDB, então continua o mesmo ao recarregar a página.
 */
export async function verificarUsuarioOperacao(usuarioId) {
  const banco = await abrirBanco();
  const tx = banco.transaction(['operacao', 'validacoesPendentes']);
  const opPedido = tx.objectStore('operacao').get(CHAVE_OPERACAO);
  const filaPedido = tx.objectStore('validacoesPendentes').getAll();
  const [operacao, fila] = await Promise.all([aguardar(opPedido), aguardar(filaPedido)]);
  if (fila.some((item) => aguardaEnvio(item) && item.usuarioId !== usuarioId)
    || (fila.some(aguardaEnvio) && operacao?.usuarioId !== usuarioId)) {
    throw new Error('Há validações pendentes de outra conta ou da demonstração. Preserve os dados e procure o responsável antes de trocar de usuário.');
  }
}

// O mesmo proprietário conserva o ID. Uma troca sem pendências cria outro ID,
// sem transferir a instalação anterior no servidor.
export async function obterIdDispositivo(usuarioId) {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw new Error('Usuário inválido.');
  const banco = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(['operacao', 'validacoesPendentes'], 'readwrite');
    const store = tx.objectStore('operacao');
    const dono = store.get('dispositivoUsuario');
    const dispositivo = store.get(CHAVE_DISPOSITIVO);
    const fila = tx.objectStore('validacoesPendentes').getAll();
    let resultado;
    let erro;
    fila.onsuccess = () => {
      try {
        if (fila.result.some((item) => aguardaEnvio(item) && item.usuarioId !== usuarioId)) {
          throw new Error('Não é permitido trocar a instalação com validações pendentes.');
        }
        if (dono.result === usuarioId && dispositivo.result) resultado = dispositivo.result;
        else {
          if (!globalThis.crypto?.randomUUID) throw new Error('Use HTTPS ou localhost para preparar o dispositivo.');
          resultado = crypto.randomUUID();
          store.put(resultado, CHAVE_DISPOSITIVO);
          store.put(usuarioId, 'dispositivoUsuario');
        }
      } catch (falha) { erro = falha; tx.abort(); }
    };
    tx.oncomplete = () => resolve(resultado);
    tx.onabort = () => reject(erro || tx.error || new Error('Instalação não registrada.'));
  });
}

/**
 * Decide o resultado da leitura usando apenas os dados locais.
 * O dispositivo guarda os ingressos de todos os portões do evento preparado.
 * - Código que não está no dispositivo → INVÁLIDO (não é deste evento ou não existe).
 * - Ingresso de outro evento → INVÁLIDO.
 * - Ingresso do mesmo evento, mas de outro portão → PORTÃO INCORRETO.
 * - Ingresso deste portão já utilizado → JÁ UTILIZADO.
 * - Ingresso deste portão disponível → VÁLIDO.
 */
function classificarIngresso(ingresso, operacao) {
  if (!ingresso) return 'INVALIDO';
  if (ingresso.eventoId !== operacao.eventoId) return 'INVALIDO';
  if (ingresso.portaoId !== operacao.portaoId) return 'PORTAO_INCORRETO';
  if (ingresso.utilizado) return 'JA_UTILIZADO';
  return 'VALIDO';
}

/**
 * Valida o código lido no QR Code e, se o ingresso estiver disponível,
 * registra a utilização no dispositivo.
 *
 * Tudo acontece em UMA transação: buscar o ingresso, marcá-lo como utilizado
 * e criar a validação pendente. Ou as duas gravações acontecem, ou nenhuma.
 * O IndexedDB executa uma transação de escrita por vez, então duas leituras
 * simultâneas do mesmo ingresso não conseguem validá-lo duas vezes.
 *
 * O resultado só é devolvido depois que a transação foi concluída: se a gravação
 * falhar, a função lança um erro e VÁLIDO nunca é apresentado.
 *
 * @returns {Promise<'VALIDO'|'JA_UTILIZADO'|'INVALIDO'|'PORTAO_INCORRETO'>}
 */
export async function validarIngresso(codigo, operacao) {
  const banco = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(['ingressos', 'operacao', 'validacoesPendentes'], 'readwrite');
    const ingressos = tx.objectStore('ingressos');
    const atual = tx.objectStore('operacao').get(CHAVE_OPERACAO);
    let status;
    let erro;
    atual.onsuccess = () => {
      const preparada = atual.result;
      if (!preparada?.usuarioId || !preparada.dispositivo
        || preparada.usuarioId !== operacao.usuarioId || preparada.dispositivo !== operacao.dispositivo
        || preparada.eventoId !== operacao.eventoId || preparada.portaoId !== operacao.portaoId) {
        erro = new Error('A operação mudou. Abra novamente o scanner.');
        tx.abort();
        return;
      }
      const busca = ingressos.index('codigo').get(codigo);
      busca.onsuccess = () => {
        const ingresso = busca.result;
        status = classificarIngresso(ingresso, preparada);
        if (status !== 'VALIDO') return;
        ingressos.put({ ...ingresso, utilizado: true });
        tx.objectStore('validacoesPendentes').add({
          ingressoId: ingresso.id, codigo: ingresso.codigo,
          portaoId: ingresso.portaoId, eventoId: ingresso.eventoId,
          dataHora: new Date().toISOString(), dispositivo: preparada.dispositivo,
          usuarioId: preparada.usuarioId, sincronizado: false,
        });
      };
    };
    tx.oncomplete = () => resolve(status);
    tx.onabort = () => reject(erro || tx.error || new Error('Gravação cancelada.'));
  });
}

/**
 * Quantidade de validações que ainda aguardam envio ao servidor.
 */
export async function contarValidacoesPendentes() {
  const validacoes = await lerTodos('validacoesPendentes');
  return validacoes.filter(aguardaEnvio).length;
}

/**
 * Contagem da fila por situação, para o scanner e o dashboard.
 * @returns {Promise<{ aguardando: number, confirmadas: number, conflitos: number, rejeitadas: number }>}
 */
export async function resumirFila() {
  const validacoes = await lerTodos('validacoesPendentes');
  return {
    aguardando: validacoes.filter(aguardaEnvio).length,
    confirmadas: validacoes.filter((item) => item.statusEnvio === 'CONFIRMADA').length,
    conflitos: validacoes.filter((item) => item.statusEnvio === 'CONFLITO').length,
    rejeitadas: validacoes.filter((item) => item.statusEnvio === 'REJEITADA').length,
  };
}

// Limite do servidor: até 100 validações por lote (o corpo fica bem abaixo de 100 KB).
const MAXIMO_POR_LOTE = 100;

/**
 * Monta os lotes de envio com as validações deste usuário que aguardam envio.
 * Agrupa por evento + portão + dispositivo DE CADA REGISTRO (nunca pela operação atual)
 * e envia somente os campos do contrato. O idLocal é o id local, que nunca muda,
 * então reenviar o mesmo registro é seguro: o servidor não conta duas vezes.
 * Validações de outra conta ou sem identificação ficam fora (permanecem preservadas).
 */
export async function montarLotesParaEnvio(usuarioId) {
  const fila = (await lerTodos('validacoesPendentes'))
    .filter((item) => aguardaEnvio(item) && item.usuarioId === usuarioId && item.dispositivo)
    .sort((a, b) => a.id - b.id);

  const grupos = new Map();
  for (const item of fila) {
    const chave = item.eventoId + '|' + item.portaoId + '|' + item.dispositivo;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }

  const lotes = [];
  for (const itens of grupos.values()) {
    for (let inicio = 0; inicio < itens.length; inicio += MAXIMO_POR_LOTE) {
      const parte = itens.slice(inicio, inicio + MAXIMO_POR_LOTE);
      lotes.push({
        eventoId: parte[0].eventoId,
        portaoId: parte[0].portaoId,
        dispositivo: parte[0].dispositivo,
        validacoes: parte.map((item) => ({
          idLocal: String(item.id), ingressoId: item.ingressoId, codigo: item.codigo, dataHora: item.dataHora,
        })),
      });
    }
  }
  return lotes;
}

/**
 * Grava o resultado do servidor para cada validação de um lote, em UMA transação.
 * Antes de gravar, confere de novo cada registro: se algum mudou ou já tem resultado,
 * nada é gravado (o lote poderá ser reenviado com segurança).
 * - CONFIRMADA (ou reenvio de uma confirmada) → sincronizado: true + validacaoId.
 * - CONFLITO / REJEITADA (ou reenvio deles) → continua não sincronizada, com motivo;
 *   fica guardada para revisão e não é reenviada.
 * @returns {Promise<{ confirmadas: number, recusadas: number }>}
 */
export async function aplicarResultadosEnvio(lote, resultados) {
  const banco = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(['validacoesPendentes', 'operacao'], 'readwrite');
    const fila = tx.objectStore('validacoesPendentes');
    const agora = new Date().toISOString();
    const contagem = { confirmadas: 0, recusadas: 0 };
    let erro;
    let restantes = lote.validacoes.length;

    lote.validacoes.forEach((enviada, posicao) => {
      const resultado = resultados[posicao];
      const pedido = fila.get(Number(enviada.idLocal));
      pedido.onsuccess = () => {
        try {
          const item = pedido.result;
          if (!item || !aguardaEnvio(item) || item.ingressoId !== enviada.ingressoId
            || item.codigo !== enviada.codigo || item.dataHora !== enviada.dataHora
            || item.eventoId !== lote.eventoId || item.portaoId !== lote.portaoId
            || item.dispositivo !== lote.dispositivo) {
            throw new Error('A fila local mudou durante o envio. Nada foi marcado; o envio será repetido.');
          }
          const final = resultado.status === 'JA_PROCESSADA' ? resultado.resultadoOriginal : resultado.status;
          if (final === 'CONFIRMADA') {
            fila.put({ ...item, sincronizado: true, statusEnvio: 'CONFIRMADA',
              validacaoId: resultado.validacaoId, respondidoEm: agora });
            contagem.confirmadas++;
          } else {
            fila.put({ ...item, sincronizado: false, statusEnvio: final,
              motivo: resultado.motivo, respondidoEm: agora });
            contagem.recusadas++;
          }
          restantes--;
          if (restantes === 0) registrarUltimaSincronizacao();
        } catch (falha) { erro = falha; tx.abort(); }
      };
    });

    // A última sincronização é o horário da última resposta aplicada.
    function registrarUltimaSincronizacao() {
      const operacoes = tx.objectStore('operacao');
      const atual = operacoes.get(CHAVE_OPERACAO);
      atual.onsuccess = () => {
        if (atual.result) operacoes.put({ ...atual.result, ultimaSincronizacao: agora }, CHAVE_OPERACAO);
      };
    }

    tx.oncomplete = () => resolve(contagem);
    tx.onabort = () => reject(erro || tx.error || new Error('Resultado do envio não gravado.'));
  });
}

/**
 * Substitui o download em uma única transação com operação e fila.
 * Pendências bloqueiam troca de conta, instalação, evento ou portão.
 * Dados legados sem proprietário nunca são adotados com pendências.
 * Os object stores da versão 1 são preservados; apenas novos campos são escritos.
 */
export async function salvarPreparacao(evento, portao, ingressosRecebidos,
  { usuarioId, dispositivo, confirmarIdentidade = () => true } = {}) {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0 || !dispositivo
    || !Array.isArray(ingressosRecebidos) || portao.eventoId !== evento.id
    || ingressosRecebidos.some((item) => item.eventoId !== evento.id)
    || new Set(ingressosRecebidos.map((item) => item.id)).size !== ingressosRecebidos.length
    || new Set(ingressosRecebidos.map((item) => item.codigo)).size !== ingressosRecebidos.length) {
    throw new Error('Preparação inválida. Nenhum dado foi substituído.');
  }
  const banco = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(['ingressos', 'operacao', 'validacoesPendentes'], 'readwrite');
    const operacoes = tx.objectStore('operacao');
    const ingressos = tx.objectStore('ingressos');
    const atual = operacoes.get(CHAVE_OPERACAO);
    const dono = operacoes.get('dispositivoUsuario');
    const idDispositivo = operacoes.get(CHAVE_DISPOSITIVO);
    const antigos = ingressos.getAll();
    const fila = tx.objectStore('validacoesPendentes').getAll();
    let erro;
    fila.onsuccess = () => {
      try {
        const op = atual.result;
        const mesmoContexto = op?.usuarioId === usuarioId && op.dispositivo === dispositivo
          && op.eventoId === evento.id && op.portaoId === portao.id;
        // Somente o que aguarda envio bloqueia a troca; conflitos e rejeições
        // já estão registrados no servidor e ficam guardados para revisão.
        const pendentes = fila.result.filter(aguardaEnvio);
        if (!confirmarIdentidade() || dono.result !== usuarioId || idDispositivo.result !== dispositivo) {
          throw new Error('A conta ou a instalação mudou durante a preparação. Entre novamente.');
        }
        if (pendentes.length && (!mesmoContexto || pendentes.some((item) => item.usuarioId !== usuarioId
          || item.dispositivo !== dispositivo || item.eventoId !== evento.id || item.portaoId !== portao.id))) {
          throw new Error('Existem validações pendentes. A troca de operação está bloqueada; nenhum dado foi apagado.');
        }
        const preservar = op?.usuarioId === usuarioId && op.dispositivo === dispositivo && op.eventoId === evento.id;
        const utilizados = new Set(preservar ? antigos.result.filter((item) => item.utilizado).map((item) => item.id) : []);
        if (pendentes.some((item) => !ingressosRecebidos.some((ingresso) => ingresso.id === item.ingressoId && ingresso.codigo === item.codigo))) {
          throw new Error('O download não contém todos os ingressos pendentes. Dados locais preservados.');
        }
        ingressos.clear();
        for (const item of ingressosRecebidos) ingressos.put({ ...item, utilizado: item.utilizado || utilizados.has(item.id) });
        operacoes.put({
          eventoId: evento.id, eventoNome: evento.nome, portaoId: portao.id, portaoNome: portao.nome,
          usuarioId, dispositivo, preparadoEm: new Date().toISOString(),
          ultimaSincronizacao: mesmoContexto ? op.ultimaSincronizacao : null,
        }, CHAVE_OPERACAO);
      } catch (falha) { erro = falha; tx.abort(); }
    };
    tx.oncomplete = () => resolve(ingressosRecebidos.length);
    tx.onabort = () => reject(erro || tx.error || new Error('Preparação cancelada.'));
  });
}
