import { createContext, useContext, useEffect, useState } from "react";
// ⚠️ FIREBASE DISABLED FOR TESTING - Uncomment lines below to re-enable
// import { onAuthStateChanged } from "firebase/auth";
// import { auth } from "../firebase";

const AuthContext = createContext(null);

// Mock user for testing (bypasses Firebase auth)
const MOCK_USER = {
  uid: "test-user-123",
  email: "test@synapsense.com",
  displayName: "Test User",
  photoURL: null,
};

// Set to false to re-enable Firebase auth
const DISABLE_FIREBASE_AUTH = true;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DISABLE_FIREBASE_AUTH ? MOCK_USER : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (DISABLE_FIREBASE_AUTH) {
      // Skip Firebase auth, use mock user
      setUser(MOCK_USER);
      setLoading(false);
      return;
    }

    // ⚠️ FIREBASE DISABLED - Uncomment below to re-enable
    // const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    //   setUser(currentUser);
    //   setLoading(false);
    // });
    // return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
