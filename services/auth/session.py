import secrets
from typing import Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth.models import UserPublic

security = HTTPBearer(auto_error=False)
_token_store: Dict[str, UserPublic] = {}


def issue_token(user: UserPublic) -> str:
    token = secrets.token_urlsafe(24)
    _token_store[token] = user
    return token


def revoke_token(token: str) -> None:
    _token_store.pop(token, None)


def get_user_by_token(token: str) -> UserPublic | None:
    return _token_store.get(token)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UserPublic:
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
