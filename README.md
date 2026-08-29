# SplitTrack

A full-stack student expense tracker for shared rooms, roommate expenses, balances, and settlements.

## Live Deployment

Frontend: https://it4xi.github.io/SplitTrack/

Backend: https://splittrack-api.onrender.com

API Docs: https://splittrack-api.onrender.com/docs

Database: MongoDB Atlas

## Features

- Basic username and password sign up
- Basic username and password login
- Per-user authentication sessions
- User-specific room access
- Room and roommate management
- Expense management
- Equal, exact, and percentage expense splitting
- Balance calculation
- Settlement calculation
- MongoDB persistence
- Responsive dark/light frontend

## Stack

Frontend: HTML, CSS, Vanilla JavaScript

Backend: Python, FastAPI, Uvicorn, PyMongo

Database: MongoDB Atlas

Hosting: GitHub Pages + Render

## Project Structure

```text
SplitTrack/
├── index.html
├── script.js
├── style.css
├── assets/
│
├── backend/
│   ├── main.py
│   ├── auth.py
│   ├── database.py
│   ├── schemas.py
│   ├── calculations.py
│   ├── balances.py
│   ├── settlements.py
│   └── routes/
│       ├── auth.py
│       ├── user.py
│       ├── room.py
│       ├── members.py
│       └── expenses.py
│
├── requirements.txt
├── .gitignore
└── README.md
```

## Authentication

SplitTrack uses a lightweight username/password authentication flow designed for a student and hackathon project.

Passwords are stored as password hashes rather than plaintext.

Authentication endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

The frontend stores only the authentication token locally. Application data is loaded from the backend and persisted in MongoDB Atlas.

## API

### Users

- `POST /api/users/`
- `GET /api/users/`
- `GET /api/users/{user_id}`

### Rooms

- `POST /api/rooms/`
- `GET /api/rooms/`
- `GET /api/rooms/{room_id}`

### Room Members

- `POST /api/rooms/{room_id}/members`
- `GET /api/rooms/{room_id}/members`
- `DELETE /api/rooms/{room_id}/members/{member_id}`
- `PUT /api/rooms/{room_id}/members/{member_id}`

### Expenses

- `POST /api/expenses/`
- `GET /api/expenses/{room_id}`
- `PUT /api/expenses/{expense_id}`
- `DELETE /api/expenses/{expense_id}`

### Balances

- `GET /api/balances/{room_id}`

### Settlements

- `GET /api/settlements/{room_id}`

## Local Development

Create a `.env` file in the project root:

```text
MONGO_URI=your_mongodb_connection_string
AUTH_SECRET=your_demo_auth_secret
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn backend.main:app --reload
```

Serve the frontend from the project root with a local HTTP server.

## Deployment

The frontend is intended for GitHub Pages.

The FastAPI backend is intended for Render.

Required Render environment variables:

- `MONGO_URI`
- `AUTH_SECRET`

Never commit environment files or database credentials to GitHub.

## Notes

This authentication implementation is intentionally lightweight and intended for a student portfolio and hackathon demonstration.

## Author

Kartheek (@It4xi)

https://github.com/It4xi/SplitTrack
