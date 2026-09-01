import mongoose from "mongoose";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

import {
  authenticateSocket,
} from "../middleware/socketAuthMiddleware.js";

import {
  canAccessConversation,
} from "../utils/conversationAccess.js";

import {
  serializeMessage,
} from "../utils/serializeMessage.js";

import {
  createPresenceStore,
} from "./presenceStore.js";

import {
  createTypingStore,
} from "./typingStore.js";

import {
  markMessageDelivered,
  markMessageRead,
} from "../services/conversationStateService.js";

import {
  serializeConversationState,
} from "../utils/serializeConversationState.js";

function getSocketRoomName(
  conversationId
) {
  return `conversation:${conversationId}`;
}

function getActiveSocketRoomName(
  conversationId
) {
  return `active-conversation:${conversationId}`;
}

function sendAcknowledgement(
  acknowledge,
  data
) {
  if (
    typeof acknowledge === "function"
  ) {
    acknowledge(data);
  }
}

function validateMessagePayload(
  payload
) {
  const conversationId =
    typeof payload.conversationId ===
      "string"
      ? payload.conversationId.trim()
      : "";

  const clientMessageId =
    typeof payload.clientMessageId ===
      "string"
      ? payload.clientMessageId.trim()
      : "";

  const content =
    typeof payload.content === "string"
      ? payload.content.trim()
      : "";

  if (
    !conversationId ||
    !mongoose.isValidObjectId(
      conversationId
    )
  ) {
    return {
      success: false,
      message:
        "Invalid conversation ID",
    };
  }

  if (!clientMessageId) {
    return {
      success: false,
      message:
        "Client message ID is required",
    };
  }

  if (
    clientMessageId.length < 10 ||
    clientMessageId.length > 100
  ) {
    return {
      success: false,
      message:
        "Invalid client message ID",
    };
  }

  if (!content) {
    return {
      success: false,
      message:
        "Message cannot be empty",
    };
  }

  if (content.length > 4000) {
    return {
      success: false,
      message:
        "Message cannot exceed 4000 characters",
    };
  }

  return {
    success: true,
    conversationId,
    clientMessageId,
    content,
  };
}

async function getExistingMessage({
  senderId,
  clientMessageId,
}) {
  return Message.findOne({
    sender: senderId,
    clientMessageId,
  }).populate(
    "sender",
    "_id name username"
  );
}

function handleExistingMessage({
  existingMessage,
  conversationId,
  content,
  acknowledge,
}) {
  const existingConversationId =
    existingMessage.conversation.toString();

  if (
    existingConversationId !==
    conversationId ||
    existingMessage.content !== content
  ) {
    sendAcknowledgement(
      acknowledge,
      {
        success: false,
        code:
          "CLIENT_MESSAGE_ID_REUSE",

        message:
          "This client message ID has already been used for another message",
      }
    );

    return;
  }

  console.log(
    `Duplicate message safely ignored: ${existingMessage.clientMessageId}`
  );

  sendAcknowledgement(
    acknowledge,
    {
      success: true,
      duplicate: true,
      message:
        serializeMessage(
          existingMessage
        ),
    }
  );
}

async function resolveReceiptTarget(
  socket,
  payload
) {
  const {
    conversationId,
    messageId,
  } = payload;

  if (
    !conversationId ||
    !messageId ||
    !mongoose.isValidObjectId(
      conversationId
    ) ||
    !mongoose.isValidObjectId(
      messageId
    )
  ) {
    return {
      success: false,
      message:
        "Invalid receipt payload",
    };
  }

  const message =
    await Message.findOne({
      _id: messageId,
      conversation:
        conversationId,
    });

  if (!message) {
    return {
      success: false,
      message:
        "Message not found",
    };
  }

  const conversation =
    await Conversation.findById(
      conversationId
    );

  if (
    !conversation ||
    !canAccessConversation(
      conversation,
      socket.user.id
    )
  ) {
    return {
      success: false,
      message:
        "Conversation access denied",
    };
  }

  return {
    success: true,
    messageDocument: message,
  };
}

