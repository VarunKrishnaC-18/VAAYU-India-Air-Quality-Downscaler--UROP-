import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { feature as topojsonFeature } from 'topojson-client';
import { geoContains } from 'd3-geo';

type MapFilter = 'all' | 'healthy' | 'moderate' | 'severe';

type SpatialLeafletMapProps = {
  geoJsonData: any | null;
  filter: MapFilter;
  resolution: 'coarse' | 'fine';
  selectedCityName?: string;
  selectedCityCenter?: { lat: number; lon: number } | null;
};

const getColor = (pm25: number) => {
  if (pm25 <= 50) return '#22c55e';
  if (pm25 <= 100) return '#facc15';
  if (pm25 <= 150) return '#f97316';
  return '#ef4444';
};

const getCategory = (pm25: number) => {
  if (pm25 <= 50) return 'Good';
  if (pm25 <= 100) return 'Moderate';
  if (pm25 <= 150) return 'Unhealthy for Sensitive Groups';
  return 'Severe';
};

const matchesFilter = (pm25: number, filter: MapFilter) => {
  if (filter === 'all') return true;
  if (filter === 'healthy') return pm25 <= 50;
  if (filter === 'moderate') return pm25 > 50 && pm25 <= 150;
  return pm25 > 150;
};

const pointToCellPolygonFeature = (feature: any, halfCell: number) => {
  const [lon, lat] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lon - halfCell, lat - halfCell],
        [lon + halfCell, lat - halfCell],
        [lon + halfCell, lat + halfCell],
        [lon - halfCell, lat + halfCell],
        [lon - halfCell, lat - halfCell],
      ]],
    },
    properties: {
      ...(feature?.properties || {}),
      _sourceType: 'point-grid',
      center_lon: lon,
      center_lat: lat,
    },
  };
};

const getRepresentativeCoordinates = (feature: any) => {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return { lat: Number(lat), lon: Number(lon) };
  }

  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
    const ring = geometry.coordinates[0];
    if (!ring.length) return null;
    const [sumLon, sumLat] = ring.reduce(
      (acc: [number, number], coord: [number, number]) => [acc[0] + Number(coord[0]), acc[1] + Number(coord[1])],
      [0, 0]
    );
    return { lat: sumLat / ring.length, lon: sumLon / ring.length };
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0]?.[0])) {
    const ring = geometry.coordinates[0][0];
    if (!ring.length) return null;
    const [sumLon, sumLat] = ring.reduce(
      (acc: [number, number], coord: [number, number]) => [acc[0] + Number(coord[0]), acc[1] + Number(coord[1])],
      [0, 0]
    );
    return { lat: sumLat / ring.length, lon: sumLon / ring.length };
  }

  return null;
};

const ResetViewControl = ({ bounds }: { bounds: L.LatLngBounds | null }) => {
  const map = useMap();

  if (!bounds) return null;

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '72px' }}>
      <div className="leaflet-control leaflet-bar" style={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.35)' }}>
        <button
          type="button"
          onClick={() => map.fitBounds(bounds, { padding: [24, 24] })}
          style={{
            width: 34,
            height: 34,
            color: '#e2e8f0',
            fontWeight: 700,
            fontSize: 16,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          title="Reset view"
          aria-label="Reset view"
        >
          ↺
        </button>
      </div>
    </div>
  );
};

