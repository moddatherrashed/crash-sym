import { SymbolicatedReport } from '../types';

export function formatJSON(report: SymbolicatedReport): string {
  return JSON.stringify(report, null, 2);
}
