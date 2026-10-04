# SkillSwap

**A peer-to-peer skill exchange platform: teach what you know, learn what you don't.**

SkillSwap connects people who want to trade skills. There is no money involved. There are two ways to book:
- **Barter:** when a teacher accepts, they choose a skill to learn back from the learner, which creates a linked request in the opposite direction.
- **Time credits:** learn from anyone, even if they don't want your skills. Teaching 1 hour earns 1 credit, and learning 1 hour costs 1. Sessions are scheduled across weeks, held over Zoom, synced to Google or Outlook Calendar, and tracked with hours, streaks and reviews.

Built with **MongoDB, Express, React and Node.js**, with **Socket.IO** for real-time chat.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Third-party integrations](#third-party-integrations)
- [Admin accounts](#admin-accounts)
- [Scripts and testing](#scripts-and-testing)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

**For learners and teachers**
- **Guided onboarding.** A chatbot builds your profile: skills to teach and learn (pick from a list or add your own), preferred days, timezone, available time slots and preferred format (video, in-person, chat).
- **Time credits.**
  - Everyone starts with 3 credits.
  - When booking, choose **Barter** or **Pay with credits**.
  - Credits are reserved when the teacher confirms, paid to the teacher as each session is completed, and refunded if a session is cancelled.
  - A navbar badge shows your live balance, and the **Credits** page lists every transaction.
- **Perfect swaps.** The Learn page opens with people you can trade with both ways: they teach something you want, and want something you teach. Each card shows "They teach you … / You teach them …". When accepting a request, the teacher's "skill to learn in return" picker lists their wishlist skills first and pre-selects one.
- **Smart matching.** The Learn page ranks teachers by a weighted score:

  | Factor | Weight |
  | --- | --- |
  | Rating | 30% |
  | Hours taught | 20% |
  | Preferred-days match | 20% |
  | Overlapping availability, compared in UTC | 15% |
  | Learning-format match | 15% |

  The page has three sections:
  - **Perfect Swaps:** a two-way match, ranked by how many skills overlap.
  - **Best Matches:** they teach something you want.
  - **All Teachers:** everyone else.
- **Chat.** Connection requests, real-time messaging, online status, clickable links and reporting of abusive users.
- **Book from free slots.** When requesting a session, learners see the teacher's actual free times for the next two weeks, shown in their own timezone. These are worked out from the teacher's availability, minus sessions already booked by either person. Learners can also propose a custom time or let the teacher decide.
- **Session scheduling.**
  - Learners request a session, usually with a time picked from the teacher's free slots.
  - Teachers accept by choosing days of the week, a time and a number of weeks (1–12), plus the skill they want in return.
  - Sessions can be rescheduled or cancelled by either participant.
- **Video meetings.** The teacher creates a Zoom meeting on demand. The learner gets a real-time "meeting started" notification with the join link. Connected users can also start an instant session from chat.
- **Calendar sync.** Optionally connect Google Calendar or Outlook, and confirmed sessions become calendar events with reminders.
- **Progress tracking.**
  - **Dashboard:** hours exchanged, active sessions, daily learning streak, skills mastered (5+ hours taught), per-skill learning progress and a session calendar.
  - **Profile:** a plain-English summary report of who you've taught and learned from.
- **Reviews.** Learners rate teachers (1–5 stars) after a completed session, and ratings feed into matching.
- **Notifications and reminders.** A bell in the navbar shows real-time notifications: new requests, acceptances, reschedules, cancellations, chat requests, reviews and meetings starting. Every confirmed session gets a reminder within 24 hours of the start and another within the hour, in the app and by email.
- **Account security.** Users verify their email address, and can reset a forgotten password with a single-use emailed link.

**For administrators**
- Dashboard with user, report, session and conversation counts.
- Review reports with the full conversation history, delete messages, and resolve or dismiss reports.
- Ban users (immediately disconnects them) or time them out from chatting for a number of days.
- Live updates over Socket.IO when new reports arrive.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3, lucide-react icons, Axios, socket.io-client |
| Backend | Node.js, Express 4, Mongoose 8, Socket.IO 4, JSON Web Tokens, bcryptjs, node-cron, Nodemailer |
| Database | MongoDB (local or Atlas) |
| Integrations | Zoom Server-to-Server OAuth, Google Calendar API (`googleapis`), Microsoft Graph (Outlook), any SMTP email provider |

---

## How it works

### Session and barter lifecycle

```
Learner requests a skill, picking one of the teacher's free slots (or a custom time)
        │
        ▼
   [pending] ── teacher declines ──► [cancelled]
        │
        │ teacher accepts: picks days, time, weeks, duration
        │ and a skill to learn from the learner in return
        ▼
   [confirmed] × N sessions   +   reverse "barter" request (pending)
        │                          └─ the original learner schedules it
        │                             the same way, now as the teacher
        ├── either side reschedules / cancels
        ▼
   teacher starts the Zoom meeting once the session begins
        ▼
   teacher marks it complete (only after it has started)
        ▼
   [completed] → hours, streaks and stats update → learner can review
```

When the learner proposed a time, the teacher's form is pre-filled with that day and time, and the recurring schedule starts from that date.

### Time credits

1 credit = 1 hour, and credits only ever move between users, so the total in circulation stays fixed, like a time bank. Barter sessions don't use credits.

| Event | Learner | Teacher |
| --- | --- | --- |
| Sign up | +3 (welcome) | — |
| Teacher confirms a credit request (N sessions × H hours) | −N×H reserved | — |
| A session is completed | — | +H earned |
| A confirmed session is cancelled | +H refunded | — |

- **No overdrafts:** each reservation is a single database operation that checks the balance and deducts it, so balances can't go negative, even when two teachers accept at the same moment.
- **No double payouts:** completing and cancelling are both one-step status changes, so a session is either paid out or refunded, never both, and never twice.
- **Fixed length:** a credit session's length can't be changed after booking (its credits are already reserved). It can still be moved to another time.
- **Ledger:** every change is recorded in a `CreditTransaction` with the resulting balance.
- **Existing accounts:** accounts created before credits existed receive their 3 starting credits once, at server start.

Business rules enforced by the server:
- A learner can request only skills the teacher lists. Duplicate pending requests are rejected.
- A barter skill must be one of the learner's teachable skills. Credit requests need no barter skill.
- Only the teacher can mark a session complete, and only once it has started. Hours are awarded exactly once.
- Instant sessions are only allowed between users with an accepted chat connection.
- Durations are 0.5–8 hours. Recurring schedules are 1–12 weeks.

### Time zones

Users pick a UTC offset (e.g. `GMT+05:30`) in their profile. If none is set, the browser's offset is used. Days and times entered in forms are interpreted in that timezone, sent to the server as UTC, and displayed back in the user's timezone. For example, a teacher in India who picks "Thursday 18:00" gets a session stored as 12:30 UTC.

### Free slots

Teachers set their availability on their profile:
- **Preferred days:** weekdays, weekends, both, or flexible.
- **Timezone.**
- **One or more time ranges,** e.g. `6:00 PM - 9:00 PM`. Ranges may run past midnight.

`GET /api/sessions/availability/:teacherId` turns this into concrete slots for the next 14 days, using these rules:
- Slots start every 30 minutes.
- Slots must be at least 1 hour in the future.
- Slots that overlap a confirmed session of the teacher or the requesting learner are removed.
- "Flexible" availability is treated as 9 AM–9 PM in the teacher's timezone.

### Reminders and notifications

A background job runs every 10 minutes. For each confirmed session it sends:
- a reminder once the session is less than 24 hours away
- a "starting soon" reminder once it is less than an hour away

Each reminder is sent once, and rescheduling resets them. Reminders always appear in the app. They are also emailed to users with a verified email address.

### Chat and moderation

Users must send a chat request and have it accepted before they can message each other. If both users request each other, the connection is accepted automatically. A **timeout** blocks only chatting for a set number of days. A **ban** blocks the whole account and disconnects the user's open sockets.

---

## Project structure

```
SkillSwap_Final/
├── backend/
│   ├── server.js              # Express app, Socket.IO setup, error handling
│   ├── config/db.js           # MongoDB connection
│   ├── middleware/
│   │   ├── auth.js            # JWT verification, blocks banned users
│   │   ├── admin.js           # Admin-only guard
│   │   ├── chatAllowed.js     # Blocks chat actions for timed-out users
│   │   └── rateLimit.js       # In-memory rate limiter (login/register)
│   ├── models/                # User, Session, Conversation, Message, Review, Report,
│   │                          # Notification, CreditTransaction
│   ├── routes/                # auth, profile, skills, sessions, reviews,
│   │                          # messages, stats, calendar, admin, notifications, credits
│   ├── services/
│   │   ├── zoomService.js     # Zoom meeting creation
│   │   ├── calendarService.js # Google & Outlook calendar events
│   │   ├── creditService.js   # Time-credit balance changes + ledger
│   │   ├── emailService.js    # Nodemailer emails (verification, reset, reminders)
│   │   ├── notificationService.js # In-app notifications pushed over Socket.IO
│   │   └── reminderService.js # Cron job sending session reminders
│   ├── utils/                 # Schedules, free-slot calculation, timezones,
│   │                          # email-link tokens, moderation, regex escaping
│   ├── scripts/createAdmin.js # Create or promote an admin account
│   ├── tests/                 # Unit tests (node:test)
│   └── .env.example
└── frontend/
    ├── index.html
    ├── public/                # logo and static assets
    ├── src/
    │   ├── App.jsx, main.jsx, config.js
    │   ├── components/
    │   │   ├── admin/         # AdminPanel
    │   │   ├── auth/          # Login, Register, ForgotPassword, ResetPassword, VerifyEmail
    │   │   ├── credits/       # CreditsPage (balance + history)
    │   │   ├── common/        # TimeSlotManager, SlotPicker, RequestSessionModal,
    │   │   │                  # VerifyEmailBanner
    │   │   ├── dashboard/     # Dashboard, Browse, ChatPage, RequestsPage,
    │   │   │                  # UserProfileModal, ReviewModal, MeetingNotification
    │   │   ├── global/        # Toast
    │   │   ├── layout/        # Navbar, NotificationBell, CreditsBadge
    │   │   ├── onboarding/    # ChatbotOnboarding
    │   │   ├── profile/       # Profile
    │   │   └── routing/       # AppRouter
    │   ├── context/           # AuthContext, SocketContext, ToastContext
    │   ├── services/          # api.js (Axios client), chat.js
    │   └── utils/             # skills, timeSlots, timezone, matching (perfect swaps), credits
    └── .env.example
```

---

## Getting started

### Prerequisites

- **Node.js 18 or newer** (developed on Node 22)
- **MongoDB**, either a local installation or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Backend

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `backend/.env` and set at least `MONGO_URI` and `JWT_SECRET`. To generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then install and start:

```bash
npm install
npm run dev                 # API on http://localhost:5000
```

You should see `Server started on port 5000` and `MongoDB Connected...`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env        # optional; defaults to http://localhost:5000
npm install
npm run dev                 # app on http://localhost:5173
```

Open http://localhost:5173, register an account and complete the onboarding chat.

> Zoom, calendar and email settings are optional. Without SMTP settings, emails (verification and reset links, reminders) are printed to the backend console instead of sent, which is handy in development: copy the link from the terminal.
> Everything else works without these integrations, and the app shows a clear message if you try to use one that isn't configured.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Long random string for signing login tokens. The server refuses to start without it. |
| `PORT` | No | `5000` | API port |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend origin, used for CORS and for redirects after calendar sign-in |
| `ZOOM_ACCOUNT_ID` | For video | — | Zoom Server-to-Server OAuth app |
| `ZOOM_CLIENT_ID` | For video | — | Zoom Server-to-Server OAuth app |
| `ZOOM_CLIENT_SECRET` | For video | — | Zoom Server-to-Server OAuth app |
| `GOOGLE_CLIENT_ID` | For Google Calendar | — | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | For Google Calendar | — | Google OAuth client |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:5000/api/calendar/google/callback` | Must match the URI registered with Google |
| `OUTLOOK_CLIENT_ID` | For Outlook | — | Azure app registration |
| `OUTLOOK_CLIENT_SECRET` | For Outlook | — | Azure app registration |
| `OUTLOOK_REDIRECT_URI` | No | `http://localhost:5000/api/calendar/outlook/callback` | Must match the URI registered in Azure |
| `SMTP_HOST` | For email | — | SMTP server. When empty, emails are printed to the console. |
| `SMTP_PORT` | No | `587` | `465` for implicit TLS |
| `SMTP_SECURE` | No | `false` | `true` for implicit TLS (port 465 also enables it) |
| `SMTP_USER`, `SMTP_PASS` | For email | — | SMTP credentials |
| `EMAIL_FROM` | No | `SkillSwap <no-reply@skillswap.local>` | Sender shown on emails |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000` | Backend URL for the REST API and Socket.IO |

> **Never commit `.env` files.** They are listed in `.gitignore`. Share configuration through `.env.example` only.

---

## Third-party integrations

### Email (SMTP)

Any SMTP provider works. Some common choices:

| Provider | Settings |
| --- | --- |
| Gmail | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, your address as `SMTP_USER`, and an [App Password](https://myaccount.google.com/apppasswords) as `SMTP_PASS` (requires 2-Step Verification) |
| Brevo, Mailgun, SendGrid | Use the SMTP credentials from the provider's dashboard |
| Mailtrap | A test inbox that catches every email, useful for development |

Links in emails point to `FRONTEND_URL`, so set it to your real domain in production.

### Zoom

1. In the [Zoom App Marketplace](https://marketplace.zoom.us/), create a **Server-to-Server OAuth** app.
2. Add the `meeting:write:admin` scope (or `meeting:write` for a single user) and activate the app.
3. Copy the Account ID, Client ID and Client Secret into `ZOOM_*`.

All meetings are created under this Zoom account. The teacher receives the host link; the learner receives the join link.

### Google Calendar

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Calendar API**.
2. Create an **OAuth client ID** of type *Web application*.
3. Add `http://localhost:5000/api/calendar/google/callback` as an authorized redirect URI.
4. Configure the OAuth consent screen with the `calendar.events` scope, and add your test users while the app is in testing mode.
5. Copy the client ID and secret into `GOOGLE_*`.

### Outlook Calendar

1. In the [Azure portal](https://portal.azure.com/), go to **App registrations → New registration**, and choose *Accounts in any organizational directory and personal Microsoft accounts*.
2. Add a **Web** redirect URI: `http://localhost:5000/api/calendar/outlook/callback`.
3. Under **API permissions**, add Microsoft Graph delegated permissions `Calendars.ReadWrite` and `offline_access`.
4. Under **Certificates & secrets**, create a client secret.
5. Copy the application (client) ID and the secret value into `OUTLOOK_*`.

Users connect a calendar from **Profile → Calendar Integration**. Events are created on the teacher's calendar with the learner invited as an attendee.

---

## Admin accounts

Create a new admin, or promote an existing account by email:

```bash
cd backend
node scripts/createAdmin.js admin@example.com "a-strong-password"
```

- New admin accounts need a password of at least 8 characters.
- If an account with that email exists, it is promoted to admin and the password argument is ignored.
- Admins are sent to `/admin` after logging in and do not appear in the Learn page listings.

---

## Scripts and testing

| Location | Command | Description |
| --- | --- | --- |
| `backend/` | `npm run dev` | Start the API with auto-reload (nodemon) |
| `backend/` | `npm start` | Start the API |
| `backend/` | `npm test` | Run unit tests with Node's built-in test runner |
| `frontend/` | `npm run dev` | Start the Vite dev server |
| `frontend/` | `npm run build` | Production build into `frontend/dist/` |
| `frontend/` | `npm run preview` | Serve the production build locally |

The unit tests cover:
- recurring-session date generation, including timezone and date-line edge cases
- free-slot calculation
- time-slot parsing and timezone formatting
- email-link tokens and password-change checks
- schedule validation and regex escaping

---

## API reference

All endpoints are prefixed with `/api`. Authenticated endpoints expect the login token in the `x-auth-token` header. Errors are returned as JSON: `{ "msg": "..." }`.

### Auth: `/api/auth`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | — | Create an account `{ username, email, password }` → `{ token }`. Rate limited. |
| POST | `/login` | — | `{ email, password }` → `{ token }`. Rate limited. |
| GET | `/` | ✓ | Current user |
| POST | `/forgot-password` | — | `{ email }` → emails a reset link (same response whether or not the account exists) |
| POST | `/reset-password` | — | `{ token, password }` → sets a new password and signs out other sessions |
| POST | `/send-verification` | ✓ | Re-send the verification email |
| POST | `/verify-email` | — | `{ token }` → marks the email as verified |

Reset links expire after 1 hour and verification links after 24 hours. Both are single-use, and only a hash of each token is stored.

### Profile: `/api/profile`
| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Your profile with derived stats |
| PUT | `/` | Update `skillsToTeach`, `skillsToLearn`, `availability`, `preferredFormat` |
| GET | `/all` | Public profiles of all active users |
| GET | `/user/:id` | One user's public profile |

### Sessions: `/api/sessions`
| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Your sessions (teaching and learning) |
| GET | `/availability/:teacherId?duration=1&days=14` | Free slots with a teacher (UTC). `duration` is in hours (0.5–8) and `days` is 1–28. |
| POST | `/request` | Request a session `{ teacherId, skill, proposedTime?, durationHours?, paymentType?: 'barter' \| 'credits' }` |
| POST | `/instant` | Start an instant Zoom session with a connected user |
| PUT | `/respond/:id` | Teacher accepts `{ response: 'confirmed', daysOfWeek, timeOfDay, numberOfWeeks, durationHours, utcOffsetMinutes, barterSkill }` (`barterSkill` only for barter requests) or declines `{ response: 'declined' }`. For credit requests the response includes `creditsReserved`. |
| POST | `/create-meeting/:id` | Teacher creates the Zoom meeting |
| PUT | `/reschedule/:id` | `{ scheduledTime, durationHours? }` |
| PUT | `/cancel/:id` | Cancel a confirmed session |
| PUT | `/complete/:id` | Teacher marks a started session complete |
| POST | `/reviews` | Review a completed session `{ sessionId, revieweeId, rating, comment? }` |

### Messages: `/api/messages`
| Method | Path | Description |
| --- | --- | --- |
| POST | `/request/:recipientId` | Send a chat request (accepts automatically if they already asked you) |
| GET | `/start/:recipientId` | Existing conversation with a user, or `null` |
| GET | `/requests/pending` | `{ incoming, outgoing }` chat requests |
| POST | `/requests/:id/accept` | Accept a chat request |
| POST | `/requests/:id/reject` | Reject a chat request |
| GET | `/conversations/my` | Accepted conversations with their last message |
| GET | `/:conversationId` | Message history |
| POST | `/report` | Report a user `{ reportedUserId, reason, description, conversationId?, messageId? }` |

### Other
| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/skills/search?skill=` | Teachers who teach a skill |
| GET | `/api/reviews/user/:userId` | Reviews about a user |
| GET | `/api/reviews/my` | Reviews you have written |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/stats/skills` | Learning progress per skill |
| GET | `/api/stats/summary` | Plain-English activity summary |
| GET | `/api/calendar/{google,outlook}/auth` | Get the calendar sign-in URL |
| GET | `/api/calendar/status` | Calendar connection status |
| DELETE | `/api/calendar/disconnect` | Disconnect your calendar |

### Credits: `/api/credits`
| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ balance, startingCredits, transactions }`: your balance and the latest 100 ledger entries |

### Notifications: `/api/notifications`
| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ notifications, unreadCount }`: the latest 30 |
| PUT | `/:id/read` | Mark one as read |
| PUT | `/read-all` | Mark all as read |

Notifications are deleted automatically after 60 days.

### Admin: `/api/admin` (admin only)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/dashboard` | Platform statistics and recent reports |
| GET | `/reports?status=` | Reports, filterable by status |
| GET | `/reports/:id` | Report with the conversation's messages |
| PUT | `/reports/:id/resolve` | `{ status: 'resolved' \| 'dismissed', adminNotes?, action?: 'ban' }` |
| GET | `/users?search=` | Users, searchable by name or email |
| GET | `/users/:id` | User details, reports and recent sessions |
| PUT | `/users/:id/ban` | `{ isBanned, banReason? }` |
| PUT | `/users/:id/timeout` | `{ days, reason? }` |
| PUT | `/users/:id/remove-timeout` | Lift a chat timeout |
| GET | `/conversations/:id` | Conversation and messages |
| DELETE | `/messages/:id` | Delete a message |

---

## Real-time events

The Socket.IO client connects with the login token: `io(API_URL, { auth: { token } })`. The server identifies the user from the token and joins them to their own room automatically. Admins also join an admin room.

| Direction | Event | Payload / purpose |
| --- | --- | --- |
| client → server | `sendMessage` | `{ conversationId, content }` (max 2000 characters) |
| server → client | `receiveMessage` | New message, sent to both participants |
| server → client | `chatError` | Why a message was rejected (not connected, timed out, …) |
| server → client | `onlineUsers` / `userOnline` / `userOffline` | Presence |
| server → client | `newChatRequest`, `chatRequestAccepted`, `chatRequestRejected`, `conversationUpdate` | Chat request changes |
| server → client | `meetingCreated` | A Zoom meeting was started for your session |
| server → client | `notification` | A new in-app notification (also shown as a toast) |
| server → client | `creditsUpdate` | `{ balance }`: your credit balance changed |
| server → admins | `newReport`, `reportResolved`, `dashboardUpdate`, `userBanned`, `userUnbanned`, `userTimedOut`, `userTimeoutRemoved` | Moderation updates |

---

## Security

- Passwords are hashed with bcrypt. Login tokens are JWTs valid for 10 hours, after which the app returns the user to the login page.
- A password reset signs out every existing session, both REST and socket. Email-link tokens are random, single-use, short-lived, and stored only as SHA-256 hashes.
- The forgot-password endpoint gives the same answer for every email, so it can't be used to find out who has an account. Email endpoints are limited to 5 requests per 15 minutes.
- Passwords and calendar OAuth tokens are never returned by the API. Other users' emails are not exposed.
- Socket connections require a valid token, and the sender of every message is taken from that token.
- Calendar sign-in uses a signed state value that expires after 10 minutes, so a calendar can only be linked to the account that started the flow.
- Login and registration are limited to 20 attempts per 15 minutes per IP address.
- User input used in database searches is escaped, request bodies are limited to 100 KB, and errors are returned as JSON without internal details.

If you deploy this publicly, also serve it over HTTPS, set `FRONTEND_URL` to your real domain, and use a fresh `JWT_SECRET` and fresh integration credentials.

---

## Known limitations

- **Phone layouts are not supported.** The UI is designed for desktop screens.
- **Single server process.** Rate limiting and online-presence tracking are kept in memory, so running several server instances would need a shared store such as Redis.
- **Fixed UTC offsets.** Timezones are stored as offsets, so daylight-saving changes are not applied automatically.
- **Few email types.** Email is used for verification, password resets and reminders. Other events (new requests, cancellations) are in-app only.
- **Credits have no admin tools.** Admins can't adjust balances, and credits can't be gifted between users.
- **Ledger writes are separate from balance updates.** If writing the ledger entry fails, the balance is still correct but that entry is missing (the failure is logged). Using MongoDB transactions would need a replica set.
- **Account settings are limited.** Users can't change their email address or password while logged in (only through "Forgot password").
- **Two moderate dependency advisories remain.** `react-router` 6 needs a v7 migration, and `uuid` sits inside `googleapis`. Neither affects how this app uses those libraries.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `JWT_SECRET is not set` on startup | Create `backend/.env` from `.env.example` and fill it in |
| `MongoDB` connection error | Check `MONGO_URI`. For Atlas, allow your IP under *Network Access*. |
| Browser shows CORS errors | Make sure `FRONTEND_URL` exactly matches the address in your browser (e.g. `localhost` vs `127.0.0.1`) |
| Chat doesn't update in real time | Check that `VITE_API_URL` points to the backend, and look for socket errors in the browser console |
| "Could not create Zoom meeting" | Check the `ZOOM_*` values and that the Zoom app is activated with meeting scopes |
| Calendar sign-in fails with `redirect_uri_mismatch` | The redirect URI registered with Google or Azure must exactly match `GOOGLE_REDIRECT_URI` / `OUTLOOK_REDIRECT_URI` (or the defaults) |
| "Too many attempts" when logging in | Wait 15 minutes, or restart the backend in development |
| Verification or reset emails don't arrive | Without `SMTP_HOST`, look for `[email:dev]` in the backend console. With SMTP, check the credentials and the spam folder. The backend logs `Failed to send email` on errors. |
| Reset link says "invalid or has expired" | Links last 1 hour and work once. Request a new one from "Forgot password?" |
| No free slots when booking | The teacher hasn't set time slots in Profile → Availability, or every slot in the next 14 days is booked. Use "Custom time" instead. |
