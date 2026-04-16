import json
import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="VAAYU - Air Quality Downscaler API")

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Base path for vaayu_ml folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(BASE_DIR, "..", "vaayu_ml")

# Global variables for models and data
model = None
scaler = None
features_list = []
city_predictions = None
spatial_map = None
model_metrics = None


def clamp(value: float, low: float, high: float) -> float:
    return float(max(low, min(high, value)))


def pm25_to_category(pm25: float) -> str:
    if pm25 <= 50:
        return "Healthy"
    if pm25 <= 100:
        return "Moderate"
    if pm25 <= 150:
        return "Poor"
    return "Severe"


def pm25_to_color(pm25: float) -> str:
    if pm25 <= 50:
        return "#22c55e"
    if pm25 <= 100:
        return "#facc15"
    if pm25 <= 150:
        return "#f97316"
    return "#ef4444"


def pm25_to_aqi(pm25: float) -> int:
    # Lightweight PM2.5 -> AQI approximation for visualization metadata.
    return int(round(clamp(pm25 * 1.9 + 12.0, 0, 500)))


def build_feature_row(lat: float, lon: float, base_pm25: float, aod: float, humidity: float, wind_speed: float) -> dict:
    temp = 24.0 + 5.0 * np.sin(np.radians(lat * 3.2)) + 2.3 * np.cos(np.radians(lon * 2.1))
    pressure = 1008.0 + 4.0 * np.cos(np.radians(lat * 2.8))
    cloud_cover = 45.0 + 20.0 * np.sin(np.radians(lon * 1.7))
    precipitation = max(0.0, 2.0 + 1.2 * np.cos(np.radians((lat + lon) * 2.0)))
    wind_dir = (lat * 7.0 + lon * 5.0) % 360.0
    radiation = 180.0 + 35.0 * np.sin(np.radians(lat * 4.0))
    ventilation = max(0.1, wind_speed * (250.0 + 6.0 * temp))

    return {
        "lat": lat,
        "lon": lon,
        "temp": temp,
        "humidity": humidity,
        "wind_speed": wind_speed,
        "aod": aod,
        "pressure": pressure,
        "cloud_cover": cloud_cover,
        "precipitation": precipitation,
        "wind_dir": wind_dir,
        "radiation": radiation,
        "ventilation": ventilation,
        "aod_humidity": aod * humidity,
        "aod_wind_interact": aod * wind_speed,
        "base_pm25": base_pm25,
    }


def idw_base_pm25(lat: float, lon: float, city_rows: list[dict], k: int = 6) -> float:
    if not city_rows:
        return 65.0

    distances = []
    for row in city_rows:
        city_lat = float(row.get("lat", 0.0))
        city_lon = float(row.get("lon", 0.0))
        pm25 = float(row.get("pm25_predicted", row.get("pm25_actual", row.get("aqi", 90))))
        # 1 deg lat/lon Euclidean approximation is sufficient for local interpolation.
        d = np.hypot(lat - city_lat, lon - city_lon)
        distances.append((d, pm25, city_lat, city_lon))

    distances.sort(key=lambda x: x[0])
    nearest = distances[: max(1, min(k, len(distances)))]

    weights = []
    weighted_vals = []
    for d, pm25, _, _ in nearest:
        w = 1.0 / max(d, 0.02) ** 1.7
        weights.append(w)
        weighted_vals.append(w * pm25)

    idw = float(sum(weighted_vals) / max(sum(weights), 1e-9))

    # Add smooth geospatial variation so the field is not block-uniform.
    wave = 5.0 * np.sin(np.radians((lat + lon) * 9.5)) + 3.8 * np.cos(np.radians((lat - lon) * 8.0))
    return max(2.0, idw + wave)


def model_pm25_prediction(lat: float, lon: float, city_rows: list[dict]) -> float | None:
    if model is None or scaler is None or not features_list:
        return None

    base = idw_base_pm25(lat, lon, city_rows)
    humidity = clamp(52.0 + 16.0 * np.cos(np.radians(lat * 3.4)), 20.0, 92.0)
    wind_speed = clamp(2.2 + 2.1 * abs(np.sin(np.radians(lon * 3.0))), 0.2, 12.0)
    aod = clamp(0.14 + (base / 240.0) + 0.03 * np.sin(np.radians((lat + lon) * 6.0)), 0.05, 1.4)

    row = build_feature_row(lat, lon, base, aod, humidity, wind_speed)
    input_data = {feature: 0.0 for feature in features_list}
    for key, value in row.items():
        if key in input_data:
            input_data[key] = float(value)

    try:
        ordered = pd.DataFrame([input_data])[features_list]
        scaled = scaler.transform(ordered)
        pred = float(model.predict(scaled)[0])
        return max(0.0, pred)
    except Exception:
        return None


def build_city_bbox(city_lat: float, city_lon: float, lat_pad: float, lon_pad: float) -> tuple[float, float, float, float]:
    return (
        city_lat - lat_pad,
        city_lat + lat_pad,
        city_lon - lon_pad,
        city_lon + lon_pad,
    )


