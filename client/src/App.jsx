import { useState } from "react";

import { SessionProvider, useSession } from "./context/SessionContext.jsx";
import ChatPanel from "./components/ChatPanel/ChatPanel.jsx";
import TablePanel from "./components/TablePanel/TablePanel.jsx";
import TicketsPanel from "./components/TicketsPanel/TicketsPanel.jsx";
import MeetingsPanel from "./components/MeetingsPanel/MeetingsPanel.jsx";
import CalendarPanel from "./components/CalendarPanel/CalendarPanel.jsx";
import LoginView from "./components/Auth/LoginView.jsx";
import "./App.css";

function AuthenticatedShell() {
  const { user, logout } = useSession();
  const [viewMode, setViewMode] = useState("chat");

  const initials = user.email
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app-shell-wrapper">
      <div className="app-header">
        <div className="header-left">
          <div className="app-brand">
            <span className="brand-mark">W</span>
            <span className="brand-name">Workspace</span>
          </div>

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

          <button
            className={`btn btn-secondary${viewMode === "meetings" ? " active" : ""}`}
            onClick={() => setViewMode("meetings")}
          >
            Meetings
          </button>

          <button
            className={`btn btn-secondary${viewMode === "calendar" ? " active" : ""}`}
            onClick={() => setViewMode("calendar")}
          >
            Calendar
          </button>
          </div>
        </div>

        <div className="header-right">
          <div className="user-chip" title={user.email}>
            <span className="user-avatar">{initials}</span>
            <span className="user-meta">
              <span className="user-email">{user.email}</span>
              <span className="user-role">{user.role}</span>
            </span>
          </div>

          <button className="btn btn-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      {viewMode === "chat" ? (
        <div className="app-shell">
          <ChatPanel />
          <TablePanel />
        </div>
      ) : (
        <div className="app-shell">
          {viewMode === "tickets" && <TicketsPanel />}
          {viewMode === "meetings" && <MeetingsPanel />}
          {viewMode === "calendar" && <CalendarPanel />}
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