export function registerSocketHandlers(
  io
) {
  const presenceStore =
    createPresenceStore();

  const typingStore =
    createTypingStore();

  io.use(authenticateSocket);

  function sendTypingStart(
    socket,
    conversationId
  ) {
    typingStore.startTyping(
      conversationId,
      socket.user.id,
      socket.id
    );

    socket
      .to(
        getActiveSocketRoomName(
          conversationId
        )
      )
      .volatile.emit(
        "typing:update",
        {
          conversationId,

          user: {
            id: socket.user.id,
            name: socket.user.name,
            username:
              socket.user.username,
          },

          isTyping: true,
        }
      );
  }

  function sendTypingStop(
    socket,
    conversationId
  ) {
    const result =
      typingStore.stopTyping(
        conversationId,
        socket.user.id,
        socket.id
      );

    if (!result.becameStopped) {
      return;
    }

    socket
      .to(
        getActiveSocketRoomName(
          conversationId
        )
      )
      .emit(
        "typing:update",
        {
          conversationId,

          user: {
            id: socket.user.id,
            name: socket.user.name,
            username:
              socket.user.username,
          },

          isTyping: false,
        }
      );
  }

  io.on("connection", async (socket) => {
    socket.on(
      "conversation:subscribe",
      async (
        payload = {},
        acknowledge
      ) => {
        try {
          const {
            conversationId,
          } = payload;

          if (
            !conversationId ||
            !mongoose.isValidObjectId(
              conversationId
            )
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "Invalid conversation ID",
              }
            );
          }

          const conversation =
            await Conversation.findById(
              conversationId
            );

          if (!conversation) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "Conversation not found",
              }
            );
          }

          if (
            !canAccessConversation(
              conversation,
              socket.user.id
            )
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "You do not have access to this conversation",
              }
            );
          }

          socket.join(
            getSocketRoomName(
              conversationId
            )
          );

          return sendAcknowledgement(
            acknowledge,
            {
              success: true,
              conversationId,
            }
          );
        } catch (error) {
          console.error(
            "Conversation subscription failed:",
            error.message
          );

          return sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "Unable to subscribe to conversation",
            }
          );
        }
      }
    );

    socket.on("conversation:delivered",
      async (
        payload = {},
        acknowledge
      ) => {
        try {
          const {
            conversationId,
            messageId,
          } = payload;

          const target =
            await resolveReceiptTarget(
              socket,
              {
                conversationId,
                messageId,
              }
            );

          if (!target.success) {
            return sendAcknowledgement(
              acknowledge,
              target
            );
          }

          const state =
            await markMessageDelivered({
              conversationId,
              userId:
                socket.user.id,
              messageId:
                target.messageDocument._id,
            });

          const serializedState =
            serializeConversationState(
              state
            );

          const statePayload = {
            ...serializedState,
            receiptType: "delivered",
          };

          /*
           * Synchronize this user's
           * other browser tabs/devices.
           */
          io.to(
            `user:${socket.user.id}`
          ).emit(
            "conversation:state",
            statePayload
          );

          /*
           * Notify everyone subscribed
           * to this conversation.
           */
          io.to(
            getSocketRoomName(
              conversationId
            )
          ).emit(
            "conversation:receipt",
            statePayload
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: true,
              state: statePayload,
            }
          );
        } catch (error) {
          console.error(
            "Delivery receipt failed:",
            error
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "Unable to record delivery",
            }
          );
        }
      }
    );

    socket.on("conversation:read",
      async (
        payload = {},
        acknowledge
      ) => {
        try {
          const {
            conversationId,
            messageId,
          } = payload;

          const target =
            await resolveReceiptTarget(
              socket,
              {
                conversationId,
                messageId,
              }
            );

          if (!target.success) {
            return sendAcknowledgement(
              acknowledge,
              target
            );
          }

          const state =
            await markMessageRead({
              conversationId,
              userId:
                socket.user.id,
              messageId:
                target.messageDocument._id,
            });

          const serializedState =
            serializeConversationState(
              state
            );

          const statePayload = {
            ...serializedState,
            receiptType: "delivered",
          };

          io.to(
            `user:${socket.user.id}`
          ).emit(
            "conversation:state",
            statePayload
          );

          io.to(
            getSocketRoomName(
              conversationId
            )
          ).emit(
            "conversation:receipt",
            statePayload
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: true,
              state: statePayload,
            }
          );
        } catch (error) {
          console.error(
            "Read receipt failed:",
            error
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "Unable to mark conversation as read",
            }
          );
        }
      }
    );

    console.log(
      `Authenticated socket connected: ${socket.user.username} (${socket.id})`
    );

    socket.join(`user:${socket.user.id}`);

    const accessibleConversations = await Conversation.find({
      $or: [
        {
          type: "room",
          isPublic: true,
        },
        {
          participants:
            socket.user.id,
        },
      ],
    }).select("_id name");

    for (
      const conversation of
      accessibleConversations
    ) {
      socket.join(
        getSocketRoomName(
          conversation._id.toString()
        )
      );
    }

    console.log(
      `${socket.user.username} subscribed to ${accessibleConversations.length} conversations`
    );

    const presenceResult =
      presenceStore.addConnection(
        socket.user.id,
        socket.id
      );

    socket.emit(
      "presence:snapshot",
      {
        userIds:
          presenceStore.getOnlineUserIds(),
      }
    );

    if (
      presenceResult.becameOnline
    ) {
      io.emit(
        "presence:update",
        {
          userId: socket.user.id,
          isOnline: true,
        }
      );

      console.log(
        `${socket.user.username} is online`
      );
    }

    socket.emit(
      "connection:ready",
      {
        socketId: socket.id,
        user: socket.user,
        message:
          "Authenticated socket connection established",
      }
    );

    socket.on("conversation:join",
      async (
        payload = {},
        acknowledge
      ) => {
        try {
          const {
            conversationId,
          } = payload;

          if (
            !conversationId ||
            !mongoose.isValidObjectId(
              conversationId
            )
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "Invalid conversation ID",
              }
            );
          }

          const conversation =
            await Conversation.findById(
              conversationId
            );

          if (!conversation) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "Conversation not found",
              }
            );
          }

          if (
            !canAccessConversation(
              conversation,
              socket.user.id
            )
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "You do not have access to this conversation",
              }
            );
          }

          if (
            socket.activeConversationId &&
            socket.activeConversationId !==
            conversationId
          ) {
            const previousConversationId =
              socket.activeConversationId;

            sendTypingStop(
              socket,
              previousConversationId
            );

            socket.leave(
              getActiveSocketRoomName(
                previousConversationId
              )
            );
          }

          socket.join(
            getSocketRoomName(
              conversationId
            )
          );

          socket.join(
            getActiveSocketRoomName(
              conversationId
            )
          );

          socket.activeConversationId =
            conversationId;

          console.log(
            `${socket.user.username} joined ${conversation.name}`
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: true,
              conversationId,
              message:
                `Joined ${conversation.name}`,
            }
          );
        } catch (error) {
          console.error(
            "Conversation join failed:",
            error.message
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "Unable to join conversation",
            }
          );
        }
      }
    );

    socket.on("conversation:leave",
      (
        payload = {},
        acknowledge
      ) => {
        const conversationId =
          payload.conversationId ||
          socket.activeConversationId;

        if (!conversationId) {
          return sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "No active conversation",
            }
          );
        }

        sendTypingStop(
          socket,
          conversationId
        );

        socket.leave(
          getActiveSocketRoomName(
            conversationId
          )
        );

        if (
          socket.activeConversationId ===
          conversationId
        ) {
          socket.activeConversationId =
            null;
        }

        sendAcknowledgement(
          acknowledge,
          {
            success: true,
            conversationId,
          }
        );
      }
    );

    socket.on("message:send",
      async (
        payload = {},
        acknowledge
      ) => {
        const validatedPayload =
          validateMessagePayload(
            payload
          );

        if (
          !validatedPayload.success
        ) {
          return sendAcknowledgement(
            acknowledge,
            validatedPayload
          );
        }

        const {
          conversationId,
          clientMessageId,
          content,
        } = validatedPayload;

        try {
          /*
           * The user must first have
           * successfully joined this
           * conversation.
           */
          if (
            socket.activeConversationId !==
            conversationId
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                code:
                  "CONVERSATION_NOT_JOINED",
                message:
                  "Join the conversation before sending messages",
              }
            );
          }

          /*
           * Authorization is checked
           * again when sending.
           *
           * Never trust a previous
           * authorization forever.
           */
          const conversation =
            await Conversation.findById(
              conversationId
            );

          if (!conversation) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "Conversation not found",
              }
            );
          }

          if (
            !canAccessConversation(
              conversation,
              socket.user.id
            )
          ) {
            return sendAcknowledgement(
              acknowledge,
              {
                success: false,
                message:
                  "You do not have access to this conversation",
              }
            );
          }

          /*
           * Fast duplicate check.
           */
          const existingMessage =
            await getExistingMessage({
              senderId:
                socket.user.id,
              clientMessageId,
            });

          if (existingMessage) {
            return handleExistingMessage({
              existingMessage,
              conversationId,
              content,
              acknowledge,
            });
          }

          let message;

          try {
            message =
              await Message.create({
                conversation:
                  conversationId,

                sender:
                  socket.user.id,

                content,

                clientMessageId,
              });
          } catch (databaseError) {
            /*
             * Handles a race where two
             * identical requests arrive
             * before either initial
             * duplicate lookup finishes.
             */
            if (
              databaseError.code ===
              11000
            ) {
              const duplicateMessage =
                await getExistingMessage(
                  {
                    senderId:
                      socket.user.id,

                    clientMessageId,
                  }
                );

              if (
                duplicateMessage
              ) {
                return handleExistingMessage(
                  {
                    existingMessage:
                      duplicateMessage,

                    conversationId,
                    content,
                    acknowledge,
                  }
                );
              }
            }

            throw databaseError;
          }

          await message.populate(
            "sender",
            "_id name username"
          );

          await Conversation.findByIdAndUpdate(
            conversationId,
            {
              $set: {
                lastMessage:
                  message._id,

                lastActivityAt:
                  message.createdAt,
              },
            }
          );

          const serializedMessage =
            serializeMessage(message);

          /*
           * Save succeeded.
           * NOW broadcast.
           */
          io.to(
            getSocketRoomName(
              conversationId
            )
          ).emit(
            "message:new",
            serializedMessage
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: true,
              duplicate: false,
              message:
                serializedMessage,
            }
          );
        } catch (error) {
          console.error(
            "Message send failed:",
            error
          );

          sendAcknowledgement(
            acknowledge,
            {
              success: false,
              message:
                "Unable to send message",
            }
          );
        }
      }
    );

    socket.on("disconnecting",
      () => {
        if (
          socket.activeConversationId
        ) {
          sendTypingStop(
            socket,
            socket.activeConversationId
          );
        }
      }
    );

    socket.on("disconnect",
      (reason) => {
        const presenceResult =
          presenceStore.removeConnection(
            socket.user.id,
            socket.id
          );

        if (
          presenceResult.becameOffline
        ) {
          io.emit(
            "presence:update",
            {
              userId:
                socket.user.id,
              isOnline: false,
            }
          );

          console.log(
            `${socket.user.username} is offline`
          );
        }

        console.log(
          `Socket disconnected: ${socket.user.username}. Reason: ${reason}`
        );
      }
    );

    socket.on("typing:start",
      (payload = {}) => {
        const {
          conversationId,
        } = payload;

        if (
          !conversationId ||
          !mongoose.isValidObjectId(
            conversationId
          )
        ) {
          return;
        }

        if (
          socket.activeConversationId !==
          conversationId
        ) {
          return;
        }

        sendTypingStart(
          socket,
          conversationId
        );
      }
    );

    socket.on("typing:stop",
      (payload = {}) => {
        const {
          conversationId,
        } = payload;

        if (
          !conversationId ||
          !mongoose.isValidObjectId(
            conversationId
          )
        ) {
          return;
        }

        sendTypingStop(
          socket,
          conversationId
        );
      }
    );
  }
  );
}