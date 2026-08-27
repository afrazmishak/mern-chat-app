import User
  from "../models/User.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

function escapeRegularExpression(
  value
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export const searchUsers =
  asyncHandler(
    async (
      request,
      response
    ) => {
      const query =
        typeof request.query.q ===
        "string"
          ? request.query.q.trim()
          : "";

      if (query.length < 2) {
        return response
          .status(200)
          .json({
            success: true,
            users: [],
          });
      }

      const safeQuery =
        escapeRegularExpression(
          query
        );

      const searchExpression =
        new RegExp(
          safeQuery,
          "i"
        );

      const users =
        await User.find({
          _id: {
            $ne:
              request.user._id,
          },

          $or: [
            {
              name:
                searchExpression,
            },
            {
              username:
                searchExpression,
            },
          ],
        })
          .select(
            "_id name username"
          )
          .limit(20);

      response
        .status(200)
        .json({
          success: true,

          users:
            users.map(
              (user) => ({
                id:
                  user._id.toString(),

                name:
                  user.name,

                username:
                  user.username,
              })
            ),
        });
    }
  );