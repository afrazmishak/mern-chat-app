import express from "express";

import {
  createDirectConversation,
  createRoom,
  getConversation,
  getConversations,
} from "../controllers/conversationController.js";

import {
  getConversationMessages,
} from "../controllers/messageController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get(
  "/",
  getConversations
);

router.post(
  "/rooms",
  createRoom
);

router.get(
  "/:conversationId/messages",
  getConversationMessages
);

router.get(
  "/:conversationId",
  getConversation
);

router.post(
  "/direct",
  createDirectConversation
);

export default router;