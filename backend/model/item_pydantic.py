from pydantic import BaseModel

class product(BaseModel):
    title: str
    completed: bool = False
    
