
from datetime import datetime, timedelta, timezone
from typing import Annotated
from google.cloud import bigquery
from google.oauth2 import id_token
from pydantic import BaseModel
from sqlalchemy import null
from google.auth.transport import requests as google_requests
import requests
import secrets

from database.connection import base
import jwt
from fastapi import Depends, FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pwdlib import PasswordHash

from database.connection import SessionLocal, engine
from model.item_model import item
from model.item_pydantic import product
from model.user_model import User
from model.user_pydantic import user_pydantic

# ---------------- CONFIGURATION ----------------

# Use a strong secret from an environment variable in production.
SECRET_KEY = "sss81046"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Must match the clientId used by <GoogleOAuthProvider> in the frontend
GOOGLE_CLIENT_ID = (
    "725060787408-t5gk57mdt1tnr0p8nm042fa9d3g9nj9e.apps.googleusercontent.com"
)

server = FastAPI()

password_hash = PasswordHash.recommended()


base.metadata.create_all(bind=engine)

#----- google credential -----

class google_credential(BaseModel):
    access_token: str

# ---------------- DATABASE ----------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dep = Annotated[Session, Depends(get_db)]


# ---------------- PASSWORD HASHING ----------------

def hash_password(password: str) -> str:
    return password_hash.hash(password)


# ---------------- JWT ----------------

def create_access_token(username: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": username,
        "exp": expires_at,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ---------------- USER LOOKUP ----------------

def user_info(username: str, db: Session):
    return (
        db.query(User)
        .filter(User.username == username)
        .first()
    )


# ---------------- AUTHENTICATION MIDDLEWARE ----------------

@server.middleware("http")
async def authenticate(request: Request, call_next):

    # Routes that do not require authentication
    public_paths = {
        "/login",
        "/user",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/google_login",
    }

    # Allow browser CORS preflight requests
    if request.method == "OPTIONS":
        return await call_next(request)

    # Allow public routes
    if request.url.path in public_paths:
        return await call_next(request)

    access_token = request.cookies.get("access_token")

    if not access_token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Access token missing. Please log in."},
        )

    db = SessionLocal()

    try:
        payload = jwt.decode(
            access_token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        username = payload.get("sub")

        if not username:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid token"},
            )

        user = user_info(username, db)

        if not user:
            return JSONResponse(
                status_code=401,
                content={"detail": "User not found"},
            )

        # Store the authenticated user object in the request
        request.state.user = user

        # Continue to the requested API route
        return await call_next(request)

    except jwt.ExpiredSignatureError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Token expired. Please log in again."},
        )

    except jwt.InvalidTokenError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid token"},
        )

    finally:
        db.close()


# ---------------- CORS ----------------
# Added AFTER the auth middleware on purpose: Starlette wraps middlewares in the
# reverse order they were added, so the LAST one added is the outermost layer.
# CORS must be outermost, otherwise the 401 JSONResponse returned by
# `authenticate` bypasses CORSMiddleware and the browser reports a CORS error
# instead of a 401.

origin = ["http://localhost:5173"]

server.add_middleware(
    CORSMiddleware,
    allow_origins=origin,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Google Login -----------------

@server.post("/google_login")
def google_login(
    request: google_credential,
    db: db_dep,
    response: Response,
):
    access_token = request.access_token

    if access_token is None:
        raise HTTPException(
            status_code=400,
            detail="Access token missing",
        )

    try:
        # Verify access token by calling Google's userinfo endpoint
        user_info_res = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if not user_info_res.ok:
            raise Exception("Google API returned error")
        
        payload = user_info_res.json()
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="Invalid token",
        )

    email = payload.get("email")
    google_id = payload.get("sub")

    if not email or not google_id:
        raise HTTPException(
            status_code=400,
            detail="Google account has no email",
        )

    # 1. User already signed in with Google before
    user = (
        db.query(User)
        .filter(User.google_id == google_id)
        .first()
    )

    # 2. Same email exists from a normal registration -> link the Google id
    if not user:
        user = (
            db.query(User)
            .filter(User.username == email)
            .first()
        )
        if user:
            user.google_id = google_id

    # 3. First time we see this account -> create it
    if not user:
        user = User(
            username=email,
            # Random unusable password; this account logs in via Google only
            password=hash_password(secrets.token_urlsafe(32)),
            google_id=google_id,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.username)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # Local HTTP only; use True with HTTPS in production
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

    return {"username": user.username, "email": email}



# ---------------- CREATE ITEM ----------------

@server.post("/")
def hello(
    product_data: product,
    db: db_dep,
    request: Request,
):
    current_user = request.state.user

    try:
        new_item = item(**product_data.model_dump(), user_id=current_user.id)
        new_item.user_id=current_user.id
        db.add(new_item)
        db.commit()
        db.refresh(new_item)

        return {
            "message": "Item added successfully",
            "username": current_user.username,
            "item": new_item,
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create item",
        )


# ---------------- GET ALL ITEMS ----------------

@server.get("/")
def all_product(request: Request, db: db_dep):
    current_user = request.state.user
    
    return db.query(item).filter(item.user_id == current_user.id).all()


# ---------------- DELETE ITEM ----------------

@server.delete("/{id}")
def delete_product(
    id: int,
    db: db_dep,
    request: Request,
):
    
    current_user = request.state.user
    if(current_user==None):
        raise HTTPException(
            status_code=401,
            detail="User not logged in",
        )
    

    item_to_delete = (
        db.query(item)
        .filter(item.id == id, item.user_id == current_user.id)
        .first()
    )

    if not item_to_delete:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
        )

    db.delete(item_to_delete)
    db.commit()

    return {
        "message": "Item deleted successfully",
        "username": current_user.username,
    }


# ---------------- UPDATE ITEM ----------------

@server.put("/{id}")
def update_completed(
    id: int,
    db: db_dep,
    request: Request,
):
    current_user = request.state.user

    db_item = (
        db.query(item)
        .filter(item.id == id, item.user_id == current_user.id)
        .first()
    )

    if not db_item:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
        )

    db_item.completed = not db_item.completed
    db.commit()
    db.refresh(db_item)

    return {
        "message": "Item updated successfully",
        "username": current_user.username,
        "item": db_item,
    }


# ---------------- ACTIVE ITEMS ----------------

@server.get("/active")
def active_item(db: db_dep, request: Request):
    current_user = request.state.user
    return (
        db.query(item)
        .filter(item.completed.is_(False), item.user_id == current_user.id)
        .all()
    )


# ---------------- COMPLETED ITEMS ----------------

@server.get("/completed")
def completed_item(db: db_dep, request: Request):
    current_user = request.state.user

    return (
        db.query(item)
        .filter(item.completed.is_(True), item.user_id == current_user.id)
        .all()
    )


# ---------------- REGISTER USER ----------------

@server.post("/user")
def register(user_data: user_pydantic, db: db_dep):

    existing_user = (
        db.query(User)
        .filter(User.username == user_data.username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Username already exists",
        )

    new_user = User(
        username=user_data.username,
        password=hash_password(user_data.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Never expose the password hash
    return {
        "message": "User registered successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
        },
    }


# ---------------- LOGIN USER ----------------

@server.post("/login")
def user_login(
    credential: user_pydantic,
    db: db_dep,
    response: Response,
):
    user = (
        db.query(User)
        .filter(User.username == credential.username)
        .first()
    )

    if not user or not password_hash.verify(
        credential.password,
        user.password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    access_token = create_access_token(user.username)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # Local HTTP only; use True with HTTPS in production
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

    return {"message": "Login successful"}


# ---------------- LOGOUT USER ----------------

@server.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )

    return {"message": "Logout successful"}
