from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.calculator import router as calculator_router
from app.api.cars import router as cars_router
from app.api.deals import router as deals_router
from app.api.history import router as history_router
from app.core.config import settings
from app.core.public_api import PublicAPIGuard

app = FastAPI(
    title="MileON Import Calculator API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(PublicAPIGuard, settings=settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

app.include_router(auth_router)
app.include_router(calculator_router)
app.include_router(cars_router)
app.include_router(deals_router)
app.include_router(history_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not reflect raw input or non-finite values into JSON error responses.
    return JSONResponse(status_code=422, content={"detail": [
        {key: error[key] for key in ("loc", "msg", "type")} for error in exc.errors()
    ]})


@app.get("/health")
async def health(request: Request):
    try:
        available = await request.state.api_rate_storage.check()
    except Exception:
        available = False
    if not available:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}
