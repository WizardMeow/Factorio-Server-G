export type LifecycleState = 'stopped' | 'pulling' | 'installing-mods' | 'recreating' | 'starting' | 'ready' | 'stopping' | 'failed';

export interface ContainerState {
  status: LifecycleState;
  running: boolean;
  health?: string;
  image?: string;
  error?: string;
}

export interface OperationRecord {
  id: string;
  kind: string;
  stage: LifecycleState | 'backing-up' | 'restoring' | 'completed';
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  result?: 'succeeded' | 'failed' | 'interrupted';
  error?: string;
}

export interface ComposeAdapter {
  inspect(): Promise<ContainerState>;
  connectionAddress(): Promise<string | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  pull(): Promise<void>;
  recreate(): Promise<void>;
  recentLogs(lines: number): Promise<string[]>;
  followLogs(onLine: (line: string) => void, signal: AbortSignal): Promise<void>;
  recentManagementLogs?(): Promise<string[]>;
  onManagementLog?(listener: (line: string) => void): () => void;
}
