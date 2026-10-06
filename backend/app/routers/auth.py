from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..auth import create_access_token
from ..database import get_db
from ..services.email import send_otp_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# TEMPORARY dev bypass: this code verifies any email without a real OTP.
# Remove before anything that isn't local development.
DEV_DUMMY_OTP = "123456"


@router.post("/send-otp", response_model=schemas.MessageResponse)
def send_otp(payload: schemas.SendOtpRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    now = datetime.utcnow()

    existing = crud.get_otps_for_email(db, email)
    unexpired = [o for o in existing if o.expiry_at > now]
    if unexpired:
        # A valid OTP is already out there; don't send another.
        return schemas.MessageResponse(message="otp sent")

    code = crud.generate_otp()
    send_otp_email(email, code)
    crud.create_otp(db, email, code)
    return schemas.MessageResponse(message="otp sent")


@router.post("/verify-otp", response_model=schemas.VerifyOtpResponse)
def verify_otp(payload: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    now = datetime.utcnow()

    # TEMPORARY dev bypass: the dummy code verifies any email, no OTP needed.
    if payload.otp == DEV_DUMMY_OTP:
        crud.delete_otps(db, crud.get_otps_for_email(db, email))
        user = crud.get_user_by_email(db, email) or crud.create_otp_user(db, email)
        token = create_access_token(user)
        return schemas.VerifyOtpResponse(
            message="otp verified",
            access_token=token,
            name_required=user.name is None,
        )

    rows = crud.get_otps_for_email(db, email)
    unexpired = [o for o in rows if o.expiry_at > now]
    expired = [o for o in rows if o.expiry_at <= now]

    # Should never happen: send-otp keeps at most one live OTP per email.
    if len(unexpired) >= 2:
        crud.delete_otps(db, rows)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="request resend otp"
        )

    # No live OTP (none issued, or all expired).
    if not unexpired:
        if expired:
            crud.delete_otps(db, expired)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="please request new otp"
        )

    match = unexpired[0]
    if match.otp != payload.otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid otp"
        )

    # Consume the OTP (and clear any expired leftovers) before issuing a token.
    crud.delete_otps(db, [match, *expired])

    user = crud.get_user_by_email(db, email)
    if user is None:
        user = crud.create_otp_user(db, email)

    token = create_access_token(user)
    return schemas.VerifyOtpResponse(
        message="otp verified",
        access_token=token,
        name_required=user.name is None,
    )
