import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  login as loginRequest,
  setAuthToken,
  setUnauthorizedHandler,
} from "../api/client.js";

const SessionContext = createContext(null);

const SESSION_STORAGE_KEY = "cdm_session_id";
const TOKEN_STORAGE_KEY = "cdm_token";

const getOrCreateSessionId = () => {
  const existing = sessionStorage.getItem(
    SESSION_STORAGE_KEY
  );

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_STORAGE_KEY, id);

  return id;
};

const decodeUserFromToken = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
};

export function SessionProvider({ children }) {
  const [sessionId] = useState(getOrCreateSessionId);
  const [activeTable, setActiveTable] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [token, setToken] = useState(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );

  const [user, setUser] = useState(() => {
    const existing = localStorage.getItem(TOKEN_STORAGE_KEY);
    return existing ? decodeUserFromToken(existing) : null;
  });

  // Keep the module-level auth token in sync. Called inline (not just in
  // an effect) so it's set before any child's mount-time API calls fire -
  // effects run child-before-parent, so a parent-only effect would race.
  setAuthToken(token);

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, []);

  const login = async (email, password) => {
    const { data } = await loginRequest(email, password);

    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const notifyTableChanged = (tableName) => {
    if (tableName) {
      setActiveTable(tableName);
    }

    setRefreshVersion((version) => version + 1);
  };

  const value = useMemo(
    () => ({
      sessionId,
      activeTable,
      setActiveTable,
      refreshVersion,
      notifyTableChanged,
      user,
      login,
      logout,
    }),
    [sessionId, activeTable, refreshVersion, user]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
