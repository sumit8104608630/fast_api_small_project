from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from database.connection import base
from datetime import datetime
from sqlalchemy.orm import relationship


class item(base):
    __tablename__="items"
    id=Column(Integer,primary_key=True,index=True,autoincrement=True)
    title=Column(String(255),nullable=False)
    completed=Column(Boolean,default=False)
    created_at=Column(DateTime,default=datetime.now)
    user_id=Column(Integer,ForeignKey("users.id"),nullable=False)
    user = relationship("User", back_populates="items")