import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import apiClient from "../api/apiClient";

import {
  useAuth,
} from "../context/useAuth";

import socket from "../socket/socket";

function createClientMessageId() {
  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  const randomValues =
    crypto.getRandomValues(
      new Uint32Array(4)
    );

  return `${Date.now()}-${Array.from(
    randomValues
  ).join("-")}`;
}

function mergeMessages(
  currentMessages,
  incomingMessages
) {
  const messageMap = new Map();

  for (
    const message of currentMessages
  ) {
    messageMap.set(
      message.id,
      message
    );
  }

  for (
    const message of incomingMessages
  ) {
    messageMap.set(
      message.id,
      message
    );
  }

  return Array.from(
    messageMap.values()
  ).sort(
    (firstMessage, secondMessage) =>
      new Date(
        firstMessage.createdAt
      ).getTime() -
      new Date(
        secondMessage.createdAt
      ).getTime()
  );
}

function formatMessageTime(value) {
  return new Date(
    value
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function ChatPage() {
  const navigate = useNavigate();

  const {
    user,
    logout,
  } = useAuth();

  const [
    conversations,
    setConversations,
  ] = useState([]);

  const [
    selectedConversation,
    setSelectedConversation,
  ] = useState(null);

  const [
    socketConnected,
    setSocketConnected,
  ] = useState(
    socket.connected
  );

  const [
    joinedConversationId,
    setJoinedConversationId,
  ] = useState(null);

  const [
    joinFailedConversationId,
    setJoinFailedConversationId,
  ] = useState(null);

  const [
    loadingConversations,
    setLoadingConversations,
  ] = useState(true);

  const [
    messagesByConversation,
    setMessagesByConversation,
  ] = useState({});

  const [
    loadedMessageHistory,
    setLoadedMessageHistory,
  ] = useState({});

  const [
    messageDraft,
    setMessageDraft,
  ] = useState("");

  const [
    sendingMessage,
    setSendingMessage,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    showRoomForm,
    setShowRoomForm,
  ] = useState(false);

  const [
    newRoom,
    setNewRoom,
  ] = useState({
    name: "",
    description: "",
  });

  const [
    creatingRoom,
    setCreatingRoom,
  ] = useState(false);

  const [
    onlineUserIds,
    setOnlineUserIds,
  ] = useState([]);

  const [
    connectionVersion,
    setConnectionVersion,
  ] = useState(0);

  const [
    typingUsersByConversation,
    setTypingUsersByConversation,
  ] = useState({});

  const [
    unreadCounts,
    setUnreadCounts,
  ] = useState({});

  const [
    conversationStates,
    setConversationStates,
  ] = useState({});

  const [
    showUserSearch,
    setShowUserSearch,
  ] = useState(false);

  const [
    userSearchQuery,
    setUserSearchQuery,
  ] = useState("");

  const [
    userSearchResults,
    setUserSearchResults,
  ] = useState([]);

  const [
    searchingUsers,
    setSearchingUsers,
  ] = useState(false);

  const typingStopTimerRef =
    useRef(null);

  const typingConversationIdRef =
    useRef(null);

  const typingStartedRef =
    useRef(false);

  const lastTypingStartEmitAtRef =
    useRef(0);

  const typingExpiryTimersRef =
    useRef(new Map());

  const selectedConversationId =
    selectedConversation?.id ??
    null;

  const messages = useMemo(
    () => {
      if (!selectedConversationId) {
        return [];
      }

      return (
        messagesByConversation[
        selectedConversationId
        ] ?? []
      );
    },
    [
      selectedConversationId,
      messagesByConversation,
    ]
  );

  const typingUsers = useMemo(
    () => {
      if (!selectedConversationId) {
        return [];
      }

      return (
        typingUsersByConversation[
        selectedConversationId
        ] ?? []
      );
    },
    [
      selectedConversationId,
      typingUsersByConversation,
    ]
  );

  const loadingMessages = Boolean(
    selectedConversationId &&
    !loadedMessageHistory[
    selectedConversationId
    ]
  );

  let roomConnectionState = "disconnected";

  if (
    socketConnected &&
    selectedConversationId
  ) {
    if (
      joinedConversationId ===
      selectedConversationId
    ) {
      roomConnectionState =
        "joined";
    } else if (
      joinFailedConversationId ===
      selectedConversationId
    ) {
      roomConnectionState =
        "failed";
    } else {
      roomConnectionState =
        "joining";
    }
  }

  function stopCurrentTyping() {
    if (
      typingStopTimerRef.current
    ) {
      clearTimeout(
        typingStopTimerRef.current
      );

      typingStopTimerRef.current =
        null;
    }

    const conversationId =
      typingConversationIdRef.current;

    if (
      typingStartedRef.current &&
      conversationId &&
      socket.connected
    ) {
      socket.emit(
        "typing:stop",
        {
          conversationId,
        }
      );
    }

    typingStartedRef.current =
      false;

    typingConversationIdRef.current =
      null;

    lastTypingStartEmitAtRef.current =
      0;
  }

  /*
   * Load available conversations.
   */
  useEffect(() => {
    let componentActive = true;

    apiClient
      .get("/conversations")
      .then((response) => {
        if (!componentActive) {
          return;
        }

        const loadedConversations =
          response.data
            .conversations;

        const loadedUnreadCounts =
          Object.fromEntries(
            loadedConversations.map(
              (conversation) => [
                conversation.id,
                conversation.unreadCount ?? 0,
              ]
            )
          );

        setUnreadCounts(
          loadedUnreadCounts
        );

        setConversations(
          loadedConversations
        );

        if (
          loadedConversations.length >
          0
        ) {
          setSelectedConversation(
            loadedConversations[0]
          );
        }
      })
      .catch(
        (requestError) => {
          if (!componentActive) {
            return;
          }

          setError(
            requestError.response
              ?.data?.message ||
            "Unable to load conversations"
          );
        }
      )
      .finally(() => {
        if (componentActive) {
          setLoadingConversations(
            false
          );
        }
      });

    return () => {
      componentActive = false;
    };
  }, []);

  /*
   * Connect Socket.IO.
   */
  useEffect(() => {
    function handleConnect() {
      setSocketConnected(true);

      setConnectionVersion(
        (currentVersion) =>
          currentVersion + 1
      );

      setError("");

      console.log(
        socket.recovered
          ? "Socket connection recovered"
          : "Socket connected with a new session"
      );
    }

    function handlePresenceSnapshot(
      payload
    ) {
      setOnlineUserIds(
        Array.isArray(payload?.userIds)
          ? payload.userIds
          : []
      );
    }

    function handlePresenceUpdate(
      payload
    ) {
      if (!payload?.userId) {
        return;
      }

      setOnlineUserIds(
        (currentUserIds) => {
          if (payload.isOnline) {
            if (
              currentUserIds.includes(
                payload.userId
              )
            ) {
              return currentUserIds;
            }

            return [
              ...currentUserIds,
              payload.userId,
            ];
          }

          return currentUserIds.filter(
            (userId) =>
              userId !==
              payload.userId
          );
        }
      );
    }

    function handleDisconnect() {
      setSocketConnected(false);

      setJoinedConversationId(null);

      setOnlineUserIds([]);

      if (typingStopTimerRef.current) {
        clearTimeout(
          typingStopTimerRef.current
        );

        typingStopTimerRef.current =
          null;
      }

      typingStartedRef.current = false;

      typingConversationIdRef.current =
        null;

      lastTypingStartEmitAtRef.current =
        0;

      for (
        const timer of
        typingExpiryTimersRef.current.values()
      ) {
        clearTimeout(timer);
      }

      typingExpiryTimersRef.current.clear();

      setTypingUsersByConversation({});
    }

    function handleConnectionError(
      connectionError
    ) {
      setSocketConnected(false);

      setJoinedConversationId(
        null
      );

      setError(
        connectionError.message ||
        "Socket connection failed"
      );
    }

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "connect_error",
      handleConnectionError
    );

    socket.on(
      "presence:snapshot",
      handlePresenceSnapshot
    );

    socket.on(
      "presence:update",
      handlePresenceUpdate
    );

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "connect_error",
        handleConnectionError
      );

      socket.off(
        "presence:snapshot",
        handlePresenceSnapshot
      );

      socket.off(
        "presence:update",
        handlePresenceUpdate
      );

      socket.disconnect();
    };
  }, []);

  /*
   * Listen for new real-time
   * messages.
   */
  useEffect(() => {
    function handleNewMessage(
      message
    ) {
      console.log(
        "[message:new received]",
        {
          conversationId:
            message?.conversationId,

          selectedConversationId,

          sender:
            message?.sender?.username,
        }
      );

      if (
        !message?.conversationId
      ) {
        return;
      }

      setMessagesByConversation(
        (currentMessages) => {
          const conversationMessages =
            currentMessages[
            message
              .conversationId
            ] ?? [];

          return {
            ...currentMessages,

            [message
              .conversationId]:
              mergeMessages(
                conversationMessages,
                [message]
              ),
          };
        }
      );

      setConversations(
        (currentConversations) =>
          currentConversations.map(
            (conversation) =>
              conversation.id ===
                message.conversationId
                ? {
                  ...conversation,

                  lastMessage:
                    message,

                  lastActivityAt:
                    message.createdAt,
                }
                : conversation
          )
      );

      if (
        message.sender.id ===
        user.id
      ) {
        return;
      }

      socket.emit(
        "conversation:delivered",
        {
          conversationId:
            message.conversationId,

          messageId:
            message.id,
        }
      );

      const conversationIsOpen =
        message.conversationId ===
        selectedConversationId &&
        document.visibilityState ===
        "visible";

      if (conversationIsOpen) {
        socket.emit(
          "conversation:read",
          {
            conversationId:
              message.conversationId,

            messageId:
              message.id,
          }
        );

        setUnreadCounts(
          (currentCounts) => ({
            ...currentCounts,

            [message.conversationId]:
              0,
          })
        );

        return;
      }

      setUnreadCounts(
        (currentCounts) => ({
          ...currentCounts,

          [message.conversationId]:
            (
              currentCounts[
              message.conversationId
              ] ?? 0
            ) + 1,
        })
      );
    }

    socket.on(
      "message:new",
      handleNewMessage
    );

    return () => {
      socket.off(
        "message:new",
        handleNewMessage
      );
    };
  }, [
    selectedConversationId,
    user.id,
  ]);

  useEffect(() => {
    function handleConversationState(
      state
    ) {
      if (
        !state?.conversationId ||
        !state?.userId
      ) {
        return;
      }

      setConversationStates(
        (currentState) => ({
          ...currentState,

          [state.conversationId]: {
            ...currentState[
            state.conversationId
            ],

            [state.userId]:
              state,
          },
        })
      );

      /*
       * Only an actual READ event
       * clears unread messages.
       *
       * Delivery must NOT clear them.
       */
      if (
        state.userId === user.id &&
        state.receiptType === "read"
      ) {
        setUnreadCounts(
          (currentCounts) => ({
            ...currentCounts,

            [state.conversationId]:
              0,
          })
        );
      }
    }

    socket.on(
      "conversation:state",
      handleConversationState
    );

    socket.on(
      "conversation:receipt",
      handleConversationState
    );

    return () => {
      socket.off(
        "conversation:state",
        handleConversationState
      );

      socket.off(
        "conversation:receipt",
        handleConversationState
      );
    };
  }, [user.id]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.visibilityState !==
        "visible" ||
        !selectedConversationId
      ) {
        return;
      }

      const latestMessage =
        messages[
        messages.length - 1
        ];

      if (!latestMessage) {
        return;
      }

      socket.emit(
        "conversation:read",
        {
          conversationId:
            selectedConversationId,

          messageId:
            latestMessage.id,
        }
      );

      setUnreadCounts(
        (currentCounts) => ({
          ...currentCounts,

          [selectedConversationId]:
            0,
        })
      );
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    selectedConversationId,
    messages,
  ]);

  /*
 * Listen for typing updates.
 */
  useEffect(() => {
    const typingExpiryTimers =
      typingExpiryTimersRef.current;

    function removeTypingUser(
      conversationId,
      userId
    ) {
      setTypingUsersByConversation(
        (currentState) => {
          const currentUsers =
            currentState[
            conversationId
            ] ?? [];

          const nextUsers =
            currentUsers.filter(
              (typingUser) =>
                typingUser.id !== userId
            );

          return {
            ...currentState,

            [conversationId]:
              nextUsers,
          };
        }
      );
    }

    function handleTypingUpdate(
      payload
    ) {
      const conversationId =
        payload?.conversationId;

      const typingUser =
        payload?.user;

      if (
        !conversationId ||
        !typingUser?.id
      ) {
        return;
      }

      if (
        typingUser.id === user.id
      ) {
        return;
      }

      const timerKey =
        `${conversationId}:${typingUser.id}`;

      const existingTimer =
        typingExpiryTimers.get(
          timerKey
        );

      if (existingTimer) {
        clearTimeout(
          existingTimer
        );

        typingExpiryTimers.delete(
          timerKey
        );
      }

      if (!payload.isTyping) {
        removeTypingUser(
          conversationId,
          typingUser.id
        );

        return;
      }

      setTypingUsersByConversation(
        (currentState) => {
          const currentUsers =
            currentState[
            conversationId
            ] ?? [];

          const alreadyPresent =
            currentUsers.some(
              (currentUser) =>
                currentUser.id ===
                typingUser.id
            );

          if (alreadyPresent) {
            return currentState;
          }

          return {
            ...currentState,

            [conversationId]: [
              ...currentUsers,
              typingUser,
            ],
          };
        }
      );

      const expiryTimer =
        setTimeout(() => {
          removeTypingUser(
            conversationId,
            typingUser.id
          );

          typingExpiryTimers.delete(
            timerKey
          );
        }, 5000);

      typingExpiryTimers.set(
        timerKey,
        expiryTimer
      );
    }

    socket.on(
      "typing:update",
      handleTypingUpdate
    );

    return () => {
      socket.off(
        "typing:update",
        handleTypingUpdate
      );

      for (
        const timer of
        typingExpiryTimers.values()
      ) {
        clearTimeout(timer);
      }

      typingExpiryTimers.clear();
    };
  }, [user.id]);

  /*
   * Join selected conversation.
   */
  useEffect(() => {
    if (
      !socketConnected ||
      !selectedConversationId
    ) {
      return;
    }

    let effectCancelled = false;

    socket.emit(
      "conversation:join",
      {
        conversationId:
          selectedConversationId,
      },
      (result) => {
        if (effectCancelled) {
          return;
        }

        if (!result?.success) {
          setJoinedConversationId(
            null
          );

          setJoinFailedConversationId(
            selectedConversationId
          );

          setError(
            result?.message ||
            "Unable to join conversation"
          );

          return;
        }

        setJoinedConversationId(
          selectedConversationId
        );

        setJoinFailedConversationId(
          null
        );

        setError("");
      }
    );

    return () => {
      effectCancelled = true;
    };
  }, [
    selectedConversationId,
    socketConnected,
  ]);

  /*
   * Load persistent history.
   */
  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    let componentActive =
      true;

    apiClient
      .get(
        `/conversations/${selectedConversationId}/messages?limit=50`
      )
      .then((response) => {
        if (!componentActive) {
          return;
        }

        const loadedMessages =
          response.data.messages;

        const loadedStates =
          response.data.states ?? [];

        setConversationStates(
          (currentState) => ({
            ...currentState,

            [selectedConversationId]:
              Object.fromEntries(
                loadedStates.map(
                  (state) => [
                    state.userId,
                    state,
                  ]
                )
              ),
          })
        );

        const latestMessage =
          loadedMessages[
          loadedMessages.length - 1
          ];

        if (
          latestMessage &&
          socket.connected
        ) {
          socket.emit(
            "conversation:delivered",
            {
              conversationId:
                selectedConversationId,

              messageId:
                latestMessage.id,
            }
          );

          if (
            document.visibilityState ===
            "visible"
          ) {
            socket.emit(
              "conversation:read",
              {
                conversationId:
                  selectedConversationId,

                messageId:
                  latestMessage.id,
              }
            );

            setUnreadCounts(
              (currentCounts) => ({
                ...currentCounts,
                [selectedConversationId]: 0,
              })
            );
          }
        }

        setMessagesByConversation(
          (currentMessages) => ({
            ...currentMessages,

            [selectedConversationId]:
              mergeMessages(
                loadedMessages,
                currentMessages[
                selectedConversationId
                ] ?? []
              ),
          })
        );

        setLoadedMessageHistory(
          (currentState) => ({
            ...currentState,

            [selectedConversationId]:
              true,
          })
        );
      })
      .catch(
        (requestError) => {
          if (!componentActive) {
            return;
          }

          setError(
            requestError.response
              ?.data?.message ||
            "Unable to synchronize message history"
          );
        }
      );

    return () => {
      componentActive = false;
    };
  }, [
    selectedConversationId,
    connectionVersion,
  ]);

  /*
 * Subscribe to every accessible
 * conversation for real-time
 * message notifications.
 */
  useEffect(() => {
    if (
      !socketConnected ||
      conversations.length === 0
    ) {
      return;
    }

    for (
      const conversation of
      conversations
    ) {
      socket.emit(
        "conversation:subscribe",
        {
          conversationId:
            conversation.id,
        }
      );
    }
  }, [
    socketConnected,
    conversations,
  ]);

  function selectConversation(
    conversation
  ) {
    if (
      conversation.id ===
      selectedConversationId
    ) {
      return;
    }

    stopCurrentTyping();

    setError("");

    setJoinFailedConversationId(
      null
    );

    setMessageDraft("");

    setSelectedConversation(
      conversation
    );
  }

  function handleNewRoomChange(
    event
  ) {
    const {
      name,
      value,
    } = event.target;

    setNewRoom(
      (currentRoom) => ({
        ...currentRoom,
        [name]: value,
      })
    );
  }

  async function handleCreateRoom(
    event
  ) {
    event.preventDefault();

    setCreatingRoom(true);
    setError("");

    try {
      const response =
        await apiClient.post(
          "/conversations/rooms",
          newRoom
        );

      const createdRoom =
        response.data
          .conversation;

      setConversations(
        (
          currentConversations
        ) => [
            ...currentConversations,
            createdRoom,
          ]
      );

      setMessagesByConversation(
        (currentMessages) => ({
          ...currentMessages,
          [createdRoom.id]: [],
        })
      );

      setLoadedMessageHistory(
        (currentState) => ({
          ...currentState,
          [createdRoom.id]: true,
        })
      );

      setSelectedConversation(
        createdRoom
      );

      setNewRoom({
        name: "",
        description: "",
      });

      setShowRoomForm(false);
    } catch (requestError) {
      setError(
        requestError.response
          ?.data?.message ||
        "Unable to create room"
      );
    } finally {
      setCreatingRoom(false);
    }
  }

  function handleSendMessage(
    event
  ) {
    event.preventDefault();

    const content =
      messageDraft.trim();

    if (
      !content ||
      !selectedConversationId ||
      sendingMessage
    ) {
      return;
    }

    if (
      roomConnectionState !==
      "joined"
    ) {
      setError(
        "Wait until the conversation is connected before sending"
      );

      return;
    }

    stopCurrentTyping();

    const clientMessageId =
      createClientMessageId();

    setSendingMessage(true);
    setError("");

    socket
      .timeout(5000)
      .emit(
        "message:send",
        {
          conversationId:
            selectedConversationId,

          clientMessageId,

          content,
        },
        (
          timeoutError,
          result
        ) => {
          setSendingMessage(false);

          if (timeoutError) {
            setError(
              "The server did not confirm the message. Please try again."
            );

            return;
          }

          if (!result?.success) {
            setError(
              result?.message ||
              "Unable to send message"
            );

            return;
          }

          /*
           * Normally message:new has
           * already added this.
           *
           * This merge also makes the
           * acknowledgement safe if
           * event ordering differs.
           */
          if (result.message) {
            setMessagesByConversation(
              (
                currentMessages
              ) => ({
                ...currentMessages,

                [selectedConversationId]:
                  mergeMessages(
                    currentMessages[
                    selectedConversationId
                    ] ?? [],
                    [
                      result.message,
                    ]
                  ),
              })
            );
          }

          setMessageDraft("");
        }
      );
  }

  function handleMessageDraftChange(
    event
  ) {
    const value =
      event.target.value;

    setMessageDraft(value);

    if (
      roomConnectionState !==
      "joined" ||
      !selectedConversationId
    ) {
      stopCurrentTyping();
      return;
    }

    if (!value.trim()) {
      stopCurrentTyping();
      return;
    }

    if (
      typingConversationIdRef.current &&
      typingConversationIdRef.current !==
      selectedConversationId
    ) {
      stopCurrentTyping();
    }

    const now = event.timeStamp;

    /*
     * Start immediately, then refresh
     * at most once every 2 seconds
     * while typing continues.
     */
    if (
      !typingStartedRef.current ||
      now -
      lastTypingStartEmitAtRef.current >=
      2000
    ) {
      socket.volatile.emit(
        "typing:start",
        {
          conversationId:
            selectedConversationId,
        }
      );

      typingStartedRef.current =
        true;

      typingConversationIdRef.current =
        selectedConversationId;

      lastTypingStartEmitAtRef.current =
        now;
    }

    if (
      typingStopTimerRef.current
    ) {
      clearTimeout(
        typingStopTimerRef.current
      );
    }

    typingStopTimerRef.current =
      setTimeout(() => {
        stopCurrentTyping();
      }, 1200);
  }

  function isUserOnline(
    userId
  ) {
    return onlineUserIds.includes(
      userId
    );
  }

  function getTypingText() {
    if (typingUsers.length === 0) {
      return "";
    }

    if (typingUsers.length === 1) {
      return `${typingUsers[0].name} is typing...`;
    }

    if (typingUsers.length === 2) {
      return `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`;
    }

    return `${typingUsers[0].name}, ${typingUsers[1].name} and ${typingUsers.length - 2
      } others are typing...`;
  }

  function getMessageReceiptText(
    message
  ) {
    if (
      message.sender.id !==
      user.id
    ) {
      return "";
    }

    const states =
      conversationStates[
      message.conversationId
      ] ?? {};

    let deliveredCount = 0;
    let readCount = 0;

    for (
      const state of
      Object.values(states)
    ) {
      if (
        state.userId === user.id
      ) {
        continue;
      }

      if (
        state.lastDeliveredMessageId &&
        state.lastDeliveredMessageId
          .localeCompare(
            message.id
          ) >= 0
      ) {
        deliveredCount += 1;
      }

      if (
        state.lastReadMessageId &&
        state.lastReadMessageId
          .localeCompare(
            message.id
          ) >= 0
      ) {
        readCount += 1;
      }
    }

    if (readCount > 0) {
      return readCount === 1
        ? "Read"
        : `Read by ${readCount}`;
    }

    if (deliveredCount > 0) {
      return deliveredCount === 1
        ? "Delivered"
        : `Delivered to ${deliveredCount}`;
    }

    return "Sent";
  }

  async function handleLogout() {
    stopCurrentTyping();

    setError("");

    try {
      socket.disconnect();

      await logout();

      navigate("/login");
    } catch (requestError) {
      setError(
        requestError.response
          ?.data?.message ||
        "Unable to log out"
      );
    }
  }

  async function handleUserSearch(
    event
  ) {
    const value =
      event.target.value;

    setUserSearchQuery(
      value
    );

    if (
      value.trim().length < 2
    ) {
      setUserSearchResults(
        []
      );

      return;
    }

    setSearchingUsers(true);

    try {
      const response =
        await apiClient.get(
          "/users/search",
          {
            params: {
              q:
                value.trim(),
            },
          }
        );

      setUserSearchResults(
        response.data.users
      );
    } catch (requestError) {
      setError(
        requestError.response
          ?.data?.message ||
        "Unable to search users"
      );
    } finally {
      setSearchingUsers(false);
    }
  }

  async function handleStartDirectConversation(
    targetUser
  ) {
    setError("");

    try {
      const response =
        await apiClient.post(
          "/conversations/direct",
          {
            targetUserId:
              targetUser.id,
          }
        );

      const conversation =
        response.data
          .conversation;

      setConversations(
        (currentConversations) => {
          const alreadyExists =
            currentConversations.some(
              (currentConversation) =>
                currentConversation.id ===
                conversation.id
            );

          if (alreadyExists) {
            return currentConversations;
          }

          return [
            ...currentConversations,
            conversation,
          ];
        }
      );

      setSelectedConversation(
        conversation
      );

      setShowUserSearch(false);

      setUserSearchQuery("");

      setUserSearchResults([]);
    } catch (requestError) {
      setError(
        requestError.response
          ?.data?.message ||
        "Unable to start conversation"
      );
    }
  }

  const roomConversations =
    useMemo(
      () =>
        conversations
          .filter(
            (conversation) =>
              conversation.type ===
              "room"
          )
          .sort(
            (
              firstConversation,
              secondConversation
            ) =>
              new Date(
                secondConversation.lastActivityAt ??
                secondConversation.updatedAt
              ).getTime() -
              new Date(
                firstConversation.lastActivityAt ??
                firstConversation.updatedAt
              ).getTime()
          ),
      [conversations]
    );

  const directConversations =
    useMemo(
      () =>
        conversations
          .filter(
            (conversation) =>
              conversation.type ===
              "direct"
          )
          .sort(
            (
              firstConversation,
              secondConversation
            ) =>
              new Date(
                secondConversation.lastActivityAt ??
                secondConversation.updatedAt
              ).getTime() -
              new Date(
                firstConversation.lastActivityAt ??
                firstConversation.updatedAt
              ).getTime()
          ),
      [conversations]
    );

  function getConversationPreview(
    conversation
  ) {
    if (
      conversation.lastMessage
    ) {
      const sentByCurrentUser =
        conversation.lastMessage.sender
          ?.id === user.id;

      const prefix =
        sentByCurrentUser
          ? "You: "
          : "";

      return `${prefix}${conversation.lastMessage.content}`;
    }

    if (
      conversation.type ===
      "direct"
    ) {
      return conversation.displayUsername
        ? `@${conversation.displayUsername}`
        : "Private conversation";
    }

    return (
      conversation.description ||
      "No messages yet"
    );
  }

  useEffect(() => {
    function handleNewConversation(
      conversation
    ) {
      if (!conversation?.id) {
        return;
      }

      setConversations(
        (currentConversations) => {
          const existingConversation =
            currentConversations.find(
              (
                currentConversation
              ) =>
                currentConversation.id ===
                conversation.id
            );

          if (
            existingConversation
          ) {
            return currentConversations.map(
              (
                currentConversation
              ) =>
                currentConversation.id ===
                  conversation.id
                  ? {
                    ...currentConversation,
                    ...conversation,
                  }
                  : currentConversation
            );
          }

          return [
            conversation,
            ...currentConversations,
          ];
        }
      );

      setUnreadCounts(
        (currentCounts) => ({
          ...currentCounts,

          [conversation.id]:
            currentCounts[
            conversation.id
            ] ??
            conversation.unreadCount ??
            0,
        })
      );
    }

    socket.on(
      "conversation:new",
      handleNewConversation
    );

    return () => {
      socket.off(
        "conversation:new",
        handleNewConversation
      );
    };
  }, []);

  return (
    <main className="chat-app">
      <aside className="chat-sidebar">
        <header className="sidebar-header">
          <div>
            <h1>MERN Chat</h1>
            <p>@{user.username}</p>
          </div>

          <span
            className={
              socketConnected
                ? "connection-dot online"
                : "connection-dot offline"
            }
          />
        </header>

        <div className="sidebar-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              setShowRoomForm(
                (currentValue) =>
                  !currentValue
              )
            }
          >
            {showRoomForm
              ? "Cancel"
              : "+ Create room"}
          </button>

          <button
            type="button"
            className="secondary-sidebar-button"
            onClick={() =>
              setShowUserSearch(
                (currentValue) =>
                  !currentValue
              )
            }
          >
            {showUserSearch
              ? "Close"
              : "+ New message"}
          </button>
        </div>

        {showUserSearch && (
          <div className="user-search-panel">
            <input
              type="search"
              value={userSearchQuery}
              onChange={handleUserSearch}
              placeholder="Search users..."
            />

            {searchingUsers && (
              <p>Searching...</p>
            )}

            {!searchingUsers &&
              userSearchQuery.trim().length >= 2 &&
              userSearchResults.length === 0 && (
                <p>No users found.</p>
              )}

            {userSearchResults.map(
              (searchUser) => (
                <button
                  type="button"
                  key={searchUser.id}
                  className="user-search-result"
                  onClick={() =>
                    handleStartDirectConversation(
                      searchUser
                    )
                  }
                >
                  <div className="user-avatar">
                    {searchUser.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <strong>
                      {searchUser.name}
                    </strong>

                    <small>
                      @{searchUser.username}
                    </small>
                  </div>
                </button>
              )
            )}
          </div>
        )}

        {showRoomForm && (
          <form
            className="room-form"
            onSubmit={
              handleCreateRoom
            }
          >
            <label>
              Room name

              <input
                type="text"
                name="name"
                value={newRoom.name}
                onChange={
                  handleNewRoomChange
                }
                minLength="2"
                maxLength="60"
                required
              />
            </label>

            <label>
              Description

              <textarea
                name="description"
                value={
                  newRoom.description
                }
                onChange={
                  handleNewRoomChange
                }
                maxLength="250"
                rows="3"
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={
                creatingRoom
              }
            >
              {creatingRoom
                ? "Creating..."
                : "Create"}
            </button>
          </form>
        )}

        <div className="conversation-section">
          <div className="conversation-heading">
            <h2>Rooms</h2>

            <span>
              {roomConversations.length}
            </span>
          </div>

          <nav className="conversation-list">
            {loadingConversations && (
              <p className="sidebar-message">
                Loading conversations...
              </p>
            )}

            {roomConversations.map(
              (conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={
                    selectedConversationId ===
                      conversation.id
                      ? "conversation-item active"
                      : "conversation-item"
                  }
                  onClick={() =>
                    selectConversation(
                      conversation
                    )
                  }
                >
                  <span className="conversation-icon">
                    #
                  </span>

                  <span className="conversation-details">
                    <strong>
                      {conversation.name}
                    </strong>

                    <small>
                      {getConversationPreview(
                        conversation
                      )}
                    </small>
                  </span>

                  {(
                    unreadCounts[
                    conversation.id
                    ] ?? 0
                  ) > 0 && (
                      <span className="unread-badge">
                        {unreadCounts[
                          conversation.id
                        ] > 99
                          ? "99+"
                          : unreadCounts[
                          conversation.id
                          ]}
                      </span>
                    )}
                </button>
              )
            )}
          </nav>

          <div className="conversation-heading direct-heading">
            <h2>
              Direct Messages
            </h2>

            <span>
              {directConversations.length}
            </span>
          </div>

          <nav className="conversation-list direct-list">
            {directConversations.length ===
              0 &&
              !loadingConversations && (
                <p className="sidebar-message">
                  No direct messages yet.
                </p>
              )}

            {directConversations.map(
              (conversation) => {
                const online =
                  isUserOnline(
                    conversation.displayUserId
                  );

                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={
                      selectedConversationId ===
                        conversation.id
                        ? "conversation-item active"
                        : "conversation-item"
                    }
                    onClick={() =>
                      selectConversation(
                        conversation
                      )
                    }
                  >
                    <span className="dm-sidebar-avatar">
                      <span className="dm-avatar">
                        {(conversation.displayName ||
                          "?")
                          .charAt(0)
                          .toUpperCase()}
                      </span>

                      <span
                        className={
                          online
                            ? "dm-presence online"
                            : "dm-presence offline"
                        }
                        title={
                          online
                            ? "Online"
                            : "Offline"
                        }
                      />
                    </span>

                    <span className="conversation-details">
                      <strong>
                        {conversation.displayName}
                      </strong>

                      <small>
                        {getConversationPreview(
                          conversation
                        )}
                      </small>
                    </span>

                    {(
                      unreadCounts[
                      conversation.id
                      ] ?? 0
                    ) > 0 && (
                        <span className="unread-badge">
                          {unreadCounts[
                            conversation.id
                          ] > 99
                            ? "99+"
                            : unreadCounts[
                            conversation.id
                            ]}
                        </span>
                      )}
                  </button>
                );
              }
            )}
          </nav>
        </div>

        <footer className="sidebar-footer">
          <div className="current-user">
            <div className="sidebar-avatar-wrapper">
              <div className="user-avatar">
                {user.name
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <span
                className={
                  socketConnected
                    ? "sidebar-presence online"
                    : "sidebar-presence offline"
                }
              />
            </div>

            <div>
              <strong>
                {user.name}
              </strong>

              <small>
                @{user.username}
              </small>
            </div>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={
              handleLogout
            }
          >
            Log out
          </button>
        </footer>
      </aside>

      <section className="conversation-panel">
        {error && (
          <div className="dashboard-error">
            <span>{error}</span>

            <button
              type="button"
              onClick={() =>
                setError("")
              }
            >
              ×
            </button>
          </div>
        )}

        {!selectedConversation ? (
          <div className="empty-conversation">
            <h2>
              Select a conversation
            </h2>

            <p>
              Choose a room from the
              sidebar.
            </p>
          </div>
        ) : (
          <>
            <header className="conversation-header">
              <div>
                <h2>
                  <span>
                    {selectedConversation.type ===
                      "room"
                      ? "#"
                      : "@"}
                  </span>

                  {selectedConversation.displayName ||
                    selectedConversation.name}
                </h2>

                <p>
                  {selectedConversation.type ===
                    "direct"
                    ? `Private conversation with @${selectedConversation.displayUsername}`
                    : selectedConversation.description ||
                    "No room description"}
                </p>
              </div>

              <div
                className={`room-status ${roomConnectionState}`}
              >
                {roomConnectionState ===
                  "joining" &&
                  "Joining..."}

                {roomConnectionState ===
                  "joined" &&
                  "Connected"}

                {roomConnectionState ===
                  "failed" &&
                  "Join failed"}

                {roomConnectionState ===
                  "disconnected" &&
                  "Disconnected"}
              </div>
            </header>

            <div className="message-list">
              {loadingMessages ? (
                <div className="messages-state">
                  Loading messages...
                </div>
              ) : messages.length ===
                0 ? (
                <div className="messages-state">
                  <div className="placeholder-icon">
                    #
                  </div>

                  <h2>
                    Welcome to #
                    {
                      selectedConversation.name
                    }
                  </h2>

                  <p>
                    There are no
                    messages yet.
                  </p>

                  <p>
                    Start the
                    conversation.
                  </p>
                </div>
              ) : (
                messages.map(
                  (message) => {
                    const ownMessage =
                      message.sender
                        .id ===
                      user.id;

                    return (
                      <article
                        key={
                          message.id
                        }
                        className={
                          ownMessage
                            ? "message-row own-message"
                            : "message-row"
                        }
                      >
                        <div className="message-avatar-wrapper">
                          <div className="message-avatar">
                            {message.sender.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <span
                            className={
                              isUserOnline(
                                message.sender.id
                              )
                                ? "message-presence online"
                                : "message-presence offline"
                            }
                            title={
                              isUserOnline(
                                message.sender.id
                              )
                                ? "Online"
                                : "Offline"
                            }
                          />
                        </div>

                        <div className="message-body">
                          <div className="message-meta">
                            <strong>
                              {
                                message
                                  .sender
                                  .name
                              }
                            </strong>

                            <span>
                              @
                              {
                                message
                                  .sender
                                  .username
                              }
                            </span>

                            <time>
                              {formatMessageTime(
                                message.createdAt
                              )}
                            </time>
                            {ownMessage && (
                              <span className="message-receipt">
                                {getMessageReceiptText(
                                  message
                                )}
                              </span>
                            )}
                          </div>

                          <p>
                            {
                              message.content
                            }
                          </p>
                        </div>
                      </article>
                    );
                  }
                )
              )}
            </div>

            <div
              className="typing-indicator"
              aria-live="polite"
            >
              {getTypingText()}
            </div>

            <form className="message-composer"
              onSubmit={
                handleSendMessage
              }
            >
              <textarea
                value={
                  messageDraft
                }
                onChange={
                  handleMessageDraftChange
                }
                placeholder={
                  selectedConversation.type ===
                    "direct"
                    ? `Message @${selectedConversation.displayUsername}`
                    : `Message #${selectedConversation.name}`
                }
                maxLength="4000"
                rows="1"
                disabled={
                  roomConnectionState !==
                  "joined" ||
                  sendingMessage
                }
              />

              <button
                type="submit"
                disabled={
                  roomConnectionState !==
                  "joined" ||
                  sendingMessage ||
                  !messageDraft.trim()
                }
              >
                {sendingMessage
                  ? "Sending..."
                  : "Send"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default ChatPage;