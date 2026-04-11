import axios from 'axios';

const API_BASE = '/api';

export async function getCitiesData() {
    try {
        const res = await axios.get(`${API_BASE}/cities`);
        return res.data;
    } catch (e) {
        console.error('Failed to get cities data:', e);
        return null;
    }
}

export async function getMapData() {
    try {
        const res = await axios.get(`${API_BASE}/map`);
        return res.data;
    } catch (e) {
        console.error('Failed to get map data:', e);
        return null;
    }
}

export async function getMetricsData() {
    try {
        const res = await axios.get(`${API_BASE}/metrics`);
        return res.data;
    } catch (e) {
        console.error('Failed to get metrics data:', e);
        return null;
    }
}

export async function predictAQI(data: { temp: number, humidity: number, wind_speed: number, aod: number, lat: number, lon: number }) {
    try {
        const res = await axios.post(`${API_BASE}/predict`, data);
        return res.data;
    } catch (e) {
        console.error('Failed to predict AQI:', e);
        return null;
    }
}
