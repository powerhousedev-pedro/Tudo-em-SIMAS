
declare module '@tanstack/react-query' {
  export * from '@tanstack/react-query/build/modern/index';
  // Fallback types in case the specific build path above is not found in the environment
  export const useQuery: any;
  export const useMutation: any;
  export const useQueryClient: any;
  export const useQueries: any;
  export const QueryClient: any;
  export const QueryClientProvider: any;
}
