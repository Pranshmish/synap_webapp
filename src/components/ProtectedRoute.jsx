// Auth disabled for development - always allow access
const ProtectedRoute = ({ children }) => {
  // Bypass authentication - directly render children
  return children;
};

export default ProtectedRoute;
