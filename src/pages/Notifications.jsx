import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, Info, CheckCircle, Clock, Volume2, VolumeX, Bell, Shield, Zap } from "lucide-react";

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmMuted, setAlarmMuted] = useState(false);

  const alarmSoundRef = useRef(null);

  useEffect(() => {
    alarmSoundRef.current = new Audio("/race-starts-beeps-125125.mp3");
    alarmSoundRef.current.volume = 1.0;
    alarmSoundRef.current.loop = true;
  }, []);

  useEffect(() => {
    const unlock = () => {
      alarmSoundRef.current.play().catch(() => { });
      alarmSoundRef.current.pause();
      alarmSoundRef.current.currentTime = 0;
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if ("Notification" in window) Notification.requestPermission();
  }, []);

  const handleReceiveNotification = useCallback(
    (payload) => {
      const item = {
        id: Date.now(),
        type: payload.type ?? "info",
        title: payload.title ?? "Notification",
        message: payload.message ?? "Event occurred.",
        timestamp: new Date().toLocaleTimeString(),
        read: false,
      };

      setNotifications((prev) => [item, ...prev]);

      if (item.type === "warning") {
        setAlarmActive(true);
        if (!alarmMuted) {
          alarmSoundRef.current.currentTime = 0;
          alarmSoundRef.current.play().catch(() => { });
        }
      }

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(item.title, { body: item.message });
      }
    },
    [alarmMuted]
  );

  const stopAlarm = () => {
    setAlarmActive(false);
    alarmSoundRef.current.pause();
    alarmSoundRef.current.currentTime = 0;
  };

  const getIcon = (type) => {
    switch (type) {
      case "warning": return <AlertTriangle className="w-5 h-5" />;
      case "success": return <CheckCircle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getColors = (type) => {
    switch (type) {
      case "warning": return { border: "border-red-500/30", icon: "text-red-400", bg: "bg-red-500/10" };
      case "success": return { border: "border-green-500/30", icon: "text-green-400", bg: "bg-green-500/10" };
      default: return { border: "border-cyan-500/30", icon: "text-cyan-400", bg: "bg-cyan-500/10" };
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] grid-bg noise-bg">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        {alarmActive ? (
          <div
            onClick={stopAlarm}
            className="cursor-pointer card-tech p-8 mb-8 border-red-500/50 animate-pulse relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-red-400 tracking-wide">⚠ ALERT ACTIVE</h1>
                  <p className="text-slate-400 text-sm">Click to dismiss warning</p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setAlarmMuted(!alarmMuted); alarmSoundRef.current.pause(); }}
                className="p-3 rounded-lg border border-slate-800 hover:border-red-500/30 transition-all"
              >
                {alarmMuted ? <VolumeX className="w-6 h-6 text-slate-400" /> : <Volume2 className="w-6 h-6 text-red-400" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="card-tech p-8 mb-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <Bell className="w-7 h-7 text-cyan-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-wide">Notification Center</h1>
                  <p className="text-slate-500 text-sm">Real-time security alerts and updates</p>
                </div>
              </div>
              <button
                onClick={() => { setAlarmMuted(!alarmMuted); alarmSoundRef.current.pause(); }}
                className="p-3 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all"
              >
                {alarmMuted ? <VolumeX className="w-6 h-6 text-slate-400" /> : <Volume2 className="w-6 h-6 text-cyan-400" />}
              </button>
            </div>
          </div>
        )}

        {/* Test Button */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => handleReceiveNotification({
              type: "warning", title: "Intrusion Detected", message: "Unknown footstep pattern detected at entrance.",
            })}
            className="btn-tech border-red-500/30 text-red-400 hover:border-red-400"
          >
            Test Warning
          </button>
          <button
            onClick={() => handleReceiveNotification({
              type: "success", title: "User Verified", message: "Known user authenticated successfully.",
            })}
            className="btn-tech border-green-500/30 text-green-400 hover:border-green-400"
          >
            Test Success
          </button>
          <button
            onClick={() => handleReceiveNotification({
              type: "info", title: "System Update", message: "Sensor calibration completed.",
            })}
            className="btn-tech"
          >
            Test Info
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="stat-card cyan">
            <div className="text-2xl font-bold text-white">{notifications.length}</div>
            <div className="text-xs text-slate-500">Total Alerts</div>
          </div>
          <div className="stat-card red">
            <div className="text-2xl font-bold text-red-400">{notifications.filter(n => n.type === "warning").length}</div>
            <div className="text-xs text-slate-500">Warnings</div>
          </div>
          <div className="stat-card green">
            <div className="text-2xl font-bold text-green-400">{notifications.filter(n => n.type === "success").length}</div>
            <div className="text-xs text-slate-500">Verified</div>
          </div>
        </div>

        {/* Notification List */}
        <div className="space-y-3">
          {notifications.length === 0 && (
            <div className="card-tech p-12 text-center">
              <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No notifications yet</p>
              <p className="text-slate-600 text-sm mt-1">Alerts will appear here in real-time</p>
            </div>
          )}

          {notifications.map((n) => {
            const colors = getColors(n.type);
            return (
              <div key={n.id} className={`card-tech p-5 border-l-2 ${colors.border} animate-fadeIn`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${colors.bg} ${colors.icon}`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-white font-medium">{n.title}</h3>
                      <span className="text-slate-500 text-xs flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> {n.timestamp}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">{n.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="card-tech p-6 mt-8">
          <h3 className="text-white font-medium mb-4 tracking-wide">Alert Types</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LegendItem icon={<AlertTriangle className="w-5 h-5 text-red-400" />} title="Warning" desc="Critical security alert" />
            <LegendItem icon={<Info className="w-5 h-5 text-cyan-400" />} title="Information" desc="System update or status" />
            <LegendItem icon={<CheckCircle className="w-5 h-5 text-green-400" />} title="Success" desc="Positive verification" />
          </div>
        </div>

      </div>
    </div>
  );
}

function LegendItem({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">{icon}</div>
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-slate-500 text-xs">{desc}</p>
      </div>
    </div>
  );
}

export default Notifications;