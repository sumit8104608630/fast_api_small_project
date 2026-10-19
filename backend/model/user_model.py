from sqlalchemy import Column, Integer, String, DateTime, Boolean
from database.connection import base
from sqlalchemy.orm import relationship


class User(base):
    __tablename__="users"
    id=Column(Integer,primary_key=True,index=True,autoincrement=True)
    username=Column(String(255),nullable=False,index=True,unique=True)
    password=Column(String(255),nullable=False)
    google_id = Column(String(255), nullable=True, unique=True, index=True)
    items=relationship("item",back_populates="user")


