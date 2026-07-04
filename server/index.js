import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { bootstrapAdmin } from "./services/bootstrapService.js";

const startServer = async () => {
  await connectDB();
  await bootstrapAdmin();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running at http://localhost:${env.PORT}`);
  });
};

startServer();