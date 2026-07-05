import { useEffect, useState } from "react";

import { listTickets, updateTicketStatus } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

const DONE_STATUSES = new Set(["Resolved", "Closed"]);

const formatDeadline = (deadline) =>
  new Date(deadline).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const deadlineInfo = (ticket) => {
  if (!ticket.deadline) return null;

  const due = new Date(ticket.deadline);
  const overdue =
    due < new Date() && !DONE_STATUSES.has(ticket.status);

  return { label: formatDeadline(ticket.deadline), overdue };
};

export default function TicketsPanel() {
  const { user } = useSession();
  const [scope, setScope] = useState("assignedToMe");
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState(null);

  const load = () => {
    listTickets(scope)
      .then(({ data }) => setTickets(data))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const handleStatusChange = async (ticketId, status) => {
    try {
      await updateTicketStatus(ticketId, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="table-panel">
      <div className="table-panel-header">
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="assignedToMe">Assigned to me</option>
          <option value="createdByMe">Sent by me</option>
          {user?.role === "admin" && (
            <option value="all">All tickets</option>
          )}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {tickets.length === 0 ? (
        <div className="table-empty">No tickets yet.</div>
      ) : (
        <div className="cards-scroll">
          <div className="cards-grid">
            {tickets.map((ticket, index) => {
              const due = deadlineInfo(ticket);

              return (
                <div
                  key={ticket._id}
                  className="ticket-card row-animate"
                  style={{ "--row-index": index }}
                >
                  <div className="card-top">
                    <span
                      className={`status-pill status-${ticket.status
                        .toLowerCase()
                        .replace(/\s+/g, "-")}`}
                    >
                      {ticket.status}
                    </span>

                    {due && (
                      <span
                        className={`deadline-chip${
                          due.overdue ? " overdue" : ""
                        }`}
                      >
                        {due.overdue ? "Overdue · " : "Due "}
                        {due.label}
                      </span>
                    )}
                  </div>

                  <div className="card-route">
                    <span className="card-person">
                      {ticket.createdBy}
                    </span>
                    <span className="card-arrow">→</span>
                    <span className="card-person">
                      {ticket.assignedTo}
                    </span>
                  </div>

                  {Object.keys(ticket.fields || {}).length > 0 ? (
                    <dl className="card-fields">
                      {Object.entries(ticket.fields).map(
                        ([key, value]) => (
                          <div className="card-field" key={key}>
                            <dt>{key}</dt>
                            <dd>{String(value)}</dd>
                          </div>
                        )
                      )}
                    </dl>
                  ) : (
                    <p className="card-empty">No fields</p>
                  )}

                  <div className="card-actions">
                    <select
                      value={ticket.status}
                      onChange={(event) =>
                        handleStatusChange(
                          ticket._id,
                          event.target.value
                        )
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
