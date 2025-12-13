import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Menu, Activity, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logoutUser } from '../utils/authActions';
import { useState } from 'react';

function Navbar({ darkMode, setDarkMode, setSidebarOpen }) {
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-lg sticky top-0 z-40 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* LEFT */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            </button>

            <Link to="/" className="flex items-center space-x-2">
              <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-300 dark:to-cyan-300">
                SynapSense
              </span>
            </Link>
          </div>

          {/* CENTER NAV LINKS */}
          <div className="hidden md:flex items-center space-x-2">
            {[
              { path: "/", label: "Home" },
              { path: "/vibrations", label: "Vibrations" },
              { path: "/notifications", label: "Notifications" },
              { path: "/faqs", label: "FAQs" },
              { path: "/about", label: "About" },
              { path: "/tracking", label: "Tracking" },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${isActive(item.path)
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-700" />}
            </button>

            {/* User Profile */}
            {user && (
              <div className="relative">
                <img
                  src={user.photoURL || "/placeholder.jpg"}
                  alt="profile"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-10 h-10 rounded-full cursor-pointer border-2 border-blue-500"
                />

                {/* Dropdown */}
                {menuOpen && (
                  <div className="absolute right-0 mt-3 bg-white dark:bg-gray-700 px-4 py-3 shadow-xl rounded-lg w-52">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{user.displayName || "User"}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>

                    <button
                      onClick={() => logoutUser(navigate)}
                      className="mt-3 flex items-center gap-2 text-sm text-white bg-red-500 hover:bg-red-600 w-full px-3 py-2 rounded-lg"
                    >
                      <LogOut className="w-4" /> Logout
                    </button>
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
