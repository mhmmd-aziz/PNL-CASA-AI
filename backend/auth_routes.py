"""
Endpoint autentikasi: login, logout, dan profil pengguna yang sedang masuk.

Akun dibaca dari tabel `users` di database/casa_ai.db. Sesi disimpan di tabel
`auth_sessions` dalam bentuk hash token, sehingga token mentah tidak pernah
tersimpan di database.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from database.db_connection import get_connection, log_audit_event

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_HOURS = 8
PBKDF2_ITERATIONS = 600_000


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


# ---------------------------------------------------------------------------
# Hash password
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if stored.startswith("pbkdf2_sha256$"):
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations)).hex()
        return hmac.compare_digest(candidate, digest)
    # Kompatibilitas: akun dari seed lama memakai SHA-256 tanpa salt
    legacy = hashlib.sha256(password.encode()).hexdigest()
    return hmac.compare_digest(legacy, stored)


def _needs_upgrade(stored: str) -> bool:
    return not stored.startswith("pbkdf2_sha256$")


# ---------------------------------------------------------------------------
# Sesi
# ---------------------------------------------------------------------------

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_user(row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
    }


def _user_from_token(token: str) -> dict:
    conn = get_connection()
    row = conn.execute(
        """
        SELECT u.id, u.email, u.full_name, u.role, u.is_active, s.expires_at, s.is_revoked
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
        """,
        (_token_hash(token),),
    ).fetchone()
    if row is None or row["is_revoked"] or not row["is_active"]:
        raise HTTPException(status_code=401, detail="Sesi tidak valid. Silakan masuk kembali.")
    expires = datetime.fromisoformat(row["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= _now():
        raise HTTPException(status_code=401, detail="Sesi sudah berakhir. Silakan masuk kembali.")
    return _public_user(row)


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Dependency FastAPI: pengguna dari header Authorization: Bearer <token>."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sesi tidak ditemukan. Silakan masuk kembali.")
    return _user_from_token(authorization.removeprefix("Bearer ").strip())


def require_roles(*allowed: str):
    """Membuat dependency yang hanya meloloskan peran (users.role) tertentu."""
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Peran Anda tidak memiliki akses ke fitur ini.")
        return user
    return checker


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

def _issue_session(conn, user_id: int, request: Request):
    """Membuat sesi baru dan mengembalikan (token, waktu_berakhir). Token mentah tidak disimpan."""
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=SESSION_HOURS)
    conn.execute(
        """
        INSERT INTO auth_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            _token_hash(token),
            request.client.host if request.client else None,
            request.headers.get("user-agent", "")[:255],
            expires.isoformat(timespec="seconds"),
        ),
    )
    return token, expires


@router.post("/login")
def login(payload: LoginRequest, request: Request):
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else None
    conn = get_connection()
    row = conn.execute(
        "SELECT id, email, full_name, role, password_hash, is_active FROM users WHERE email = ?",
        (email,),
    ).fetchone()

    # Pesan dibuat sama untuk email salah dan password salah, agar tidak membocorkan akun yang ada
    if row is None or not verify_password(payload.password, row["password_hash"]):
        log_audit_event(
            actor_id=row["id"] if row else None,
            action_type="LOGIN_FAILED",
            description=f"Percobaan masuk gagal untuk {email}",
            actor_email=email,
            actor_ip=ip,
            result="FAILURE",
        )
        raise HTTPException(status_code=401, detail="Email atau kata sandi tidak sesuai.")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Akun ini dinonaktifkan. Hubungi administrator.")

    if _needs_upgrade(row["password_hash"]):
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.password), row["id"]),
        )

    token, expires = _issue_session(conn, row["id"], request)
    conn.execute(
        "UPDATE users SET last_login_at = ? WHERE id = ?",
        (_now().isoformat(timespec="seconds"), row["id"]),
    )
    conn.commit()

    log_audit_event(
        actor_id=row["id"],
        action_type="LOGIN_SUCCESS",
        description=f"{email} berhasil masuk",
        actor_email=email,
        actor_role=row["role"],
        actor_ip=ip,
    )
    return {
        "token": token,
        "expires_at": expires.isoformat(timespec="seconds"),
        "user": _public_user(row),
    }


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


@router.post("/change-password")
def change_password(payload: PasswordChange, user: dict = Depends(get_current_user)):
    """Pengguna mengubah kata sandinya sendiri. Hanya baris akun milik pengguna yang login yang diubah."""
    conn = get_connection()
    row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if row is None or not verify_password(payload.current_password, row["password_hash"]):
        log_audit_event(
            actor_id=user["id"], action_type="PASSWORD_CHANGE_FAILED",
            description=f"Ubah kata sandi gagal untuk {user['email']}: kata sandi saat ini tidak sesuai",
            actor_email=user["email"], actor_role=user["role"], result="FAILURE",
        )
        raise HTTPException(status_code=400, detail="Kata sandi saat ini tidak sesuai.")
    if verify_password(payload.new_password, row["password_hash"]):
        raise HTTPException(status_code=422, detail="Kata sandi baru harus berbeda dari kata sandi saat ini.")
    conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (hash_password(payload.new_password), user["id"]),
    )
    conn.commit()
    log_audit_event(
        actor_id=user["id"], action_type="PASSWORD_CHANGE",
        description=f"Kata sandi {user['email']} diubah oleh pemiliknya",
        target_type="user", target_id=user["id"],
        actor_email=user["email"], actor_role=user["role"],
    )
    return {"ok": True}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        return {"ok": True}
    token = authorization.removeprefix("Bearer ").strip()
    conn = get_connection()
    conn.execute(
        "UPDATE auth_sessions SET is_revoked = 1, revoked_at = ?, revoked_reason = 'LOGOUT' WHERE token_hash = ?",
        (_now().isoformat(timespec="seconds"), _token_hash(token)),
    )
    conn.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# URL berkas hasil analisis yang ditandatangani server
# ---------------------------------------------------------------------------

MEDIA_TTL_SECONDS = 15 * 60
_MEDIA_KEY = secrets.token_bytes(32)  # berubah setiap server dinyalakan; URL lama otomatis tidak berlaku


def _media_signature(file_name: str, user_id: int, expires: int) -> str:
    message = f"{file_name}|{user_id}|{expires}".encode()
    return hmac.new(_MEDIA_KEY, message, hashlib.sha256).hexdigest()


def sign_output_url(file_name: str, user_id: int) -> str:
    """URL /outputs/... yang hanya berlaku untuk pengguna ini dalam batas waktu singkat."""
    expires = int(_now().timestamp()) + MEDIA_TTL_SECONDS
    signature = _media_signature(file_name, user_id, expires)
    return f"/outputs/{file_name}?uid={user_id}&exp={expires}&sig={signature}"


def verify_output_url(file_name: str, user_id: Optional[int], expires: Optional[int], signature: Optional[str]) -> dict:
    """Memeriksa tanda tangan, masa berlaku, dan peran pemilik URL. Mengembalikan data pengguna."""
    if user_id is None or expires is None or not signature:
        raise HTTPException(status_code=401, detail="Tautan berkas tidak lengkap.")
    if int(_now().timestamp()) > expires:
        raise HTTPException(status_code=403, detail="Tautan berkas sudah kedaluwarsa. Muat ulang hasil analisis.")
    if not hmac.compare_digest(_media_signature(file_name, user_id, expires), signature):
        raise HTTPException(status_code=403, detail="Tautan berkas tidak valid.")
    conn = get_connection()
    row = conn.execute("SELECT id, email, full_name, role, is_active FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=403, detail="Akun tidak aktif.")
    return _public_user(row)
