"""
Seed data for CASA-AI database development and testing

This module provides initial data for:
- Test users with different roles
- Sample patients
- Calibration profiles
- Demo examinations

WARNING: This is for DEVELOPMENT ONLY. Never use in production.
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
import hashlib

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from db_connection import get_connection, log_audit_event


def hash_password(password: str) -> str:
    """
    Simple password hashing for development

    NOTE: In production, use bcrypt or argon2
    """
    return hashlib.sha256(password.encode()).hexdigest()


def seed_users(conn):
    """Create test users for each role"""

    print("[INFO] Seeding users...")

    users = [
        {
            "email": "admin@casa-ai.local",
            "password": "admin123",
            "full_name": "Admin Super",
            "role": "SUPER_ADMIN",
            "phone_number": "+62812-3456-7890",
            "license_number": None
        },
        {
            "email": "frontoffice@casa-ai.local",
            "password": "front123",
            "full_name": "Siti Nurhaliza",
            "role": "FRONT_OFFICE",
            "phone_number": "+62812-1111-1111",
            "license_number": None
        },
        {
            "email": "analyst@casa-ai.local",
            "password": "analyst123",
            "full_name": "Budi Santoso, A.Md.AK",
            "role": "ANALYST",
            "phone_number": "+62812-2222-2222",
            "license_number": "ATLM-12345"
        },
        {
            "email": "physician@casa-ai.local",
            "password": "doctor123",
            "full_name": "Dr. Ahmad Hidayat, Sp.And",
            "role": "PHYSICIAN",
            "phone_number": "+62812-3333-3333",
            "license_number": "SIP-2024-001"
        },
        {
            "email": "patient@casa-ai.local",
            "password": "patient123",
            "full_name": "John Doe",
            "role": "PATIENT",
            "phone_number": "+62812-4444-4444",
            "license_number": None
        }
    ]

    user_ids = {}

    for user in users:
        cursor = conn.execute("""
            INSERT INTO users (
                email, password_hash, full_name, role,
                phone_number, license_number
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            user["email"],
            hash_password(user["password"]),
            user["full_name"],
            user["role"],
            user["phone_number"],
            user["license_number"]
        ))

        user_ids[user["role"]] = cursor.lastrowid
        print(f"  ✓ Created {user['role']}: {user['email']}")

    conn.commit()
    return user_ids


