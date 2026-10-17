# CASA-AI Database

Database layer untuk sistem CASA-AI (Computer-Assisted Sperm Analysis with AI).

## Struktur Database

Database menggunakan **SQLite3** dengan 12 tabel utama:

### Authentication & Authorization
1. **users** - User accounts dengan role-based access control
2. **auth_sessions** - Session management dan token handling

### Patient & Examination
3. **patients** - Data demografis pasien
4. **examinations** - Pemeriksaan + data makroskopik

### Calibration & Media
5. **calibration_profiles** - Konfigurasi kalibrasi mikroskop
6. **media_assets** - File video dan output artifacts

### AI Analysis
7. **analysis_runs** - Hasil AI per-video + calibration snapshot
8. **analysis_revisions** - Hasil aggregate setelah human review
9. **revision_inputs** - Relasi many-to-many revisions ↔ runs

### Review & Approval
10. **review_events** - Audit trail koreksi analyst & physician
11. **reports** - Laporan final dengan physician approval

### Audit
12. **audit_logs** - System-wide audit trail

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Initialize Database

```bash
cd backend/database
python db_connection.py init
```

Ini akan membuat file `casa_ai.db` dengan semua tabel dan index.

### 3. Seed Development Data (Optional)

```bash
cd backend/database/seeds
python seed_data.py
```

Atau untuk clear data lama dan seed ulang:

```bash
python seed_data.py --clear
```

### 4. Verify Database

```bash
cd backend/database
python db_connection.py verify
```

## Test Accounts (After Seeding)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@casa-ai.local | admin123 |
| Front Office | frontoffice@casa-ai.local | front123 |
| Analyst | analyst@casa-ai.local | analyst123 |
| Physician | physician@casa-ai.local | doctor123 |
| Patient | patient@casa-ai.local | patient123 |

**⚠️ WARNING: Never use these accounts in production!**

## File Structure

```
backend/database/
├── schema.sql              # Main schema (tables 1-6)
├── schema_part2.sql        # Extended schema (tables 7-12, triggers, views)
├── db_connection.py        # Database connection & utilities
├── models.py               # Pydantic models for validation
├── casa_ai.db             # SQLite database file (generated)
├── README.md              # This file
├── migrations/            # Future migration scripts
└── seeds/
    └── seed_data.py       # Development seed data
```

## Usage in Python Code

### Basic Connection

```python
from database.db_connection import get_connection, get_transaction

# Simple query
conn = get_connection()
cursor = conn.execute("SELECT * FROM users WHERE role = ?", ("ANALYST",))
users = cursor.fetchall()

# With transaction
with get_transaction() as conn:
    conn.execute("INSERT INTO patients (...) VALUES (...)")
    conn.execute("INSERT INTO examinations (...) VALUES (...)")
    # Auto-commit on success, auto-rollback on error
```

### Helper Functions

```python
from database.db_connection import (
    execute_query,
    execute_update,
    row_to_dict,
    rows_to_dict_list,
    log_audit_event
)

# Execute SELECT
users = execute_query("SELECT * FROM users WHERE is_active = ?", (1,))
user_dicts = rows_to_dict_list(users)

# Execute INSERT/UPDATE
user_id = execute_update(
    "INSERT INTO users (email, password_hash, ...) VALUES (?, ?, ...)",
    ("test@example.com", "hashed_password", ...)
)

# Log audit event
log_audit_event(
    actor_id=1,
    action_type="CREATE_PATIENT",
    description="Created new patient MRN-2024-001",
    target_type="PATIENT",
    target_id=patient_id,
    result="SUCCESS"
)
```

### With Pydantic Models

```python
from database.models import UserCreate, UserResponse

# Validate input
user_data = UserCreate(
    email="newuser@example.com",
    password="securepass123",
    full_name="John Doe",
    role="ANALYST"
)

# Insert to database
user_id = execute_update(
    "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
    (user_data.email, hash_password(user_data.password), user_data.full_name, user_data.role)
)

# Query and validate response
row = execute_query("SELECT * FROM users WHERE id = ?", (user_id,), fetch_one=True)
user = UserResponse(**row_to_dict(row))
```

## Database Schema Design Principles

