import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    organizer: { type: String, required: true },
    attendees: { type: [String], required: true },

    title: { type: String, default: "Meeting" },

    scheduledFor: { type: Date, required: true },

    // Without Google API credentials the app can't mint a real
    // pre-created Meet room; this link opens Google Meet ready to
    // start the call. Kept as data so a real Calendar-API link can
    // replace it later without a schema change.
    meetLink: {
      type: String,
      default: "https://meet.google.com/new",
    },

    // The real room code (e.g. "abc-defg-hij"), shared by the
    // organizer AFTER starting the meet - attendees join with this.
    // null until shared.
    meetCode: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Meeting", meetingSchema);
