import os
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials

from services.auth.models import AuthCallbackResponse, AuthStartResponse, LogoutResponse, UserPublic
from services.auth.session import get_current_user, issue_token, revoke_token, security

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_EMAIL_DOMAIN = "@email.kmutnb.ac.th"


def _build_google_auth_url() -> str | None:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback").strip()
    if not client_id:
        return None

    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
            "state": "kmutnb-login",
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def _extract_email_from_code(code: str) -> str:
    if code.startswith("dev:") and len(code.split(":", 1)) == 2:
        return code.split(":", 1)[1].strip().lower()

    raise HTTPException(
        status_code=501,
        detail="Real Google token exchange not implemented yet. Use dev:<email>@email.kmutnb.ac.th for now.",
    )


def _validate_kmutnb_email(email: str) -> None:
    if not email.endswith(ALLOWED_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=403,
            detail="Only @email.kmutnb.ac.th is allowed",
        )


@router.get("/google/start")
def google_start() -> RedirectResponse:
    google_auth_url = _build_google_auth_url()

    if google_auth_url:
        return RedirectResponse(url=google_auth_url, status_code=307)

    # Dev fallback when Google OAuth credentials are not set.
    return RedirectResponse(
        url="/auth/google/callback?code=dev:test@email.kmutnb.ac.th&state=dev",
        status_code=307,
    )


@router.post("/google/start", response_model=AuthStartResponse)
def google_start_api() -> AuthStartResponse:
    google_auth_url = _build_google_auth_url()
    if google_auth_url:
        return AuthStartResponse(auth_url=google_auth_url, state="kmutnb-login")

    return AuthStartResponse(
        auth_url="/auth/google/callback?code=dev:test@email.kmutnb.ac.th&state=dev",
        state="dev",
    )


@router.get("/google/callback", response_model=AuthCallbackResponse)
def google_callback(code: str = Query(...), state: str | None = Query(None)) -> AuthCallbackResponse:
    del state  # state verification will be added with real OAuth token exchange.

    email = _extract_email_from_code(code)
    _validate_kmutnb_email(email)

    user = UserPublic(
        user_id=f"u_{email.split('@')[0]}",
        email=email,
        full_name=email.split("@")[0].replace(".", " ").title(),
        role="student",
    )
    token = issue_token(user)

    return AuthCallbackResponse(
        access_token=token,
        token_type="bearer",
        user=user,
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    _: UserPublic = Depends(get_current_user),
) -> LogoutResponse:
    if credentials:
        revoke_token(credentials.credentials)
    return LogoutResponse(success=True)
