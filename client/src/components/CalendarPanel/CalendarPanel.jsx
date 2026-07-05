import { useEffect, useMemo, useState } from "react";

import { listTickets, listMeetings } from "../../api/client.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DONE_STATUSES = new Set(["Resolved", "Closed"]);

const dayKey = (date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function CalendarPanel() {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [tickets, setTickets] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Both perspectives matter: deadlines you assigned (sent) and
    // deadlines assigned to you (received).
    Promise.all([
      listTickets("assignedToMe"),
      listTickets("createdByMe"),
      listMeetings(),
    ])
      .then(([assigned, created, meetingsRes]) => {
        const byId = new Map();

        for (const ticket of [...assigned.data, ...created.data]) {
          byId.set(ticket._id, ticket);
        }

        setTickets([...byId.values()]);
        setMeetings(meetingsRes.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const itemsByDay = useMemo(() => {
    const map = new Map();

    const push = (date, item) => {
      const key = dayKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    };

    for (const ticket of tickets) {
      if (!ticket.deadline) continue;

      const due = new Date(ticket.deadline);

      push(due, {
        kind: "ticket",
        overdue:
          due < new Date() && !DONE_STATUSES.has(ticket.status),
        label:
          Object.values(ticket.fields || {})[0] ||
          `Ticket for ${ticket.assignedTo}`,
        title: `${ticket.createdBy} → ${ticket.assignedTo} (${ticket.status})`,
      });
    }

    for (const meeting of meetings) {
      const when = new Date(meeting.scheduledFor);

      push(when, {
        kind: "meeting",
        label: `${when.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })} ${meeting.title}`,
        title: `Organized by ${meeting.organizer} · ${meeting.attendees.join(
          ", "
        )}`,
      });
    }

    return map;
  }, [tickets, meetings]);

  const cells = useMemo(() => {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = monthStart.getDay();

    const result = [];

    for (let i = 0; i < leadingBlanks; i++) {
      result.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(year, month, day));
    }

    return result;
  }, [monthStart]);

  const todayKey = dayKey(new Date());

  const shiftMonth = (delta) => {
    setMonthStart(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  };

  return (
    <div className="table-panel calendar-panel">
      <div className="table-panel-header calendar-header">
        <h2 className="calendar-title">
          {monthStart.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>

        <div className="calendar-nav">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => shiftMonth(-1)}
          >
            ‹
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setMonthStart(() => {
                const now = new Date();
                return new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  1
                );
              })
            }
          >
            Today
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => shiftMonth(1)}
          >
            ›
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="calendar-scroll">
        <div className="calendar-grid calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((date, index) => {
            if (!date) {
              return (
                <div
                  key={`blank-${index}`}
                  className="calendar-cell blank"
                />
              );
            }

            const key = dayKey(date);
            const items = itemsByDay.get(key) || [];

            return (
              <div
                key={key}
                className={`calendar-cell${
                  key === todayKey ? " today" : ""
                }`}
              >
                <span className="calendar-day-number">
                  {date.getDate()}
                </span>

                <div className="calendar-items">
                  {items.map((item, itemIndex) => (
                    <span
                      key={itemIndex}
                      className={`calendar-chip ${item.kind}${
                        item.overdue ? " overdue" : ""
                      }`}
                      title={item.title}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-legend">
        <span className="calendar-chip ticket">Ticket deadline</span>
        <span className="calendar-chip ticket overdue">Overdue</span>
        <span className="calendar-chip meeting">Meeting</span>
      </div>
    </div>
  );
}
