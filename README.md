# MERN Real-Time Chat Application

A production-minded real-time chat application built using the MERN stack.

The project started as a basic authenticated chat application and has progressively evolved into a multi-conversation messaging platform supporting:

- Public chat rooms
- Private/direct conversations
- Persistent messages
- Real-time Socket.IO communication
- Online presence
- Typing indicators
- Unread message counts
- Delivery and read receipts
- Persistent conversation state
- Real-time sidebar updates
- Conversation activity ordering
- URL-based conversation navigation
- Refresh-safe conversation restoration

The project has also been used as a practical learning environment for backend architecture, MongoDB modelling, authentication, Socket.IO, React state management, debugging, database migrations, race conditions, and production-oriented design.

---

# 1. Technology Stack

## Frontend

- React
- Vite
- JavaScript
- React Router
- Axios
- Socket.IO Client
- CSS

## Backend

- Node.js
- Express.js
- Socket.IO
- Mongoose
- MongoDB
- JWT authentication
- bcrypt

## Development Tools

- VS Code
- PowerShell
- Postman
- Git
- GitHub
- Nodemon
- ESLint

---

# 2. High-Level Architecture

The application is divided into two main applications:

```text
mern-chat-app/
│
├── client/
│   └── React frontend
│
└── server/
    └── Node.js / Express / Socket.IO backend