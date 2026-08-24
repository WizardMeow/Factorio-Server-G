import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { redact } from './redact.js';
import type { OperationRecord } from './types.js';

export class OperationConflictError extends Error {}

export class OperationManager extends EventEmitter {
  private active?: OperationRecord;
  private history: OperationRecord[] = [];

  constructor(private readonly journalPath: string, private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}) { super(); }

  async initialize() {
    await mkdir(dirname(this.journalPath), { recursive: true });
    try {
      this.history = JSON.parse(await readFile(this.journalPath, 'utf8')) as OperationRecord[];
      const unfinished = [...this.history].reverse().find(item => !item.result);
      if (unfinished) {
        unfinished.result = 'interrupted';
        unfinished.finishedAt = new Date().toISOString();
        await this.persist();
        this.log({ operationId: unfinished.id, kind: unfinished.kind, stage: unfinished.stage }, 'operation marked interrupted during startup');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  get snapshot() { return { active: this.active, history: this.history.slice(-20).reverse() }; }

  async run(kind: string, initialStage: OperationRecord['stage'], work: (setStage: (stage: OperationRecord['stage']) => Promise<void>) => Promise<void>) {
    if (this.active) throw new OperationConflictError(`Operation ${this.active.id} is already running`);
    const now = new Date().toISOString();
    const record: OperationRecord = { id: randomUUID(), kind, stage: initialStage, startedAt: now, updatedAt: now };
    this.active = record;
    this.history.push(record);
    await this.persist();
    this.log({ operationId: record.id, kind, stage: initialStage }, 'operation started');
    this.emit('change', this.snapshot);
    void (async () => {
      try {
        await work(async stage => { record.stage = stage; record.updatedAt = new Date().toISOString(); await this.persist(); this.log({ operationId: record.id, kind, stage }, 'operation stage changed'); this.emit('change', this.snapshot); });
        record.stage = 'completed';
        record.result = 'succeeded';
      } catch (error) {
        record.result = 'failed';
        record.error = redact(error);
        this.log({ operationId: record.id, kind, stage: record.stage, error: record.error }, 'operation failed');
      } finally {
        record.finishedAt = new Date().toISOString();
        record.updatedAt = record.finishedAt;
        this.active = undefined;
        await this.persist();
        this.log({ operationId: record.id, kind, result: record.result }, 'operation finished');
        this.emit('change', this.snapshot);
      }
    })();
    return record;
  }

  private async persist() {
    const temp = `${this.journalPath}.tmp`;
    await writeFile(temp, JSON.stringify(this.history.slice(-100), null, 2));
    await rename(temp, this.journalPath);
  }
}
