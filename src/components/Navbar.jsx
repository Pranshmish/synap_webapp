import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, LogOut, Activity, Bell, Settings, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logoutUser } from '../utils/authActions';
import { useState } from 'react';

function Navbar({ darkMode, setDarkMode, setSidebarOpen }) {
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Dashboard", icon: "◈" },
    { path: "/vibrations", label: "Sensors", icon: "◉" },
    { path: "/notifications", label: "Alerts", icon: "◎" },
    { path: "/tracking", label: "Tracking", icon: "◇" },
  ];

  return (
    <nav className="nav-tech sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex justify-between items-center h-16">

          {/* LEFT - Logo & Menu */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5"
            >
              <Menu className="w-5 h-5 text-slate-400" />
            </button>

            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-black" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-slate-950 animate-pulse" />
              </div>
              <div>
                <span className="text-xl font-bold text-gradient tracking-tight">SYNAPSENSE</span>
                <div className="text-[9px] text-slate-500 tracking-[0.3em] -mt-1">SECURITY PLATFORM</div>
              </div>
            </Link>
          </div>

          {/* CENTER - Navigation */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-lg border border-slate-800">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-md text-xs font-medium tracking-wider transition-all flex items-center gap-2 ${isActive(item.path)
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
              >
                <span className="text-sm opacity-60">{item.icon}</span>
                {item.label.toUpperCase()}
              </Link>
            ))}
          </div>

          {/* RIGHT - Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-4 mr-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="status-dot online" />
                <span className="text-slate-400">SYSTEM ACTIVE</span>
              </div>
            </div>

            {/* Notifications */}
            <button className="relative p-2 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5">
              <Bell className="w-5 h-5 text-slate-400" />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">3</div>
            </button>

            {/* Settings */}
            <Link to="/settings" className="p-2 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5">
              <Settings className="w-5 h-5 text-slate-400" />
            </Link>

            {/* User Profile */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 py-1 pl-1 pr-3 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5"
                >
                  <div className="w-8 h-8 rounded-md bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover rounded-md" />
                    ) : (
                      <User className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-medium text-slate-200">{user.displayName?.split(' ')[0] || 'User'}</div>
                    <div className="text-[10px] text-slate-500">OPERATOR</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                </button>

                {/* Dropdown */}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-64 card-tech p-2 animate-fadeIn z-50">
                    <div className="px-3 py-3 border-b border-slate-800">
                      <div className="text-xs text-slate-500 tracking-wider mb-1">SIGNED IN AS</div>
                      <div className="text-sm font-medium text-white">{user.displayName || "User"}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </div>

                    <div className="py-2 space-y-1">
                      <Link to="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Profile Settings</span>
                      </Link>
                      <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">System Settings</span>
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <button
                        onClick={() => { logoutUser(navigate); setMenuOpen(false); }}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all group"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
