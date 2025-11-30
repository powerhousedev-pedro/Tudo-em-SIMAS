import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Dados são considerados "frescos" por 5 minutos
      gcTime: 1000 * 60 * 30, // Garbage Collection: Cache mantido por 30 minutos
      refetchOnWindowFocus: true, // Atualiza ao focar na janela
      retry: 1, // Tenta novamente 1 vez em caso de erro
    },
  },
});
