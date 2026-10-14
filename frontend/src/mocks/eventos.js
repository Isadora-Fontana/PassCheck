// Dados simulados de eventos e portões.
// Usados enquanto o back-end não está disponível.
// O formato imita as respostas da API:
//   GET /eventos                     → lista de eventos
//   GET /eventos/:eventoId/portoes   → lista de portões do evento

// Resposta de GET /eventos
export const eventosMock = [
  { id: 1, nome: 'Festival UNIVAG', data: '2026-11-20', local: 'Campus UNIVAG' },
  { id: 2, nome: 'Show de Formatura', data: '2026-12-12', local: 'Centro de Eventos' },
  { id: 3, nome: 'Feira de Tecnologia', data: '2027-03-05', local: 'Pavilhão de Exposições' },
];

// Todos os portões. Cada portão pertence a um evento (eventoId).
// GET /eventos/:eventoId/portoes devolve apenas os portões daquele evento.
export const portoesMock = [
  { id: 1, eventoId: 1, nome: 'Portão A' },
  { id: 2, eventoId: 1, nome: 'Portão B' },
  { id: 3, eventoId: 1, nome: 'Portão C' },
  { id: 4, eventoId: 2, nome: 'Portão Principal' },
  { id: 5, eventoId: 2, nome: 'Portão VIP' },
  { id: 6, eventoId: 3, nome: 'Entrada Única' },
];
