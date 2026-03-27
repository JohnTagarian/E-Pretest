from fastapi import APIRouter, Depends

from services.auth.models import UserPublic
from services.auth.session import get_current_user

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
def get_me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user
