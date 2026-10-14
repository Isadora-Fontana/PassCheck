// Guarda o evento e o portão escolhidos pelo operador, para que as telas
// seguintes saibam o que foi selecionado.
// Fica no sessionStorage para não se perder ao recarregar a página.
// A operação já preparada (ingressos baixados) fica no IndexedDB: veja src/db.js.

export function salvarEvento(evento) {
  sessionStorage.setItem('evento', JSON.stringify(evento));
  sessionStorage.removeItem('portao');
}

export function salvarPortao(portao) {
  sessionStorage.setItem('portao', JSON.stringify(portao));
}

export function obterEvento() {
  return JSON.parse(sessionStorage.getItem('evento'));
}

export function obterPortao() {
  return JSON.parse(sessionStorage.getItem('portao'));
}
