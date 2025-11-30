declare module '@tanstack/react-query' {
  export class QueryClient {
    constructor(config?: any);
    invalidateQueries(filters?: any): Promise<void>;
    clear(): void;
  }
  export const QueryClientProvider: any;
  export const useQuery: any;
  export const useMutation: any;
  export const useQueryClient: any;
  export const useQueries: any;
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
    constructor(orientation?: any, unit?: any, format?: any);
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

declare module '@prisma/client' {
  export class PrismaClient {
    constructor(options?: any);
    [key: string]: any;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
  }
}