### 1. Traceability
- Setiap analysis traceable ke source video, calibration snapshot, algorithm version
- Immutable calibration snapshot di `analysis_runs`
- Preserve original AI output walau sudah dikoreksi

### 2. Immutability
- Released reports READ-ONLY
- Approved results tidak boleh diubah diam-diam
- Amendments create new version

### 3. Privacy & Security
- Patient data protected dengan role-based access
- Media files stored privately (NEVER public URLs)
- Comprehensive audit logging
- Password hashing (use bcrypt/argon2 in production)

### 4. Audit Trail
- `review_events`: business-level corrections
- `audit_logs`: system-wide security events
- Track who, when, what, why untuk semua sensitive actions

### 5. State Validation
- Examination lifecycle enforced
- Foreign key constraints
- CHECK constraints untuk valid values

## Important Security Notes

### Production Checklist

- [ ] Change all default passwords
- [ ] Use bcrypt/argon2 untuk password hashing
- [ ] Enable HTTPS only
- [ ] Set proper file permissions pada database file
- [ ] Configure regular automated backups
- [ ] Setup retention policy untuk patient data
- [ ] Review and lock calibration profiles
- [ ] Configure audit log monitoring
- [ ] Validate all user inputs server-side
- [ ] Never expose database file directly

### Database File Permissions

```bash
# Restrict database file access
chmod 600 backend/database/casa_ai.db

# Only backend process should read/write
chown backend-user:backend-group backend/database/casa_ai.db
```

## Maintenance

### Backup Database

```bash
# Simple backup
cp backend/database/casa_ai.db backend/database/backups/casa_ai_$(date +%Y%m%d_%H%M%S).db

# Or using SQLite command
sqlite3 backend/database/casa_ai.db ".backup backend/database/backups/backup.db"
```

### Check Database Integrity

```bash
sqlite3 backend/database/casa_ai.db "PRAGMA integrity_check;"
sqlite3 backend/database/casa_ai.db "PRAGMA foreign_key_check;"
```

### Vacuum Database (Optimize)

```bash
sqlite3 backend/database/casa_ai.db "VACUUM;"
```

## Common Queries

### Get Pending Reviews

```sql
SELECT * FROM vw_pending_reviews;
```

### Get Patient's Released Reports

```sql
SELECT r.*
FROM reports r
INNER JOIN examinations e ON r.examination_id = e.id
WHERE e.patient_id = ? AND r.status = 'RELEASED'
ORDER BY r.released_at DESC;
```

### Get Analysis History for Examination

```sql
SELECT
    ar.id,
    ar.status,
    ar.created_at,
    ar.pr_percentage,
    ar.np_percentage,
    ar.im_percentage,
    ma.file_name AS source_video
FROM analysis_runs ar
INNER JOIN media_assets ma ON ar.source_media_id = ma.id
WHERE ar.examination_id = ?
ORDER BY ar.created_at DESC;
```

### Audit Trail for Patient Record

```sql
SELECT
    al.created_at,
    al.action_type,
    al.description,
    u.full_name AS actor_name,
    al.result
FROM audit_logs al
LEFT JOIN users u ON al.actor_id = u.id
WHERE al.target_type = 'PATIENT' AND al.target_id = ?
ORDER BY al.created_at DESC;
```

## Migration Strategy (Future)

Untuk schema changes di masa depan:

1. Create migration file: `migrations/001_add_column_x.sql`
2. Document rollback procedure
3. Test on staging database
4. Backup production before applying
5. Track migration version in database

## Troubleshooting

### Foreign Key Constraint Failed

```python
# Check if foreign keys enabled
conn = get_connection()
result = conn.execute("PRAGMA foreign_keys").fetchone()
print(f"Foreign keys: {result[0]}")  # Should be 1

# Check violations
violations = conn.execute("PRAGMA foreign_key_check").fetchall()
for v in violations:
    print(f"Violation: {v}")
```

### Database Locked

```python
# Increase timeout
conn = sqlite3.connect("casa_ai.db", timeout=30.0)

# Or use WAL mode (already enabled in db_connection.py)
conn.execute("PRAGMA journal_mode = WAL")
```

## References

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- PRD.md - Product Requirements Document
- CLAUDE.md - Project development guide
