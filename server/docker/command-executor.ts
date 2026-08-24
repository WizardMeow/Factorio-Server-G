import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { authorizeComposeCommand } from './command-policy.js';

type SpawnProcess = (file: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

export class DockerCommandExecutor {
  constructor(private readonly spawnProcess: SpawnProcess = spawn) {}

  spawn(command: unknown, options: SpawnOptionsWithoutStdio) {
    return this.spawnProcess('docker', authorizeComposeCommand(command), options);
  }
}
