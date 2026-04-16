import axios from 'axios';

const API_BASE = '/api';

export async function fetchStaticJson(path: string) {
    try {
        const res = await fetch(path, {cache: 'no-store'});
        if (!res.ok) {
            throw new Error(`Static fetch failed for ${path}: ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error(`Failed to load static file ${path}:`, e);
        return null;
    }
}

export async function getCitiesData() {
    try {
        const res = await axios.get(`${API_BASE}/cities`);
        return res.data;
    } catch (e) {
        console.warn('Backend /cities unavailable, falling back to static city data.');
        return await fetchStaticJson('/vaayu_ml/city_predictions.json');
    }
}

export async function getMapData() {
    try {
        const res = await axios.get(`${API_BASE}/map`);
        return res.data;
    } catch (e) {
        console.warn('Backend /map unavailable, falling back to static map data.');
        return await fetchStaticJson('/vaayu_ml/spatial_map.geojson');
    }
}

export async function getMetricsData() {
    try {
        const res = await axios.get(`${API_BASE}/metrics`);
        return res.data;
    } catch (e) {
        console.warn('Backend /metrics unavailable, falling back to static metrics data.');
        return await fetchStaticJson('/vaayu_ml/model_metrics.json');
    }
}

export async function predictAQI(data: { temp: number, humidity: number, wind_speed: number, aod: number, lat: number, lon: number }) {
    try {
        const res = await axios.post(`${API_BASE}/predict`, data);
        return res.data;
    } catch (e) {
        console.warn('Backend /predict unavailable, returning local heuristic prediction.');
        const estimatedPm25 = Math.max(
            0,
            Number((data.aod * 120 + data.humidity * 0.25 - data.wind_speed * 0.9 + data.temp * 0.4 + 15).toFixed(2))
        );
        return {pm25: estimatedPm25, source: 'frontend-fallback'};
    }
}
