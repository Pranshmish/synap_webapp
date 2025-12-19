import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";

import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import VoiceAssistant from "./components/VoiceAssistant";

import Home from "./pages/Home";
import Vibrations from "./pages/Vibrations";
import Notifications from "./pages/Notifications";
import FAQs from "./pages/FAQs";
import About from "./pages/About";
import Tracking from "./pages/Tracking";

import Login from "./pages/Login.jsx";
import Signup from "./pages/SignUp.jsx";

import Profile from "./pages/Profile.jsx";
import Settings from "./pages/Setting.jsx";
import ContactsPage from "./pages/Contacts.jsx";

import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth.jsx";

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { user } = useAuth();

  // Dark mode listener
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <Router>
      <div className="min-h-screen transition-colors duration-300">
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

          {/* 🎙️ GLOBAL VOICE ASSISTANT */}
          {user && <VoiceAssistant />}

          {/* Navbar only when logged in */}
          {user && (
            <Navbar
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              setSidebarOpen={setSidebarOpen}
            />
          )}

          {/* Sidebar only when logged in */}
          {user && (
            <Sidebar
              isOpen={sidebarOpen}
              setIsOpen={setSidebarOpen}
              darkMode={darkMode}
            />
          )}

          <Routes>
            {/* -------- PUBLIC ROUTES -------- */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* -------- PROTECTED ROUTES -------- */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home darkMode={darkMode} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vibrations"
              element={
                <ProtectedRoute>
                  <Vibrations darkMode={darkMode} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications darkMode={darkMode} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/faqs"
              element={
                <ProtectedRoute>
                  <FAQs darkMode={darkMode} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/about"
              element={
                <ProtectedRoute>
                  <About darkMode={darkMode} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/tracking"
              element={
                <ProtectedRoute>
                  <Tracking />
                </ProtectedRoute>
              }
            />

            {/* New Sidebar-linked Pages */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/contacts"
              element={
                <ProtectedRoute>
                  <ContactsPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
