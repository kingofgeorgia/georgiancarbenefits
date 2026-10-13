import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.deal_share import DealShare
from app.schemas.deals import DealShareCreate, DealShareCreated, DealShareOut

router = APIRouter(prefix="/deals", tags=["deals"])
MAX_SNAPSHOT_BYTES = 64 * 1024


def _new_public_id() -> str:
    return secrets.token_urlsafe(9)


@router.post("/", response_model=DealShareCreated, status_code=status.HTTP_201_CREATED)
def create_deal_share(payload: DealShareCreate, db: Session = Depends(get_db)):
    snapshot = payload.model_dump(mode="json")
    if len(json.dumps(snapshot, ensure_ascii=False).encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Shared deal snapshot is too large")

    public_id = _new_public_id()
    for _ in range(5):
        exists = db.query(DealShare.id).filter(DealShare.public_id == public_id).first()
        if not exists:
            break
        public_id = _new_public_id()
    else:
        raise HTTPException(status_code=503, detail="Could not allocate public deal id")

    share = DealShare(
        public_id=public_id,
        schema_version="1",
        snapshot=snapshot,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return DealShareCreated(public_id=share.public_id, created_at=share.created_at)


@router.get("/{public_id}", response_model=DealShareOut)
def get_deal_share(public_id: str, db: Session = Depends(get_db)):
    if len(public_id) > 32:
        raise HTTPException(status_code=404, detail="Shared deal not found")
    share = db.query(DealShare).filter(DealShare.public_id == public_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Shared deal not found")
    return DealShareOut(
        public_id=share.public_id,
        schema_version=share.schema_version,
        snapshot=DealShareCreate.model_validate(share.snapshot),
        created_at=share.created_at,
    )
