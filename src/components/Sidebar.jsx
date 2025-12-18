import { X, User, Settings, Phone, LogOut, Activity, Home, Bell, FileText, HelpCircle, Shield, Zap } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { logoutUser } from "../utils/authActions";

function Sidebar({ isOpen, setIsOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { label: "Dashboard", icon: Home, route: "/" },
    { label: "Sensors", icon: Activity, route: "/vibrations" },
    { label: "Notifications", icon: Bell, route: "/notifications" },
    { label: "Tracking", icon: Zap, route: "/tracking" },
  ];

  const settingsItems = [
    { label: "Profile", icon: User, route: "/profile" },
    { label: "Settings", icon: Settings, route: "/settings" },
    { label: "Contacts", icon: Phone, route: "/contacts" },
  ];

  const infoItems = [
    { label: "FAQs", icon: HelpCircle, route: "/faqs" },
    { label: "About", icon: FileText, route: "/about" },
  ];

  const isActive = (path) => location.pathname === path;

  const MenuItem = ({ item }) => (
    <button
      onClick={() => { navigate(item.route); setIsOpen(false); }}
      className={`w-full flex items-center gap-4 p-3 rounded-lg text-left transition-all group ${isActive(item.route)
          ? 'bg-cyan-500/20 border border-cyan-500/30'
          : 'hover:bg-slate-800 border border-transparent'
        }`}
    >
      <item.icon className={`w-5 ${isActive(item.route) ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
      <span className={`text-sm font-medium tracking-wide ${isActive(item.route) ? 'text-cyan-400' : 'text-slate-300 group-hover:text-white'}`}>
        {item.label}
      </span>
    </button>
  );

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div
        className={`fixed top-0 left-0 w-80 h-full bg-[#0a0a0f] border-r border-slate-800 z-50 transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="text-white font-bold tracking-wide">SYNAPSENSE</div>
              <div className="text-[10px] text-slate-500 tracking-[0.2em]">CONTROL PANEL</div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-white" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-slate-950" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{user.displayName || "User"}</p>
                <p className="text-slate-500 text-xs truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Menu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Main Navigation */}
          <div>
            <div className="text-xs text-slate-600 tracking-[0.2em] px-3 mb-2">NAVIGATION</div>
            <div className="space-y-1">
              {menuItems.map((item, idx) => <MenuItem key={idx} item={item} />)}
            </div>
          </div>

          {/* Settings */}
          <div>
            <div className="text-xs text-slate-600 tracking-[0.2em] px-3 mb-2">ACCOUNT</div>
            <div className="space-y-1">
              {settingsItems.map((item, idx) => <MenuItem key={idx} item={item} />)}
            </div>
          </div>

          {/* Info */}
          <div>
            <div className="text-xs text-slate-600 tracking-[0.2em] px-3 mb-2">INFORMATION</div>
            <div className="space-y-1">
              {infoItems.map((item, idx) => <MenuItem key={idx} item={item} />)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => logoutUser(navigate)}
            className="w-full flex items-center justify-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all"
          >
            <LogOut className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-medium text-sm tracking-wide">SIGN OUT</span>
          </button>

          {/* Version */}
          <div className="mt-4 text-center">
            <div className="text-[10px] text-slate-600 tracking-[0.3em]">VERSION 2.0.0</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
