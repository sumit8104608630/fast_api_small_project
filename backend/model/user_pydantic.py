from pydantic import BaseModel


class user_pydantic(BaseModel):
    id: int | None = None
    username:str
    password:str

    
