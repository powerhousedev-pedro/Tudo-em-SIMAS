declare module '@tanstack/react-query' {
  export class QueryClient {
    constructor(options?: any);
    invalidateQueries(filters?: any, options?: any): Promise<void>;
    clear(): void;
  }
  export const QueryClientProvider: any;
  export const useQuery: (options: any) => any;
  export const useMutation: (options: any) => any;
  export const useQueryClient: () => QueryClient;
  export const useQueries: (options: any) => any;
}

declare module 'recharts' {
  export const BarChart: any;
  export const Bar: any;
  export const XAxis: any;
  export const YAxis: any;
  export const CartesianGrid: any;
  export const Tooltip: any;
  export const Legend: any;
  export const ResponsiveContainer: any;
}

declare module 'jspdf' {
  export default class jsPDF {
    constructor(options?: any);
    text(text: string, x: number, y: number, options?: any): any;
    rect(x: number, y: number, w: number, h: number, style?: string): any;
    setFillColor(r: number, g: number, b: number): any;
    setTextColor(r: number, g: number, b: number): any;
    setFontSize(size: number): any;
    save(filename: string): any;
  }
}

declare module 'jspdf-autotable' {
  export default function autoTable(doc: any, options: any): any;
}
