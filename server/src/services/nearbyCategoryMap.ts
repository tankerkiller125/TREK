/**
 * Category translation table used by the Nearby feature.
 *
 * Each key is a stable identifier sent by the client. The server uses it to
 * pick the correct Google Places `includedTypes` set or the equivalent
 * Overpass QL filter when falling back to OpenStreetMap.
 */

export type NearbyCategoryKey =
  | 'hotel'
  | 'restaurant'
  | 'attraction'
  | 'shopping'
  | 'transport'
  | 'activity'
  | 'bar_cafe'
  | 'beach'
  | 'nature';

export interface NearbyCategoryDef {
  google: string[];
  overpass: string[];
}

export const NEARBY_CATEGORY_MAP: Record<NearbyCategoryKey, NearbyCategoryDef> = {
  hotel: {
    google: ['lodging'],
    overpass: ['["tourism"~"^(hotel|hostel|motel|guest_house|apartment)$"]'],
  },
  restaurant: {
    google: ['restaurant'],
    overpass: ['["amenity"="restaurant"]'],
  },
  attraction: {
    google: ['tourist_attraction', 'museum', 'art_gallery'],
    overpass: ['["tourism"~"^(attraction|museum|gallery|monument|viewpoint)$"]'],
  },
  shopping: {
    google: ['shopping_mall', 'store', 'clothing_store'],
    overpass: ['["shop"]'],
  },
  transport: {
    google: ['transit_station', 'subway_station', 'train_station', 'bus_station', 'airport'],
    overpass: ['["public_transport"~"station|stop_position"]', '["railway"="station"]'],
  },
  activity: {
    google: ['amusement_park', 'park', 'gym', 'stadium', 'zoo'],
    overpass: ['["leisure"~"^(park|sports_centre|stadium|playground|fitness_centre)$"]'],
  },
  bar_cafe: {
    google: ['bar', 'cafe', 'coffee_shop', 'pub'],
    overpass: ['["amenity"~"^(bar|cafe|pub|biergarten)$"]'],
  },
  beach: {
    google: ['beach'],
    overpass: ['["natural"="beach"]'],
  },
  nature: {
    google: ['park', 'national_park'],
    overpass: ['["leisure"="park"]', '["boundary"="national_park"]'],
  },
};

export function isNearbyCategoryKey(key: string): key is NearbyCategoryKey {
  return Object.prototype.hasOwnProperty.call(NEARBY_CATEGORY_MAP, key);
}
