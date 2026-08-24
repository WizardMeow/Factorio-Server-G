import { portalModSchema, type PortalMod } from './schemas.js';

export interface ModMetadataProvider { getMod(name: string): Promise<PortalMod> }

export class ModPortalClient implements ModMetadataProvider {
  constructor(private readonly baseUrl = 'https://mods.factorio.com') {}
  async getMod(name: string): Promise<PortalMod> {
    const response = await fetch(`${this.baseUrl}/api/mods/${encodeURIComponent(name)}/full`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 404 ? `Mod not found: ${name}` : `Mod Portal metadata request failed (${response.status})`);
    return portalModSchema.parse(await response.json());
  }
}
