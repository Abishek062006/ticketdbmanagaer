import { useEffect, useState } from "react";

import { listMeetings } from "../../api/client.js";
import { useSession } from "../../context/SessionContext.jsx";

const formatWhen = (value) =>
  new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function MeetingsPanel() {
  const { user } = useSession();
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    listMeetings()
      .then(({ data }) => setMeetings(data))
      .catch((err) => setError(err.message));
  }, []);

  const now = new Date();

  const upcoming = meetings.filter(
    (meeting) => new Date(meeting.scheduledFor) >= now
  );

  const past = meetings.filter(
    (meeting) => new Date(meeting.scheduledFor) < now
  );

  const renderCard = (meeting, index) => {
    const isOrganizer = meeting.organizer === user?.email;

    return (
      <div
        key={meeting._id}
        className={`meeting-card row-animate${
          new Date(meeting.scheduledFor) < now ? " past" : ""
        }`}
        style={{ "--row-index": index }}
      >
        <div className="card-top">
          <span className="meeting-when">
            {formatWhen(meeting.scheduledFor)}
          </span>

          {meeting.meetCode && (
            <a
              className="meet-code-chip"
              href={`https://meet.google.com/${meeting.meetCode}`}
              target="_blank"
              rel="noreferrer"
            >
              meet.google.com/{meeting.meetCode}
            </a>
          )}
        </div>

        <h3 className="meeting-title">{meeting.title}</h3>

        <p className="meeting-organizer">
          Organized by{" "}
          <strong>
            {isOrganizer ? "you" : meeting.organizer}
          </strong>
        </p>

        <div className="attendee-chips">
          {meeting.attendees.map((attendee) => (
            <span key={attendee} className="attendee-chip">
              {attendee === user?.email ? "you" : attendee}
            </span>
          ))}
        </div>

        <div className="card-actions meeting-actions">
          {isOrganizer ? (
            <>
              <a
                className="btn btn-primary meeting-link"
                href={meeting.meetLink}
                target="_blank"
                rel="noreferrer"
              >
                Start Google Meet
              </a>

              {!meeting.meetCode && (
                <span className="meeting-hint">
                  Then paste the link to the chat: &quot;share
                  https://meet.google.com/... for {meeting.title}
                  &quot;
                </span>
              )}
            </>
          ) : meeting.meetCode ? (
            <a
              className="btn btn-primary meeting-link"
              href={`https://meet.google.com/${meeting.meetCode}`}
              target="_blank"
              rel="noreferrer"
            >
              Join meeting
            </a>
          ) : (
            <span className="meeting-hint">
              Waiting for the organizer to share the join code
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="table-panel">
      <div className="table-panel-header">
        <h2 className="panel-title">Meetings</h2>
      </div>

      {error && <p className="form-error">{error}</p>}

      {meetings.length === 0 ? (
        <div className="table-empty">
          No meetings yet. Ask the chat to schedule one - e.g.
          &quot;schedule a google meet with @ravi tomorrow at 3pm&quot;.
        </div>
      ) : (
        <div className="cards-scroll">
          {upcoming.length > 0 && (
            <>
              <h3 className="cards-section-title">Upcoming</h3>
              <div className="cards-grid">
                {upcoming.map(renderCard)}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <h3 className="cards-section-title">Past</h3>
              <div className="cards-grid">
                {past.map(renderCard)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
