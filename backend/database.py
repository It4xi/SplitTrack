import os

from dotenv import load_dotenv
from pymongo import MongoClient


# Load values from the .env file
load_dotenv()

# Read the MongoDB connection string
MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("MONGO_URI is missing from .env")


# Create MongoDB client
client = MongoClient(MONGO_URI)

# Select the SplitTrack database
db = client["splittrack"]