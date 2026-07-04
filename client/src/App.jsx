import { useState } from "react";

import { SessionProvider, useSession } from "./context/SessionContext.jsx";
import ChatPanel from "./components/ChatPanel/ChatPanel.jsx";
import TablePanel from "./components/TablePanel/TablePanel.jsx";
import TicketsPanel from "./components/TicketsPanel/TicketsPanel.jsx";
import LoginView from "./components/Auth/LoginView.jsx";
import "./App.css";

function AuthenticatedShell() {
  const { user, logout } = useSession();
  const [viewMode, setViewMode] = useState("chat");

  return (
    <div className="app-shell-wrapper">
      <div className="app-header">
        <div className="view-tabs">
          <button
            className={`btn btn-secondary${viewMode === "chat" ? " active" : ""}`}
            onClick={() => setViewMode("chat")}
          >
            Chat &amp; Tables
          </button>

          <button
            className={`btn btn-secondary${viewMode === "tickets" ? " active" : ""}`}
            onClick={() => setViewMode("tickets")}
          >
            Tickets
          </button>
        </div>

        <span>
          {user.email} ({user.role})
        </span>

        <button className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </div>

      {viewMode === "chat" ? (
        <div className="app-shell">
          <ChatPanel />
          <TablePanel />
        </div>
      ) : (
        <div className="app-shell">
          <TicketsPanel />
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { user } = useSession();

  return user ? <AuthenticatedShell /> : <LoginView />;
}

function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

export default App;