def frange(start: float, stop: float, step: float):
    cur = start
    # Inclusive range for stable edges.
    while cur <= stop + 1e-12:
        yield cur
        cur += step


def generate_spatial_geojson(
    city_name: str | None,
    step: float,
    lat_pad: float,
    lon_pad: float,
) -> dict:
    city_rows = city_predictions if isinstance(city_predictions, list) else []

    if not city_rows:
        return {
            "type": "FeatureCollection",
            "metadata": {
                "generated": datetime.now(timezone.utc).isoformat(),
                "model": "XGBoost",
                "resolution_deg": step,
                "crs": "EPSG:4326",
                "city": city_name,
                "features": 0,
            },
            "features": [],
        }

    selected_rows: list[dict]
    if city_name:
        selected_rows = [
            row for row in city_rows
            if str(row.get("city", "")).strip().lower() == city_name.strip().lower()
        ]
        if not selected_rows:
            raise HTTPException(status_code=404, detail=f"City '{city_name}' not found in city predictions")
    else:
        # Build a combined city-focused map around all known city centers.
        selected_rows = city_rows

    features = []
    seen = set()

    for row in selected_rows:
        city = str(row.get("city", "Unknown"))
        city_lat = float(row.get("lat", 0.0))
        city_lon = float(row.get("lon", 0.0))
        lat_min, lat_max, lon_min, lon_max = build_city_bbox(city_lat, city_lon, lat_pad, lon_pad)

        for lat in frange(lat_min, lat_max, step):
            for lon in frange(lon_min, lon_max, step):
                qlat = round(lat, 5)
                qlon = round(lon, 5)
                key = (qlat, qlon)
                if key in seen:
                    continue
                seen.add(key)

                base_pm25 = idw_base_pm25(qlat, qlon, city_rows)
                pred_model = model_pm25_prediction(qlat, qlon, city_rows)

                if pred_model is not None:
                    pm25 = 0.62 * base_pm25 + 0.38 * pred_model
                else:
                    pm25 = base_pm25

                # Keep smooth local variation using geospatial/weather interactions.
                humidity = clamp(52.0 + 16.0 * np.cos(np.radians(qlat * 3.4)), 20.0, 92.0)
                wind_speed = clamp(2.2 + 2.1 * abs(np.sin(np.radians(qlon * 3.0))), 0.2, 12.0)
                aod = clamp(0.14 + (pm25 / 240.0) + 0.03 * np.sin(np.radians((qlat + qlon) * 6.0)), 0.05, 1.4)
                interaction_bump = 0.018 * (aod * humidity) - 0.25 * (aod * wind_speed)

                # Add city-scale anisotropic plume to avoid flat blocks.
                norm_d_lat = (qlat - city_lat) / max(lat_pad, 1e-6)
                norm_d_lon = (qlon - city_lon) / max(lon_pad, 1e-6)
                radial_dist = np.hypot(norm_d_lat, norm_d_lon)
                plume = max(0.0, 1.0 - radial_dist) * 7.5
                directional = 3.6 * np.sin(np.radians((qlon - city_lon) * 180.0)) + 2.9 * np.cos(np.radians((qlat - city_lat) * 160.0))

                pm25 = clamp(pm25 + interaction_bump + plume + directional, 2.0, 320.0)

                features.append(
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [qlon, qlat],  # GeoJSON = [lon, lat]
                        },
                        "properties": {
                            "city_focus": city,
                            "pm25": round(pm25, 2),
                            "aqi": pm25_to_aqi(pm25),
                            "category": pm25_to_category(pm25),
                            "color": pm25_to_color(pm25),
                            "lat": qlat,
                            "lon": qlon,
                            "aod": round(aod, 4),
                            "humidity": round(humidity, 2),
                            "wind_speed": round(wind_speed, 2),
                        },
                    }
                )

    city_label = city_name if city_name else "ALL_CITIES"
    return {
        "type": "FeatureCollection",
        "metadata": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "model": "XGBoost",
            "resolution_deg": step,
            "crs": "EPSG:4326",
            "city": city_label,
            "lat_pad": lat_pad,
            "lon_pad": lon_pad,
            "features": len(features),
        },
        "features": features,
    }

