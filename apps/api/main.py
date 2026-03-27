from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from packages.shared.env_loader import load_local_env
from services.user import api as user
from services.admin import api as admin
from services.auth import api as auth
from services.core_exam import api as core_exam

load_local_env()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",  
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(user.router) 
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(core_exam.router)

@app.get("/health")
def read_root():
    return {"status": "ok","mode":"skeleton"}

