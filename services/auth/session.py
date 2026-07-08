import secrets
from typing import Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth.models import UserPublic

security = HTTPBearer(auto_error=False)
_token_store: Dict[str, UserPublic] = {}


def issue_token(user: UserPublic) -> str:
    """Create an app session token for the signed-in user."""
    token = secrets.token_urlsafe(24)
    _token_store[token] = user
    return token


def revoke_token(token: str) -> None:
    """Remove a session token if it exists."""
    _token_store.pop(token, None)


def get_user_by_token(token: str) -> UserPublic | None:
    """Look up the user attached to a session token."""
    return _token_store.get(token)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UserPublic:
    """Require a valid bearer token and return its user."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    user = get_user_by_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


def get_admin_user(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    """Require the current user to have the admin role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user