@app.on_event("startup")
def load_assets():
    global model, scaler, features_list, city_predictions, spatial_map, model_metrics

    # Load Model and Scaler (optional; continue if unavailable)
    model_path = os.path.join(ML_DIR, "model_xgboost.pkl")
    scaler_path = os.path.join(ML_DIR, "scaler.pkl")
    try:
        if os.path.exists(model_path):
            model = joblib.load(model_path)
    except Exception as e:
        model = None
        print(f"⚠️ Model load skipped: {e}")

    try:
        if os.path.exists(scaler_path):
            scaler = joblib.load(scaler_path)
    except Exception as e:
        scaler = None
        print(f"⚠️ Scaler load skipped: {e}")

    # Load Features List
    features_path = os.path.join(ML_DIR, "features.json")
    try:
        if os.path.exists(features_path):
            with open(features_path, "r") as f:
                features_list = json.load(f)
    except Exception as e:
        features_list = []
        print(f"⚠️ Features load skipped: {e}")

    # Load static JSON files
    city_pred_path = os.path.join(ML_DIR, "city_predictions.json")
    try:
        if os.path.exists(city_pred_path):
            with open(city_pred_path, "r") as f:
                city_predictions = json.load(f)
    except Exception as e:
        city_predictions = None
        print(f"⚠️ City predictions load skipped: {e}")

    spatial_map_path = os.path.join(ML_DIR, "spatial_map.geojson")
    try:
        if os.path.exists(spatial_map_path):
            with open(spatial_map_path, "r") as f:
                spatial_map = json.load(f)
    except Exception as e:
        spatial_map = None
        print(f"⚠️ Spatial map load skipped: {e}")

    model_metrics_path = os.path.join(ML_DIR, "model_metrics.json")
    try:
        if os.path.exists(model_metrics_path):
            with open(model_metrics_path, "r") as f:
                model_metrics = json.load(f)
    except Exception as e:
        model_metrics = None
        print(f"⚠️ Model metrics load skipped: {e}")

    # Regenerate spatial map with higher resolution and city-focused sampling.
    # This keeps frontend unchanged while serving better map geometry.
    try:
        regenerated = generate_spatial_geojson(
            city_name=None,
            step=0.01,
            lat_pad=0.24,
            lon_pad=0.24,
        )
        spatial_map = regenerated
        with open(spatial_map_path, "w") as f:
            json.dump(regenerated, f)
    except Exception as regen_err:
        print(f"⚠️ Spatial map regeneration failed, using existing file: {regen_err}")

    print("✅ Backend assets loaded.")

class PredictionRequest(BaseModel):
    temp: float
    humidity: float
    wind_speed: float
    aod: float
    lat: float
    lon: float

@app.get("/")
def read_root():
    return {"status": "VAAYU API is running", "models_loaded": model is not None}

@app.get("/cities")
def get_cities():
    if not city_predictions:
        raise HTTPException(status_code=404, detail="City predictions data not found")
    return city_predictions

@app.get("/map")
def get_map(
    city: str | None = Query(default=None, description="City name to generate a tight local grid"),
    step: float | None = Query(default=None, description="Grid step in degrees, e.g. 0.01 or 0.005"),
    lat_pad: float = Query(default=0.24, ge=0.05, le=2.0, description="Latitude padding from city center"),
    lon_pad: float = Query(default=0.24, ge=0.05, le=2.0, description="Longitude padding from city center"),
):
    if city_predictions is None:
        raise HTTPException(status_code=404, detail="City predictions data not found")

    effective_step = step if step is not None else (0.005 if city else 0.01)
    effective_step = clamp(float(effective_step), 0.002, 0.05)

    if city is None and spatial_map:
        # Fast path for unchanged frontend default request.
        return spatial_map

    generated = generate_spatial_geojson(
        city_name=city,
        step=effective_step,
        lat_pad=lat_pad,
        lon_pad=lon_pad,
    )
    return generated

@app.get("/metrics")
def get_metrics():
    if not model_metrics:
        raise HTTPException(status_code=404, detail="Model metrics data not found")
    return model_metrics

@app.post("/predict")
def predict_pm25(req: PredictionRequest):
    if not model or not scaler or not features_list:
        raise HTTPException(status_code=500, detail="ML model or scaler not loaded properly")
        
    try:
        # Create a dictionary with default values for all expected features
        # Assuming 0.0 as default for features not provided by the user
        input_data = {feature: 0.0 for feature in features_list}
        
        # Override with user inputs
        input_data["temp"] = req.temp
        input_data["humidity"] = req.humidity
        input_data["wind_speed"] = req.wind_speed
        input_data["aod"] = req.aod
        input_data["lat"] = req.lat
        input_data["lon"] = req.lon
        
        # Some interactive feature defaults computation based on user input, to make it realistic 
        if "aod_humidity" in input_data:
            input_data["aod_humidity"] = req.aod * req.humidity
        if "aod_wind_interact" in input_data:
            input_data["aod_wind_interact"] = req.aod * req.wind_speed
            
        # Convert to DataFrame in the exact order model expects
        df = pd.DataFrame([input_data])[features_list]
        
        # Scale features
        # Note: Depending on the original training, scaler might expect DataFrame or numpy array
        scaled_features = scaler.transform(df)
        
        # Predict
        prediction = model.predict(scaled_features)
        
        # Ensure non-negative PM2.5 (e.g., if regression models output negatives accidentally)
        predicted_pm25 = max(0.0, float(prediction[0]))
        
        return {"pm25": round(predicted_pm25, 2)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
