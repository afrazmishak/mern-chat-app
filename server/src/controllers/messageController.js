import mongoose from "mongoose";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

import AppError from "../utils/AppError.js";
import ConversationState from "../models/ConversationState.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { canAccessConversation } from "../utils/conversationAccess.js";
import { serializeMessage } from "../utils/serializeMessage.js";
import { serializeConversationState } from "../utils/serializeConversationState.js";

export const getConversationMessages =
  asyncHandler(
    async (request, response) => {
      const { conversationId } =
        request.params;

      /*
       * Validate conversation ID.
       */
      if (
        !mongoose.isValidObjectId(
          conversationId
        )
      ) {
        throw new AppError(
          "Invalid conversation ID",
          400
        );
      }

      /*
       * Find conversation.
       */
      const conversation =
        await Conversation.findById(
          conversationId
        );

      if (!conversation) {
        throw new AppError(
          "Conversation not found",
          404
        );
      }

      /*
       * Make sure the authenticated
       * user is allowed to access it.
       */
      if (
        !canAccessConversation(
          conversation,
          request.user._id
        )
      ) {
        throw new AppError(
          "You do not have access to this conversation",
          403
        );
      }

      /*
       * Parse and clamp the requested
       * page size.
       *
       * Default: 50
       * Minimum: 1
       * Maximum: 100
       */
      const requestedLimit =
        Number.parseInt(
          request.query.limit,
          10
        );

      const limit =
        Number.isInteger(
          requestedLimit
        )
          ? Math.min(
            Math.max(
              requestedLimit,
              1
            ),
            100
          )
          : 50;

      /*
       * Cursor values used when the
       * client asks for older messages.
       *
       * Both values must be supplied
       * together because our ordering is:
       *
       * createdAt DESC
       * _id       DESC
       */
      const {
        beforeCreatedAt,
        beforeId,
      } = request.query;

      const hasPartialCursor =
        Boolean(beforeCreatedAt) !==
        Boolean(beforeId);

      if (hasPartialCursor) {
        throw new AppError(
          "Both beforeCreatedAt and beforeId are required for message pagination",
          400
        );
      }

      /*
       * Start with the conversation
       * filter used for every request.
       */
      const messageFilter = {
        conversation:
          conversationId,
      };

      /*
       * If a cursor exists, restrict
       * the query to messages strictly
       * older than that cursor.
       */
      if (
        beforeCreatedAt &&
        beforeId
      ) {
        const beforeDate =
          new Date(
            beforeCreatedAt
          );

        if (
          Number.isNaN(
            beforeDate.getTime()
          )
        ) {
          throw new AppError(
            "Invalid beforeCreatedAt cursor",
            400
          );
        }

        if (
          !mongoose.isValidObjectId(
            beforeId
          )
        ) {
          throw new AppError(
            "Invalid beforeId cursor",
            400
          );
        }

        messageFilter.$or = [
          {
            createdAt: {
              $lt: beforeDate,
            },
          },
          {
            createdAt:
              beforeDate,

            _id: {
              $lt: beforeId,
            },
          },
        ];
      }

      /*
       * Ask MongoDB for one extra
       * message.
       *
       * Example:
       *
       * client wants 30
       * MongoDB fetches 31
       *
       * If the 31st exists, we know
       * another older page exists.
       */
      const messages =
        await Message.find(
          messageFilter
        )
          .sort({
            createdAt: -1,
            _id: -1,
          })
          .limit(
            limit + 1
          )
          .populate(
            "sender",
            "_id name username"
          );

      const hasMore =
        messages.length > limit;

      /*
       * Remove the extra probe message.
       */
      if (hasMore) {
        messages.pop();
      }

      /*
       * At this point messages are still:
       *
       * newest
       *   ↓
       * oldest
       *
       * The oldest returned message
       * becomes the cursor for the
       * next history request.
       */
      const oldestMessage =
        messages[
        messages.length - 1
        ] ?? null;

      const nextCursor =
        hasMore &&
          oldestMessage
          ? {
            createdAt:
              oldestMessage
                .createdAt
                .toISOString(),

            id:
              oldestMessage
                ._id
                .toString(),
          }
          : null;

      /*
       * React currently expects
       * chronological display order:
       *
       * oldest
       *   ↓
       * newest
       */
      messages.reverse();

      /*
       * Keep the existing conversation
       * state response for backwards
       * compatibility.
       *
       * Later, older-page requests will
       * not use this state data.
       */
      const states =
        await ConversationState.find({
          conversation:
            conversationId,
        });

      response
        .status(200)
        .json({
          success: true,

          conversationId,

          messages:
            messages.map(
              serializeMessage
            ),

          states:
            states.map(
              serializeConversationState
            ),

          pagination: {
            limit,
            hasMore,
            nextCursor,
          },
        });
    }
  );