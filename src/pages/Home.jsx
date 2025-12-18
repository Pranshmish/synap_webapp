import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { ArrowRight, Activity, Shield, AlertTriangle, Users, Zap, TrendingUp, Clock } from "lucide-react";

function Home() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [liveSignal, setLiveSignal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Time update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket + LocalStorage
  useEffect(() => {
    const stored = localStorage.getItem("synapsense_events");
    if (stored) setEvents(JSON.parse(stored));

    const ws = new WebSocket("ws://192.168.4.1:81");

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        data.timestamp = data.timestamp || new Date().toISOString();
        setEvents(prevEvents => {
          const updated = [...prevEvents, data];
          localStorage.setItem("synapsense_events", JSON.stringify(updated));
          return updated;
        });
        setLiveSignal(true);
        setTimeout(() => setLiveSignal(false), 7000);
      } catch {
        console.log("Invalid ESP32 data:", msg.data);
      }
    };

    return () => ws.close();
  }, []);

  // Analytics
  const today = new Date().toDateString();
  const todayEvents = events.filter(e => new Date(e.timestamp).toDateString() === today);
  const known = todayEvents.filter(e => e.known).length;
  const unknown = todayEvents.length - known;
  const danger = todayEvents.filter(e => e.danger).length;
  const safe = todayEvents.length - danger;
  const alarmCount = todayEvents.filter(e => e.alarm).length;
  const safePercentage = todayEvents.length ? Math.round((safe / todayEvents.length) * 100) : 100;

  // Hourly data
  const hourlyCount = Array(24).fill(0);
  todayEvents.forEach(e => hourlyCount[new Date(e.timestamp).getHours()]++);
  const busiestHour = hourlyCount.indexOf(Math.max(...hourlyCount));

  const hourlyData = hourlyCount.map((count, hour) => ({
    hour: `${hour.toString().padStart(2, '0')}:00`,
    events: count,
  }));

  // Detection data
  const detectionData = [
    { name: "Safe", value: safe, fill: "#10b981" },
    { name: "Danger", value: danger, fill: "#ef4444" },
    { name: "Known", value: known, fill: "#22d3ee" },
    { name: "Unknown", value: unknown, fill: "#a855f7" }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] grid-bg noise-bg">
      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* ═══════════════════════════════════════════════════════════════════════════
            HEADER SECTION
            ═══════════════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Activity className="w-6 h-6 text-black" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Security Dashboard</h1>
                <p className="text-slate-500 text-sm">Real-time monitoring & threat detection</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Time */}
            <div className="card-glass px-4 py-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="font-mono text-lg text-white">
                  {currentTime.toLocaleTimeString('en-US', { hour12: false })}
                </span>
              </div>
            </div>

            {/* System Status */}
            <div className={`card-glass px-4 py-2 flex items-center gap-3 ${liveSignal ? 'animate-border-glow' : ''}`}>
              {liveSignal ? (
                <>
                  <div className="status-dot online" />
                  <span className="text-green-400 font-medium text-sm">RECEIVING DATA</span>
                </>
              ) : (
                <>
                  <div className="status-dot offline" />
                  <span className="text-slate-400 font-medium text-sm">STANDBY</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            STATS GRID
            ═══════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Events */}
          <div className="stat-card cyan">
            <div className="flex items-center justify-between mb-3">
              <Zap className="w-5 h-5 text-cyan-400" />
              <span className="text-xs text-slate-500 font-mono">TODAY</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{todayEvents.length}</div>
            <div className="text-xs text-slate-400">Total Events</div>
          </div>

          {/* Security Score */}
          <div className="stat-card green">
            <div className="flex items-center justify-between mb-3">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-xs text-slate-500 font-mono">SCORE</span>
            </div>
            <div className="text-3xl font-bold text-green-400 mb-1">{safePercentage}%</div>
            <div className="text-xs text-slate-400">Safety Rating</div>
          </div>

          {/* Threats */}
          <div className="stat-card red">
            <div className="flex items-center justify-between mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-xs text-slate-500 font-mono">ALERT</span>
            </div>
            <div className="text-3xl font-bold text-red-400 mb-1">{danger}</div>
            <div className="text-xs text-slate-400">Threat Detected</div>
          </div>

          {/* Known Users */}
          <div className="stat-card purple">
            <div className="flex items-center justify-between mb-3">
              <Users className="w-5 h-5 text-purple-400" />
              <span className="text-xs text-slate-500 font-mono">USERS</span>
            </div>
            <div className="text-3xl font-bold text-purple-400 mb-1">{known}</div>
            <div className="text-xs text-slate-400">Identified</div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            MAIN CONTENT GRID
            ═══════════════════════════════════════════════════════════════════════════ */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">

          {/* Detection Overview Chart */}
          <div className="lg:col-span-2 card-tech p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white tracking-wide">Detection Analysis</h2>
                <p className="text-xs text-slate-500 mt-1">Today's classification breakdown</p>
              </div>
              <button
                onClick={() => navigate("/vibrations")}
                className="btn-tech text-xs flex items-center gap-2"
              >
                View Details <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={detectionData} barSize={60}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 32, 53, 0.5)" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#12131d',
                    border: '1px solid #1e2035',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Actions Panel */}
          <div className="card-tech p-6">
            <h2 className="text-lg font-semibold text-white mb-6 tracking-wide">Quick Actions</h2>

            <div className="space-y-3">
              <button
                onClick={() => navigate("/vibrations")}
                className="w-full p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-all">
                    <Activity className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Live Sensors</div>
                    <div className="text-xs text-slate-500">Monitor vibration data</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate("/notifications")}
                className="w-full p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-all">
                    <AlertTriangle className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Alerts</div>
                    <div className="text-xs text-slate-500">{alarmCount} notifications</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate("/tracking")}
                className="w-full p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-all">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Activity Log</div>
                    <div className="text-xs text-slate-500">Historical data</div>
                  </div>
                </div>
              </button>
            </div>

            {/* Peak Activity */}
            <div className="mt-6 p-4 rounded-lg border border-slate-800 bg-slate-900/30">
              <div className="text-xs text-slate-500 mb-2">PEAK ACTIVITY</div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-xl font-bold text-white font-mono">{busiestHour.toString().padStart(2, '0')}:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            HOURLY ACTIVITY CHART
            ═══════════════════════════════════════════════════════════════════════════ */}
        <div className="card-tech p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-wide">Hourly Activity</h2>
              <p className="text-xs text-slate-500 mt-1">Event distribution over 24 hours</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 32, 53, 0.5)" />
              <XAxis dataKey="hour" stroke="#64748b" fontSize={10} interval={2} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: '#12131d',
                  border: '1px solid #1e2035',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Area type="monotone" dataKey="events" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#colorEvents)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}

export default Home;