const FitToData = ({ bounds }: { bounds: L.LatLngBounds | null }) => {
  const map = useMap();

  useEffect(() => {
    if (!bounds || !bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);

  return null;
};

export default function SpatialLeafletMap({ geoJsonData, filter, resolution, selectedCityName, selectedCityCenter }: SpatialLeafletMapProps) {
  const [indiaBoundary, setIndiaBoundary] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadIndiaBoundary = async () => {
      try {
        const response = await fetch('/vaayu_ml/india-countries-110m.json', { cache: 'no-store' });
        if (!response.ok) return;

        const topology = await response.json();
        const countries = topojsonFeature(topology, topology?.objects?.countries) as any;
        const india = countries?.features?.find((entry: any) => Number(entry?.id) === 356) || null;
        if (isMounted) setIndiaBoundary(india);
      } catch (error) {
        console.error('Failed to load India boundary for clipping:', error);
      }
    };

    loadIndiaBoundary();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredGeoJson = useMemo(() => {
    const sourceFeatures = Array.isArray(geoJsonData?.features) ? geoJsonData.features : [];
    const resolutionDeg = Number(geoJsonData?.metadata?.resolution_deg ?? 0.5);
    const halfCell = Math.max(0.05, resolutionDeg / 2);

    const cityLat = Number(selectedCityCenter?.lat);
    const cityLon = Number(selectedCityCenter?.lon);
    const hasCityCenter = Number.isFinite(cityLat) && Number.isFinite(cityLon);
    const cityLatPad = resolution === 'fine' ? 2.2 : 3.2;
    const cityLonPad = resolution === 'fine' ? 2.2 : 3.2;

    const processed = sourceFeatures
      .map((feature: any) => {
        if (feature?.geometry?.type === 'Point') {
          return pointToCellPolygonFeature(feature, halfCell);
        }
        return feature;
      })
      .filter((feature: any) => !!feature)
      .filter((feature: any) => {
        const pm25 = Number(feature?.properties?.pm25 ?? 0);
        if (!Number.isFinite(pm25) || !matchesFilter(pm25, filter)) return false;

        const coords = getRepresentativeCoordinates(feature);
        if (!coords) return false;

        if (indiaBoundary && !geoContains(indiaBoundary, [coords.lon, coords.lat])) return false;

        if (hasCityCenter) {
          const inCityWindow =
            Math.abs(coords.lat - cityLat) <= cityLatPad &&
            Math.abs(coords.lon - cityLon) <= cityLonPad;
          if (!inCityWindow) return false;
        }

        return true;
      });

    let optimized = processed;
    if (resolution === 'coarse' && processed.length > 2000) {
      const stride = Math.max(2, Math.floor(processed.length / 1200));
      optimized = processed.filter((_: any, index: number) => index % stride === 0);
    }

    return {
      type: 'FeatureCollection',
      features: optimized,
    };
  }, [geoJsonData, filter, resolution, indiaBoundary, selectedCityCenter]);

  const dataBounds = useMemo(() => {
    if (!filteredGeoJson.features.length) return null;
    const layer = L.geoJSON(filteredGeoJson as any);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : null;
  }, [filteredGeoJson]);

  const focusBounds = useMemo(() => {
    const cityLat = Number(selectedCityCenter?.lat);
    const cityLon = Number(selectedCityCenter?.lon);
    const hasCityCenter = Number.isFinite(cityLat) && Number.isFinite(cityLon);

    if (hasCityCenter) {
      const latPad = resolution === 'fine' ? 1.8 : 2.8;
      const lonPad = resolution === 'fine' ? 1.8 : 2.8;
      return L.latLngBounds(
        [cityLat - latPad, cityLon - lonPad],
        [cityLat + latPad, cityLon + lonPad]
      );
    }

    return dataBounds;
  }, [selectedCityCenter, resolution, dataBounds]);

  const defaultCenter: [number, number] = [22.9734, 78.6569];

  return (
    <div className="relative w-full h-[620px] rounded-[3rem] overflow-hidden border border-white/10 bg-[#020617]">
      <div className="absolute top-3 left-3 z-[500] rounded-xl bg-slate-950/85 border border-white/10 px-3 py-2 text-[10px] text-slate-200 font-bold uppercase tracking-widest">
        {selectedCityName ? `Focused: ${selectedCityName}` : 'Focused: India'}
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={5}
        minZoom={3}
        maxZoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; OpenStreetMap & CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <GeoJSON
          key={`${filter}-${resolution}-${selectedCityName || 'india'}-${filteredGeoJson.features.length}`}
          data={filteredGeoJson as any}
          style={(feature: any) => {
            const pm25 = Number(feature?.properties?.pm25 ?? 0);
            return {
              color: '#0f172a',
              weight: 0.3,
              opacity: 0.38,
              fillColor: getColor(pm25),
              fillOpacity: 0.56,
            };
          }}
          onEachFeature={(feature: any, layer) => {
            const pm25 = Number(feature?.properties?.pm25 ?? 0);
            const category = getCategory(pm25);
            const coords = getRepresentativeCoordinates(feature);
            const coordText = coords ? `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}` : 'N/A';

            layer.bindTooltip(
              `<div style="font-family: Inter, sans-serif; min-width: 170px;">
                <div style="font-weight: 700; margin-bottom: 6px;">PM2.5: ${pm25.toFixed(2)} &micro;g/m&sup3;</div>
                <div style="font-size: 12px; color: #334155; margin-bottom: 3px;">AQI Category: ${category}</div>
                <div style="font-size: 12px; color: #64748b;">Coordinates: ${coordText}</div>
              </div>`,
              { sticky: true, direction: 'top', opacity: 0.96 }
            );

            layer.on({
              mouseover: () => {
                if ('setStyle' in layer) {
                  (layer as any).setStyle({ weight: 0.8, fillOpacity: 0.82 });
                }
              },
              mouseout: () => {
                if ('setStyle' in layer) {
                  (layer as any).setStyle({ weight: 0.3, fillOpacity: 0.56 });
                }
              },
            });
          }}
        />

        <FitToData bounds={focusBounds} />
        <ResetViewControl bounds={focusBounds} />
      </MapContainer>

      {filteredGeoJson.features.length === 0 && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm text-slate-200 text-sm font-bold">
          No map cells match this AQI filter.
        </div>
      )}
    </div>
  );
}
