
import os
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base

# Use environment variable for database URL, fallback to local for development
database_url = os.getenv("DATABASE_URL", "postgresql://postgres:sss81046@localhost:5432/todo")

# Render uses 'postgres://' but SQLAlchemy 1.4+ requires 'postgresql://'
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(database_url)
SessionLocal = sessionmaker(autoflush=False, autocommit=False, bind=engine)

base = declarative_base()