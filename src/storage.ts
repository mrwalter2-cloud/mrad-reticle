import type { DistUnit, SizeUnit } from './math';

export const STORE_KEY = 'mrad-reticle-v2';
const LEGACY_KEY = 'mrad-reticle-v1';

export type ReticleStyle = 'hash' | 'mildot' | 'cross';
export type FacingMode = 'environment' | 'user';

export interface CalProfile {
  id: string;
  name: string;
  pxPerMrad: number;
  zoomWhenCalibrated: number;
  facingMode: FacingMode;
  knownSize?: number;
  sizeUnit?: SizeUnit;
  knownDist?: number;
  distUnit?: DistUnit;
  createdAt: number;
  updatedAt: number;
}

export interface Prefs {
  style: ReticleStyle;
  color: string;
  opacity: number;
  major: number;
  showMoa: boolean;
}

export interface Store {
  version: 2;
  activeProfileId: string | null;
  prefs: Prefs;
  profiles: Record<string, CalProfile>;
}

export const DEFAULT_PREFS: Prefs = {
  style: 'hash',
  color: '#ff2a2a',
  opacity: 0.92,
  major: 1,
  showMoa: false,
};

function emptyStore(): Store {
  return { version: 2, activeProfileId: null, prefs: { ...DEFAULT_PREFS }, profiles: {} };
}

function migrateLegacy(raw: unknown): Store {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object') return store;
  const legacy = raw as { profiles?: Record<string, { pxPerMrad?: number; zoomWhenSaved?: number; ts?: number }> };
  const profiles = legacy.profiles ?? {};
  for (const [name, p] of Object.entries(profiles)) {
    if (!p || typeof p.pxPerMrad !== 'number' || !(p.pxPerMrad > 0)) continue;
    const id = crypto.randomUUID();
    store.profiles[id] = {
      id,
      name,
      pxPerMrad: p.pxPerMrad,
      zoomWhenCalibrated: typeof p.zoomWhenSaved === 'number' ? p.zoomWhenSaved : 1,
      facingMode: 'environment',
      createdAt: p.ts ?? Date.now(),
      updatedAt: p.ts ?? Date.now(),
    };
  }
  const first = Object.keys(store.profiles)[0];
  store.activeProfileId = first ?? null;
  return store;
}

export function loadStore(): Store {
  try {
    const v2 = localStorage.getItem(STORE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as Store;
      if (parsed?.version === 2 && parsed.profiles && parsed.prefs) {
        parsed.prefs = { ...DEFAULT_PREFS, ...parsed.prefs };
        return parsed;
      }
    }
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) {
      const migrated = migrateLegacy(JSON.parse(v1));
      saveStore(migrated);
      return migrated;
    }
  } catch {
    /* keep empty */
  }
  return emptyStore();
}

export function saveStore(store: Store): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function listProfiles(store: Store): CalProfile[] {
  return Object.values(store.profiles).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertProfile(store: Store, profile: CalProfile): Store {
  const next = {
    ...store,
    profiles: { ...store.profiles, [profile.id]: profile },
    activeProfileId: profile.id,
  };
  saveStore(next);
  return next;
}

export function deleteProfile(store: Store, id: string): Store {
  const profiles = { ...store.profiles };
  delete profiles[id];
  const next: Store = {
    ...store,
    profiles,
    activeProfileId: store.activeProfileId === id ? null : store.activeProfileId,
  };
  saveStore(next);
  return next;
}

export function setActiveProfile(store: Store, id: string | null): Store {
  const next = { ...store, activeProfileId: id };
  saveStore(next);
  return next;
}

export function savePrefs(store: Store, prefs: Partial<Prefs>): Store {
  const next = { ...store, prefs: { ...store.prefs, ...prefs } };
  saveStore(next);
  return next;
}

export function newProfileId(): string {
  return crypto.randomUUID();
}
