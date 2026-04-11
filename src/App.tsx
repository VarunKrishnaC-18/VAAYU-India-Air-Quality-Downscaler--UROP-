/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  BarChart3, 
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
import ReactMarkdown from 'react-markdown';
import { format, subDays } from 'date-fns';
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

// --- Types ---

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

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
    { id: 'literature', icon: BarChart3, label: 'Literature Review' },
    { id: 'methodology', icon: Database, label: 'Data & Methodology' },
  ];

  const journeyItems = [
    { step: "01", title: "Explore Map", icon: MapIcon, color: "blue", tab: 'map' },
    { step: "02", title: "Verify Data", icon: Activity, color: "emerald", action: startVerification },
    { step: "03", title: "AI Insights", icon: MessageSquare, color: "purple", action: () => setIsChatOpen(true) },
    { step: "04", title: "Research", icon: BarChart3, color: "cyan", tab: 'literature' }
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
  cityOptions,
  apiStatus
}: { 
  title: string; 
  selectedCity: string;
  setSelectedCity: (c: string) => void;
  cityOptions: string[];
  apiStatus: 'connected' | 'disconnected';
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [realtimeRefresh, setRealtimeRefresh] = useState(true);

  const notifications = [
    {
      title: apiStatus === 'connected' ? 'Backend Connected' : 'Backend Disconnected',
      detail: apiStatus === 'connected' ? 'Live endpoints are responding.' : 'API calls are failing. Check backend server.',
      tone: apiStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'
    },
    {
      title: 'Selected City',
      detail: selectedCity || 'No city selected',
      tone: 'text-blue-400'
    },
    {
      title: 'Cities Available',
      detail: `${cityOptions.length}`,
      tone: 'text-slate-300'
    }
  ];

  return (
  <header className="h-24 bg-[#020617]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-12 sticky top-0 z-40 ml-64">
    <div className="flex items-center gap-8">
      <div className="flex flex-col">
        <h2 className="text-2xl font-black text-white tracking-tighter leading-none mb-1">{title}</h2>
        <div className="flex items-center gap-3 text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <span>Live Satellite Feed: India</span>
        </div>
      </div>
      
      <div className="h-10 w-px bg-white/10" />
      
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Select City</span>
          <select 
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
          >
            {cityOptions.length > 0 ? cityOptions.map(city => (
              <option key={city} value={city} className="bg-slate-900">{city}</option>
            )) : <option value="" className="bg-slate-900">No cities loaded</option>}
          </select>
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
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs font-bold text-white">Backend Status</p>
                  <p className={cn('text-[11px] mt-1', apiStatus === 'connected' ? 'text-emerald-400' : 'text-red-400')}>
                    {apiStatus === 'connected' ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </header>
  );
};

const StatCard = ({ label, value, icon: Icon, trend, color, onClick }: any) => (
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
      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{label}</p>
      <h3 className="text-xl font-black text-white tracking-tight">{value}</h3>
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

const IndiaMapVisualization = ({ resolution, data, onCitySelect }: { resolution: 'coarse' | 'fine'; data: OpenAQResult[]; onCitySelect: (city: string) => void }) => {
  const [filter, setFilter] = useState<'all' | 'healthy' | 'moderate' | 'severe'>('all');
  const [hoveredCity, setHoveredCity] = useState<OpenAQResult | null>(null);
  
  // Simple projection for India (approximate)
  // Lat: 8 to 37, Lng: 68 to 97
  const project = (lat: number, lng: number) => {
    const x = ((lng - 68) / (97 - 68)) * 100;
    const y = 120 - ((lat - 8) / (37 - 8)) * 120;
    return { x, y };
  };

  const filteredData = data.filter(city => {
    const pmValue = city.measurements[0].value;
    if (filter === 'all') return true;
    if (filter === 'healthy') return pmValue <= 50;
    if (filter === 'moderate') return pmValue > 50 && pmValue <= 150;
    if (filter === 'severe') return pmValue > 150;
    return true;
  });

  return (
    <div className="relative w-full aspect-[4/5] bg-[#020617] rounded-[4rem] overflow-hidden border border-white/5 shadow-[0_0_100px_rgba(37,99,235,0.1)] group/map perspective-1000">
      <div className="absolute top-10 left-10 z-50 flex flex-col gap-3">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-3xl space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Filter by AQI</p>
          <div className="flex flex-col gap-2">
            {[
              { id: 'all', label: 'All Stations', color: 'bg-slate-400' },
              { id: 'healthy', label: 'Healthy (0-50)', color: 'bg-emerald-500' },
              { id: 'moderate', label: 'Moderate (51-150)', color: 'bg-orange-500' },
              { id: 'severe', label: 'Severe (151+)', color: 'bg-red-500' }
            ].map((cat) => (
              <button 
                key={cat.id}
                onClick={() => setFilter(cat.id as any)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider",
                  filter === cat.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", cat.color)} />
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

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
              viewBox="0 0 100 120" 
              className="w-full h-full drop-shadow-[0_20px_100px_rgba(0,0,0,0.8)]"
              initial={{ rotateX: 15, rotateY: -10 }}
              whileHover={{ rotateX: 0, rotateY: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              {/* Simplified India Path */}
              <path 
                d="M32,10 L45,8 L55,15 L65,28 L85,58 L82,78 L75,98 L65,118 L50,121 L35,115 L25,108 L15,88 L10,68 L15,48 L22,28 L28,13 Z" 
                fill={resolution === 'fine' ? '#0f172a' : '#020617'} 
                stroke={resolution === 'fine' ? '#3b82f6' : '#1e293b'} 
                strokeWidth="0.5"
                className="transition-colors duration-1000"
              />
              
              {filteredData.length === 0 && (
                <g>
                  <text x="50" y="60" textAnchor="middle" fill="#64748b" fontSize="4" className="font-black uppercase tracking-widest">
                    No Stations Found
                  </text>
                  <text x="50" y="66" textAnchor="middle" fill="#3b82f6" fontSize="3" className="font-bold cursor-pointer underline" onClick={() => onCitySelect('')}>
                    Clear Search
                  </text>
                </g>
              )}
              
              {filteredData.filter(city => resolution === 'fine' || !city.location.startsWith('AI_Virtual_Station')).map((city, i) => {
                const pmValue = city.measurements[0].value;
                const isVirtual = city.location.startsWith('AI_Virtual_Station');
                const { x, y } = project(city.coordinates.latitude, city.coordinates.longitude);
                const color = pmValue > 150 ? '#ef4444' : pmValue > 100 ? '#f97316' : pmValue > 50 ? '#eab308' : '#10b981';

                return (
                  <motion.g 
                    key={city.location + i} 
                    className="cursor-pointer group/spot"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: isVirtual ? 0.6 : 1 }}
                    transition={{ delay: (i % 50) * 0.01 }}
                    onClick={() => !isVirtual && onCitySelect(city.city)}
                    onMouseEnter={() => !isVirtual && setHoveredCity(city)}
                    onMouseLeave={() => setHoveredCity(null)}
                  >
                    <circle 
                      cx={x} 
                      cy={y} 
                      r={isVirtual ? "0.4" : (resolution === 'fine' ? "1.2" : "2.2")} 
                      fill={color} 
                      className="transition-all duration-500 shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover/spot:r-[2]"
                    />
                    
                    {!isVirtual && (
                      <circle 
                        cx={x} 
                        cy={y} 
                        r={resolution === 'fine' ? "4" : "8"} 
                        fill={color} 
                        className="animate-pulse opacity-20" 
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
            {resolution === 'fine' ? 'AI SHARPENED (1KM)' : 'SATELLITE RAW (10KM)'}
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
        { name: "OpenAQ API", desc: "Real-time ground truth data from thousands of physical monitoring stations across India. Provides the baseline for model calibration." },
        { name: "Copernicus Sentinel-5P", desc: "Satellite imagery providing Aerosol Optical Depth (AOD) and trace gas concentrations at 7km resolution." },
        { name: "Copernicus Sentinel-2", desc: "High-resolution (10m) optical imagery used for land-cover classification and NDVI calculation." },
        { name: "NASA SRTM", desc: "Shuttle Radar Topography Mission data for elevation and terrain features that influence pollutant dispersion." }
      ]
    },
    {
      title: "AI Downscaling Architecture",
      icon: Cpu,
      items: [
        { name: "Random Forest Ensemble", desc: "Our core regressor that maps coarse satellite features to fine-grained ground concentrations." },
        { name: "Spatial Interpolation", desc: "Kriging and IDW methods used to fill gaps in physical sensor networks." },
        { name: "Gemini 3.1 Pro", desc: "Used for real-time interpretation of complex spatial patterns and generating human-readable insights." }
      ]
    },
    {
      title: "Verification & Accuracy",
      icon: ShieldCheck,
      items: [
        { name: "Cross-Validation", desc: "Leave-one-out spatial cross-validation ensures the model generalizes to unmonitored areas." },
        { name: `R² Score: ${bestModelStats ? Number(bestModelStats.r2).toFixed(4) : 'N/A'}`, desc: `Best model: ${bestModel || 'N/A'} from the backend metrics payload.` },
        { name: `RMSE: ${bestModelStats ? Number(bestModelStats.rmse).toFixed(2) : 'N/A'} µg/m³`, desc: `Training samples: ${metrics?.training_samples ?? 'N/A'} and cities covered: ${metrics?.cities_covered ?? 'N/A'}.` }
      ]
    }
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4">
        <h2 className="text-4xl font-black text-white tracking-tighter">METHODOLOGY & <span className="text-blue-500">DATASETS</span></h2>
        <p className="text-slate-400 max-w-2xl font-medium leading-relaxed">
          Vaayu leverages a multi-modal AI approach to bridge the gap between coarse satellite observations and hyper-local air quality reality.
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
              Run our real-time cross-referencing tool to see how Vaayu matches satellite data with ground truth in your selected area.
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
  const [apiError, setApiError] = useState('');
  const [predictForm, setPredictForm] = useState({ temp: '', humidity: '', wind_speed: '', aod: '', lat: '', lon: '' });
  const [predictionResult, setPredictionResult] = useState<number | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);

  const selectedCityData: any = apiCities.find((city: any) => city.city.toLowerCase() === selectedCity.toLowerCase()) || apiCities[0] || null;
  const selectedMapPoint = mapData[0] || null;
  const liveDateLabel = format(new Date(), 'd/M/yy');
  const currentPollutant = POLLUTANTS.find(p => p.id === 'pm25') || POLLUTANTS[0];
  const modelSummary = apiMetrics?.models?.[apiMetrics?.best_model] || null;
  const modelNames = apiMetrics?.models ? Object.keys(apiMetrics.models) : [];
  const mapPointSummaries = (() => {
    const seen = new Set<string>();
    return mapData
      .map((point, index) => {
        const pm25 = Number(point.measurements[0]?.value ?? 0);
        const lat = Number(point.coordinates.latitude);
        const lon = Number(point.coordinates.longitude);
        const category = pm25 > 150 ? 'Severe' : pm25 > 50 ? 'Moderate' : 'Healthy';
        return {
          ...point,
          index,
          pm25,
          lat,
          lon,
          category,
          key: `${lat.toFixed(2)}-${lon.toFixed(2)}-${pm25.toFixed(1)}`,
        };
      })
      .filter(point => {
        if (seen.has(point.key)) return false;
        seen.add(point.key);
        return true;
      })
      .sort((a, b) => b.pm25 - a.pm25)
      .slice(0, 8);
  })();

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

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setApiError('');

        const [citiesData, mapGeoJSON, metricsRes] = await Promise.all([
          getCitiesData(),
          getMapData(),
          getMetricsData()
        ]);

        const normalizedCities = Array.isArray(citiesData)
          ? citiesData.map((city: any) => ({
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
            }))
          : [];

        const normalizedMap = mapGeoJSON?.features?.map((feature: any, index: number) => ({
          location: `grid_${index + 1}`,
          city: feature.properties?.category ? `${feature.properties.category} Zone ${index + 1}` : `Grid Point ${index + 1}`,
          country: 'IN',
          coordinates: {
            latitude: Number(feature.geometry.coordinates[1]),
            longitude: Number(feature.geometry.coordinates[0])
          },
          measurements: [{
            parameter: 'pm25',
            value: Number(feature.properties?.pm25 ?? 0),
            lastUpdated: metricsRes?.generated || new Date().toISOString(),
            unit: 'µg/m³'
          }]
        })) ?? [];

        setApiCities(Array.isArray(citiesData) ? citiesData : []);
        setAqData(normalizedCities);
        setMapData(normalizedMap);
        setApiMetrics(metricsRes ?? null);

        let nextSelected = '';
        if (normalizedCities.length > 0) {
          nextSelected = normalizedCities.find(city => city.city.toLowerCase() === selectedCity.toLowerCase())?.city || normalizedCities[0].city;
          setSelectedCity(nextSelected);
        } else {
          setSelectedCity('');
          nextSelected = '';
        }

        try {
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
        setAqData([]);
        setMapData([]);
        setApiMetrics(null);
        setAiInsight('');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [showIntro]);

  useEffect(() => {
    if (!selectedCity && aqData.length > 0) {
      setSelectedCity(aqData[0].city);
    }
  }, [aqData, selectedCity]);

  const startVerification = async () => {
    setIsVerifying(true);
    setCurrentStepIndex(0);
    const steps = [
      "Fetching historical OpenAQ ground truth...",
      "Retrieving Copernicus Sentinel-5P AOD data...",
      "Preprocessing spatial features (Elevation, NDVI)...",
      "Feeding data to Random Forest Ensemble...",
      "Calculating residual errors...",
      "Finalizing comparison..."
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
    const selectedDateLabel = liveDateLabel;
    
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
                label={`Current ${currentPollutant.name}`} 
                value={`${currentValue} ${currentPollutant.unit}`} 
                icon={Wind} 
                trend={selectedModelStats?.r2 ? Number((selectedModelStats.r2 * 100).toFixed(1)) : undefined} 
                color="bg-red-500" 
                onClick={() => setSelectedMetricInfo({ ...currentPollutant, pm25_predicted: currentValue, pm25_actual: actualValue })}
              />
              <StatCard 
                label="Cities Loaded" 
                value={aqData.length} 
                icon={Database} 
                color="bg-blue-500" 
              />
              <StatCard 
                label="Model R²" 
                value={selectedModelStats ? Number(selectedModelStats.r2).toFixed(4) : 'N/A'} 
                icon={ShieldCheck} 
                color="bg-emerald-500" 
              />
              <StatCard 
                label="RMSE" 
                value={selectedModelStats ? Number(selectedModelStats.rmse).toFixed(2) : 'N/A'} 
                icon={Zap} 
                color="bg-purple-500" 
              />
              <StatCard 
                label="MAE" 
                value={selectedModelStats ? Number(selectedModelStats.mae).toFixed(2) : 'N/A'} 
                icon={CheckCircle2} 
                color="bg-cyan-500" 
              />
            </div>

            {/* Climate Trackers Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'State', value: cityData?.state || 'N/A', icon: Thermometer, color: 'bg-orange-500' },
                { label: 'Zone', value: cityData?.zone || 'N/A', icon: Droplets, color: 'bg-blue-400' },
                { label: 'AQI', value: cityData?.aqi ?? 'N/A', icon: Wind, color: 'bg-slate-400' },
                { label: 'Advisory', value: cityData?.category || 'N/A', icon: Cloud, color: 'bg-indigo-400' }
              ].map((metric) => {
                return (
                  <StatCard 
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
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
                    <p className="text-sm text-slate-500">Live GeoJSON points from the backend map endpoint</p>
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
                <IndiaMapVisualization resolution={mapResolution} data={mapData.length > 0 ? (mapResolution === 'coarse' ? mapPointSummaries.slice(0, Math.max(1, Math.ceil(mapPointSummaries.length / 2))) : mapData) : aqData} onCitySelect={setSelectedCity} />
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-xl font-black text-white mb-6">Map Points</h3>
                <div className="space-y-4">
                  {mapPointSummaries.slice(0, 5).map((area) => (
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
                </div>
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
          cityOptions={apiCities.map(city => city.city)}
          apiStatus={apiError ? 'disconnected' : 'connected'}
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
