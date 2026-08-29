from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import db
from backend.routes.user import router as users_router
from backend.routes.room import router as room_router
from backend.routes.members import router as members_router
from backend.routes.expenses import router as expenses_router
from backend.balances import router as balances_router
from backend.settlements import router as settlements_router


app = FastAPI(
    title="SplitTrack API",
    description="Backend for the SplitTrack student expense tracker",
    version="1.0.0"
)


# ==========================================================
# CORS
# ==========================================================
# Allows the GitHub Pages frontend and local development
# frontend to communicate with the FastAPI backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://it4xi.github.io",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================
# ROUTES
# ==========================================================
app.include_router(users_router)
app.include_router(room_router)
app.include_router(members_router)
app.include_router(expenses_router)
app.include_router(balances_router)
app.include_router(settlements_router)


# ==========================================================
# HOME
# ==========================================================
@app.get("/")
def home():
    return {
        "message": "SplitTrack backend is running!",
        "version": "1.0.0"
    }


# ==========================================================
# HEALTH CHECK
# ==========================================================
@app.get("/api/health")
def health_check():
    try:
        db.command("ping")

        return {
            "status": "healthy",
            "database": "connected"
        }

    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }