/**
 * Maps Nearby integration tests.
 * Covers NEARBY-001 to NEARBY-005.
 *
 * The mapsService.searchNearby function is mocked at the module boundary; we
 * verify the route's request validation, success path, and error propagation.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  for (const pragma of ['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000']) {
    db.prepare(`PRAGMA ${pragma}`).run();
  }
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: () => null,
    isOwner: () => false,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

vi.mock('../../src/services/mapsService', () => ({
  searchPlaces: vi.fn(),
  autocompletePlaces: vi.fn(),
  getPlaceDetails: vi.fn(),
  getPlaceDetailsExpanded: vi.fn(),
  getPlacePhoto: vi.fn(),
  reverseGeocode: vi.fn(),
  resolveGoogleMapsUrl: vi.fn(),
  searchNearby: vi.fn(),
}));

import { createApp } from '../../src/app';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb } from '../helpers/test-db';
import { createUser } from '../helpers/factories';
import { authCookie } from '../helpers/auth';
import { loginAttempts, mfaAttempts } from '../../src/routes/auth';
import * as mapsService from '../../src/services/mapsService';

const app: Application = createApp();

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  loginAttempts.clear();
  mfaAttempts.clear();
});

afterAll(() => {
  testDb.close();
});

describe('Maps Nearby', () => {
  it('POST /maps/nearby without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/maps/nearby')
      .send({ lat: 48.8566, lng: 2.3522, category: 'restaurant' });
    expect(res.status).toBe(401);
  });

  it('NEARBY-001 — POST /maps/nearby without lat/lng returns 400', async () => {
    const { user } = createUser(testDb);
    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ category: 'restaurant' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lat.*lng/i);
  });

  it('NEARBY-001 — POST /maps/nearby with out-of-range lat returns 400', async () => {
    const { user } = createUser(testDb);
    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 91, lng: 0, category: 'restaurant' });
    expect(res.status).toBe(400);
  });

  it('NEARBY-002 — POST /maps/nearby with unknown category returns 400', async () => {
    const { user } = createUser(testDb);
    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 48.8566, lng: 2.3522, category: 'nonsense' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('NEARBY-002 — POST /maps/nearby with missing category returns 400', async () => {
    const { user } = createUser(testDb);
    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 48.8566, lng: 2.3522 });
    expect(res.status).toBe(400);
  });

  it('NEARBY-003 — POST /maps/nearby returns service result on happy path', async () => {
    const { user } = createUser(testDb);
    vi.mocked(mapsService.searchNearby).mockResolvedValueOnce({
      results: [
        { google_place_id: 'gp1', osm_id: null, name: 'Cafe One', address: '1 rue', lat: 48.857, lng: 2.352, rating: 4.5, distance_m: 120, types: ['cafe'], source: 'google' },
      ],
      source: 'google',
      radius_m: 500,
    } as any);

    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 48.8566, lng: 2.3522, category: 'bar_cafe' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('google');
    expect(res.body.radius_m).toBe(500);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].name).toBe('Cafe One');
  });

  it('NEARBY-004 — POST /maps/nearby surfaces OSM source when service returns it', async () => {
    const { user } = createUser(testDb);
    vi.mocked(mapsService.searchNearby).mockResolvedValueOnce({
      results: [
        { google_place_id: null, osm_id: 'node:1', name: 'Le Bistro', address: '', lat: 48.857, lng: 2.352, rating: null, distance_m: 200, types: [], source: 'openstreetmap' },
      ],
      source: 'openstreetmap',
      radius_m: 2000,
    } as any);

    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 48.8566, lng: 2.3522, category: 'restaurant' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('openstreetmap');
    expect(res.body.radius_m).toBe(2000);
    expect(res.body.results[0].osm_id).toBe('node:1');
  });

  it('NEARBY-005 — POST /maps/nearby with empty results still returns 200', async () => {
    const { user } = createUser(testDb);
    vi.mocked(mapsService.searchNearby).mockResolvedValueOnce({
      results: [],
      source: 'openstreetmap',
      radius_m: 2000,
    } as any);

    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 0, lng: 0, category: 'attraction' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.radius_m).toBe(2000);
  });

  it('NEARBY-005 — POST /maps/nearby service error with status propagates', async () => {
    const { user } = createUser(testDb);
    vi.mocked(mapsService.searchNearby).mockRejectedValueOnce(
      Object.assign(new Error('Upstream failure'), { status: 502 }),
    );

    const res = await request(app)
      .post('/api/maps/nearby')
      .set('Cookie', authCookie(user.id))
      .send({ lat: 48.8566, lng: 2.3522, category: 'hotel' });

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});
