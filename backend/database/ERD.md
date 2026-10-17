# Database Entity Relationship Diagram (ERD)

## Visual Schema Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CASA-AI Database Schema                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐        ┌─────────────────┐
│     users       │◄───────┤  auth_sessions  │
│─────────────────│        │─────────────────│
│ PK id           │        │ PK id           │
│    email        │        │ FK user_id      │
│    password_hash│        │    token_hash   │
│    full_name    │        │    expires_at   │
│    role         │        │    is_revoked   │
│    is_active    │        └─────────────────┘
│    phone_number │
│    license_num  │        ┌─────────────────┐
└────────┬────────┘        │  audit_logs     │
         │                 │─────────────────│
         │                 │ PK id           │
         │                 │ FK actor_id     │
         │                 │    action_type  │
         │                 │    target_type  │
         │                 │    target_id    │
         │                 │    description  │
         │                 │    result       │
         └─────────────────┤    created_at   │
                           └─────────────────┘

┌─────────────────┐
│    patients     │
│─────────────────│
│ PK id           │
│    mrn          │◄────────────┐
│    full_name    │             │
│    dob          │             │
│    gender       │             │
│ FK user_id      │◄─────┐      │
│ FK created_by   │      │      │
└────────┬────────┘      │      │
         │               │      │
         │               │      │
         ▼               │      │
┌─────────────────────────────┐ │
│      examinations           │ │
│─────────────────────────────│ │
│ PK id                       │ │
│ FK patient_id ──────────────┘ │
│    sample_code                │
│    collection_datetime        │
│    abstinence_duration        │
│                               │
│    -- Macroscopic Data --     │
│    volume_ml                  │
│    liquefaction_time_min      │
│    viscosity                  │
│    ph_value                   │
│    appearance                 │
│                               │
│    status                     │
│ FK created_by                 │
│ FK current_analyst_id ────────┤
│ FK current_physician_id ──────┤
└────────┬──────────────────────┘
         │
         │
         │
    ┌────┴───────────────────┐
    │                        │
    ▼                        ▼
┌─────────────────┐    ┌──────────────────────┐
│  media_assets   │    │  analysis_revisions  │
│─────────────────│    │──────────────────────│
│ PK id           │    │ PK id                │
│ FK examination_id    │ FK examination_id     │
│    asset_type   │    │    revision_number   │
│    file_name    │    │    final_pr_count    │
│    storage_path │    │    final_np_count    │
│    checksum     │    │    final_im_count    │
│    fov_index    │    │    concentration     │
│ FK uploaded_by  │    │    is_submitted      │
│ FK analysis_run │    │ FK submitted_by      │
└────────┬────────┘    └──────────┬───────────┘
         │                        │
         │                        │
         │             ┌──────────┴──────────┐
         │             │                     │
         │             ▼                     ▼
         │      ┌──────────────────┐  ┌─────────────┐
         │      │ revision_inputs  │  │   reports   │
         │      │──────────────────│  │─────────────│
         │      │ PK id            │  │ PK id       │
         │      │ FK revision_id   │  │ FK exam_id  │
         │      │ FK analysis_run  │  │ FK revision │
         │      │    included      │  │    number   │
         │      │    excluded      │  │    version  │
         │      └──────────────────┘  │    status   │
         │                            │ FK approved │
         │                            │    released │
         │                            └─────────────┘
         │
         ▼
┌──────────────────────┐
│   analysis_runs      │
│──────────────────────│
│ PK id                │
│ FK examination_id    │
│ FK source_media_id   │
│    calibration_snap  │ ← JSON snapshot
│    status            │
│    algorithm_ver     │
│    pr_count          │
│    np_count          │
│    im_count          │
│    pr_percentage     │
│    np_percentage     │
│    im_percentage     │
│    avg_speed_um_s    │
│    avg_linearity     │
│    canonical_count   │
│    tracking_data     │ ← JSON
└──────────────────────┘

┌──────────────────────┐
│ calibration_profiles │
│──────────────────────│
│ PK id                │
│    profile_name      │
│    microscope_model  │
│    camera_model      │
│    chamber_type      │
│    magnification     │
│    pixel_scale_um    │ ← CRITICAL
│    frame_rate_fps    │ ← CRITICAL
│    chamber_depth_um  │ ← CRITICAL
│    dilution_factor   │ ← CRITICAL
│    is_locked         │
│    is_active         │
│ FK created_by        │
│ FK approved_by       │
└──────────────────────┘

