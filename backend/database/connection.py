
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base

database_url="postgresql://postgres:sss81046@localhost:5432/todo"
engine=create_engine(database_url)
SessionLocal = sessionmaker(autoflush=False,autocommit=False,bind=engine)

base = declarative_base()