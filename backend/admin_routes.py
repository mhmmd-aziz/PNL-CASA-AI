"""
Super Admin: kelola akun staf dan melihat log audit.

Akun pasien dibuat lewat registrasi mandiri, jadi tidak bisa dibuat atau diubah
dari sini. Super Admin juga tidak bisa menjadikan dirinya sendiri nonaktif, dan
sistem selalu menyisakan minimal satu Super Admin aktif.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth_routes import hash_password, require_roles
from database.db_connection import get_connection, log_audit_event

router = APIRouter(prefix="/api/admin", tags=["admin"])

SUPER_ADMIN = Depends(require_roles("SUPER_ADMIN"))
STAFF_ROLES = Literal["FRONT_OFFICE", "ANALYST", "PHYSICIAN", "SUPER_ADMIN"]


class StaffCreate(BaseModel):
    # Domain internal lab (misal .local) juga diizinkan, jadi tidak memakai EmailStr
    email: str = Field(min_length=5, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    full_name: str = Field(min_length=3, max_length=120)
    role: STAFF_ROLES
    password: str = Field(min_length=8, max_length=256)
    phone_number: Optional[str] = Field(default=None, max_length=25)
    license_number: Optional[str] = Field(default=None, max_length=40)


class StaffUpdate(BaseModel):
    role: Optional[STAFF_ROLES] = None
    is_active: Optional[bool] = None


def _user_row(row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
        "phone_number": row["phone_number"],
        "license_number": row["license_number"],
        "last_login_at": row["last_login_at"],
        "created_at": row["created_at"],
    }


@router.get("/users")
def list_users(user: dict = SUPER_ADMIN):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT id, email, full_name, role, is_active, phone_number, license_number, last_login_at, created_at
        FROM users WHERE role <> 'PATIENT' ORDER BY id
        """
    ).fetchall()
    return [_user_row(row) for row in rows]


@router.post("/users", status_code=201)
def create_staff(payload: StaffCreate, actor: dict = SUPER_ADMIN):
    if payload.role == "PHYSICIAN" and not (payload.license_number or "").strip():
        raise HTTPException(status_code=422, detail="Dokter wajib memiliki nomor SIP/STR.")
    email = str(payload.email).strip().lower()
    conn = get_connection()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(status_code=409, detail="Email sudah terdaftar.")
    try:
        cursor = conn.execute(
            """
            INSERT INTO users (email, password_hash, full_name, role, phone_number, license_number)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                email,
                hash_password(payload.password),
                payload.full_name.strip(),
                payload.role,
                payload.phone_number.strip() if payload.phone_number else None,
                payload.license_number.strip() if payload.license_number else None,
            ),
        )
        new_id = cursor.lastrowid
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Akun gagal dibuat. Coba lagi.")

    log_audit_event(
        actor_id=actor["id"],
        action_type="CREATE_STAFF_ACCOUNT",
        description=f"Akun {email} dibuat dengan peran {payload.role}",
        target_type="user",
        target_id=new_id,
        actor_email=actor["email"],
        actor_role=actor["role"],
    )
    row = conn.execute(
        "SELECT id, email, full_name, role, is_active, phone_number, license_number, last_login_at, created_at FROM users WHERE id = ?",
        (new_id,),
    ).fetchone()
    return _user_row(row)


@router.patch("/users/{user_id}")
def update_staff(user_id: int, payload: StaffUpdate, actor: dict = SUPER_ADMIN):
    conn = get_connection()
    target = conn.execute(
        "SELECT id, email, role, is_active FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if target is None or target["role"] == "PATIENT":
        raise HTTPException(status_code=404, detail="Akun staf tidak ditemukan.")

    new_role = payload.role or target["role"]
    new_active = target["is_active"] if payload.is_active is None else int(payload.is_active)

    if user_id == actor["id"] and (new_active == 0 or new_role != "SUPER_ADMIN"):
        raise HTTPException(status_code=409, detail="Anda tidak dapat menonaktifkan atau menurunkan peran akun Anda sendiri.")

    loses_super_admin = target["role"] == "SUPER_ADMIN" and target["is_active"] == 1 and (new_role != "SUPER_ADMIN" or new_active == 0)
    if loses_super_admin:
        remaining = conn.execute(
            "SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1 AND id <> ?", (user_id,)
        ).fetchone()[0]
        if remaining == 0:
            raise HTTPException(status_code=409, detail="Sistem harus memiliki minimal satu Super Admin aktif.")

    try:
        conn.execute(
            "UPDATE users SET role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?",
            (new_role, new_active, user_id),
        )
        if new_active == 0:
            # Akun yang dinonaktifkan langsung kehilangan semua sesinya
            conn.execute(
                "UPDATE auth_sessions SET is_revoked = 1, revoked_at = datetime('now'), revoked_reason = 'ACCOUNT_DISABLED' WHERE user_id = ? AND is_revoked = 0",
                (user_id,),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Perubahan akun gagal disimpan. Coba lagi.")

    changes = []
    if new_role != target["role"]:
        changes.append(f"peran {target['role']} -> {new_role}")
    if new_active != target["is_active"]:
        changes.append("diaktifkan" if new_active else "dinonaktifkan")
    log_audit_event(
        actor_id=actor["id"],
        action_type="UPDATE_STAFF_ACCOUNT",
        description=f"Akun {target['email']}: {', '.join(changes) or 'tanpa perubahan'}",
        target_type="user",
        target_id=user_id,
        actor_email=actor["email"],
        actor_role=actor["role"],
    )
    row = conn.execute(
        "SELECT id, email, full_name, role, is_active, phone_number, license_number, last_login_at, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return _user_row(row)


@router.get("/audit-logs")
def audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    action_type: Optional[str] = Query(default=None, max_length=60),
    user: dict = SUPER_ADMIN,
):
    conn = get_connection()
    if action_type:
        rows = conn.execute(
            """
            SELECT id, created_at, actor_email, actor_role, actor_ip, action_type, target_type, target_id, description, result
            FROM audit_logs WHERE action_type = ? ORDER BY id DESC LIMIT ?
            """,
            (action_type, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, created_at, actor_email, actor_role, actor_ip, action_type, target_type, target_id, description, result
            FROM audit_logs ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "actor_email": row["actor_email"],
            "actor_role": row["actor_role"],
            "actor_ip": row["actor_ip"],
            "action_type": row["action_type"],
            "target": f"{row['target_type']}#{row['target_id']}" if row["target_type"] else None,
            "description": row["description"],
            "result": row["result"],
        }
        for row in rows
    ]
