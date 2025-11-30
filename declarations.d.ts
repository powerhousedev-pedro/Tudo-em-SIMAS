declare module '@tanstack/react-query' {
  export const useQuery: (options: any) => any;
  export const useMutation: (options: any) => any;
  export const useQueryClient: () => any;
  export const useQueries: (options: any) => any;
  
  export class QueryClient {
    constructor(options?: any);
    invalidateQueries(filters?: any, options?: any): Promise<void>;
    clear(): void;
  }
  
  export const QueryClientProvider: any;
}
