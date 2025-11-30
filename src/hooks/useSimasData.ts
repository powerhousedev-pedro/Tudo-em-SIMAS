import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { api } from '../services/api';
import { RecordData } from '../types';
import { ENTITY_CONFIGS } from '../constants';

// --- QUERIES ---

export const useEntityData = (entityName: string, searchTerm = '') => {
  return useQuery({
    queryKey: ['entity', entityName, { search: searchTerm }],
    queryFn: () => api.fetchEntity(entityName, searchTerm),
    enabled: !!entityName, // Only run if entityName is provided
  });
};

// Hook for fetching multiple entities in parallel (used by Dashboard columns)
export const useDashboardData = (entities: string[]) => {
  return useQueries({
    queries: entities.map(entity => ({
      queryKey: ['entity', entity, { search: '' }], // Base load without search
      queryFn: () => api.fetchEntity(entity),
      staleTime: 1000 * 60 * 5, // 5 minutes
    }))
  });
};

export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: api.getUsers
  });
};

export const usePendingReviews = () => {
  return useQuery({
    queryKey: ['reviews', 'pending'],
    queryFn: api.getRevisoesPendentes,
    refetchInterval: 60000 // Poll every minute
  });
};

export const useReportData = (reportId: string) => {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: () => api.getReportData(reportId),
    enabled: !!reportId
  });
};

// --- MUTATIONS ---

export const useMutateEntity = (entityName: string) => {
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIGS[entityName];

  // CREATE
  const createMutation = useMutation({
    mutationFn: (data: RecordData) => api.createRecord(entityName, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] });
      // Invalidate related queries if needed (e.g., Contrato affects Vaga)
      if (entityName === 'Contrato') {
          queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] });
          queryClient.invalidateQueries({ queryKey: ['entity', 'RESERVAS'] });
      }
    }
  });

  // UPDATE
  const updateMutation = useMutation({
    mutationFn: ({ pkValue, data }: { pkValue: string, data: RecordData }) => 
      api.updateRecord(entityName, config.pk, pkValue, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] });
    }
  });

  // DELETE
  const deleteMutation = useMutation({
    mutationFn: (pkValue: string) => api.deleteRecord(entityName, config.pk, pkValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] });
    }
  });

  return { create: createMutation, update: updateMutation, remove: deleteMutation };
};

export const useToggleVagaLock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idVaga: string) => api.toggleVagaBloqueada(idVaga),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] });
    }
  });
};

export const useSetExercicio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idVaga, idLotacao }: { idVaga: string, idLotacao: string }) => 
      api.setExercicio(idVaga, idLotacao),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', 'Exercicio'] });
      queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] }); // Vaga display updates
    }
  });
};

export const useExecuteAction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => api.executeAction(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            queryClient.invalidateQueries({ queryKey: ['entity'] }); // Brute force invalidation to ensure consistency
        }
    });
};
