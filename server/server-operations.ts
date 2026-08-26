import type { ModInstaller } from './mods/installer.js';
import type { SaveService } from './save-service.js';
import type { ProfileDataStore } from './profile-data-store.js';
import type { ComposeAdapter } from './types.js';
import type { OperationManager } from './operation-manager.js';

interface ActiveRuntime { installer: ModInstaller; saves: SaveService; data: ProfileDataStore }
type SaveCollection = 'autosaves' | 'imports' | 'backups';

export class ServerOperations {
  constructor(
    private readonly adapter: ComposeAdapter,
    private readonly operations: OperationManager,
    private readonly runtime: () => Promise<ActiveRuntime>,
  ) {}

  async lifecycle(action: 'start' | 'stop' | 'restart') {
    const stage = action === 'stop' ? 'stopping' : 'pulling';
    return this.operations.run(action, stage, async setStage => {
      if (action === 'stop') await this.adapter.stop();
      if (action !== 'stop') {
        if (action === 'restart' && (await this.adapter.inspect()).running) { await setStage('stopping'); await this.adapter.stop(); }
        const { installer, saves, data } = await this.runtime();
        const launch = await data.readNextLaunch();
        const latestAutosave = await saves.latestAutosave();
        const usesTemporarySave = launch !== null;
        await this.adapter.pull();
        if (await installer.hasPending()) await setStage('installing-mods');
        await installer.applyPending();
        if (usesTemporarySave && latestAutosave && (launch.kind !== 'autosaves' || launch.saveName !== latestAutosave.name)) await saves.backup(latestAutosave.name, 'before-selected-launch');
        await setStage('recreating');
        await this.adapter.recreate();
        if (usesTemporarySave) await data.clearNextLaunch();
        await setStage('starting');
        await this.waitUntilReady(setStage);
      }
    });
  }

  async backup(kind: SaveCollection, name: string) {
    const { saves } = await this.runtime();
    const before = await this.adapter.inspect();
    return this.operations.run('backup', 'backing-up', async setStage => {
      const restoreRunning = before.running && kind === 'autosaves';
      let backupError: unknown;
      if (restoreRunning) { await setStage('stopping'); await this.adapter.stop(); }
      try { await setStage('backing-up'); await saves.backupEntry(kind, name); }
      catch (error) { backupError = error; }
      if (restoreRunning) {
        try { await setStage('starting'); await this.adapter.start(); await this.waitUntilReady(setStage); }
        catch (restartError) {
          if (backupError) throw new AggregateError([backupError, restartError], 'Backup failed and the prior running state could not be restored');
          throw restartError;
        }
      }
      if (backupError) throw backupError;
    });
  }

  async rollbackMods(previousPath: string) {
    return this.operations.run('rollback-mods', 'recreating', async setStage => {
      const { installer } = await this.runtime();
      await installer.rollback(previousPath);
      await setStage('starting');
      await this.adapter.start();
      await this.waitUntilReady(setStage);
    });
  }

  private async waitUntilReady(setStage: (stage: 'ready' | 'failed') => Promise<void>) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const state = await this.adapter.inspect();
      if (state.status === 'ready') { await setStage('ready'); return; }
      if (attempt >= 2 && !state.running) throw new Error('Factorio container exited during startup; inspect its logs for details');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Factorio did not become ready before timeout');
  }
}
