import logging
import base64
import hashlib
import hmac
import json
import secrets
import time
import os
import urllib.parse

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials

from packages.db_postgres.user_repo import upsert_user_from_google
from packages.shared.env_loader import load_local_env
from services.auth.models import AuthCallbackResponse, AuthStartResponse, LogoutResponse, UserPublic
from services.auth.session import get_current_user, issue_token, revoke_token, security

load_local_env()

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_EMAIL_DOMAIN = "@email.kmutnb.ac.th"

STATE_TTL_SECONDS = 600


def _urlsafe_b64encode(data: bytes) -> str:
    """Encode bytes for OAuth state without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _urlsafe_b64decode(data: str) -> bytes:
    """Decode a URL-safe base64 string and restore padding first."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _state_secret() -> str:
    """Get the secret used to sign OAuth state."""
    # Prefer a dedicated secret. Fallback keeps dev simple.
    return (
        _env("OAUTH_STATE_SECRET")
        or _env("GOOGLE_CLIENT_SECRET")
    )


def _env(name: str) -> str:
    """Read an env value and tolerate quoted .env entries."""
    value = os.getenv(name, "").strip()
    # tolerate quoted values in .env (common during manual export)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1].strip()
    return value


def _issue_state() -> str:
    """Create a short-lived signed OAuth state token."""
    secret = _state_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="OAuth state secret not configured")

    payload_obj = {
        "nonce": secrets.token_urlsafe(16),
        "exp": int(time.time()) + STATE_TTL_SECONDS,
    }
    payload_json = json.dumps(payload_obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload = _urlsafe_b64encode(payload_json)
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    signature_part = _urlsafe_b64encode(signature)
    return f"{payload}.{signature_part}"


def _verify_state(state: str) -> None:
    """Verify OAuth state signature and expiration."""
    secret = _state_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="OAuth state secret not configured")

    try:
        payload_part, signature_part = state.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state") from exc

    expected_sig = hmac.new(
        secret.encode("utf-8"),
        payload_part.encode("ascii"),
        hashlib.sha256,
    ).digest()
    actual_sig = _urlsafe_b64decode(signature_part)
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    try:
        payload = json.loads(_urlsafe_b64decode(payload_part).decode("utf-8"))
        exp = int(payload.get("exp", 0))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state") from exc

    if exp < int(time.time()):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")


def _build_google_auth_url(state: str) -> str:
    """Build the Google OAuth consent URL for login."""
    client_id = _env("GOOGLE_CLIENT_ID")
    redirect_uri = _env("GOOGLE_REDIRECT_URI")
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
    """Exchange Google's callback code for an access token."""
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": _env("GOOGLE_CLIENT_ID"),
        "client_secret": _env("GOOGLE_CLIENT_SECRET"),
        "redirect_uri": _env("GOOGLE_REDIRECT_URI"),
        "grant_type": "authorization_code",
    }
    if not payload["client_secret"]:
        raise HTTPException(status_code=500, detail="Google client secret not configured")
    with httpx.Client(timeout=15.0) as client:
        response = client.post(token_url, data=payload)

    if response.status_code != 200:
        error_detail = "Google token exchange failed"
        try:
            payload = response.json()
            google_error = payload.get("error")
            google_description = payload.get("error_description")
            if google_error or google_description:
                error_detail = (
                    f"Google token exchange failed: {google_error or 'unknown_error'}"
                    f" ({google_description or 'no description'})"
                )
        except Exception:
            pass
        raise HTTPException(status_code=401, detail=error_detail)

    token_payload = response.json()
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing Google access token")
    return access_token

def _get_google_userinfo(access_token: str) -> dict:
    """Fetch the signed-in user's profile from Google."""
    with httpx.Client(timeout=15.0) as client:
        response = client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Google userinfo lookup failed")
    return response.json()


def _validate_kmutnb_email(email: str) -> None:
    """Allow only KMUTNB student email accounts."""
    if not email.endswith(ALLOWED_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=403,
            detail="Only @email.kmutnb.ac.th is allowed",
        )


@router.get("/google/start")
def google_start() -> RedirectResponse:
    """Redirect browser users to Google login."""
    state = _issue_state()
    google_auth_url = _build_google_auth_url(state)

    return RedirectResponse(url=google_auth_url, status_code=307)


@router.post("/google/start", response_model=AuthStartResponse)
def google_start_api() -> AuthStartResponse:
    """Return the Google login URL for SPA clients."""
    state = _issue_state()
    google_auth_url = _build_google_auth_url(state)

    return AuthStartResponse(auth_url=google_auth_url, state=state)


@router.get("/google/callback", response_model=AuthCallbackResponse)
def google_callback(code: str = Query(...), state: str = Query(...)) -> AuthCallbackResponse:
    """Handle Google callback and issue the app token."""
    _verify_state(state)

    google_access_token = _exchange_code_for_access_token(code)
    userinfo = _get_google_userinfo(google_access_token)

    email = (userinfo.get("email") or "").strip().lower()
    email_verified = bool(userinfo.get("email_verified"))
    if not email_verified:
        raise HTTPException(status_code=403, detail="Email is not verified by Google")
    
    _validate_kmutnb_email(email)
    
    full_name = (userinfo.get("name") or email.split("@")[0]).strip()
    try:
        db_user = upsert_user_from_google(email=email, full_name=full_name)
    except Exception as exc:
        logging.exception("Failed to upsert OAuth user in Postgres")
        raise HTTPException(status_code=500, detail="Failed to persist user") from exc

    user = UserPublic(
        user_id=str(db_user.id),
        email=db_user.email,
        full_name=db_user.full_name,
        role=db_user.role,
    )
    token = issue_token(user)
    return AuthCallbackResponse(access_token=token, token_type="bearer", user=user)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    _: UserPublic = Depends(get_current_user),
) -> LogoutResponse:
    """Revoke the current in-memory session token."""
    if credentials:
        revoke_token(credentials.credentials)
    return LogoutResponse(success=True)
