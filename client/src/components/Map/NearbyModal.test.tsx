// FE-COMP-NEARBY-001 to FE-COMP-NEARBY-006
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useAuthStore } from '../../store/authStore';
import { buildUser, buildPlace } from '../../../tests/helpers/factories';
import NearbyModal from './NearbyModal';

const place = buildPlace({ id: 99, name: 'Notre-Dame', lat: 48.8530, lng: 2.3499 });

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true, hasMapsKey: true });
});

describe('NearbyModal', () => {
  it('FE-COMP-NEARBY-001: renders the category picker initially', () => {
    render(<NearbyModal place={place} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText(/Restaurants/i)).toBeInTheDocument();
    expect(screen.getByText(/Hotels/i)).toBeInTheDocument();
    expect(screen.getByText(/Attractions/i)).toBeInTheDocument();
  });

  it('FE-COMP-NEARBY-002: clicking a category fetches and shows results', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/maps/nearby', () =>
        HttpResponse.json({
          results: [
            { google_place_id: 'g1', osm_id: null, name: 'Café Léon', address: '12 rue Lagrange', lat: 48.851, lng: 2.351, rating: 4.6, distance_m: 240, types: ['cafe'], source: 'google' },
          ],
          source: 'google',
          radius_m: 500,
        }),
      ),
    );

    render(<NearbyModal place={place} onClose={vi.fn()} onPick={vi.fn()} />);
    await user.click(screen.getByText(/Bars & Cafés/i));

    await screen.findByText('Café Léon');
    expect(screen.getByText(/12 rue Lagrange/)).toBeInTheDocument();
    expect(screen.getByText(/240 m/)).toBeInTheDocument();
    expect(screen.getByText(/Results from Google Maps/i)).toBeInTheDocument();
  });

  it('FE-COMP-NEARBY-003: picking a result calls onPick with the categoryKey', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    server.use(
      http.post('/api/maps/nearby', () =>
        HttpResponse.json({
          results: [
            { google_place_id: 'g1', osm_id: null, name: 'Le Petit Bistrot', address: '', lat: 48.852, lng: 2.350, rating: null, distance_m: 80, types: [], source: 'google' },
          ],
          source: 'google',
          radius_m: 500,
        }),
      ),
    );

    render(<NearbyModal place={place} onClose={vi.fn()} onPick={onPick} />);
    await user.click(screen.getByText(/Restaurants/i));
    const result = await screen.findByText('Le Petit Bistrot');
    await user.click(result);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][1]).toBe('restaurant');
    expect(onPick.mock.calls[0][0]).toMatchObject({ name: 'Le Petit Bistrot', google_place_id: 'g1' });
  });

  it('FE-COMP-NEARBY-004: empty results show no-results copy', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/maps/nearby', () =>
        HttpResponse.json({ results: [], source: 'openstreetmap', radius_m: 2000 }),
      ),
    );

    render(<NearbyModal place={place} onClose={vi.fn()} onPick={vi.fn()} />);
    await user.click(screen.getByText(/Hotels/i));

    await screen.findByText(/No nearby places found within 2 km/i);
    expect(screen.getByText(/Results from OpenStreetMap/i)).toBeInTheDocument();
  });

  it('FE-COMP-NEARBY-005: change-category link returns to the picker', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/maps/nearby', () =>
        HttpResponse.json({ results: [], source: 'google', radius_m: 500 }),
      ),
    );

    render(<NearbyModal place={place} onClose={vi.fn()} onPick={vi.fn()} />);
    await user.click(screen.getByText(/Attractions/i));
    await screen.findByText(/No nearby places found/i);
    await user.click(screen.getByText(/Change category/i));

    await waitFor(() => {
      expect(screen.getByText(/What are you looking for nearby\?/i)).toBeInTheDocument();
    });
  });

  it('FE-COMP-NEARBY-006: closes when place has no coordinates', () => {
    const onClose = vi.fn();
    const placeNoCoords = buildPlace({ id: 100, name: 'Mystery', lat: null, lng: null });
    render(<NearbyModal place={placeNoCoords} onClose={onClose} onPick={vi.fn()} />);
    expect(onClose).toHaveBeenCalled();
  });
});
