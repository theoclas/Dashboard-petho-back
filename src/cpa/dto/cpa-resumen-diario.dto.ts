export type CpaResumenNodeTipo = 'mes' | 'semana' | 'dia' | 'cuenta' | 'producto';

export interface CpaResumenMetrics {
  sumGasto: number;
  sumConversaciones: number;
  sumVentas: number;
  sumUtilidad: number;
  avgGananciaPromedio: number | null;
  avgCpa: number | null;
  cpaPonderado: number | null;
}

export interface CpaResumenNode {
  tipo: CpaResumenNodeTipo;
  key: string;
  label: string;
  metrics: CpaResumenMetrics;
  children: CpaResumenNode[];
}

export interface CpaResumenDiarioResponse {
  total: CpaResumenMetrics;
  nodes: CpaResumenNode[];
}