┌──────────────────────┐
│   review_events      │
│──────────────────────│
│ PK id                │
│ FK examination_id    │
│ FK revision_id       │
│    event_type        │
│ FK actor_id          │
│    actor_role        │
│    target_type       │
│    target_id         │
│    action            │
│    reason            │
│    changes_json      │
│    created_at        │
└──────────────────────┘
```

## Key Relationships

### 1. User Management
- `users` ─ 1:N ─ `auth_sessions` (one user, many sessions)
- `users` ─ 1:N ─ `patients` (created_by)
- `users` ─ 1:N ─ `examinations` (analyst, physician)

### 2. Patient & Examination Flow
- `patients` ─ 1:N ─ `examinations` (one patient, many exams)
- `examinations` ─ 1:N ─ `media_assets` (one exam, multiple videos)
- `examinations` ─ 1:N ─ `analysis_revisions` (one exam, multiple revision versions)

### 3. Analysis Pipeline
- `media_assets` ─ 1:1 ─ `analysis_runs` (one video, one analysis)
- `analysis_runs` ─ N:M ─ `analysis_revisions` (via `revision_inputs`)
- `analysis_revisions` ─ 1:N ─ `reports` (one revision, potentially multiple report versions)

### 4. Calibration
- `calibration_profiles` ─ 1:N ─ `analysis_runs` (via JSON snapshot)
- Snapshot stored as JSON in `analysis_runs.calibration_snapshot`

### 5. Audit Trail
- All tables ─ tracked by ─ `audit_logs`
- All review actions ─ tracked by ─ `review_events`

## Foreign Key Constraints

```sql
-- Users cascade sessions (delete user = delete sessions)
auth_sessions.user_id → users.id (ON DELETE CASCADE)

-- Patient restrict examinations (cannot delete patient with exams)
examinations.patient_id → patients.id (ON DELETE RESTRICT)

-- Examination cascade analysis (delete exam = delete analysis)
analysis_runs.examination_id → examinations.id (ON DELETE CASCADE)
analysis_revisions.examination_id → examinations.id (ON DELETE CASCADE)
media_assets.examination_id → examinations.id (ON DELETE CASCADE)

-- Media restrict analysis (cannot delete video if analyzed)
analysis_runs.source_media_id → media_assets.id (ON DELETE RESTRICT)

-- Revision restrict reports (cannot delete revision with reports)
reports.revision_id → analysis_revisions.id (ON DELETE RESTRICT)

-- Revisions cascade inputs (delete revision = delete join records)
revision_inputs.revision_id → analysis_revisions.id (ON DELETE CASCADE)

-- Runs restrict inputs (cannot delete run if used in revision)
revision_inputs.analysis_run_id → analysis_runs.id (ON DELETE RESTRICT)
```

## Data Flow Diagram

```
┌──────────────┐
│ Front Office │ ──► Create Patient & Examination
└──────────────┘
       │
       ▼
┌──────────────┐
│   Analyst    │ ──► Enter Macroscopic Data
└──────────────┘     Select Calibration Profile
       │             Upload Video(s)
       │             Run AI Analysis ───────┐
       ▼                                    │
┌──────────────┐                            ▼
│  AI Pipeline │                   ┌─────────────────┐
└──────────────┘                   │ analysis_runs   │
       │                           │ (per-video)     │
       │                           └─────────────────┘
       ▼                                    │
┌──────────────┐                            │
│   Analyst    │ ◄── Review Detection       │
└──────────────┘     Correct Artifacts      │
       │             Create Revision ◄──────┘
       │             Submit for Review
       ▼
┌──────────────┐
│  Physician   │ ──► Review Revision
└──────────────┘     Approve / Return
       │             Add Clinical Interpretation
       │             Digital Signature
       ▼
┌──────────────┐
│    Report    │ ──► Generate PDF
└──────────────┘     Release to Patient
```

## Index Strategy

### Primary Indexes (for FK joins)
- `idx_sessions_user` on `auth_sessions(user_id)`
- `idx_patients_user` on `patients(user_id)`
- `idx_exams_patient` on `examinations(patient_id)`
- `idx_media_exam` on `media_assets(examination_id)`
- `idx_runs_exam` on `analysis_runs(examination_id)`
- `idx_revisions_exam` on `analysis_revisions(examination_id)`
- `idx_reports_exam` on `reports(examination_id)`

### Secondary Indexes (for queries)
- `idx_users_email` on `users(email)` - Login queries
- `idx_users_role` on `users(role)` - Role-based queries
- `idx_patients_mrn` on `patients(medical_record_number)` - Patient lookup
- `idx_exams_sample` on `examinations(sample_code)` - Sample tracking
- `idx_exams_status` on `examinations(status)` - Queue/dashboard queries
- `idx_sessions_token` on `auth_sessions(token_hash)` - Auth validation

### Composite Indexes (for common filters)
- `idx_audit_target` on `audit_logs(target_type, target_id)` - Audit queries
- `idx_review_type` on `review_events(event_type)` - Review filtering

## Performance Notes

1. **SQLite WAL Mode**: Enabled for better concurrent read access
2. **Foreign Keys**: Always enabled (`PRAGMA foreign_keys = ON`)
3. **JSON Storage**: Used for flexible nested data (snapshots, tracking data)
4. **Indexes**: Covering common query patterns without over-indexing
5. **Triggers**: Auto-update `updated_at` timestamps

## Capacity Planning

### Expected Row Counts (per year)
- **Examinations**: ~1,000 - 10,000
- **Analysis Runs**: ~2,000 - 40,000 (2-4 videos per exam)
- **Media Assets**: ~4,000 - 80,000 (videos + outputs)
- **Audit Logs**: ~50,000 - 500,000 (highly variable)

### Storage Estimates
- **Database File**: ~100MB - 500MB per year (without media files)
- **Media Files**: ~10GB - 100GB per year (videos stored separately)

### Scaling Considerations
- SQLite suitable for single-server deployments up to ~100k examinations
- For larger scale, consider PostgreSQL migration
- Partition audit_logs by date for large installations
- Archive old released reports to separate storage
