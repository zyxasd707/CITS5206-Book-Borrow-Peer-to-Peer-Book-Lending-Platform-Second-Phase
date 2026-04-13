from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import secrets
import time

from brevo import Brevo

from core.config import settings
from core.security import create_access_token, verify_password, get_password_hash
from core.dependencies import get_db, get_current_user
from services.auth_service import AuthService
from models.user import User
from models.ban import Ban

# { email: {"token": str, "expires": float} }
reset_token_store: dict = {}
RESET_TOKEN_TTL = 900  # 15 minutes

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Pydantic models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    confirm_password: str
    agree_terms: bool

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        password = info.data.get("password")
        if password and v != password:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("agree_terms")
    @classmethod
    def terms_agreed(cls, v: bool, info) -> bool:
        if not v:
            raise ValueError("Must agree to terms")
        return v

class UserResponse(BaseModel): #identify logged in user
    id: str
    name: str
    email: str
    location: Optional[str] = None
    avatar: Optional[str] = None
    createdAt: str
    is_admin: bool

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    
    # Check if user exists
    if auth_service.get_user_by_email(user_data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = get_password_hash(user_data.password)
    
    # Create user (location/avatar optional, can be updated later)
    user = User(
        user_id=auth_service.generate_user_id(),  # Assuming UUID in service
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_password,
        password_algo="bcrypt"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return UserResponse(
    id=user.user_id,
    name=user.name,
    email=user.email,
    location=user.location,
    avatar=user.avatar,
    createdAt=user.created_at.isoformat(),
    is_admin=user.is_admin,  #return is_admin from register
)

@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    user = auth_service.authenticate_user(login_data.email, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is banned
    active_ban = db.query(Ban).filter(Ban.user_id == user.user_id, Ban.is_active == True).first()
    if active_ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is banned: {active_ban.reason}"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token}

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # Client-side: clear token from storage
    # Optional: Implement token blacklist here if needed
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)  
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.user_id,
        name=current_user.name,
        email=current_user.email,
        location=current_user.location,
        avatar=current_user.avatar,
        createdAt=current_user.created_at.isoformat()
    )


# ── Forgot / Reset Password ───────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if info.data.get("new_password") and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    user = auth_service.get_user_by_email(request.email)

    # Always return the same message to prevent email enumeration
    generic_response = {"message": "If this email is registered, a reset link has been sent."}

    if not user:
        return generic_response

    # Generate a secure random token and store it
    token = secrets.token_urlsafe(32)
    reset_token_store[request.email] = {
        "token": token,
        "expires": time.time() + RESET_TOKEN_TTL,
    }

    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}&email={request.email}"

    # Send email via Brevo (inline HTML, no template needed)
    brevo_config: dict = {"api_key": settings.BREVO_API_KEY}
    if settings.BREVO_KEY_TYPE != "api-key":
        brevo_config["headers"] = {settings.BREVO_KEY_TYPE: settings.BREVO_API_KEY}

    html_content = f"""
    <p>Hi {user.name},</p>
    <p>We received a request to reset your BookHive password.</p>
    <p><a href="{reset_link}">Click here to reset your password</a></p>
    <p>This link expires in 15 minutes. If you did not request a password reset, you can ignore this email.</p>
    """

    try:
        api_instance = Brevo(**brevo_config).transactional_emails
        api_instance.send_transac_email(
            to=[{"email": request.email, "name": user.name}],
            sender={"email": settings.BREVO_SENDER_EMAIL, "name": settings.BREVO_SENDER_NAME},
            subject="Reset your BookHive password",
            html_content=html_content,
        )
    except Exception as e:
        # Don't expose email sending errors to the caller
        print(f"Failed to send reset email to {request.email}: {e}")

    return generic_response


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    record = reset_token_store.get(request.email)

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if time.time() > record["expires"]:
        del reset_token_store[request.email]
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if record["token"] != request.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    auth_service = AuthService(db)
    user = auth_service.get_user_by_email(request.email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.password_hash = get_password_hash(request.new_password)
    db.commit()

    del reset_token_store[request.email]

    return {"message": "Password reset successfully"}
