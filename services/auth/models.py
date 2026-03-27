from pydantic import BaseModel


class UserPublic(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str


class AuthStartResponse(BaseModel):
    auth_url: str
    state: str


class AuthCallbackResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserPublic


class LogoutResponse(BaseModel):
    success: bool
