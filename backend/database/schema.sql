-- ==============================================================================
-- CASA-AI Database Schema
-- Version: 1.0.0
-- Database: SQLite3
-- Created: 2026-10-17
-- ==============================================================================
--
-- This schema defines the complete database structure for CASA-AI
-- (Computer-Assisted Sperm Analysis with AI) system.
--
-- Design Principles:
-- 1. Traceability: All analysis traceable to source video & calibration
-- 2. Immutability: Approved results and released reports are read-only
-- 3. Privacy: Patient data protected with role-based access
-- 4. Audit trail: All sensitive actions logged
-- 5. State validation: Lifecycle transitions enforced
--
-- ==============================================================================

-- Enable foreign key constraints (CRITICAL for SQLite)
PRAGMA foreign_keys = ON;

-- ==============================================================================
-- TABLE 1: users
-- Stores user accounts with role-based access control
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    email               TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    full_name           TEXT NOT NULL,
    role                TEXT NOT NULL
                        CHECK(role IN (
                            'FRONT_OFFICE',     -- Register patients & examinations
                            'ANALYST',          -- Run analysis & review results
                            'PHYSICIAN',        -- Approve & sign reports
                            'PATIENT',          -- View own released reports
                            'SUPER_ADMIN'       -- Manage users & system config
                        )),

    is_active           INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    phone_number        TEXT,
    license_number      TEXT,               -- SIP/STR for physicians

    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ==============================================================================
-- TABLE 2: auth_sessions
-- Stores login sessions for authentication and token management
-- ==============================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    token_hash          TEXT UNIQUE NOT NULL,
    ip_address          TEXT,
    user_agent          TEXT,

    expires_at          TEXT NOT NULL,
    is_revoked          INTEGER NOT NULL DEFAULT 0 CHECK(is_revoked IN (0, 1)),
    revoked_at          TEXT,
    revoked_reason      TEXT,

    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON auth_sessions(is_revoked);

-- ==============================================================================
-- TABLE 3: patients
-- Stores patient demographic information
-- ==============================================================================

CREATE TABLE IF NOT EXISTS patients (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    medical_record_number   TEXT UNIQUE NOT NULL,
    full_name               TEXT NOT NULL,
    date_of_birth           TEXT NOT NULL,      -- ISO 8601: YYYY-MM-DD
    gender                  TEXT CHECK(gender IN ('MALE', 'FEMALE', 'OTHER')),

    phone_number            TEXT,
    email                   TEXT,
    address                 TEXT,

    -- Optional link to patient portal account
    user_id                 INTEGER,

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    created_by              INTEGER,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX IF NOT EXISTS idx_patients_user ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_creator ON patients(created_by);

-- ==============================================================================
-- TABLE 4: examinations
-- Stores examination records including macroscopic data
-- ==============================================================================

CREATE TABLE IF NOT EXISTS examinations (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id                  INTEGER NOT NULL,
    sample_code                 TEXT UNIQUE NOT NULL,

    -- Sample collection information
    collection_datetime         TEXT,
    received_datetime           TEXT,
    abstinence_duration_hours   INTEGER,

    -- Macroscopic examination data
    volume_ml                   REAL CHECK(volume_ml IS NULL OR volume_ml >= 0),
    liquefaction_time_min       INTEGER CHECK(liquefaction_time_min IS NULL OR liquefaction_time_min >= 0),
    viscosity                   TEXT CHECK(viscosity IS NULL OR viscosity IN ('NORMAL', 'INCREASED', 'DECREASED')),
    ph_value                    REAL CHECK(ph_value IS NULL OR (ph_value >= 0 AND ph_value <= 14)),
    appearance                  TEXT,
    macroscopic_notes           TEXT,

    -- Workflow status
    status                      TEXT NOT NULL DEFAULT 'REGISTERED'
                                CHECK(status IN (
                                    'REGISTERED',
                                    'IN_PROGRESS',
                                    'PENDING_REVIEW',
                                    'RETURNED_FOR_CORRECTION',
                                    'APPROVED',
                                    'RELEASED',
                                    'CANCELLED',
                                    'FAILED_ANALYSIS'
                                )),

    -- Tracking
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    created_by                  INTEGER,
    current_analyst_id          INTEGER,
    current_physician_id        INTEGER,

    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (current_analyst_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (current_physician_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exams_patient ON examinations(patient_id);
CREATE INDEX IF NOT EXISTS idx_exams_sample ON examinations(sample_code);
CREATE INDEX IF NOT EXISTS idx_exams_status ON examinations(status);
CREATE INDEX IF NOT EXISTS idx_exams_analyst ON examinations(current_analyst_id);
CREATE INDEX IF NOT EXISTS idx_exams_physician ON examinations(current_physician_id);
CREATE INDEX IF NOT EXISTS idx_exams_created ON examinations(created_at);

-- ==============================================================================
-- TABLE 5: calibration_profiles
-- Stores approved microscope/chamber calibration configurations
-- ==============================================================================

CREATE TABLE IF NOT EXISTS calibration_profiles (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name            TEXT UNIQUE NOT NULL,

    -- Device identification
    microscope_model        TEXT,
    camera_model            TEXT,
    chamber_type            TEXT,
    magnification           TEXT,

    -- Critical calibration parameters
    pixel_scale_um          REAL NOT NULL CHECK(pixel_scale_um > 0),
    frame_rate_fps          REAL NOT NULL CHECK(frame_rate_fps > 0),
    chamber_depth_um        REAL NOT NULL CHECK(chamber_depth_um > 0),
    dilution_factor         REAL NOT NULL DEFAULT 1.0 CHECK(dilution_factor > 0),

    -- Configuration metadata
    calibration_method      TEXT,
    calibration_date        TEXT,
    notes                   TEXT,

    -- Version control
    version                 INTEGER NOT NULL DEFAULT 1,
    is_locked               INTEGER NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    created_by              INTEGER,
    approved_by             INTEGER,
    approved_at             TEXT,

    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_calibration_active ON calibration_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_calibration_locked ON calibration_profiles(is_locked);
CREATE INDEX IF NOT EXISTS idx_calibration_name ON calibration_profiles(profile_name);

-- ==============================================================================
-- TABLE 6: media_assets
-- Stores file metadata and private storage paths for all media files
-- ==============================================================================

CREATE TABLE IF NOT EXISTS media_assets (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id          INTEGER NOT NULL,

    -- File type and metadata
    asset_type              TEXT NOT NULL
                            CHECK(asset_type IN (
                                'VIDEO_SOURCE',
                                'ANNOTATED_VIDEO',
                                'HEATMAP',
                                'TRAJECTORY',
                                'REPORT_PDF'
                            )),

    file_name               TEXT NOT NULL,
    file_size_bytes         INTEGER CHECK(file_size_bytes >= 0),
    mime_type               TEXT,
    storage_path            TEXT NOT NULL,      -- Private storage, NEVER public URL
    checksum_sha256         TEXT,

    -- Video-specific metadata
    field_of_view_index     INTEGER CHECK(field_of_view_index BETWEEN 1 AND 4),
    duration_seconds        REAL,
    width_pixels            INTEGER,
    height_pixels           INTEGER,
    actual_fps              REAL,

    -- Access control
    is_public               INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0, 1)),

    -- Tracking
    uploaded_at             TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by             INTEGER,

    -- Link to analysis if this is an output artifact
    analysis_run_id         INTEGER,

    FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_exam ON media_assets(examination_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_media_fov ON media_assets(field_of_view_index);
CREATE INDEX IF NOT EXISTS idx_media_run ON media_assets(analysis_run_id);

-- ===============================================================================