def seed_patients(conn, user_ids):
    """Create sample patients"""

    print("[INFO] Seeding patients...")

    patients = [
        {
            "mrn": "MRN-2024-001",
            "full_name": "Ahmad Wijaya",
            "date_of_birth": "1990-05-15",
            "gender": "MALE",
            "phone_number": "+62812-5555-5555",
            "email": "ahmad.wijaya@example.com"
        },
        {
            "mrn": "MRN-2024-002",
            "full_name": "Bambang Suryanto",
            "date_of_birth": "1988-08-22",
            "gender": "MALE",
            "phone_number": "+62812-6666-6666",
            "email": "bambang.s@example.com"
        },
        {
            "mrn": "MRN-2024-003",
            "full_name": "Cahyo Prasetyo",
            "date_of_birth": "1992-03-10",
            "gender": "MALE",
            "phone_number": "+62812-7777-7777",
            "email": "cahyo.p@example.com"
        },
        {
            "mrn": "MRN-2024-004",
            "full_name": "John Doe",
            "date_of_birth": "1985-12-01",
            "gender": "MALE",
            "phone_number": "+62812-4444-4444",
            "email": "patient@casa-ai.local",
            "user_id": user_ids.get("PATIENT")  # Link to patient portal account
        }
    ]

    patient_ids = []

    for patient in patients:
        cursor = conn.execute("""
            INSERT INTO patients (
                medical_record_number, full_name, date_of_birth,
                gender, phone_number, email, user_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient["mrn"],
            patient["full_name"],
            patient["date_of_birth"],
            patient["gender"],
            patient["phone_number"],
            patient["email"],
            patient.get("user_id"),
            user_ids["FRONT_OFFICE"]
        ))

        patient_ids.append(cursor.lastrowid)
        print(f"  ✓ Created patient: {patient['mrn']} - {patient['full_name']}")

    conn.commit()
    return patient_ids


def seed_calibration_profiles(conn, user_ids):
    """Create sample calibration profiles"""

    print("[INFO] Seeding calibration profiles...")

    profiles = [
        {
            "profile_name": "Olympus BX53 - Makler Chamber - 400x",
            "microscope_model": "Olympus BX53",
            "camera_model": "Canon EOS 600D",
            "chamber_type": "Makler Counting Chamber",
            "magnification": "400x",
            "pixel_scale_um": 0.25,  # µm per pixel
            "frame_rate_fps": 30.0,
            "chamber_depth_um": 10.0,
            "dilution_factor": 1.0,
            "calibration_method": "Calibration slide with 10µm grid",
            "calibration_date": "2024-01-15",
            "is_locked": 1,  # Approved and locked
            "is_active": 1
        },
        {
            "profile_name": "Nikon Eclipse E200 - Standard Chamber - 200x",
            "microscope_model": "Nikon Eclipse E200",
            "camera_model": "Nikon DS-Fi3",
            "chamber_type": "Standard Counting Chamber",
            "magnification": "200x",
            "pixel_scale_um": 0.5,
            "frame_rate_fps": 25.0,
            "chamber_depth_um": 20.0,
            "dilution_factor": 1.0,
            "calibration_method": "Stage micrometer calibration",
            "calibration_date": "2024-02-10",
            "is_locked": 1,
            "is_active": 1
        },
        {
            "profile_name": "Test Profile - Not Approved",
            "microscope_model": "Generic Microscope",
            "camera_model": "Generic Camera",
            "chamber_type": "Test Chamber",
            "magnification": "400x",
            "pixel_scale_um": 0.3,
            "frame_rate_fps": 30.0,
            "chamber_depth_um": 10.0,
            "dilution_factor": 1.0,
            "calibration_method": "Test calibration",
            "calibration_date": "2024-10-17",
            "is_locked": 0,  # Not approved yet
            "is_active": 1
        }
    ]

    profile_ids = []

    for profile in profiles:
        cursor = conn.execute("""
            INSERT INTO calibration_profiles (
                profile_name, microscope_model, camera_model, chamber_type,
                magnification, pixel_scale_um, frame_rate_fps, chamber_depth_um,
                dilution_factor, calibration_method, calibration_date,
                is_locked, is_active, created_by, approved_by, approved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            profile["profile_name"],
            profile["microscope_model"],
            profile["camera_model"],
            profile["chamber_type"],
            profile["magnification"],
            profile["pixel_scale_um"],
            profile["frame_rate_fps"],
            profile["chamber_depth_um"],
            profile["dilution_factor"],
            profile["calibration_method"],
            profile["calibration_date"],
            profile["is_locked"],
            profile["is_active"],
            user_ids["SUPER_ADMIN"],
            user_ids["SUPER_ADMIN"] if profile["is_locked"] else None,
            datetime.now().isoformat() if profile["is_locked"] else None
        ))

        profile_ids.append(cursor.lastrowid)
        status = "LOCKED" if profile["is_locked"] else "DRAFT"
        print(f"  ✓ Created profile [{status}]: {profile['profile_name']}")

    conn.commit()
    return profile_ids


