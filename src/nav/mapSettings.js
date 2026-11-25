// Map and GPS options in the settings (gotham-settings-v1 `map`, workstream L2). Pure.
//   minimap        show the minimap (off: the diegetic option; routes and markers still work)
//   rotate         the minimap turns with you (default north-up)
//   footRoute      draw the road ribbon on foot too (default: only in a vehicle)
//   highContrast   the accessibility look: black streets, white land, solid water
//   breadcrumbs    a trail of where you have been
//   pingSetsWaypoint  the comms wheel's "Go here" also sets your waypoint
export const DEFAULT_MAP_SETTINGS = Object.freeze({ minimap: true, rotate: false, footRoute: false, highContrast: false, breadcrumbs: false, pingSetsWaypoint: true });

export function sanitizeMapSettings(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_MAP_SETTINGS)) out[k] = typeof r[k] === 'boolean' ? r[k] : v;
  return out;
}
