import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    author: String,
    message: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    createdBy: { type: String, required: true },
    assignedTo: { type: String, required: true },
    mentions: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },

    // Fully free-form - whatever the sender named in natural language
    // (e.g. { urgency: "Low", description: "printer not working" }).
    // No standard/default fields are ever added beyond what was said.
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },

    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Ticket", ticketSchema);
