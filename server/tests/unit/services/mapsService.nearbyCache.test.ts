/**
 * Cache-layer tests for searchNearby (MAPS-NEARBY-CACHE-001..006).
 *
 * Uses a real in-memory SQLite database (so the nearby_search_cache table
 * exists). Stubs global fetch so we can count upstream calls and confirm
 * that the second invocation with the same params skips the network.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  for (const pragma of ['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000']) {
    db.prepare(`PRAGMA ${pragma}`).run();
  }
  return { testDb: db, dbMock: { db, closeDb: () => {}, reinitialize: () => {}, getPlaceWithTags: () => null, canAccessTrip: () => null, isOwner: () => false } };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser } from '../../helpers/factories';
import { searchNearby } from '../../../src/services/mapsService';

let fetchSpy: ReturnType<typeof vi.fn>;

function googleResponse(places: Array<{ id: string; name: string; lat: number; lng: number }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      places: places.map(p => ({
        id: p.id,
        displayName: { text: p.name },
        location: { latitude: p.lat, longitude: p.lng },
        types: ['restaurant'],
      })),
    }),
  };
}

function overpassResponse(elements: Array<{ id: number; lat: number; lng: number; name: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      elements: elements.map(e => ({ type: 'node', id: e.id, lat: e.lat, lon: e.lng, tags: { name: e.name } })),
    }),
  };
}

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  // Wipe cache between tests for determinism
  testDb.prepare('DELETE FROM nearby_search_cache').run();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  testDb.close();
});

describe('searchNearby cache layer', () => {
  it('MAPS-NEARBY-CACHE-001: caches Google results on first call', async () => {
    const { user } = createUser(testDb);
    // Give the user a Google key so searchNearby picks the Google path
    testDb.prepare('UPDATE users SET maps_api_key = ? WHERE id = ?').run('test-google-key', user.id);
    fetchSpy.mockResolvedValueOnce(googleResponse([
      { id: 'g1', name: 'A', lat: 48.86, lng: 2.35 },
      { id: 'g2', name: 'B', lat: 48.861, lng: 2.351 },
      { id: 'g3', name: 'C', lat: 48.862, lng: 2.352 },
      { id: 'g4', name: 'D', lat: 48.863, lng: 2.353 },
      { id: 'g5', name: 'E', lat: 48.864, lng: 2.354 },
    ]));

    const result = await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(result.results).toHaveLength(5);
    expect(result.source).toBe('google');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const cached = testDb.prepare('SELECT COUNT(*) as c FROM nearby_search_cache').get() as { c: number };
    expect(cached.c).toBe(1);
  });

  it('MAPS-NEARBY-CACHE-002: second identical Google call hits cache and skips fetch', async () => {
    const { user } = createUser(testDb);
    testDb.prepare('UPDATE users SET maps_api_key = ? WHERE id = ?').run('test-google-key', user.id);
    fetchSpy.mockResolvedValue(googleResponse([
      { id: 'g1', name: 'A', lat: 48.86, lng: 2.35 },
      { id: 'g2', name: 'B', lat: 48.861, lng: 2.351 },
      { id: 'g3', name: 'C', lat: 48.862, lng: 2.352 },
      { id: 'g4', name: 'D', lat: 48.863, lng: 2.353 },
      { id: 'g5', name: 'E', lat: 48.864, lng: 2.354 },
    ]));

    await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(second.results).toHaveLength(5);
    expect(second.source).toBe('google');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no new upstream call
  });

  it('MAPS-NEARBY-CACHE-003: caches Overpass (OSM) results when no API key', async () => {
    const { user } = createUser(testDb);
    // No maps key → Overpass path
    fetchSpy.mockResolvedValueOnce(overpassResponse([
      { id: 1, lat: 48.86, lng: 2.35, name: 'O1' },
      { id: 2, lat: 48.861, lng: 2.351, name: 'O2' },
      { id: 3, lat: 48.862, lng: 2.352, name: 'O3' },
      { id: 4, lat: 48.863, lng: 2.353, name: 'O4' },
      { id: 5, lat: 48.864, lng: 2.354, name: 'O5' },
    ]));

    const result = await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(result.source).toBe('openstreetmap');
    expect(result.results.length).toBeGreaterThanOrEqual(5);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const row = testDb.prepare('SELECT source FROM nearby_search_cache LIMIT 1').get() as { source: string };
    expect(row.source).toBe('openstreetmap');
  });

  it('MAPS-NEARBY-CACHE-004: second identical Overpass call hits cache', async () => {
    const { user } = createUser(testDb);
    fetchSpy.mockResolvedValue(overpassResponse([
      { id: 1, lat: 48.86, lng: 2.35, name: 'O1' },
      { id: 2, lat: 48.861, lng: 2.351, name: 'O2' },
      { id: 3, lat: 48.862, lng: 2.352, name: 'O3' },
      { id: 4, lat: 48.863, lng: 2.353, name: 'O4' },
      { id: 5, lat: 48.864, lng: 2.354, name: 'O5' },
    ]));

    await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(second.source).toBe('openstreetmap');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('MAPS-NEARBY-CACHE-005: different category → cache miss → new fetch', async () => {
    const { user } = createUser(testDb);
    testDb.prepare('UPDATE users SET maps_api_key = ? WHERE id = ?').run('k', user.id);
    fetchSpy.mockResolvedValue(googleResponse([
      { id: 'g1', name: 'A', lat: 48.86, lng: 2.35 },
      { id: 'g2', name: 'B', lat: 48.861, lng: 2.351 },
      { id: 'g3', name: 'C', lat: 48.862, lng: 2.352 },
      { id: 'g4', name: 'D', lat: 48.863, lng: 2.353 },
      { id: 'g5', name: 'E', lat: 48.864, lng: 2.354 },
    ]));

    await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    await searchNearby(user.id, 48.8566, 2.3522, 'hotel', 'en');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const cnt = testDb.prepare('SELECT COUNT(*) as c FROM nearby_search_cache').get() as { c: number };
    expect(cnt.c).toBe(2);
  });

  it('MAPS-NEARBY-CACHE-006: expired cache entry triggers refetch', async () => {
    const { user } = createUser(testDb);
    testDb.prepare('UPDATE users SET maps_api_key = ? WHERE id = ?').run('k', user.id);
    fetchSpy.mockResolvedValue(googleResponse([
      { id: 'g1', name: 'A', lat: 48.86, lng: 2.35 },
      { id: 'g2', name: 'B', lat: 48.861, lng: 2.351 },
      { id: 'g3', name: 'C', lat: 48.862, lng: 2.352 },
      { id: 'g4', name: 'D', lat: 48.863, lng: 2.353 },
      { id: 'g5', name: 'E', lat: 48.864, lng: 2.354 },
    ]));

    await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Backdate the cache row by 2 days (TTL is 24h)
    testDb.prepare('UPDATE nearby_search_cache SET fetched_at = ?').run(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await searchNearby(user.id, 48.8566, 2.3522, 'restaurant', 'en');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
