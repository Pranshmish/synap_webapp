import { useState } from "react";
import { Settings as SettingsIcon, Bell, Shield, Wifi, Volume2, Moon, Zap, Save, RotateCcw } from "lucide-react";

function Settings() {
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    darkMode: true,
    autoConnect: true,
    strictMode: false,
    sensitivity: 75,
  });

  const ToggleSwitch = ({ enabled, onChange }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-12 h-6 rounded-full relative transition-all ${enabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  const SettingItem = ({ icon: Icon, title, desc, children }) => (
    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-medium">{title}</h3>
          <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] grid-bg noise-bg">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <SettingsIcon className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">System Settings</h1>
            <p className="text-slate-500 text-sm">Configure your security preferences</p>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="card-tech p-6 mb-6">
          <h2 className="text-white font-medium mb-4 tracking-wide flex items-center gap-2">
            <Bell className="w-4 h-4 text-cyan-400" />
            Notifications
          </h2>
          <div className="space-y-3">
            <SettingItem icon={Bell} title="Push Notifications" desc="Receive alerts on your device">
              <ToggleSwitch enabled={settings.notifications} onChange={(v) => setSettings({ ...settings, notifications: v })} />
            </SettingItem>
            <SettingItem icon={Volume2} title="Sound Alerts" desc="Play audio for critical events">
              <ToggleSwitch enabled={settings.soundAlerts} onChange={(v) => setSettings({ ...settings, soundAlerts: v })} />
            </SettingItem>
          </div>
        </div>

        {/* Security Settings */}
        <div className="card-tech p-6 mb-6">
          <h2 className="text-white font-medium mb-4 tracking-wide flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            Security
          </h2>
          <div className="space-y-3">
            <SettingItem icon={Shield} title="Strict Voice Mode" desc="Require voice verification for all commands">
              <ToggleSwitch enabled={settings.strictMode} onChange={(v) => setSettings({ ...settings, strictMode: v })} />
            </SettingItem>
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Detection Sensitivity</h3>
                    <p className="text-slate-500 text-xs">Adjust sensor threshold</p>
                  </div>
                </div>
                <span className="text-cyan-400 font-mono">{settings.sensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.sensitivity}
                onChange={(e) => setSettings({ ...settings, sensitivity: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* System Settings */}
        <div className="card-tech p-6 mb-6">
          <h2 className="text-white font-medium mb-4 tracking-wide flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" />
            System
          </h2>
          <div className="space-y-3">
            <SettingItem icon={Moon} title="Dark Mode" desc="Use dark interface theme">
              <ToggleSwitch enabled={settings.darkMode} onChange={(v) => setSettings({ ...settings, darkMode: v })} />
            </SettingItem>
            <SettingItem icon={Wifi} title="Auto Connect" desc="Automatically connect to sensors">
              <ToggleSwitch enabled={settings.autoConnect} onChange={(v) => setSettings({ ...settings, autoConnect: v })} />
            </SettingItem>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button className="btn-solid flex-1 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            Save Changes
          </button>
          <button className="btn-tech flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        {/* Version Info */}
        <div className="mt-8 text-center text-xs text-slate-600">
          <div className="mb-1">SynapSense Security Platform v2.0.0</div>
          <div>© 2024 All rights reserved</div>
        </div>

      </div>
    </div>
  );
}

export default Settings;
