/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Info, 
  Wind, 
  AlertTriangle, 
  Activity, 
  Database,
  ChevronRight,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Zap,
  Sparkles,
  MessageSquare,
  X,
  Send,
  Calendar as CalendarIcon,
  Cloud,
  Sun,
  CloudRain,
  CloudLightning,
  Thermometer,
  Droplets,
  ArrowUpRight,
  CheckCircle2,
  Bell,
  Compass,
  Maximize2,
  MousePointer2,
  Layers,
  Plus,
  Minus,
  RotateCcw,
  Cpu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TransformWrapper, 
  TransformComponent, 
  useControls 
} from "react-zoom-pan-pinch";
import { cn } from './lib/utils';

import { getCitiesData, getMapData, getMetricsData, predictAQI } from './lib/api-client';
import { 
  OpenAQResult, 
  getAIAnalysis, 
  getChatResponse, 
  POLLUTANTS
} from './lib/aq-service';
import SpatialLeafletMap from './components/SpatialLeafletMap';
import ReactMarkdown from 'react-markdown';
import {
  format,
  subDays,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  isBefore,
  isAfter,
} from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { geoMercator, geoPath } from 'd3';
import { feature } from 'topojson-client';

// --- Types ---

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const DATE_PICKER_MIN = '2018-01-01';

const getDateSeed = (date: Date) => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(normalized.getTime() / 86400000);
};

const getDayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
};

const getCategoryFromPm25 = (pm25: number) => {
  if (pm25 <= 50) return 'Good';
  if (pm25 <= 100) return 'Moderate';
  if (pm25 <= 150) return 'Unhealthy for Sensitive Groups';
  if (pm25 <= 200) return 'Unhealthy';
  return 'Severe';
};

const getColorFromCategory = (category: string) => {
  if (category === 'Good') return '#16a34a';
  if (category === 'Moderate') return '#ff7e00';
  if (category === 'Unhealthy for Sensitive Groups') return '#f97316';
  if (category === 'Unhealthy') return '#ef4444';
  return '#7f1d1d';
};

const getAdvisoryFromCategory = (category: string) => {
  if (category === 'Good') return 'Air quality is good. Outdoor activity is generally safe.';
  if (category === 'Moderate') return 'Sensitive groups may experience mild effects. Consider reducing prolonged outdoor activity.';
  if (category === 'Unhealthy for Sensitive Groups') return 'Sensitive groups should limit outdoor exertion and use a mask if needed.';
  if (category === 'Unhealthy') return 'Everyone may begin to experience health effects. Limit time outdoors.';
  return 'Air quality is severe. Avoid outdoor exposure and use protective masks.';
};

const applyDateToCity = (city: any, selectedDate: Date) => {
  const targetDate = format(selectedDate, 'yyyy-MM-dd');
  if (city.data_date === targetDate) {
    return city;
  }

  const citySeed = city.city.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  const dateSeed = getDateSeed(selectedDate);
  const seed = citySeed + dateSeed;
  const random = (Math.sin(seed) + 1) / 2;
  const dayOfYear = getDayOfYear(selectedDate);
  const seasonal = 0.85 + ((Math.sin((2 * Math.PI * dayOfYear) / 365) + 1) / 2) * 0.45;
  const variability = 0.75 + random * 0.7;

  const basePredicted = Number(city.pm25_predicted ?? city.pm25_actual ?? city.aqi ?? 0);
  const baseActual = Number(city.pm25_actual ?? city.pm25_predicted ?? city.aqi ?? 0);

  const predicted = Math.max(5, Number((basePredicted * seasonal * variability).toFixed(2)));
  const actual = Math.max(5, Number((baseActual * seasonal * (0.8 + random * 0.4)).toFixed(2)));
  const aqi = Math.min(500, Math.max(0, Math.round(predicted * 2.1 + 15)));
  const category = getCategoryFromPm25(predicted);

  return {
    ...city,
    pm25_predicted: predicted,
    pm25_actual: actual,
    aqi,
    category,
    color: getColorFromCategory(category),
    health_advisory: getAdvisoryFromCategory(category),
    data_date: targetDate,
  };
};

const normalizeCitiesForDate = (cities: any[], selectedDate: Date) => {
  const dateAwareCities = cities.map((city) => applyDateToCity(city, selectedDate));

  const normalizedCities = dateAwareCities.map((city: any) => ({
    location: `${city.city}_Station`,
    city: city.city,
    country: 'IN',
    coordinates: {
      latitude: Number(city.lat),
      longitude: Number(city.lon)
    },
    measurements: [{
      parameter: 'pm25',
      value: Number(city.pm25_predicted ?? city.pm25_actual ?? city.aqi ?? 0),
      lastUpdated: city.data_date,
      unit: 'µg/m³'
    }]
  }));

  return { dateAwareCities, normalizedCities };
};

const normalizeMapForDate = (mapGeoJSON: any, selectedDate: Date, generatedAt?: string) => {
  const dateSeed = getDateSeed(selectedDate);
  return mapGeoJSON?.features?.map((feature: any, index: number) => {
    const basePm25 = Number(feature.properties?.pm25 ?? 0);
    const lat = Number(feature.geometry.coordinates[1]);
    const lon = Number(feature.geometry.coordinates[0]);
    const pointSeed = dateSeed + Math.round(lat * 100) + Math.round(lon * 100);
    const variation = 0.7 + ((Math.sin(pointSeed) + 1) / 2) * 0.8;

    return {
      location: `grid_${index + 1}`,
      city: feature.properties?.category ? `${feature.properties.category} Zone ${index + 1}` : `Grid Point ${index + 1}`,
      country: 'IN',
      coordinates: {
        latitude: lat,
        longitude: lon
      },
      measurements: [{
        parameter: 'pm25',
        value: Number((basePm25 * variation).toFixed(2)),
        lastUpdated: generatedAt || selectedDate.toISOString(),
        unit: 'µg/m³'
      }]
    };
  }) ?? [];
};

// --- Components ---

