// Serviço do IndexedDB: o banco local do dispositivo.
// Guarda os dados que permitem validar ingressos sem internet.
//
// Estruturas (object stores):
//   ingressos           → ingressos de todos os portões do evento preparado
//                         (chave: id; índice: codigo). Os de outros portões servem
//                         para identificar PORTÃO INCORRETO no scanner.
//   operacao            → evento/portão preparado (chave: 'atual') e o
//                         identificador deste dispositivo (chave: 'dispositivo')
//   validacoesPendentes → validações feitas no dispositivo ainda não enviadas à API
//                         (chave: id gerado automaticamente)

const NOME_BANCO = 'passcheck';
const VERSAO_BANCO = 1;
const CHAVE_OPERACAO = 'atual';
const CHAVE_DISPOSITIVO = 'dispositivo';

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
      pedido.onupgradeneeded = () => {
        const banco = pedido.result;

        const ingressos = banco.createObjectStore('ingressos', { keyPath: 'id' });
        // Índice para encontrar o ingresso pelo código lido no QR Code.
        ingressos.createIndex('codigo', 'codigo', { unique: true });

        banco.createObjectStore('operacao');

        banco.createObjectStore('validacoesPendentes', { keyPath: 'id', autoIncrement: true });
      };

      pedido.onsuccess = () => {
        const banco = pedido.result;
        // Se o navegador encerrar a conexão (comum no Safari do iPhone ao
        // voltar do segundo plano), a próxima chamada abre uma nova.
        banco.onclose = () => {
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
async function obterIdDispositivo() {
  const banco = await abrirBanco();
  const leitura = banco.transaction('operacao').objectStore('operacao');
  const idSalvo = await aguardar(leitura.get(CHAVE_DISPOSITIVO));
  if (idSalvo) return idSalvo;

  // randomUUID só existe em HTTPS/localhost; fora disso, usa data + número aleatório.
  const novoId = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const escrita = banco.transaction('operacao', 'readwrite').objectStore('operacao');
  await aguardar(escrita.put(novoId, CHAVE_DISPOSITIVO));
  return novoId;
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
  const dispositivo = await obterIdDispositivo();
  try {
    return await registrarValidacao(codigo, operacao, dispositivo);
  } catch (erro) {
    // A conexão pode ter sido perdida sem aviso (Safari do iPhone).
    // Como a transação falhou, nada foi gravado: é seguro tentar mais uma vez.
    bancoAberto = null;
    return registrarValidacao(codigo, operacao, dispositivo);
  }
}

async function registrarValidacao(codigo, operacao, dispositivo) {
  const banco = await abrirBanco();

  return new Promise((resolve, reject) => {
    const transacao = banco.transaction(['ingressos', 'validacoesPendentes'], 'readwrite');
    const estruturaIngressos = transacao.objectStore('ingressos');
    let status = null;
    let erroGravacao = null;

    const busca = estruturaIngressos.index('codigo').get(codigo);
    busca.onsuccess = () => {
      const ingresso = busca.result || null;
      status = classificarIngresso(ingresso, operacao);

      // Inválido, portão incorreto ou já utilizado: nada é gravado.
      if (status !== 'VALIDO') return;

      try {
        estruturaIngressos.put({ ...ingresso, utilizado: true });
        transacao.objectStore('validacoesPendentes').add({
          ingressoId: ingresso.id,
          codigo: ingresso.codigo,
          portaoId: ingresso.portaoId,
          eventoId: ingresso.eventoId,
          dataHora: new Date().toISOString(),
          dispositivo,
          sincronizado: false,
        });
      } catch (erro) {
        // Se uma das gravações falhar, cancela tudo: o ingresso não fica marcado.
        erroGravacao = erro;
        transacao.abort();
      }
    };

    // Só devolve o resultado depois que tudo foi gravado.
    transacao.oncomplete = () => resolve(status);
    // Qualquer falha cancela a transação inteira (nada é gravado).
    transacao.onabort = () =>
      reject(erroGravacao || transacao.error || new Error('Gravação cancelada.'));
  });
}

/**
 * Quantidade de validações que ainda não foram sincronizadas com a API.
 */
export async function contarValidacoesPendentes() {
  const validacoes = await lerTodos('validacoesPendentes');
  return validacoes.filter((validacao) => !validacao.sincronizado).length;
}

/**
 * Salva no dispositivo os ingressos do evento escolhido (de todos os portões)
 * e registra o portão em que este dispositivo vai operar.
 *
 * Regras de segurança:
 * - As validações pendentes nunca são apagadas aqui.
 * - Não troca de evento/portão se houver validações pendentes do portão anterior.
 * - Ao preparar novamente o mesmo evento, ingressos já marcados como utilizados
 *   neste dispositivo continuam utilizados, mesmo que a API ainda diga o contrário.
 *
 * Tudo é gravado em uma única transação: ou salva tudo, ou nada.
 *
 * @returns {Promise<number>} quantidade de ingressos armazenados
 */
export async function salvarPreparacao(evento, portao, ingressosRecebidos) {
  const banco = await abrirBanco();
  const operacaoAtual = await obterOperacao();

  const mesmoPortao =
    operacaoAtual !== null &&
    operacaoAtual.eventoId === evento.id &&
    operacaoAtual.portaoId === portao.id;

  if (operacaoAtual && !mesmoPortao && (await contarValidacoesPendentes()) > 0) {
    throw new Error('Existem validações pendentes de sincronização no portão atual.');
  }

  const mesmoEvento = operacaoAtual !== null && operacaoAtual.eventoId === evento.id;

  // Ids dos ingressos que este dispositivo já marcou como utilizados.
  const idsUtilizados = new Set();
  if (mesmoEvento) {
    const ingressosLocais = await lerTodos('ingressos');
    ingressosLocais
      .filter((ingresso) => ingresso.utilizado)
      .forEach((ingresso) => idsUtilizados.add(ingresso.id));
  }

  return new Promise((resolve, reject) => {
    const transacao = banco.transaction(['ingressos', 'operacao'], 'readwrite');
    const estruturaIngressos = transacao.objectStore('ingressos');

    // Remove os ingressos antigos e grava a lista nova do evento.
    estruturaIngressos.clear();
    ingressosRecebidos.forEach((ingresso) => {
      estruturaIngressos.put({
        ...ingresso,
        utilizado: ingresso.utilizado || idsUtilizados.has(ingresso.id),
      });
    });

    transacao.objectStore('operacao').put(
      {
        eventoId: evento.id,
        eventoNome: evento.nome,
        portaoId: portao.id,
        portaoNome: portao.nome,
        // Os ingressos acabaram de ser recebidos do servidor.
        ultimaSincronizacao: new Date().toISOString(),
      },
      CHAVE_OPERACAO
    );

    transacao.oncomplete = () => resolve(ingressosRecebidos.length);
    transacao.onerror = () => reject(transacao.error);
    transacao.onabort = () => reject(transacao.error);
  });
}
