// Which side of an online game this tab is (workstream D2). Tiny and dependency-free so shared
// gameplay files (flow, coop runtime, boss) can ask without pulling the net layer into the main
// bundle. 'off' for single-player and split screen: every gate below is then a no-op.
//   host    owns the world (story, enemies, crimes, vehicles), as in single-player
//   guest   a replica: never spawns, never advances the story; applies the host's events
export const netMode = { role: 'off', net: null };

export const isReplica = () => netMode.role === 'guest';
export const isNetHost = () => netMode.role === 'host';
export const isOnline = () => netMode.role !== 'off';

export function setNetRole(role, net = null) {
  netMode.role = role === 'host' || role === 'guest' ? role : 'off';
  netMode.net = netMode.role === 'off' ? null : net;
}
