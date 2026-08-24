import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { DockerComposeAdapter } from './compose-adapter.js';

const projectRoot = resolve(process.env.PROJECT_ROOT || process.cwd());
const adapter = new DockerComposeAdapter(projectRoot, 'factorio', (fields, message) => console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), ...fields, message })));
const app = await buildApp({ projectRoot, adapter, serveFrontend: process.env.NODE_ENV === 'production' });
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 3001) });
