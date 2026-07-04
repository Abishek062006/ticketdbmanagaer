import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import healthRoutes from "./routes/healthRoutes.js";
import tableRoutes from "./routes/tableRoutes.js";
import recordRoutes from "./routes/recordRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  authenticate,
  requireCurrentAllowedTables,
} from "./middleware/auth.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/health", healthRoutes);

// Public - the only unauthenticated route.
app.use("/api/auth", authRoutes);

// Everything below requires a valid JWT. requireCurrentAllowedTables
// re-reads the caller's fresh allowedTables/allowedAssignees from their
// employees row on every request (never trusted from the JWT itself),
// so a revoked employee loses access on their very next request.
app.use(authenticate);
app.use(requireCurrentAllowedTables);

// tableRoutes and recordRoutes are both mounted on "/api/tables" - this
// is safe because their sub-paths never collide (tableRoutes only ever
// matches "/", "/:tableName", "/:tableName/rename", "/import-csv";
// recordRoutes only ever matches "/:tableName/records..."), but keep
// this comment here since it's an easy landmine for a future overlapping
// route to silently shadow the other by registration order.
app.use("/api/tables", tableRoutes);
app.use("/api/tables", recordRoutes);

app.use("/api/chat", conversationRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/employees", employeeRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;