def seed_examinations(conn, patient_ids, user_ids):
    """Create sample examinations with different statuses"""

    print("[INFO] Seeding examinations...")

    now = datetime.now()

    examinations = [
        {
            "patient_id": patient_ids[0],
            "sample_code": "CASA-2024-10-001",
            "collection_datetime": (now - timedelta(hours=2)).isoformat(),
            "received_datetime": (now - timedelta(hours=1)).isoformat(),
            "abstinence_duration_hours": 72,
            "volume_ml": 3.5,
            "liquefaction_time_min": 20,
            "viscosity": "NORMAL",
            "ph_value": 7.8,
            "appearance": "Gray-opalescent",
            "status": "REGISTERED"
        },
        {
            "patient_id": patient_ids[1],
            "sample_code": "CASA-2024-10-002",
            "collection_datetime": (now - timedelta(days=1, hours=3)).isoformat(),
            "received_datetime": (now - timedelta(days=1, hours=2)).isoformat(),
            "abstinence_duration_hours": 96,
            "volume_ml": 2.8,
            "liquefaction_time_min": 25,
            "viscosity": "INCREASED",
            "ph_value": 7.5,
            "appearance": "Turbid",
            "status": "IN_PROGRESS"
        },
        {
            "patient_id": patient_ids[2],
            "sample_code": "CASA-2024-10-003",
            "collection_datetime": (now - timedelta(days=2)).isoformat(),
            "received_datetime": (now - timedelta(days=2)).isoformat(),
            "abstinence_duration_hours": 48,
            "volume_ml": 4.2,
            "liquefaction_time_min": 15,
            "viscosity": "NORMAL",
            "ph_value": 8.0,
            "appearance": "Gray-opalescent",
            "status": "PENDING_REVIEW"
        },
        {
            "patient_id": patient_ids[3],
            "sample_code": "CASA-2024-10-004",
            "collection_datetime": (now - timedelta(days=3)).isoformat(),
            "received_datetime": (now - timedelta(days=3)).isoformat(),
            "abstinence_duration_hours": 120,
            "volume_ml": 3.0,
            "liquefaction_time_min": 30,
            "viscosity": "NORMAL",
            "ph_value": 7.6,
            "appearance": "Gray-opalescent",
            "status": "APPROVED"
        }
    ]

    examination_ids = []

    for exam in examinations:
        cursor = conn.execute("""
            INSERT INTO examinations (
                patient_id, sample_code, collection_datetime, received_datetime,
                abstinence_duration_hours, volume_ml, liquefaction_time_min,
                viscosity, ph_value, appearance, status,
                created_by, current_analyst_id, current_physician_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            exam["patient_id"],
            exam["sample_code"],
            exam["collection_datetime"],
            exam["received_datetime"],
            exam["abstinence_duration_hours"],
            exam["volume_ml"],
            exam["liquefaction_time_min"],
            exam["viscosity"],
            exam["ph_value"],
            exam["appearance"],
            exam["status"],
            user_ids["FRONT_OFFICE"],
            user_ids["ANALYST"] if exam["status"] != "REGISTERED" else None,
            user_ids["PHYSICIAN"] if exam["status"] in ["PENDING_REVIEW", "APPROVED"] else None
        ))

        examination_ids.append(cursor.lastrowid)
        print(f"  ✓ Created examination [{exam['status']}]: {exam['sample_code']}")

    conn.commit()
    return examination_ids


def seed_audit_logs(conn, user_ids):
    """Create sample audit log entries"""

    print("[INFO] Seeding audit logs...")

    # Log user creation events
    for role, user_id in user_ids.items():
        log_audit_event(
            actor_id=user_ids.get("SUPER_ADMIN"),
            action_type="CREATE_USER",
            description=f"Created {role} user account",
            target_type="USER",
            target_id=user_id,
            actor_email="admin@casa-ai.local",
            actor_role="SUPER_ADMIN",
            result="SUCCESS"
        )

    print(f"  ✓ Created {len(user_ids)} audit log entries")

    conn.commit()


def clear_all_data(conn):
    """Clear all data from database (keeping schema)"""

    print("[WARNING] Clearing all data from database...")

    # Get all table names (excluding sqlite internal tables)
    cursor = conn.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)

    tables = [row[0] for row in cursor.fetchall()]

    # Disable foreign keys temporarily
    conn.execute("PRAGMA foreign_keys = OFF")

    # Delete from all tables
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
        print(f"  ✓ Cleared table: {table}")

    # Re-enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")

    # Reset auto-increment counters
    conn.execute("DELETE FROM sqlite_sequence")

    conn.commit()
    print("[SUCCESS] All data cleared")


def seed_database(clear_first: bool = False):
    """
    Seed database with development data

    Args:
        clear_first: If True, clear existing data first
    """
    conn = get_connection()

    try:
        if clear_first:
            clear_all_data(conn)

        print("\n" + "=" * 60)
        print("SEEDING CASA-AI DATABASE")
        print("=" * 60 + "\n")

        # Seed in order (respecting foreign key constraints)
        user_ids = seed_users(conn)
        patient_ids = seed_patients(conn, user_ids)
        profile_ids = seed_calibration_profiles(conn, user_ids)
        examination_ids = seed_examinations(conn, patient_ids, user_ids)
        seed_audit_logs(conn, user_ids)

        print("\n" + "=" * 60)
        print("SEEDING COMPLETE")
        print("=" * 60)
        print("\nTest Accounts:")
        print("  Admin:        admin@casa-ai.local / admin123")
        print("  Front Office: frontoffice@casa-ai.local / front123")
        print("  Analyst:      analyst@casa-ai.local / analyst123")
        print("  Physician:    physician@casa-ai.local / doctor123")
        print("  Patient:      patient@casa-ai.local / patient123")
        print("\nData Summary:")
        print(f"  Users:                {len(user_ids)}")
        print(f"  Patients:             {len(patient_ids)}")
        print(f"  Calibration Profiles: {len(profile_ids)}")
        print(f"  Examinations:         {len(examination_ids)}")
        print("\n" + "=" * 60 + "\n")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Seeding failed: {e}")
        raise


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--clear":
        seed_database(clear_first=True)
    else:
        print("Usage:")
        print("  python seed_data.py           # Add seed data")
        print("  python seed_data.py --clear   # Clear all data first, then seed")
        print()

        response = input("Proceed with seeding? (y/N): ")
        if response.lower() == 'y':
            seed_database(clear_first=False)
        else:
            print("Cancelled.")
