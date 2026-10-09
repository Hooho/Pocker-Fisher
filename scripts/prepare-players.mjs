import { readFileSync, writeFileSync } from 'node:fs';
import { copyPlayers } from '../../../packages/game-common/src/publishing/copy-players.mjs';

export function buildCharacters() {
  const identities = JSON.parse(readFileSync(new URL('../../../packages/game-common/players/identities.json', import.meta.url), 'utf8'));
  const profiles = new Map(JSON.parse(readFileSync(new URL('../public/characters.json', import.meta.url), 'utf8')).map(p => [p.id, p]));
  return identities.map(identity => {
    const profile = profiles.get(identity.id);
    if (!profile) throw new Error(`缺少选手 ${identity.id} 的德扑参数，请在 public/characters.json 补充。`);
    const { id: _id, name: _name, avatar: _avatar, ...gameplay } = profile;
    return { ...gameplay, ...identity };
  });
}

const destination = new URL('../public/shared-players/', import.meta.url);
copyPlayers(destination);
writeFileSync(new URL('characters.json', destination), JSON.stringify(buildCharacters()));
