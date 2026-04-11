import json
import os
import joblib
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
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

@app.on_event("startup")
def load_assets():
    global model, scaler, features_list, city_predictions, spatial_map, model_metrics
    
    try:
        # Load Model and Scaler
        model_path = os.path.join(ML_DIR, "model_xgboost.pkl")
        scaler_path = os.path.join(ML_DIR, "scaler.pkl")
        
        if os.path.exists(model_path):
            model = joblib.load(model_path)
        if os.path.exists(scaler_path):
            scaler = joblib.load(scaler_path)
            
        # Load Features List
        features_path = os.path.join(ML_DIR, "features.json")
        if os.path.exists(features_path):
            with open(features_path, "r") as f:
                features_list = json.load(f)
                
        # Load static JSON files
        city_pred_path = os.path.join(ML_DIR, "city_predictions.json")
        if os.path.exists(city_pred_path):
            with open(city_pred_path, "r") as f:
                city_predictions = json.load(f)
                
        spatial_map_path = os.path.join(ML_DIR, "spatial_map.geojson")
        if os.path.exists(spatial_map_path):
            with open(spatial_map_path, "r") as f:
                spatial_map = json.load(f)
                
        model_metrics_path = os.path.join(ML_DIR, "model_metrics.json")
        if os.path.exists(model_metrics_path):
            with open(model_metrics_path, "r") as f:
                model_metrics = json.load(f)
                
        print("✅ All ML assets loaded successfully.")
    except Exception as e:
        print(f"⚠️ Error loading ML assets: {e}")

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
def get_map():
    if not spatial_map:
        raise HTTPException(status_code=404, detail="Spatial map data not found")
    return spatial_map

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