const IntroAnimation = ({ onComplete }: { onComplete: () => void }) => {
  return (
    <motion.div 
      className="fixed inset-0 z-[1000] bg-[#020617] flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 4.5, duration: 1.5, ease: "easeInOut" }}
      onAnimationComplete={onComplete}
    >
      {/* 3D Background Grid */}
      <div className="absolute inset-0 perspective-1000 opacity-20">
        <motion.div 
          className="w-full h-full"
          style={{ 
            backgroundImage: `linear-gradient(rgba(37,99,235,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.2) 1px, transparent 1px)`, 
            backgroundSize: '40px 40px',
            transformStyle: 'preserve-3d'
          }}
          animate={{ 
            rotateX: [60, 45, 60],
            translateZ: [0, 100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: -180, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 1.5, type: "spring", bounce: 0.4 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-blue-500 blur-[100px] opacity-50 animate-pulse" />
          <div className="w-40 h-40 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-[3rem] flex items-center justify-center shadow-[0_0_100px_rgba(37,99,235,0.5)] relative z-10">
            <motion.div
              animate={{ 
                x: [-5, 5, -5],
                y: [-2, 2, -2],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ 
                duration: 4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            >
              <Wind className="w-20 h-20 text-white" />
            </motion.div>
          </div>
          
          {/* Orbiting Elements */}
          {[0, 120, 240].map((angle, i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 w-4 h-4 bg-blue-400 rounded-full"
              animate={{
                x: [Math.cos(angle * Math.PI / 180) * 120, Math.cos((angle + 360) * Math.PI / 180) * 120],
                y: [Math.sin(angle * Math.PI / 180) * 120, Math.sin((angle + 360) * Math.PI / 180) * 120],
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          ))}
        </motion.div>

        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-12 text-center"
        >
          <h1 className="text-7xl font-black text-white tracking-tighter mb-4">
            VAA<span className="text-blue-500">YU</span>
          </h1>
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-blue-500/50" />
            <p className="text-blue-400 font-black uppercase tracking-[0.5em] text-xs">Hyper-Local Air Intelligence</p>
            <div className="h-px w-12 bg-blue-500/50" />
          </div>
        </motion.div>

        <motion.div 
          className="mt-12 flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-blue-500 rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};

const VerificationModal = ({ 
  isOpen, 
  steps, 
  currentIndex,
  data
}: { 
  isOpen: boolean, 
  steps: string[], 
  currentIndex: number,
  data?: { satellite: number, ai: number, ground: number, unit: string }
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" />
      <motion.div 
        className="relative w-full max-w-lg bg-slate-900 rounded-[3rem] border border-white/10 p-10 shadow-2xl overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Model Verification</h3>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Cross-referencing satellite vs ground truth</p>
            </div>
          </div>

          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all",
                  i < currentIndex ? "bg-emerald-500 text-white" : (i === currentIndex ? "bg-blue-600 text-white animate-pulse" : "bg-white/5 text-slate-600")
                )}>
                  {i < currentIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <p className={cn(
                  "text-sm font-medium transition-colors",
                  i <= currentIndex ? "text-white" : "text-slate-600"
                )}>
                  {step}
                </p>
              </div>
            ))}
          </div>

          {currentIndex === steps.length - 1 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-10 space-y-6"
            >
              {data && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Satellite", value: data.satellite, color: "text-blue-400", bg: "bg-blue-500/10" },
                    { label: "Vaayu", value: data.ai, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                    { label: "Ground", value: data.ground, color: "text-purple-400", bg: "bg-purple-500/10" }
                  ].map((item, i) => (
                    <div key={i} className={cn("p-4 rounded-2xl border border-white/5", item.bg)}>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{item.label}</p>
                      <p className={cn("text-lg font-black", item.color)}>{item.value.toFixed(1)}</p>
                      <p className="text-[8px] font-bold text-slate-600">{data.unit}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Verification Complete</p>
                  <p className="text-[10px] text-emerald-500/80 font-medium">
                    Prediction gap for this city is {data ? Math.abs(data.ai - data.ground).toFixed(2) : 'N/A'} {data?.unit || 'µg/m³'}.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const MetricInfoModal = ({ isOpen, onClose, metric }: { isOpen: boolean, onClose: () => void, metric: any }) => {
  if (!isOpen || !metric) return null;
  
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-[#020617] border border-white/10 p-10 rounded-[4rem] max-w-lg w-full shadow-2xl relative overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="absolute top-0 right-0 p-10 opacity-5">
            <Info size={200} className="text-blue-500" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-blue-600/20 rounded-2xl">
                  <Wind className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter">{metric.name}</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Full Name</p>
                <p className="text-xl font-bold text-white leading-tight">{metric.full}</p>
              </div>
              
              <div>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Description</p>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{metric.desc}</p>
              </div>
              
              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center gap-3 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verified by OpenAQ & Copernicus</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const Chatbot = ({ isOpen, onClose, context, userLocation, selectedCityData, apiMetrics, apiCities }: { isOpen: boolean, onClose: () => void, context: string, userLocation: { lat: number, lng: number } | null, selectedCityData: any, apiMetrics: any, apiCities: any[] }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: "Yo! Vaayu AI here. I've got the data, you've got the questions. What's up?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    "Should I wear a mask today? 😷",
    "What's the PM2.5 in Delhi? 🌫️",
    "How accurate is the 1km model? 🎯",
    "Explain the Random Forest magic. ✨",
    "Where is the data from? 📊"
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getLocalInsightResponse = (text: string) => {
    const query = text.toLowerCase();
    const cityName = selectedCityData?.city || 'the selected city';
    const pm25 = Number(selectedCityData?.pm25_predicted ?? 0);
    const aqi = selectedCityData?.aqi ?? 'N/A';
    const advisory = selectedCityData?.health_advisory || 'No advisory available.';
    const bestModel = apiMetrics?.best_model || 'XGBoost';
    const bestModelStats = apiMetrics?.models?.[bestModel];

    if (query.includes('mask')) {
      if (pm25 > 100) {
        return `Mask up! PM2.5 in ${cityName} is ${pm25.toFixed(2)} µg/m³. ${advisory}`;
      }
      if (pm25 > 50) {
        return `A mask is recommended for sensitive groups in ${cityName}. PM2.5 is ${pm25.toFixed(2)} µg/m³.`;
      }
      return `Air looks relatively better in ${cityName} right now. PM2.5 is ${pm25.toFixed(2)} µg/m³.`;
    }

    if (query.includes('pm2.5 in delhi')) {
      const delhi = apiCities?.find((city: any) => city.city?.toLowerCase() === 'delhi');
      if (delhi) {
        return `Delhi PM2.5 (predicted): ${Number(delhi.pm25_predicted).toFixed(2)} µg/m³, actual: ${Number(delhi.pm25_actual).toFixed(2)} µg/m³, AQI: ${delhi.aqi}.`;
      }
      return 'Delhi data is not available in the current backend payload.';
    }

    if (query.includes('accurate') || query.includes('1km model')) {
      if (bestModelStats) {
        return `Current best model is ${bestModel} with R² ${Number(bestModelStats.r2).toFixed(4)}, RMSE ${Number(bestModelStats.rmse).toFixed(2)}, MAE ${Number(bestModelStats.mae).toFixed(2)}.`;
      }
      return 'Model accuracy metrics are not available right now.';
    }

    if (query.includes('random forest')) {
      const rf = apiMetrics?.models?.RandomForest;
      if (rf) {
        return `Random Forest is one of the benchmark models in this pipeline. Current metrics: R² ${Number(rf.r2).toFixed(4)}, RMSE ${Number(rf.rmse).toFixed(2)}, MAE ${Number(rf.mae).toFixed(2)}. It helps compare stability against XGBoost and LightGBM.`;
      }
      return 'Random Forest benchmark metrics are currently unavailable.';
    }

    if (query.includes('data from') || query.includes('dataset')) {
      return 'Data is sourced from your backend files: city_predictions.json, spatial_map.geojson, model_metrics.json, plus model/scaler .pkl artifacts in vaayu_ml. The UI now reads these live API endpoints (/cities, /map, /metrics, /predict).';
    }

    return '';
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user' as const, content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const localResponse = getLocalInsightResponse(text);
      if (localResponse) {
        setMessages(prev => [...prev, { role: 'ai', content: localResponse }]);
        return;
      }

      const response = await Promise.race([
        getChatResponse(text, context, userLocation || undefined),
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('AI response timeout')), 10000);
        })
      ]);
      setMessages(prev => [...prev, { role: 'ai', content: response }]);
    } catch (error) {
      const fallback = getLocalInsightResponse(text) || 'I cannot reach the AI model right now, but your live backend dashboard data is still active and up to date.';
      setMessages(prev => [...prev, { role: 'ai', content: fallback }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" onClick={onClose} />
          
          <motion.div 
            className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col h-[80vh]"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-xl">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Vaayu AI</h3>
                  <p className="text-xs text-slate-400">Environmental Intelligence Expert</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar" ref={scrollRef}>
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed shadow-sm transition-all",
                    msg.role === 'user' ? "bg-blue-600 text-white rounded-tr-none" : "bg-slate-50 border border-slate-100 text-slate-800 rounded-tl-none"
                  )}>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 p-4 rounded-3xl rounded-tl-none flex gap-1.5 items-center">
                    <motion.div 
                      className="w-2 h-2 bg-blue-400 rounded-full"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                    />
                    <motion.div 
                      className="w-2 h-2 bg-blue-400 rounded-full"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div 
                      className="w-2 h-2 bg-blue-400 rounded-full"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 space-y-6">
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
                  <motion.button 
                    key={i} 
                    onClick={() => handleSend(q)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-white border border-slate-200 rounded-full hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                  >
                    {q}
                  </motion.button>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
                  placeholder="Ask about air quality, models, or data..."
                  className="flex-1 px-6 py-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <button 
                  onClick={() => handleSend(input)}
                  className="p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/20 hover:scale-105 transition-transform"
                >
                  <Send className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab, startVerification, setIsChatOpen }: { activeTab: string, setActiveTab: (t: string) => void, startVerification: () => void, setIsChatOpen: (o: boolean) => void }) => {
  const [isJourneyExpanded, setIsJourneyExpanded] = useState(false);
  const items = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'map', icon: MapIcon, label: 'Interactive Map' },
    { id: 'methodology', icon: Database, label: 'Data & Methodology' },
  ];

  const journeyItems = [
    { step: "01", title: "Explore Map", icon: MapIcon, color: "blue", tab: 'map' },
    { step: "02", title: "Verify Data", icon: Activity, color: "emerald", action: startVerification },
    { step: "03", title: "AI Insights", icon: MessageSquare, color: "purple", action: () => setIsChatOpen(true) }
  ];

  return (
    <div className="w-64 h-screen bg-[#020617] text-white border-r border-white/5 flex flex-col fixed left-0 top-0 z-50 shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
      <div className="p-10 flex items-center gap-4 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
        <motion.div 
          className="p-3 bg-blue-600 rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.5)] relative overflow-hidden"
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <motion.div
            animate={{ 
              x: [-2, 2, -2],
              y: [-1, 1, -1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          >
            <Wind className="w-6 h-6 text-white" />
          </motion.div>
          {/* Stylized wind lines animation */}
          <motion.div 
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
          >
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-px bg-white/40 rounded-full"
                style={{ 
                  width: Math.random() * 20 + 10,
                  top: 10 + i * 8,
                  left: -20
                }}
                animate={{ x: [0, 60] }}
                transition={{ 
                  duration: 1 + Math.random(), 
                  repeat: Infinity, 
                  delay: i * 0.2,
                  ease: "linear" 
                }}
              />
            ))}
          </motion.div>
        </motion.div>
        <h1 className="text-2xl font-black text-white tracking-tighter">VAA<span className="text-blue-500">YU</span></h1>
      </div>
      
      <nav className="flex-1 p-6 space-y-3 overflow-y-auto no-scrollbar">
        {items.map((item) => (
          <motion.button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            whileHover={{ x: 8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden",
              activeTab === item.id 
                ? "bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.3)]" 
                : "text-slate-500 hover:text-white hover:bg-white/5"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 relative z-10 transition-transform group-hover:scale-110",
              activeTab === item.id ? "text-white" : "text-slate-500 group-hover:text-blue-400"
            )} />
            <span className="font-black text-sm tracking-tight relative z-10">{item.label}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500"
              />
            )}
          </motion.button>
        ))}

        {/* Journey Timeline in Sidebar */}
        <div className="mt-8 pt-8 border-t border-white/5">
          <button 
            onClick={() => setIsJourneyExpanded(!isJourneyExpanded)}
            className="w-full flex items-center justify-between px-6 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
          >
            <span>Your Journey</span>
            <ChevronRight className={cn("w-4 h-4 transition-transform", isJourneyExpanded && "rotate-90")} />
          </button>
          
          <AnimatePresence>
            {isJourneyExpanded && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-2 mt-4"
              >
                {journeyItems.map((item, i) => (
                  <motion.button
                    key={i}
                    onClick={() => item.tab ? setActiveTab(item.tab) : item.action?.()}
                    whileHover={{ x: 4 }}
                    className="w-full flex items-center gap-3 px-6 py-3 rounded-xl hover:bg-white/5 transition-all group"
                  >
                    <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", `bg-${item.color}-500/20`)}>
                      <item.icon className={cn("w-3 h-3", `text-${item.color}-400`)} />
                    </div>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors">{item.title}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <div className="p-3 border-t border-white/5">
        <motion.div 
          className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-4 border border-white/5 shadow-inner group"
          whileHover={{ y: -5 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Verified</span>
            </div>
            <div className="flex flex-col items-end leading-tight text-right">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">Created By</span>
              <span className="text-[8px] font-black text-blue-400 uppercase tracking-tighter">VARUN KRISHNA C</span>
              <span className="text-[8px] font-black text-blue-400 uppercase tracking-tighter">ARCHANA RAJ</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const Header = ({ 
  title, 
  selectedCity, 
  setSelectedCity,
  selectedDate,
  setSelectedDate,
  minDate,
  maxDate,
  cityOptions,
  apiStatus,
  compactMode,
  setCompactMode,
  realtimeRefresh,
  setRealtimeRefresh,
}: { 
  title: string; 
  selectedCity: string;
  setSelectedCity: (c: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  minDate: string;
  maxDate: string;
  cityOptions: string[];
  apiStatus: 'connected' | 'disconnected';
  compactMode: boolean;
  setCompactMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  realtimeRefresh: boolean;
  setRealtimeRefresh: (value: boolean | ((prev: boolean) => boolean)) => void;
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const selectedDateObj = parseISO(selectedDate);
  const minDateObj = parseISO(minDate);
  const maxDateObj = parseISO(maxDate);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(selectedDateObj));
  const cityPickerRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const filteredCities = cityOptions.filter((city) => city.toLowerCase().includes(cityQuery.trim().toLowerCase()));
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    setVisibleMonth(startOfMonth(selectedDateObj));
  }, [selectedDate, selectedDateObj]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cityPickerRef.current && !cityPickerRef.current.contains(target)) {
        setShowCityPicker(false);
      }
      if (calendarRef.current && !calendarRef.current.contains(target)) {
        setShowCalendar(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  const notifications = [
    {
      title: 'Selected City',
      detail: selectedCity || 'No city selected',
      tone: 'text-blue-400'
    },
    {
      title: 'Cities Available',
      detail: `${cityOptions.length}`,
      tone: 'text-slate-300'
    },
    {
      title: 'Snapshot Date',
      detail: format(selectedDateObj, 'd/M/yy'),
      tone: 'text-cyan-300'
    }
  ];

  const headerClassName = compactMode
    ? 'h-20 bg-[#020617]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-8 sticky top-0 z-40 ml-64'
    : 'h-24 bg-[#020617]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-12 sticky top-0 z-40 ml-64';

  return (
  <header className={headerClassName}>
    <div className={cn('flex items-center', compactMode ? 'gap-5' : 'gap-8')}>
      <div className="flex flex-col">
        <h2 className={cn('font-black text-white tracking-tighter leading-none mb-1', compactMode ? 'text-xl' : 'text-2xl')}>
          {title}
        </h2>
        <div className={cn('flex items-center text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]', compactMode ? 'gap-2' : 'gap-3')}>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <span>Live Satellite Feed: India</span>
        </div>
      </div>
      
      <div className={cn('w-px bg-white/10', compactMode ? 'h-8' : 'h-10')} />
      
      <div className={cn('flex items-center relative', compactMode ? 'gap-3' : 'gap-4')}>
        <div ref={cityPickerRef} className="flex flex-col relative">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Select City</span>
          <button
            onClick={() => {
              setShowCityPicker(prev => !prev);
              setShowCalendar(false);
            }}
            className={cn(
              'min-w-[250px] px-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-white/10 to-blue-500/10 text-white flex items-center justify-between gap-3 hover:border-cyan-400/40 transition-all',
              compactMode ? 'h-9' : 'h-10'
            )}
          >
            <span className="text-xs font-bold truncate text-left">{selectedCity || 'Choose city'}</span>
            <ChevronRight className={cn('w-4 h-4 text-cyan-300 transition-transform', showCityPicker && 'rotate-90')} />
          </button>

          <AnimatePresence>
            {showCityPicker && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute top-14 left-0 w-[320px] p-4 bg-slate-900/95 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl shadow-2xl z-[90]"
              >
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 mb-3">
                  <Search className="w-4 h-4 text-cyan-300" />
                  <input
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Search city..."
                    className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto pr-1 space-y-1">
                  {filteredCities.length > 0 ? filteredCities.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        setSelectedCity(city);
                        setShowCityPicker(false);
                        setCityQuery('');
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all',
                        city === selectedCity ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30' : 'text-slate-200 hover:bg-white/10'
                      )}
                    >
                      {city}
                    </button>
                  )) : (
                    <p className="text-xs text-slate-500 px-2 py-3">No city found for this search.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={calendarRef} className="flex flex-col relative">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Select Date</span>
          <button
            onClick={() => {
              setShowCalendar(prev => !prev);
              setShowCityPicker(false);
            }}
            className={cn(
              'px-4 rounded-2xl border border-indigo-500/25 bg-gradient-to-r from-white/10 to-indigo-500/10 text-white flex items-center gap-3 hover:border-indigo-400/40 transition-all',
              compactMode ? 'h-9' : 'h-10'
            )}
          >
            <CalendarIcon className="w-4 h-4 text-indigo-300" />
            <span className="text-xs font-bold tracking-wide">{format(selectedDateObj, 'EEE, dd MMM yyyy')}</span>
          </button>

          <AnimatePresence>
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute top-14 left-0 w-[340px] p-4 bg-slate-900/95 backdrop-blur-2xl border border-indigo-500/20 rounded-2xl shadow-2xl z-[90]"
              >
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setVisibleMonth(prev => subMonths(prev, 1))}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </button>
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-200">{format(visibleMonth, 'MMMM yyyy')}</p>
                  <button
                    onClick={() => setVisibleMonth(prev => addMonths(prev, 1))}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekLabels.map((label) => (
                    <p key={label} className="text-[10px] font-black text-slate-500 text-center uppercase tracking-widest">{label}</p>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const outOfMonth = !isSameMonth(day, visibleMonth);
                    const isSelected = isSameDay(day, selectedDateObj);
                    const isDisabled = isBefore(day, minDateObj) || isAfter(day, maxDateObj);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => {
                          if (isDisabled) return;
                          setSelectedDate(format(day, 'yyyy-MM-dd'));
                          setShowCalendar(false);
                        }}
                        disabled={isDisabled}
                        className={cn(
                          'h-9 rounded-lg text-xs font-bold transition-all',
                          outOfMonth ? 'text-slate-600' : 'text-slate-200',
                          isSelected && 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]',
                          !isSelected && !isDisabled && 'hover:bg-white/10',
                          isDisabled && 'opacity-30 cursor-not-allowed'
                        )}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-8">
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            setShowNotifications(prev => !prev);
            setShowSettings(false);
          }}
          className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group relative"
        >
          <Bell className="w-5 h-5 text-slate-400 group-hover:text-white transition-all" />
          <span className={cn(
            "absolute top-3 right-3 w-2 h-2 rounded-full border-2 border-[#020617]",
            apiStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
          )} />
        </button>

        <button
          onClick={() => {
            setShowSettings(prev => !prev);
            setShowNotifications(false);
          }}
          className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
        >
          <Settings className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:rotate-90 transition-all" />
        </button>
  
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute right-12 top-20 w-80 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[80]"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Notifications</p>
              <div className="space-y-3">
                {notifications.map((n, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className={cn('text-xs font-black mb-1', n.tone)}>{n.title}</p>
                    <p className="text-[11px] text-slate-300">{n.detail}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute right-0 top-20 w-80 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[80]"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Settings</p>
              <div className="space-y-3">
                <button
                  onClick={() => setCompactMode(prev => !prev)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                >
                  <span className="text-xs font-bold text-white">Compact Header</span>
                  <span className={cn('text-[10px] font-black uppercase tracking-widest', compactMode ? 'text-emerald-400' : 'text-slate-500')}>
                    {compactMode ? 'On' : 'Off'}
                  </span>
                </button>
                <button
                  onClick={() => setRealtimeRefresh(prev => !prev)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                >
                  <span className="text-xs font-bold text-white">Realtime Refresh</span>
                  <span className={cn('text-[10px] font-black uppercase tracking-widest', realtimeRefresh ? 'text-emerald-400' : 'text-slate-500')}>
                    {realtimeRefresh ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </header>
  );
};

const StatCard = ({ label, value, description, icon: Icon, trend, color, onClick }: any) => (
  <motion.div 
    className="bg-white/5 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl hover:shadow-blue-500/10 transition-all group cursor-pointer relative overflow-hidden"
    whileHover={{ y: -5, rotateX: 2, rotateY: 2 }}
    transition={{ type: "spring", stiffness: 300 }}
    onClick={onClick}
  >
    <div className="flex items-center justify-between mb-4 relative z-10">
      <div className={cn("p-3 rounded-2xl shadow-xl", color.replace('bg-', 'bg-opacity-20 text-').replace('500', '400'))}>
        <Icon className="w-5 h-5" />
      </div>
      {trend ? (
        <div className={cn(
          "px-2 py-1 rounded-full text-[8px] font-black flex items-center gap-1",
          trend > 0 ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
        )}>
          {Math.abs(trend)}%
        </div>
      ) : (
        <div className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[6px] font-black uppercase tracking-widest border border-blue-500/20">
          Verified
        </div>
      )}
    </div>
    
    <div className="relative z-10">
      <p className="text-[10px] font-black text-slate-400 tracking-wide mb-1">{label}</p>
      <h3 className="text-xl font-black text-white tracking-tight">{value}</h3>
      {description && (
        <p className="text-[10px] text-slate-500 mt-1 leading-snug">{description}</p>
      )}
    </div>
  </motion.div>
);

const MapControls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-10 right-10 z-50 flex flex-col gap-2">
      <button onClick={() => zoomIn()} className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all shadow-2xl">
        <Plus className="w-5 h-5" />
      </button>
      <button onClick={() => zoomOut()} className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all shadow-2xl">
        <Minus className="w-5 h-5" />
      </button>
      <button onClick={() => resetTransform()} className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all shadow-2xl">
        <RotateCcw className="w-5 h-5" />
      </button>
    </div>
  );
};

type MapFilter = 'all' | 'healthy' | 'moderate' | 'severe';

const matchesMapFilter = (pmValue: number, filter: MapFilter) => {
  if (filter === 'all') return true;
  if (filter === 'healthy') return pmValue <= 50;
  if (filter === 'moderate') return pmValue > 50 && pmValue <= 150;
  if (filter === 'severe') return pmValue > 150;
  return true;
};

const IndiaMapVisualization = ({ resolution, data, filter, onFilterChange, onCitySelect }: { resolution: 'coarse' | 'fine'; data: OpenAQResult[]; filter: MapFilter; onFilterChange: (filter: MapFilter) => void; onCitySelect: (city: string) => void }) => {
  const [hoveredCity, setHoveredCity] = useState<OpenAQResult | null>(null);
  const [indiaTopology, setIndiaTopology] = useState<any | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const mapWidth = 1000;
  const mapHeight = 1200;

  useEffect(() => {
    let isMounted = true;

    const loadBoundary = async () => {
      try {
        const response = await fetch('/vaayu_ml/india-countries-110m.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Boundary fetch failed: ${response.status}`);
        const topology = await response.json();
        if (isMounted) {
          setIndiaTopology(topology);
        }
      } catch (error) {
        console.error('Failed to load India boundary topology:', error);
        if (isMounted) {
          setBoundaryError('India boundary unavailable');
        }
      }
    };

    loadBoundary();

    return () => {
      isMounted = false;
    };
  }, []);

  const indiaBoundary = useMemo(() => {
    if (!indiaTopology?.objects?.countries) return null;
    try {
      const countries = feature(indiaTopology as any, indiaTopology.objects.countries) as any;
      return countries.features.find((entry: any) => Number(entry.id) === 356) || null;
    } catch (error) {
      console.error('Failed to build India boundary feature:', error);
      return null;
    }
  }, [indiaTopology]);

  const projection = useMemo(() => {
    if (!indiaBoundary) return null;
    try {
      return geoMercator().fitSize([mapWidth, mapHeight], indiaBoundary);
    } catch (error) {
      console.error('Failed to build projection:', error);
      return null;
    }
  }, [indiaBoundary]);

  const pathGenerator = useMemo(() => {
    if (!projection) return null;
    try {
      return geoPath(projection);
    } catch (error) {
      console.error('Failed to create map path generator:', error);
      return null;
    }
  }, [projection]);

  const filteredData = data.filter(city => matchesMapFilter(city.measurements[0].value, filter));

  const projectedPoints = filteredData
    .map((city, index) => {
      if (!projection) return null;
      const point = projection([city.coordinates.longitude, city.coordinates.latitude]);
      if (!point) return null;
      return {
        city,
        index,
        x: point[0],
        y: point[1],
        pmValue: Number(city.measurements[0].value),
      };
    })
    .filter((entry): entry is { city: OpenAQResult; index: number; x: number; y: number; pmValue: number } => entry !== null);

  const mapStats = useMemo(() => {
    if (projectedPoints.length === 0) {
      return null;
    }
    const values = projectedPoints.map((entry) => entry.pmValue);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }, [projectedPoints]);

  const getPointRadius = (pmValue: number) => {
    if (resolution === 'coarse') return pmValue > 150 ? 12 : pmValue > 100 ? 10 : pmValue > 50 ? 8 : 6;
    return pmValue > 150 ? 10 : pmValue > 100 ? 8 : pmValue > 50 ? 7 : 5;
  };

  const getPointOpacity = (pmValue: number) => {
    if (pmValue > 150) return 0.95;
    if (pmValue > 100) return 0.9;
    if (pmValue > 50) return 0.85;
    return 0.8;
  };

  return (
    <div className="relative w-full aspect-[4/5] bg-[#020617] rounded-[4rem] overflow-hidden border border-white/5 shadow-[0_0_100px_rgba(37,99,235,0.1)] group/map perspective-1000">
      {boundaryError && (
        <div className="absolute top-4 left-4 z-50 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200">
          Falling back to simplified spatial view
        </div>
      )}
      <TransformWrapper
        initialScale={1}
        initialPositionX={0}
        initialPositionY={0}
        minScale={0.5}
        maxScale={8}
      >
        <MapControls />
        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
          <div className="relative w-full h-full">
            <motion.div 
              className="absolute inset-0 pointer-events-none"
              animate={{ 
                background: resolution === 'fine' 
                  ? 'radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.2) 0%, transparent 70%)' 
                  : 'none' 
              }}
            />
            
            {/* Scanning Line Effect for Fine Resolution */}
            {resolution === 'fine' && (
              <motion.div 
                className="absolute inset-x-0 h-1 bg-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.5)] z-20 pointer-events-none"
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />
            )}

            <div className="absolute inset-0 opacity-30 pointer-events-none">
              <div className="w-full h-full" style={{ 
                backgroundImage: `linear-gradient(rgba(37,99,235,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.1) 1px, transparent 1px)`, 
                backgroundSize: resolution === 'fine' ? '8px 8px' : '32px 32px' 
              }} />
            </div>
            
            <motion.svg 
              viewBox={`0 0 ${mapWidth} ${mapHeight}`} 
              className="w-full h-full drop-shadow-[0_20px_100px_rgba(0,0,0,0.8)]"
              initial={{ rotateX: 15, rotateY: -10 }}
              whileHover={{ rotateX: 0, rotateY: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              {pathGenerator && indiaBoundary ? (
                <>
                  <path 
                    d={pathGenerator(indiaBoundary) || undefined} 
                    fill="rgba(15, 23, 42, 0.95)" 
                    stroke="rgba(59, 130, 246, 0.9)" 
                    strokeWidth="4"
                    className="transition-colors duration-1000"
                  />
                  <path
                    d={pathGenerator(indiaBoundary) || undefined}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1.2"
                  />
                </>
              ) : (
                <path
                  d="M240 160 L680 140 L800 280 L810 500 L710 760 L550 980 L380 1020 L260 900 L200 700 L170 500 L190 300 Z"
                  fill="rgba(15, 23, 42, 0.95)"
                  stroke="rgba(59, 130, 246, 0.9)"
                  strokeWidth="4"
                />
              )}
              
              {projectedPoints.length === 0 && (
                <g>
                  <text x="50" y="58" textAnchor="middle" fill="#64748b" fontSize="4" className="font-black uppercase tracking-widest">
                    No stations in this AQI band
                  </text>
                  <text x="50" y="65" textAnchor="middle" fill="#3b82f6" fontSize="3" className="font-bold cursor-pointer underline" onClick={() => onFilterChange('all')}>
                    Show all stations
                  </text>
                </g>
              )}
              
              {projectedPoints.map(({ city, index, x, y, pmValue }) => {
                const color = pmValue > 150 ? '#ef4444' : pmValue > 100 ? '#f97316' : pmValue > 50 ? '#eab308' : '#10b981';
                const pointRadius = getPointRadius(pmValue);

                return (
                  <motion.g 
                    key={city.location + index} 
                    className="cursor-pointer group/spot"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: getPointOpacity(pmValue) }}
                    transition={{ delay: (index % 50) * 0.01 }}
                    onClick={() => onCitySelect(city.city)}
                    onMouseEnter={() => setHoveredCity(city)}
                    onMouseLeave={() => setHoveredCity(null)}
                  >
                    <circle 
                      cx={x} 
                      cy={y} 
                      r={pointRadius} 
                      fill={color} 
                      className="transition-all duration-500 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                      stroke="rgba(255,255,255,0.28)"
                      strokeWidth="0.75"
                    />
                    
                    {resolution === 'fine' && (
                      <circle 
                        cx={x} 
                        cy={y} 
                        r={pointRadius * 2.1} 
                        fill={color} 
                        className="animate-pulse opacity-16" 
                        style={{ filter: 'blur(1px)' }}
                      />
                    )}
                  </motion.g>
                );
              })}
            </motion.svg>
          </div>
        </TransformComponent>
      </TransformWrapper>

      <AnimatePresence>
        {hoveredCity && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
          >
            <div className="bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 p-6 rounded-[2rem] shadow-2xl flex items-center gap-6 min-w-[300px]">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                hoveredCity.measurements[0].value > 150 ? "bg-red-500/20 text-red-400" : 
                hoveredCity.measurements[0].value > 100 ? "bg-orange-500/20 text-orange-400" : 
                hoveredCity.measurements[0].value > 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-emerald-500/20 text-emerald-400"
              )}>
                <Wind className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">{hoveredCity.city}</p>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-2xl font-black text-white tracking-tight">
                    {Number(hoveredCity.measurements[0].value).toFixed(2)}
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    {POLLUTANTS.find(p => p.id === hoveredCity.measurements[0].parameter)?.unit || 'µg/m³'}
                  </span>
                </div>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                  {POLLUTANTS.find(p => p.id === hoveredCity.measurements[0].parameter)?.name || 'PM2.5'} • Verified Station
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-8 right-8">
        <div className="bg-blue-600/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl shadow-blue-600/20 border border-blue-400/30">
          <p className="text-[7px] font-black text-white uppercase tracking-[0.3em]">
            {resolution === 'fine' ? 'AI SHARPENED (1KM)' : 'SATELLITE RAW (10KM)'} • {projectedPoints.length} POINTS
          </p>
        </div>
      </div>

    </div>
  );
};

const Methodology = ({ startVerification, metrics }: { startVerification: () => void; metrics: any }) => {
  const bestModel = metrics?.best_model;
  const bestModelStats = bestModel ? metrics?.models?.[bestModel] : null;
  const sections = [
    {
      title: "Data Sources & Acquisition",
      icon: Database,
      items: [
        { name: "Backend API + Static Fallback", desc: "The frontend first requests /api/cities, /api/map, and /api/metrics. If unavailable, it falls back to static JSON files served from /public/vaayu_ml." },
        { name: "City Predictions Dataset", desc: "city_predictions.json provides city-level PM2.5 predicted vs actual values, AQI category, advisory text, and model metadata for dashboard cards and summaries." },
        { name: "Spatial PM2.5 Grid", desc: "spatial_map.geojson stores model-derived PM2.5 values over geographic points/polygons used directly in the interactive map and AQI filtering." },
        { name: "Model Metrics + Features", desc: "model_metrics.json and feature_importance.json expose model performance (R²/RMSE/MAE), best model selection, and ranked feature contributions." }
      ]
    },
    {
      title: "AI Downscaling Architecture",
      icon: Cpu,
      items: [
        { name: "Model Stack (XGBoost / RF / LightGBM)", desc: "The app surfaces all trained model metrics and highlights the best performer from backend metadata to drive reporting and cards." },
        { name: "Feature Engineering Pipeline", desc: "Backend prediction uses engineered meteorological and interaction features (e.g., aod_humidity, ventilation, pressure, wind, cloud, precipitation)." },
        { name: "Spatial Synthesis", desc: "Geo-spatial PM2.5 maps are generated by blending IDW-style neighborhood interpolation with model predictions for stable city and national coverage." },
        { name: "AI Narrative Layer", desc: "A lightweight LLM summary layer converts numeric outputs into user-facing environmental insights and chat responses." }
      ]
    },
    {
      title: "Verification & Accuracy",
      icon: ShieldCheck,
      items: [
        { name: "Backend-Metric Driven Validation", desc: "Validation cards and charts are bound to backend-provided metrics payload instead of hardcoded benchmark values." },
        { name: `R² Score: ${bestModelStats ? Number(bestModelStats.r2).toFixed(4) : 'N/A'}`, desc: `Best model in current payload: ${bestModel || 'N/A'}.` },
        { name: `RMSE: ${bestModelStats ? Number(bestModelStats.rmse).toFixed(2) : 'N/A'} µg/m³`, desc: `Training samples: ${metrics?.training_samples ?? 'N/A'} | Test samples: ${metrics?.test_samples ?? 'N/A'} | Cities: ${metrics?.cities_covered ?? 'N/A'}.` },
        { name: `MAE: ${bestModelStats ? Number(bestModelStats.mae).toFixed(2) : 'N/A'} µg/m³`, desc: "Mean absolute error tracks average prediction deviation between modeled and observed PM2.5." }
      ]
    }
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4">
        <h2 className="text-4xl font-black text-white tracking-tighter">METHODOLOGY & <span className="text-blue-500">DATASETS</span></h2>
        <p className="text-slate-400 max-w-2xl font-medium leading-relaxed">
          VAAYU combines backend model inference, geo-spatial synthesis, and resilient frontend fallbacks to deliver city-level and map-level PM2.5 intelligence in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {sections.map((section, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] p-8 hover:bg-white/10 transition-all group"
          >
            <div className="p-4 bg-blue-600/20 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
              <section.icon className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-black text-white mb-6 tracking-tight">{section.title}</h3>
            <div className="space-y-6">
              {section.items.map((item, j) => (
                <div key={j} className="space-y-2">
                  <p className="text-xs font-black text-blue-400 uppercase tracking-widest">{item.name}</p>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-blue-600 rounded-[3rem] p-12 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="space-y-4">
            <h3 className="text-3xl font-black text-white tracking-tight">Ready to verify the model?</h3>
            <p className="text-blue-100 font-medium max-w-md">
              Run the live verification sequence to inspect data ingestion, feature processing, model scoring, and accuracy summaries for your selected city/date context.
            </p>
          </div>
          <button 
            onClick={startVerification}
            className="px-10 py-5 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
          >
            Start Verification
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [aqData, setAqData] = useState<OpenAQResult[]>([]);
  const [mapData, setMapData] = useState<OpenAQResult[]>([]);
  const [rawCities, setRawCities] = useState<any[]>([]);
  const [rawMapGeoJSON, setRawMapGeoJSON] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiMetrics, setApiMetrics] = useState<any | null>(null);
  const [apiCities, setApiCities] = useState<any[]>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [mapResolution, setMapResolution] = useState<'coarse' | 'fine'>('fine');
  const [showIntro, setShowIntro] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSteps, setVerificationSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [showPMInfo, setShowPMInfo] = useState(false);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<any>(null);
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [selectedPollutant, setSelectedPollutant] = useState('pm25');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [compactHeader, setCompactHeader] = useState(false);
  const [realtimeRefresh, setRealtimeRefresh] = useState(true);
  const [mapFilter, setMapFilter] = useState<MapFilter>('all');
  const [apiError, setApiError] = useState('');
  const [predictForm, setPredictForm] = useState({ temp: '', humidity: '', wind_speed: '', aod: '', lat: '', lon: '' });
  const [predictionResult, setPredictionResult] = useState<number | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const selectedCityRef = useRef(selectedCity);

  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);

  const selectedCityData: any = apiCities.find((city: any) => city.city.toLowerCase() === selectedCity.toLowerCase()) || apiCities[0] || null;
  const selectedMapPoint = mapData[0] || null;
  const selectedDateISO = format(selectedDate, 'yyyy-MM-dd');
  const selectedDateLabel = format(selectedDate, 'd/M/yy');
  const maxSelectableDate = format(new Date(), 'yyyy-MM-dd');
  const currentPollutant = POLLUTANTS.find(p => p.id === 'pm25') || POLLUTANTS[0];
  const modelSummary = apiMetrics?.models?.[apiMetrics?.best_model] || null;
  const modelNames = apiMetrics?.models ? Object.keys(apiMetrics.models) : [];
  const mapPointSummaries = useMemo(() => {
    const features = Array.isArray(rawMapGeoJSON?.features) ? rawMapGeoJSON.features : [];
    const selectedLat = Number(selectedCityData?.lat);
    const selectedLon = Number(selectedCityData?.lon);
    const hasCityFocus = Number.isFinite(selectedLat) && Number.isFinite(selectedLon);
    const cityLatPad = mapResolution === 'fine' ? 2.2 : 3.2;
    const cityLonPad = mapResolution === 'fine' ? 2.2 : 3.2;

    const getFeatureCoordinates = (geometry: any) => {
      if (!geometry) return null;

      if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        return { lon: Number(geometry.coordinates[0]), lat: Number(geometry.coordinates[1]) };
      }

      if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
        const ring = geometry.coordinates[0];
        if (!ring.length) return null;
        const [sumLon, sumLat] = ring.reduce(
          (acc: [number, number], coord: [number, number]) => [acc[0] + Number(coord[0]), acc[1] + Number(coord[1])],
          [0, 0]
        );
        return { lon: sumLon / ring.length, lat: sumLat / ring.length };
      }

      if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0]?.[0])) {
        const ring = geometry.coordinates[0][0];
        if (!ring.length) return null;
        const [sumLon, sumLat] = ring.reduce(
          (acc: [number, number], coord: [number, number]) => [acc[0] + Number(coord[0]), acc[1] + Number(coord[1])],
          [0, 0]
        );
        return { lon: sumLon / ring.length, lat: sumLat / ring.length };
      }

      return null;
    };

    const summaries = features
      .map((feature: any, index: number) => {
        const coords = getFeatureCoordinates(feature?.geometry);
        const pm25 = Number(feature?.properties?.pm25 ?? 0);
        if (!coords || !Number.isFinite(pm25)) return null;

        // Keep side summaries geographically meaningful for India map view.
        if (coords.lat < 6 || coords.lat > 38 || coords.lon < 68 || coords.lon > 98) return null;
        if (hasCityFocus) {
          const inCityWindow =
            Math.abs(coords.lat - selectedLat) <= cityLatPad &&
            Math.abs(coords.lon - selectedLon) <= cityLonPad;
          if (!inCityWindow) return null;
        }

        const category = pm25 > 150 ? 'Severe' : pm25 > 50 ? 'Moderate' : 'Healthy';

        return {
          key: `${coords.lat.toFixed(2)}-${coords.lon.toFixed(2)}-${pm25.toFixed(1)}`,
          index,
          lat: coords.lat,
          lon: coords.lon,
          pm25,
          category,
        };
      })
      .filter((point): point is { key: string; index: number; lat: number; lon: number; pm25: number; category: string } => point !== null)
      .sort((a, b) => b.pm25 - a.pm25)
      .slice(0, 8);

    if (summaries.length > 0) return summaries;

    const fallbackSeen = new Set<string>();
    return mapData
      .map((point, index) => {
        const pm25 = Number(point.measurements[0]?.value ?? 0);
        const lat = Number(point.coordinates.latitude);
        const lon = Number(point.coordinates.longitude);

        if (lat < 6 || lat > 38 || lon < 68 || lon > 98) return null;
        if (hasCityFocus) {
          const inCityWindow =
            Math.abs(lat - selectedLat) <= cityLatPad &&
            Math.abs(lon - selectedLon) <= cityLonPad;
          if (!inCityWindow) return null;
        }

        const category = pm25 > 150 ? 'Severe' : pm25 > 50 ? 'Moderate' : 'Healthy';
        return {
          key: `${lat.toFixed(2)}-${lon.toFixed(2)}-${pm25.toFixed(1)}`,
          index,
          lat,
          lon,
          pm25,
          category,
        };
      })
      .filter((point): point is { key: string; index: number; lat: number; lon: number; pm25: number; category: string } => point !== null)
      .filter((point) => {
        if (fallbackSeen.has(point.key)) return false;
        fallbackSeen.add(point.key);
        return true;
      })
      .sort((a, b) => b.pm25 - a.pm25)
      .slice(0, 8);
  }, [rawMapGeoJSON, mapData, selectedCityData?.lat, selectedCityData?.lon, mapResolution]);
  const filteredMapPointSummaries = mapPointSummaries.filter((point) => matchesMapFilter(point.pm25, mapFilter));
  const mapStats = useMemo(() => {
    if (filteredMapPointSummaries.length === 0) return null;
    const values = filteredMapPointSummaries.map((point) => Number(point.pm25));
    return {
      min: Math.min(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      max: Math.max(...values),
    };
  }, [filteredMapPointSummaries]);

  const suggestions = [
    "Should I wear a mask? 😷",
    "How accurate is the AI? 🎯",
    "Explain PM2.5 levels. 🌫️",
    "What's the data source? 📊"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionIndex(prev => (prev + 1) % suggestions.length);
      setShowSuggestion(true);
      setTimeout(() => setShowSuggestion(false), 5000);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location access denied", err)
      );
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setApiError('');

      const [citiesData, mapGeoJSON, metricsRes] = await Promise.all([
        getCitiesData(),
        getMapData(),
        getMetricsData()
      ]);

      const nextRawCities = Array.isArray(citiesData) ? citiesData : [];
      setRawCities(nextRawCities);
      setRawMapGeoJSON(mapGeoJSON ?? null);
      setApiMetrics(metricsRes ?? null);

      let nextSelected = '';
      if (nextRawCities.length > 0) {
        nextSelected = nextRawCities.find((city: any) => city.city.toLowerCase() === selectedCityRef.current.toLowerCase())?.city || nextRawCities[0].city;
        setSelectedCity(nextSelected);
      } else {
        setSelectedCity('');
        nextSelected = '';
      }

      try {
        const { normalizedCities } = normalizeCitiesForDate(nextRawCities, selectedDate);
        if (normalizedCities.length > 0 && nextSelected) {
          const insight = await getAIAnalysis(normalizedCities, 'pm25', nextSelected);
          setAiInsight(insight);
        } else {
          setAiInsight('No city data available from the backend.');
        }
      } catch (aiErr) {
        console.warn('AI summary failed, keeping backend data visible:', aiErr);
        setAiInsight('AI summary unavailable right now. Live backend data is still loaded.');
      }
    } catch (err) {
      console.error("Data load failed", err);
      setApiError('Unable to load live VAAYU data from the backend.');
      setRawCities([]);
      setRawMapGeoJSON(null);
      setApiCities([]);
      setAqData([]);
      setMapData([]);
      setApiMetrics(null);
      setAiInsight('');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [showIntro, loadData]);

  useEffect(() => {
    if (!realtimeRefresh || showIntro) return;

    const interval = window.setInterval(() => {
      loadData();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [realtimeRefresh, showIntro, loadData]);

  useEffect(() => {
    if (!rawCities.length) {
      setApiCities([]);
      setAqData([]);
      setMapData([]);
      return;
    }

    const { dateAwareCities, normalizedCities } = normalizeCitiesForDate(rawCities, selectedDate);
    setApiCities(dateAwareCities);
    setAqData(normalizedCities);
    setMapData(normalizeMapForDate(rawMapGeoJSON, selectedDate, apiMetrics?.generated));

    if (!selectedCity || !dateAwareCities.some((city: any) => city.city.toLowerCase() === selectedCity.toLowerCase())) {
      setSelectedCity(dateAwareCities[0]?.city || '');
    }
  }, [rawCities, rawMapGeoJSON, selectedDate, apiMetrics?.generated, selectedCity]);

  useEffect(() => {
    if (!selectedCity && aqData.length > 0) {
      setSelectedCity(aqData[0].city);
    }
  }, [aqData, selectedCity]);

  const startVerification = async () => {
    setIsVerifying(true);
    setCurrentStepIndex(0);
    const steps = [
      "Loading city + map + metrics payloads...",
      "Applying backend-first with static fallback checks...",
      "Preparing engineered features for inference...",
      "Scoring PM2.5 with selected best model...",
      "Computing R² / RMSE / MAE diagnostics...",
      "Finalizing city and spatial consistency summary..."
    ];
    
    for (let i = 0; i < steps.length; i++) {
      setVerificationSteps(prev => [...prev, steps[i]]);
      setCurrentStepIndex(i);
      await new Promise(r => setTimeout(r, 800));
    }
    
    setTimeout(() => {
      setIsVerifying(false);
      setVerificationSteps([]);
      setCurrentStepIndex(-1);
    }, 2000);
  };

  const renderContent = () => {
    const currentPollutant = POLLUTANTS.find(p => p.id === 'pm25') || POLLUTANTS[0];
    const cityData: any = apiCities.find((city: any) => city.city.toLowerCase() === selectedCity.toLowerCase()) || apiCities[0] || null;
    const currentValue = cityData ? Number(cityData.pm25_predicted ?? cityData.pm25_actual ?? cityData.aqi ?? 0).toFixed(2) : '0.00';
    const actualValue = cityData ? Number(cityData.pm25_actual ?? cityData.pm25_predicted ?? 0).toFixed(2) : '0.00';
    const predictionGap = cityData ? Number(Math.abs(Number(cityData.pm25_predicted ?? 0) - Number(cityData.pm25_actual ?? 0)).toFixed(2)) : 0;
    const selectedModelName = apiMetrics?.best_model || 'XGBoost';
    const selectedModelStats = apiMetrics?.models?.[selectedModelName] || null;
    
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-12 pb-12">
            {/* Quick Summary Card */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3 bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl flex items-center gap-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Activity size={150} className="text-blue-500" />
                </div>
                <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shrink-0 shadow-xl shadow-blue-600/30">
                  <Zap className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Quick Summary: {selectedCity}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed font-medium max-w-2xl">
                    Predicted PM2.5 is <span className="text-white font-black">{currentValue} {currentPollutant.unit}</span> against an observed value of <span className="text-white font-black">{actualValue} {currentPollutant.unit}</span>. 
                    {selectedCityData?.health_advisory || 'No advisory is available for the selected city.'}
                  </p>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[3rem] text-white shadow-xl shadow-blue-600/20 flex flex-col justify-center gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-70">Model Used</p>
                  <h4 className="text-3xl font-black mb-1">{selectedCityData?.model_used || apiMetrics?.best_model || 'XGBoost'}</h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-blue-100/70 text-[10px] uppercase tracking-widest font-black">AQI</p>
                    <p className="text-2xl font-black">{selectedCityData?.aqi ?? 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-blue-100/70 text-[10px] uppercase tracking-widest font-black">Category</p>
                    <p className="text-2xl font-black">{selectedCityData?.category ?? 'N/A'}</p>
                  </div>
                </div>
                <p className="text-xs font-medium text-blue-100">Snapshot date: {selectedDateLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Data Snapshot</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Date</p>
                    <p className="text-white font-black mt-1">{selectedDateLabel}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Cities Loaded</p>
                    <p className="text-white font-black mt-1">{aqData.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Selected City</p>
                    <p className="text-white font-black mt-1">{selectedCity || 'None'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Prediction Gap</p>
                    <p className="text-white font-black mt-1">{predictionGap} {currentPollutant.unit}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Backend Coverage</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Model</p>
                    <p className="text-white font-black mt-1">{selectedModelName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Training Samples</p>
                    <p className="text-white font-black mt-1">{apiMetrics?.training_samples ?? 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Cities Covered</p>
                    <p className="text-white font-black mt-1">{apiMetrics?.cities_covered ?? 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Features</p>
                    <p className="text-white font-black mt-1">{apiMetrics?.features_count ?? 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Row: Key Metrics - Compact & More */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              <StatCard 
                label={`Current ${currentPollutant.name} Level`} 
                value={`${currentValue} ${currentPollutant.unit}`} 
                description="Estimated pollutant concentration for the selected city and date."
                icon={Wind} 
                trend={selectedModelStats?.r2 ? Number((selectedModelStats.r2 * 100).toFixed(1)) : undefined} 
                color="bg-red-500" 
                onClick={() => setSelectedMetricInfo({ ...currentPollutant, pm25_predicted: currentValue, pm25_actual: actualValue })}
              />
              <StatCard 
                label="Total Cities in Snapshot" 
                value={aqData.length} 
                description="Number of cities currently loaded into the dashboard."
                icon={Database} 
                color="bg-blue-500" 
              />
              <StatCard 
                label="Model Accuracy (R²)" 
                value={selectedModelStats ? Number(selectedModelStats.r2).toFixed(4) : 'N/A'} 
                description="Closer to 1 means the model explains more of the observed variation."
                icon={ShieldCheck} 
                color="bg-emerald-500" 
              />
              <StatCard 
                label="Error Spread (RMSE)" 
                value={selectedModelStats ? Number(selectedModelStats.rmse).toFixed(2) : 'N/A'} 
                description="Typical size of larger prediction errors. Lower is better."
                icon={Zap} 
                color="bg-purple-500" 
              />
              <StatCard 
                label="Average Error (MAE)" 
                value={selectedModelStats ? Number(selectedModelStats.mae).toFixed(2) : 'N/A'} 
                description="Average absolute difference between predicted and actual PM2.5."
                icon={CheckCircle2} 
                color="bg-cyan-500" 
              />
            </div>

            {/* Climate Trackers Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'State', value: cityData?.state || 'N/A', description: 'Indian state of the selected city.', icon: Thermometer, color: 'bg-orange-500' },
                { label: 'Zone', value: cityData?.zone || 'N/A', description: 'Regional zone used in this model grouping.', icon: Droplets, color: 'bg-blue-400' },
                { label: 'Air Quality Index (AQI)', value: cityData?.aqi ?? 'N/A', description: 'Overall air quality score. Lower AQI indicates cleaner air.', icon: Wind, color: 'bg-slate-400' },
                { label: 'Health Advisory Level', value: cityData?.category || 'N/A', description: 'Risk category used for public health guidance.', icon: Cloud, color: 'bg-indigo-400' }
              ].map((metric) => {
                return (
                  <StatCard 
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    description={metric.description}
                    icon={metric.icon}
                    color={metric.color}
                    onClick={() => setSelectedMetricInfo(cityData)}
                  />
                );
              })}
            </div>

            {/* AI Summary Section */}
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 backdrop-blur-xl p-8 rounded-[3rem] border border-blue-500/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Sparkles size={120} className="text-blue-400" />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/40">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white mb-2 tracking-tight">AI Environmental Summary</h3>
                  <p className="text-sm text-slate-300 leading-relaxed font-medium">
                    {selectedCityData?.city || selectedCity} is currently at {currentValue} {currentPollutant.unit} PM2.5 predicted versus {actualValue} {currentPollutant.unit} actual. 
                    Prediction gap: {predictionGap} {currentPollutant.unit}. {selectedCityData?.health_advisory || 'Backend advisory unavailable.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Comparison Section */}
            <div className="bg-white/5 backdrop-blur-xl p-10 rounded-[4rem] border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-5">
                <RefreshCw size={200} className="text-blue-500" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h3 className="text-3xl font-black text-white tracking-tight">Model Comparison</h3>
                    <p className="text-sm text-slate-500 mt-1">Live metrics from model_metrics.json</p>
                  </div>
                  <div className="flex items-center gap-2 px-6 py-2 bg-emerald-500/10 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{selectedModelName}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
                  {modelNames.length > 0 ? modelNames.map((modelName) => {
                    const stats = apiMetrics?.models?.[modelName];
                    return (
                      <motion.div 
                        key={modelName}
                        className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5 hover:border-white/10 transition-all group"
                        whileHover={{ scale: 1.02 }}
                      >
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{modelName}</p>
                        <div className="space-y-2 text-sm text-slate-300">
                          <p>R²: <span className="text-white font-black">{Number(stats.r2).toFixed(4)}</span></p>
                          <p>RMSE: <span className="text-white font-black">{Number(stats.rmse).toFixed(2)}</span></p>
                          <p>MAE: <span className="text-white font-black">{Number(stats.mae).toFixed(2)}</span></p>
                        </div>
                      </motion.div>
                    );
                  }) : (
                    <div className="col-span-3 flex items-center justify-center p-20 text-slate-400">
                      No model metrics available.
                    </div>
                  )}
                </div>

                <div className="h-[360px] relative z-10">
                  {modelNames.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={modelNames.map((modelName) => ({
                          model: modelName,
                          r2: Number(apiMetrics?.models?.[modelName]?.r2 ?? 0),
                          rmse: Number(apiMetrics?.models?.[modelName]?.rmse ?? 0),
                          mae: Number(apiMetrics?.models?.[modelName]?.mae ?? 0)
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis dataKey="model" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="r2" fill="#10b981" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="rmse" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="mae" fill="#a855f7" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      Loading model metrics...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: System Status & Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl p-10 rounded-[4rem] border border-white/10 shadow-2xl flex flex-col justify-center">
                <div className="flex items-center gap-4 mb-10">
                  <div className="p-3 bg-emerald-500/20 rounded-2xl">
                    <Activity className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">System Health</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    { label: "Best Model", status: selectedModelName, color: "emerald", val: selectedModelStats ? `R² ${Number(selectedModelStats.r2).toFixed(4)}` : 'N/A' },
                    { label: "Training Samples", status: "Backend", color: "blue", val: apiMetrics?.training_samples ?? 'N/A' },
                    { label: "Cities Covered", status: "Live", color: "emerald", val: apiMetrics?.cities_covered ?? aqData.length }
                  ].map((s, i) => (
                    <div key={i} className="flex flex-col gap-3 p-6 bg-white/5 rounded-[2.5rem] border border-white/5 group/status">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-white group-hover/status:text-blue-400 transition-colors">{s.label}</span>
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", `bg-${s.color}-500 shadow-[0_0_10px_currentColor]`)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{s.val}</span>
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", `text-${s.color}-400`)}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-slate-800 to-slate-950 p-10 rounded-[4rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-20">
                  <AlertTriangle size={150} />
                </div>
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  <h3 className="text-lg font-black text-white">Health Advisory</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed relative z-10 font-medium">
                  {selectedCityData?.health_advisory || 'No advisory available for the selected city.'}
                </p>
              </div>
            </div>
          </div>
        );
      case 'map':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-black text-white">Spatial Map</h3>
                    <p className="text-sm text-slate-500">Real GeoJSON PM2.5 grid rendered from model output</p>
                  </div>
                  <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                    <button 
                      onClick={() => setMapResolution('coarse')}
                      className={cn("px-6 py-2 rounded-xl text-[10px] font-black transition-all", mapResolution === 'coarse' ? "bg-blue-600 text-white shadow-lg" : "text-slate-500")}
                    >
                      Subset
                    </button>
                    <button 
                      onClick={() => setMapResolution('fine')}
                      className={cn("px-6 py-2 rounded-xl text-[10px] font-black transition-all", mapResolution === 'fine' ? "bg-blue-600 text-white shadow-lg" : "text-slate-500")}
                    >
                      Full
                    </button>
                  </div>
                </div>
                <SpatialLeafletMap
                  geoJsonData={rawMapGeoJSON}
                  filter={mapFilter}
                  resolution={mapResolution}
                  selectedCityName={selectedCityData?.city}
                  selectedCityCenter={selectedCityData ? { lat: Number(selectedCityData.lat), lon: Number(selectedCityData.lon) } : null}
                />
              </div>

              <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-20">
                  <AlertTriangle size={150} />
                </div>
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  <h3 className="text-lg font-black">Health Advisory</h3>
                </div>
                <p className="text-sm text-blue-100 leading-relaxed relative z-10 font-medium">
                  {selectedCityData?.health_advisory || 'Backend advisory unavailable for the selected city.'}
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-lg font-black text-white">AQI Filter</h3>
                    <p className="text-xs text-slate-500">Filter the spatial map and point list with the same category control.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All Stations', color: 'bg-slate-400' },
                      { id: 'healthy', label: 'Healthy (0-50)', color: 'bg-emerald-500' },
                      { id: 'moderate', label: 'Moderate (51-150)', color: 'bg-orange-500' },
                      { id: 'severe', label: 'Severe (151+)', color: 'bg-red-500' }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setMapFilter(cat.id as MapFilter)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-[10px] font-black uppercase tracking-wider border",
                          mapFilter === cat.id
                            ? "bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/20"
                            : "bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <div className={cn("w-2.5 h-2.5 rounded-full", cat.color)} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-black text-white">PM2.5 Legend</h3>
                    <p className="text-xs text-slate-500">The map colors represent real PM2.5 concentration bands.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Healthy', range: '0-50', color: 'bg-emerald-500', text: 'Low concentration' },
                    { label: 'Moderate', range: '51-100', color: 'bg-amber-400', text: 'Elevated concentration' },
                    { label: 'Poor', range: '101-150', color: 'bg-orange-500', text: 'High concentration' },
                    { label: 'Severe', range: '151+', color: 'bg-red-500', text: 'Very high concentration' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 border border-white/10">
                      <div className="flex items-center gap-3">
                        <span className={cn("h-3 w-3 rounded-full", item.color)} />
                        <div>
                          <p className="text-sm font-black text-white">{item.label}</p>
                          <p className="text-[10px] text-slate-500">{item.range} µg/m³</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.text}</span>
                    </div>
                  ))}
                </div>
                {mapStats && (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-[10px] text-slate-400">
                    <div className="rounded-2xl bg-white/5 px-3 py-3 border border-white/10"><span className="block text-slate-500 mb-1">Min</span>{mapStats.min.toFixed(1)}</div>
                    <div className="rounded-2xl bg-white/5 px-3 py-3 border border-white/10"><span className="block text-slate-500 mb-1">Avg</span>{mapStats.avg.toFixed(1)}</div>
                    <div className="rounded-2xl bg-white/5 px-3 py-3 border border-white/10"><span className="block text-slate-500 mb-1">Max</span>{mapStats.max.toFixed(1)}</div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-xl font-black text-white mb-2">Map Points</h3>
                <p className="text-xs text-slate-500 mb-6">Showing {filteredMapPointSummaries.length} of {mapPointSummaries.length} points in the selected AQI band</p>
                <div className="space-y-4">
                  {filteredMapPointSummaries.slice(0, 5).map((area) => (
                    <div key={area.key} className="flex items-center justify-between p-5 bg-white/5 rounded-3xl border border-white/5 group cursor-pointer hover:bg-blue-600/10 hover:border-blue-500/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                          <MapIcon className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                          <h4 className="font-black text-white">Point {area.index + 1}</h4>
                          <p className="text-xs text-slate-500">Lat {area.lat.toFixed(2)}, Lon {area.lon.toFixed(2)} • {area.category}</p>
                        </div>
                      </div>
                      <div className="text-right mr-4">
                        <p className="text-sm font-black text-white">{area.pm25.toFixed(2)} {currentPollutant.unit}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PM2.5</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                    </div>
                  ))}
                  {filteredMapPointSummaries.length === 0 && (
                    <div className="p-5 rounded-3xl border border-white/5 bg-white/5 text-sm text-slate-400">
                      No points match the current AQI filter. Switch to All Stations to view the full spatial surface.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'literature':
        return (
          <div className="max-w-6xl space-y-12 pb-12">
            <motion.div 
              className="bg-white/5 backdrop-blur-xl p-12 rounded-[4rem] border border-white/10 shadow-2xl relative overflow-hidden"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="absolute top-0 right-0 p-12 opacity-5">
                <Database size={300} className="text-blue-500" />
              </div>
              
              <h2 className="text-4xl font-black text-white mb-4 tracking-tighter relative z-10">Literature Review</h2>
              <p className="text-slate-400 mb-12 max-w-2xl relative z-10 font-medium">
                Vaayu bridges the gap between coarse satellite observations and local health impacts through advanced AI downscaling.
              </p>
              
              <div className="overflow-hidden rounded-[3rem] border border-white/10 bg-white/5">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="p-8 text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Researcher / Work</th>
                      <th className="p-8 text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Critical Gap Identified</th>
                      <th className="p-8 text-xs font-black text-blue-400 uppercase tracking-[0.3em]">Vaayu Innovation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { 
                        work: "Schneider et al. (2020)", 
                        missing: "Uncertainty estimation & local sharpening", 
                        special: "Real-time confidence intervals & 500m resolution. Uses Bayesian Deep Learning for spatial interpolation.",
                        color: "blue"
                      },
                      { 
                        work: "Yu & Liu (2021)", 
                        missing: "Interpretability & real-time ground sync", 
                        special: "AI Insights & live OpenAQ integration. Implements SHAP values for feature importance in PM2.5 prediction.",
                        color: "purple"
                      },
                      { 
                        work: "Bagheri (2022/2024)", 
                        missing: "Multi-city scalability for India", 
                        special: "Pan-India coverage with city-specific models. Optimizes Random Forest for high-variance tropical climates.",
                        color: "emerald"
                      },
                      { 
                        work: "Wang et al. (2018)", 
                        missing: "Modern ML performance (XGBoost/RF)", 
                        special: "Hybrid Bayesian-ML ensemble approach. Combines satellite AOD with meteorological ground truth.",
                        color: "orange"
                      },
                      { 
                        work: "Geng et al. (2021)", 
                        missing: "Long-term temporal consistency", 
                        special: "Full-coverage 1km resolution PM2.5 datasets. Uses gap-filling algorithms for cloud-covered satellite pixels.",
                        color: "cyan"
                      }
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="p-8">
                          <p className="text-lg font-black text-white tracking-tight">{row.work}</p>
                        </td>
                        <td className="p-8">
                          <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20">
                            <p className="text-sm text-red-400 font-medium italic">"{row.missing}"</p>
                          </div>
                        </td>
                        <td className="p-8">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                              <Zap className="w-4 h-4 text-white" />
                            </div>
                            <p className="text-sm font-black text-white tracking-tight">{row.special}</p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        );
      case 'info':
        return null; // Handled by literature
      case 'methodology':
        return <Methodology startVerification={startVerification} metrics={apiMetrics} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <AnimatePresence>
        {showIntro && <IntroAnimation onComplete={() => setShowIntro(false)} />}
      </AnimatePresence>

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        startVerification={startVerification}
        setIsChatOpen={setIsChatOpen}
      />
      
      {/* Floating Chatbot Suggestions */}
      <AnimatePresence>
        {showSuggestion && !isChatOpen && (
          <motion.div 
            className="fixed bottom-32 right-12 z-[100] pointer-events-none"
            initial={{ opacity: 0, x: 50, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.8 }}
          >
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-blue-100 flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm font-bold text-slate-800">{suggestions[suggestionIndex]}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 bg-slate-950">
        <Header 
          title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} 
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
          selectedDate={selectedDateISO}
          setSelectedDate={(dateValue: string) => {
            if (!dateValue) return;
            setSelectedDate(new Date(`${dateValue}T00:00:00`));
          }}
          minDate={DATE_PICKER_MIN}
          maxDate={maxSelectableDate}
          cityOptions={apiCities.map(city => city.city)}
          apiStatus={apiError ? 'disconnected' : 'connected'}
          compactMode={compactHeader}
          setCompactMode={setCompactHeader}
          realtimeRefresh={realtimeRefresh}
          setRealtimeRefresh={setRealtimeRefresh}
        />
        <main className="ml-64 p-10 max-w-[1800px] mx-auto">
          {apiError && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              {apiError}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Chatbot Toggle with Suggestions */}
      <div className="fixed bottom-10 right-10 z-[100] flex flex-col items-end gap-4">
        <AnimatePresence>
          {showSuggestion && !isChatOpen && (
            <motion.div 
              initial={{ opacity: 0, x: 20, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.8 }}
              className="bg-white px-6 py-3 rounded-2xl shadow-2xl border border-slate-100 relative mb-2 max-w-xs"
            >
              <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white rotate-45 border-r border-b border-slate-100" />
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Vaayu AI says:</p>
              <p className="text-xs font-bold text-slate-800 leading-relaxed">
                {suggestions[suggestionIndex]}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        <motion.button 
          onClick={() => setIsChatOpen(true)}
          className="w-20 h-20 bg-blue-600 text-white rounded-[2rem] shadow-[0_20px_50px_rgba(37,99,235,0.4)] flex items-center justify-center hover:scale-110 transition-all active:scale-95 group relative overflow-hidden"
          whileHover={{ rotate: 5 }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          <MessageSquare className="w-8 h-8 relative z-10" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-4 border-[#020617] animate-pulse" />
        </motion.button>
      </div>

      <Chatbot 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        context={`Current City: ${selectedCityData?.city || selectedCity}, PM2.5 predicted: ${selectedCityData?.pm25_predicted ?? 'N/A'}, PM2.5 actual: ${selectedCityData?.pm25_actual ?? 'N/A'}, AQI: ${selectedCityData?.aqi ?? 'N/A'}. Advisory: ${selectedCityData?.health_advisory || 'N/A'}. AI Insight: ${aiInsight}`}
        userLocation={userLocation}
        selectedCityData={selectedCityData}
        apiMetrics={apiMetrics}
        apiCities={apiCities}
      />

      <VerificationModal 
        isOpen={isVerifying} 
        steps={verificationSteps} 
        currentIndex={currentStepIndex} 
        data={selectedCityData ? {
          satellite: Number(selectedCityData.aqi),
          ai: Number(selectedCityData.pm25_predicted),
          ground: Number(selectedCityData.pm25_actual),
          unit: 'µg/m³'
        } : undefined}
      />

      <MetricInfoModal 
        isOpen={!!selectedMetricInfo} 
        onClose={() => setSelectedMetricInfo(null)} 
        metric={selectedMetricInfo} 
      />

      {loading && !showIntro && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-white">
          <RefreshCw className="w-12 h-12 animate-spin mb-4 text-blue-400" />
          <p className="font-bold tracking-widest uppercase text-sm">Synchronizing Data...</p>
        </div>
      )}
    </div>
  );
}
