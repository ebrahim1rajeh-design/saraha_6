# Saraha Anonymous Messaging & Conversation API

A Node.js, Express, and MongoDB backend implementing anonymous messaging, sender identity reveal requests, and private two-party conversations.

## Features & Requirements Implemented

1. **Send Anonymous Message (`POST /api/messages`)**
   - Allows an authenticated user to send an anonymous message to another registered user.
   - The receiver cannot see the sender's identity (`sender: null`, `isIdentityRevealed: false`).

2. **Request Sender Identity (`POST /api/identity-requests`)**
   - The receiver can request to know who sent a specific message.
   - Creates an `IdentityRequest` document with `status: "pending"`.

3. **Get Requests (`GET /api/identity-requests`)**
   - The sender can view all identity requests received from other users.

4. **Accept or Reject Request (`PATCH /api/identity-requests/:id`)**
   - The sender can either `accept` or `reject` the request.
   - If **rejected**, the sender's identity remains hidden.
   - If **accepted**, the request status changes to `accepted` and the receiver can now see the sender's identity.

5. **Create Conversation**
   - Automatically created upon acceptance between the sender and receiver, linked to the `originalMessage`.

6. **Send Messages in Conversation (`POST /api/conversations/:id/messages`)**
   - Allows both users involved in the conversation to send messages.

7. **Get Conversation Messages (`GET /api/conversations/:id/messages`)**
   - Allows both users involved to retrieve the conversation messages.

8. **Authorization**
   - Only the two users involved (`participants`) can access the conversation or send messages (`403 Forbidden` otherwise).
   - Only the message receiver can request sender identity; only the message sender can view/respond to requests.

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Framework:** Express.js
- **Database:** MongoDB + Mongoose
- **Authentication:** JWT (`jsonwebtoken`) + `bcryptjs`

## Setup & Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env` (see `.env.example`):
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/saraha_db
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=7d
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Run tests:
   ```bash
   npm test
   ```

## MongoDB in VS Code

- The **MongoDB for VS Code** extension (`mongodb.mongodb-vscode`) is configured in `.vscode/extensions.json` and `.vscode/settings.json` with the local connection `mongodb://127.0.0.1:27017/saraha_db`.
- Use [`mongodb-playground.mongodb.js`](mongodb-playground.mongodb.js) in VS Code to inspect collections (`users`, `messages`, `identityrequests`, `conversations`, `conversationmessages`).
