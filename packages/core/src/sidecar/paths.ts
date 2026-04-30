import { join } from 'node:path';

export function sidecarPath(projectRoot: string, uuid: string): string {
  return join(projectRoot, '.deskwork', 'entries', `${uuid}.json`);
}

export function sidecarsDir(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'entries');
}
