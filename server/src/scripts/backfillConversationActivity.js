import mongoose from "mongoose";
import dotenv from "dotenv";

import Conversation
  from "../models/Conversation.js";

import Message
  from "../models/Message.js";

dotenv.config();

async function backfillConversationActivity() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log(
      "MongoDB connected"
    );

    const conversations =
      await Conversation.find({});

    for (
      const conversation of
      conversations
    ) {
      const latestMessage =
        await Message.findOne({
          conversation:
            conversation._id,
        }).sort({
          createdAt: -1,
          _id: -1,
        });

      if (latestMessage) {
        await Conversation.updateOne(
          {
            _id:
              conversation._id,
          },
          {
            $set: {
              lastMessage:
                latestMessage._id,

              lastActivityAt:
                latestMessage.createdAt,
            },
          }
        );

        console.log(
          `Updated: ${conversation.name ??
          conversation._id
          } → ${latestMessage.createdAt}`
        );
      } else {
        await Conversation.updateOne(
          {
            _id:
              conversation._id,
          },
          {
            $set: {
              lastMessage: null,
              lastActivityAt:
                null,
            },
          }
        );

        console.log(
          `No messages: ${conversation.name ??
          conversation._id
          }`
        );
      }
    }

    console.log(
      "Conversation activity backfill completed"
    );
  } catch (error) {
    console.error(
      "Backfill failed:",
      error
    );
  } finally {
    await mongoose.disconnect();
  }
}

backfillConversationActivity();