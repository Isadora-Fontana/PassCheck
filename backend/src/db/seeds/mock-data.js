// Cópia dos mocks do frontend na referência 1838a5a, sem dependência em runtime.
// Testes comparam todos os campos com os arquivos originais; não alterar IDs/códigos.
export const eventos = [
  { id: 1, nome: 'Festival UNIVAG', data: '2026-11-20', local: 'Campus UNIVAG' },
  { id: 2, nome: 'Show de Formatura', data: '2026-12-12', local: 'Centro de Eventos' },
  { id: 3, nome: 'Feira de Tecnologia', data: '2027-03-05', local: 'Pavilhão de Exposições' },
];

export const portoes = [
  { id: 1, eventoId: 1, nome: 'Portão A' },
  { id: 2, eventoId: 1, nome: 'Portão B' },
  { id: 3, eventoId: 1, nome: 'Portão C' },
  { id: 4, eventoId: 2, nome: 'Portão Principal' },
  { id: 5, eventoId: 2, nome: 'Portão VIP' },
  { id: 6, eventoId: 3, nome: 'Entrada Única' },
];

export const ingressos = [
  { id: 1, codigo: 'PC-A7X9K2', eventoId: 1, portaoId: 1, utilizado: false },
  { id: 2, codigo: 'PC-B3M8Q1', eventoId: 1, portaoId: 1, utilizado: false },
  { id: 3, codigo: 'PC-C5T2W7', eventoId: 1, portaoId: 1, utilizado: false },
  { id: 4, codigo: 'PC-D9R4L6', eventoId: 1, portaoId: 1, utilizado: true },
  { id: 5, codigo: 'PC-E1H6Z3', eventoId: 1, portaoId: 1, utilizado: false },
  { id: 6, codigo: 'PC-F8N3V5', eventoId: 1, portaoId: 2, utilizado: false },
  { id: 7, codigo: 'PC-G2K7P9', eventoId: 1, portaoId: 2, utilizado: false },
  { id: 8, codigo: 'PC-H4Y1J8', eventoId: 1, portaoId: 2, utilizado: false },
  { id: 9, codigo: 'PC-J6S5U2', eventoId: 1, portaoId: 2, utilizado: false },
  { id: 10, codigo: 'PC-K3W9E4', eventoId: 1, portaoId: 3, utilizado: false },
  { id: 11, codigo: 'PC-L7Q2N6', eventoId: 1, portaoId: 3, utilizado: false },
  { id: 12, codigo: 'PC-M1V8R3', eventoId: 1, portaoId: 3, utilizado: true },
  { id: 13, codigo: 'PC-N5Z4T7', eventoId: 2, portaoId: 4, utilizado: false },
  { id: 14, codigo: 'PC-P9B6X1', eventoId: 2, portaoId: 4, utilizado: false },
  { id: 15, codigo: 'PC-Q2F3H8', eventoId: 2, portaoId: 4, utilizado: false },
  { id: 16, codigo: 'PC-R6D7M5', eventoId: 2, portaoId: 4, utilizado: false },
  { id: 17, codigo: 'PC-S8G1K4', eventoId: 2, portaoId: 5, utilizado: false },
  { id: 18, codigo: 'PC-T3J5Y9', eventoId: 2, portaoId: 5, utilizado: false },
  { id: 19, codigo: 'PC-U7L2C6', eventoId: 3, portaoId: 6, utilizado: false },
  { id: 20, codigo: 'PC-V4P8A3', eventoId: 3, portaoId: 6, utilizado: false },
  { id: 21, codigo: 'PC-W1X6S8', eventoId: 3, portaoId: 6, utilizado: false },
  { id: 22, codigo: 'PC-Y5E9G2', eventoId: 3, portaoId: 6, utilizado: false },
];
