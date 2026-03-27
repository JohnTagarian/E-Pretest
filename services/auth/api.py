import secrets
import time
import os
import urllib.parse

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials

from services.auth.models import AuthCallbackResponse, AuthStartResponse, LogoutResponse, UserPublic
from services.auth.session import get_current_user, issue_token, revoke_token, security

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_EMAIL_DOMAIN = "@email.kmutnb.ac.th"

# NOTE: For now this is in-memory. In production, move this to Redis/DB.
STATE_TTL_SECONDS = 600
_state_store: dict[str, float] = {}


def _issue_state() -> str:
    state = secrets.token_urlsafe(24)
    _state_store[state] = time.time() + STATE_TTL_SECONDS
    return state


def _verify_state(state: str) -> None:
    expires_at = _state_store.pop(state, None)
    if not expires_at or expires_at < time.time():
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")


def _build_google_auth_url(state: str) -> str:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if not client_id:
        raise HTTPException(status_code=500, detail="Google client ID not configured")
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="Google redirect URI not configured")

    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def _exchange_code_for_access_token(code: str) -> str:
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": os.getenv("GOOGLE_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("GOOGLE_REDIRECT_URI", "").strip(),
        "grant_type": "authorization_code",
    }
    if not payload["client_secret"]:
        raise HTTPException(status_code=500, detail="Google client secret not configured")
    with httpx.Client(timeout=15.0) as client:
        response = client.post(token_url, data=payload)

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Google token exchange failed")

    token_payload = response.json()
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing Google access token")
    return access_token

def _get_google_userinfo(access_token: str) -> dict:
    with httpx.Client(timeout=15.0) as client:
        response = client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Google userinfo lookup failed")
    return response.json()


def _validate_kmutnb_email(email: str) -> None:
    if not email.endswith(ALLOWED_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=403,
            detail="Only @email.kmutnb.ac.th is allowed",
        )


@router.get("/google/start")
def google_start() -> RedirectResponse:
    state = _issue_state()
    google_auth_url = _build_google_auth_url(state)

    return RedirectResponse(url=google_auth_url, status_code=307)


@router.post("/google/start", response_model=AuthStartResponse)
def google_start_api() -> AuthStartResponse:
    state = _issue_state()
    google_auth_url = _build_google_auth_url(state)

    return AuthStartResponse(auth_url=google_auth_url, state=state)


@router.get("/google/callback", response_model=AuthCallbackResponse)
def google_callback(code: str = Query(...), state: str = Query(...)) -> AuthCallbackResponse:
    _verify_state(state)

    google_access_token = _exchange_code_for_access_token(code)
    userinfo = _get_google_userinfo(google_access_token)

    email = (userinfo.get("email") or "").strip().lower()
    email_verified = bool(userinfo.get("email_verified"))
    if not email_verified:
        raise HTTPException(status_code=403, detail="Email is not verified by Google")
    
    _validate_kmutnb_email(email)
    
    user = UserPublic(
        user_id=f"u_{userinfo.get('sub', email.split('@')[0])}",
        email=email,
        full_name=(userinfo.get("name") or email.split("@")[0]).strip(),
        role="student",
    )
    token = issue_token(user)
    return AuthCallbackResponse(access_token=token, token_type="bearer", user=user)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    _: UserPublic = Depends(get_current_user),
) -> LogoutResponse:
    if credentials:
        revoke_token(credentials.credentials)
    return LogoutResponse(success=True)
