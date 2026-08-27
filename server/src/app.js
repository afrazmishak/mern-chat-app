import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import AppError from "./utils/AppError.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (request, response) => {
  response.status(200).json({
    success: true,
    message: "MERN Chat API is running",
  });
});

app.get("/api/health", (request, response) => {
  response.status(200).json({
    success: true,
    service: "mern-chat-server",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);

app.use("/api/users", userRoutes);

app.use((request, response, next) => {
  next(
    new AppError(
      `Route not found: ${request.method} ${request.originalUrl}`,
      404
    )
  );
});

app.use(errorMiddleware);

export default app;