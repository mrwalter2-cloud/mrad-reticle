import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteProfile,
  listProfiles,
  loadStore,
  newProfileId,
  savePrefs,
  STORE_KEY,
  upsertProfile,
} from './storage';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

describe('profile storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'id-1' },
      configurable: true,
    });
  });

  it('saves, lists, and deletes a profile', () => {
    let store = loadStore();
    expect(listProfiles(store)).toHaveLength(0);
    const profile = {
      id: newProfileId(),
      name: 'iPhone rear',
      pxPerMrad: 1.25,
      zoomWhenCalibrated: 2,
      facingMode: 'environment' as const,
      createdAt: 1,
      updatedAt: 2,
    };
    store = upsertProfile(store, profile);
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}').activeProfileId).toBe('id-1');
    expect(listProfiles(store)[0]?.name).toBe('iPhone rear');
    store = deleteProfile(store, 'id-1');
    expect(listProfiles(store)).toHaveLength(0);
    expect(store.activeProfileId).toBeNull();
  });

  it('persists reticle prefs', () => {
    let store = loadStore();
    store = savePrefs(store, { showMoa: true, color: '#33ff66' });
    const again = loadStore();
    expect(again.prefs.showMoa).toBe(true);
    expect(again.prefs.color).toBe('#33ff66');
  });

  it('migrates legacy v1 profiles', () => {
    localStorage.setItem(
      'mrad-reticle-v1',
      JSON.stringify({ profiles: { Default: { pxPerMrad: 12.5, zoomWhenSaved: 2, ts: 99 } } }),
    );
    const store = loadStore();
    expect(listProfiles(store)).toHaveLength(1);
    expect(listProfiles(store)[0]?.pxPerMrad).toBe(12.5);
    expect(store.activeProfileId).toBeTruthy();
  });
});
