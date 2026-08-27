import mongoose from "mongoose";

import Conversation from "../models/Conversation.js"
import AppError from "../utils/AppError.js"
import Message from "../models/Message.js";
import ConversationState from "../models/ConversationState.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { canAccessConversation } from "../utils/conversationAccess.js"
import { createDirectKey, } from "../utils/directConversation.js";


function createSlug(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function serializeParticipant(participant) {
    return {
        id: participant._id.toString(),
        name: participant.name,
        username: participant.username,
    };
}

function serializeConversation(
    conversation,
    currentUserId,
    unreadCount = 0
) {
    let displayName =
        conversation.name;

    let displayUsername =
        null;

    if (
        conversation.type ===
        "direct"
    ) {
        const otherParticipant =
            conversation.participants.find(
                (participant) =>
                    participant._id
                        .toString() !==
                    currentUserId.toString()
            );

        displayName =
            otherParticipant?.name ??
            "Unknown user";

        displayUsername =
            otherParticipant
                ?.username ?? null;
    }

    return {
        id:
            conversation._id.toString(),

        type:
            conversation.type,

        name:
            conversation.name,

        displayName,

        displayUsername,

        slug:
            conversation.slug,

        description:
            conversation.description,

        isPublic:
            conversation.isPublic,

        participants:
            conversation.participants.map(
                serializeParticipant
            ),

        unreadCount,

        createdAt:
            conversation.createdAt,

        updatedAt:
            conversation.updatedAt,
    };
}

export const getConversations =
    asyncHandler(
        async (request, response) => {
            const conversations =
                await Conversation.find({
                    $or: [
                        {
                            type: "room",
                            isPublic: true,
                        },
                        {
                            participants:
                                request.user._id,
                        },
                    ],
                })
                    .populate(
                        "participants",
                        "_id name username"
                    )
                    .sort({
                        type: -1,
                        name: 1,
                        updatedAt: -1,
                    });

            const conversationIds =
                conversations.map(
                    (conversation) =>
                        conversation._id
                );

            const states =
                await ConversationState.find({
                    user:
                        request.user._id,

                    conversation: {
                        $in:
                            conversationIds,
                    },
                });

            const stateMap =
                new Map(
                    states.map(
                        (state) => [
                            state.conversation
                                .toString(),
                            state,
                        ]
                    )
                );

            const serialized =
                await Promise.all(
                    conversations.map(
                        async (
                            conversation
                        ) => {
                            const state =
                                stateMap.get(
                                    conversation._id
                                        .toString()
                                );

                            const unreadQuery = {
                                conversation:
                                    conversation._id,

                                /*
                                 * Your own messages
                                 * are never unread.
                                 */
                                sender: {
                                    $ne:
                                        request.user._id,
                                },
                            };

                            if (
                                state
                                    ?.lastReadMessage
                            ) {
                                unreadQuery._id = {
                                    $gt:
                                        state.lastReadMessage,
                                };
                            }

                            const unreadCount =
                                await Message.countDocuments(
                                    unreadQuery
                                );

                            return serializeConversation(
                                conversation,
                                request.user._id,
                                unreadCount
                            );
                        }
                    )
                );

            response
                .status(200)
                .json({
                    success: true,
                    conversations:
                        serialized,
                });
        }
    );

export const getConversation = asyncHandler(
    async (request, response) => {
        const { conversationId } = request.params;

        if (!mongoose.isValidObjectId(conversationId)) {
            throw new AppError("Invalid conversation ID", 400);
        }

        const conversation =
            await Conversation.findById(conversationId);

        if (!conversation) {
            throw new AppError("Conversaion not found", 404);
        }

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

        await conversation.populate(
            "participants",
            "_id name username"
        );

        response.status(200).json({
            success: true,
            conversation: serializeConversation(conversation),
        });
    }
)

export const createRoom = asyncHandler(
    async (request, response) => {
        const { name, description = "" } = request.body;

        if (!name || !name.trim()) {
            throw new AppError("Room name is required", 400);
        }

        const normalizedName = name.trim();

        if (
            normalizedName.length < 2 ||
            normalizedName.length > 60
        ) {
            throw new AppError(
                "Room name must contain between 2 and 60 characters",
                400
            );
        }

        const slug = createSlug(normalizedName);

        if (!slug) {
            throw new AppError(
                "Room name must contain letters or numbers",
                400
            );
        }

        const existingRoom = await Conversation.findOne({
            slug,
        });

        if (existingRoom) {
            throw new AppError(
                "A room with this name already exists",
                409
            );
        }

        const room = await Conversation.create({
            type: "room",
            name: normalizedName,
            slug,
            description: description.trim(),
            isPublic: true,
            participants: [],
            createdBy: request.user._id,
        });

        response.status(201).json({
            success: true,
            message: "Room created successfully",
            conversation: serializeConversation(room),
        });
    }
);

export const createDirectConversation =
    asyncHandler(
        async (
            request,
            response
        ) => {
            const {
                targetUserId,
            } = request.body;

            if (
                !targetUserId ||
                !mongoose.isValidObjectId(
                    targetUserId
                )
            ) {
                throw new AppError(
                    "Invalid user ID",
                    400
                );
            }

            if (
                targetUserId ===
                request.user._id.toString()
            ) {
                throw new AppError(
                    "You cannot start a direct conversation with yourself",
                    400
                );
            }

            const targetUser =
                await User.findById(
                    targetUserId
                ).select(
                    "_id name username"
                );

            if (!targetUser) {
                throw new AppError(
                    "User not found",
                    404
                );
            }

            const directKey =
                createDirectKey(
                    request.user._id,
                    targetUser._id
                );

            const conversation =
                await Conversation.findOneAndUpdate(
                    {
                        directKey,
                    },

                    {
                        $setOnInsert: {
                            type:
                                "direct",

                            directKey,

                            participants: [
                                request.user._id,
                                targetUser._id,
                            ],

                            createdBy:
                                request.user._id,

                            isPublic:
                                false,
                        },
                    },

                    {
                        upsert: true,
                        returnDocument:
                            "after",
                        setDefaultsOnInsert:
                            true,
                        runValidators: true,
                    }
                );

            await conversation.populate(
                "participants",
                "_id name username"
            );

            response
                .status(200)
                .json({
                    success: true,

                    conversation:
                        serializeConversation(
                            conversation,
                            request.user._id
                        ),
                });
        }
    );