import { useEffect, useState } from "react";

import { listTickets, updateTicketStatus } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Fields</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket._id}>
                  <td>{ticket.createdBy}</td>
                  <td>{ticket.assignedTo}</td>
                  <td>
                    {Object.entries(ticket.fields || {})
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    <select
                      value={ticket.status}
                      onChange={(event) =>
                        handleStatusChange(ticket._id, event.target.value)
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
