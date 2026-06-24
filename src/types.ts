export type Platform = 'ios' | 'android' | 'rn' | 'anr' | 'unknown';

export interface BinaryImage {
  loadAddress: string;
  endAddress: string;
  name: string;
  arch: string;
  uuid: string;
  path: string;
}

export interface RawFrame {
  index: number;
  raw: string;
  address?: string;
  library?: string;
  offset?: string;
  // Android / RN
  className?: string;
  methodName?: string;
  fileName?: string;
  lineNumber?: number;
  column?: number;
  layer?: 'native-ios' | 'native-android' | 'js' | 'system' | 'unknown';
}

export interface SymbolicatedFrame {
  index: number;
  raw: string;
  methodName?: string;
  // Resolved
  symbol?: string;
  file?: string;
  line?: number;
  column?: number;
  // Source map layer (RN)
  originalFile?: string;
  originalLine?: number;
  originalColumn?: number;
  originalName?: string;
  // Meta
  layer: 'native-ios' | 'native-android' | 'js' | 'system' | 'unknown';
  symbolicated: boolean;
}

export interface CrashReport {
  platform: Platform;
  appName?: string;
  appVersion?: string;
  osVersion?: string;
  device?: string;
  crashReason?: string;
  crashType?: string;
  timestamp?: string;
  threads: CrashThread[];
  binaryImages?: BinaryImage[];
  rawContent: string;
}

export interface CrashThread {
  id: number;
  name?: string;
  crashed: boolean;
  frames: RawFrame[];
}

export interface SymbolicatedReport {
  platform: Platform;
  appName?: string;
  appVersion?: string;
  osVersion?: string;
  device?: string;
  crashReason?: string;
  crashType?: string;
  timestamp?: string;
  threads: SymbolicatedThread[];
  rawContent: string;
  symbolicatedAt: string;
}

export interface SymbolicatedThread {
  id: number;
  name?: string;
  crashed: boolean;
  frames: SymbolicatedFrame[];
}

export interface SymbolicatorOptions {
  dsym?: string;
  mapping?: string;
  sourcemap?: string;
  arch?: string;
  verbose?: boolean;
}

export interface SymbolicateOptions {
  dsym?: string;
  mapping?: string;
  sourcemap?: string;
  arch?: string;
  platform?: Platform;
  format?: string;
  output?: string;
  verbose?: boolean;
}
