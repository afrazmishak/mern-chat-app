import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["room", "direct"],
      required: true,
    },

    name: {
      type: String,
      trim: true,
      minlength: [
        2,
        "Conversation name must contain at least 2 characters",
      ],
      maxlength: [
        60,
        "Conversation name cannot exceed 60 characters",
      ],
      required: function requireRoomName() {
        return this.type === "room";
      },
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },

    directKey: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [
        250,
        "Description cannot exceed 250 characters",
      ],
      default: "",
    },

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastActivityAt: {
      type: Date,
      default: null,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);



conversationSchema.index(
  { slug: 1 },

  {
    unique: true,
    sparse: true,
  }
);

conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    sparse: true,
    name: "unique_direct_conversation",
  }
);

conversationSchema.index({
  lastActivityAt: -1,
});

conversationSchema.pre(
  "validate",
  function validateConversation() {
    if (this.type === "room" && !this.slug) {
      this.invalidate("slug", "Room slug is required");
    }

    if (this.type === "direct") {
      this.slug = undefined;
      this.isPublic = false;

      const uniqueParticipantIds =
        new Set(
          this.participants.map(
            (participantId) =>
              participantId.toString()
          )
        );

      if (
        uniqueParticipantIds.size !== 2
      ) {
        this.invalidate(
          "participants",
          "A direct conversation must contain exactly two different users"
        );
      }
    }
  }
);

const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);

export default Conversation;