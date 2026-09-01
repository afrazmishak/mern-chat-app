import "dotenv/config";
import http from "node:http";
import { Server } from "socket.io";

import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { seedDefaultRooms } from "./config/seedDefaultRooms.js";
import { registerSocketHandlers } from "./sockets/socketHandler.js";

const PORT = process.env.PORT || 5000;

function validateEnvironment() {
  const requiredVariables = [
    "MONGODB_URI",
    "JWT_SECRET",
    "CLIENT_URL",
  ];

  const missingVariables = requiredVariables.filter(
    (variableName) => !process.env[variableName]
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing environment variables: ${missingVariables.join(", ")}`
    );
  }
}

async function startServer() {
  validateEnvironment();

  await connectDatabase();
  await seedDefaultRooms();

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },

    connectionStateRecovery: {
      maxDisconnectionDuration:
        2 * 60 * 1000,

      skipMiddlewares: false,
    },
  });

  app.set(
    "io",
    io
  );

  app.set(
    "io",
    io
  );

  registerSocketHandlers(io);

  httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});