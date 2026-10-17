-- ==============================================================================
-- TABLE 7: analysis_runs
-- Stores AI analysis execution results per video with immutable calibration snapshot
-- ==============================================================================

CREATE TABLE IF NOT EXISTS analysis_runs (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id              INTEGER NOT NULL,
    source_media_id             INTEGER NOT NULL,

    -- Immutable calibration snapshot (copied from calibration_profile)
    calibration_snapshot        TEXT NOT NULL,  -- JSON format

    -- Processing status
    status                      TEXT NOT NULL DEFAULT 'PENDING'
                                CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),

    -- Algorithm metadata
    algorithm_version           TEXT,
    model_checkpoint            TEXT,
    config_params               TEXT,           -- JSON format

    -- Processing timing
    started_at                  TEXT,
    completed_at                TEXT,
    processing_duration_sec     REAL,

    -- Frame analysis metrics
    total_frames_analyzed       INTEGER CHECK(total_frames_analyzed >= 0),
    frames_with_detections      INTEGER CHECK(frames_with_detections >= 0),

    -- Detection and tracking counts
    raw_detections_count        INTEGER CHECK(raw_detections_count >= 0),
    valid_tracks_count          INTEGER CHECK(valid_tracks_count >= 0),
    canonical_count             INTEGER CHECK(canonical_count >= 0),

    -- Motility classification (per-video, before human review)
    pr_count                    INTEGER CHECK(pr_count >= 0),
    np_count                    INTEGER CHECK(np_count >= 0),
    im_count                    INTEGER CHECK(im_count >= 0),

    pr_percentage               REAL CHECK(pr_percentage IS NULL OR (pr_percentage >= 0 AND pr_percentage <= 100)),
    np_percentage               REAL CHECK(np_percentage IS NULL OR (np_percentage >= 0 AND np_percentage <= 100)),
    im_percentage               REAL CHECK(im_percentage IS NULL OR (im_percentage >= 0 AND im_percentage <= 100)),

    -- Movement metrics
    avg_speed_um_s              REAL CHECK(avg_speed_um_s IS NULL OR avg_speed_um_s >= 0),
    avg_linearity               REAL CHECK(avg_linearity IS NULL OR (avg_linearity >= 0 AND avg_linearity <= 1)),

    -- Detailed tracking data for review and reproducibility
    tracking_data_json          TEXT,           -- JSON format: per-frame detections, tracks, coordinates

    -- Error handling
    error_message               TEXT,
    error_traceback             TEXT,

    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
    FOREIGN KEY (source_media_id) REFERENCES media_assets(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runs_exam ON analysis_runs(examination_id);
CREATE INDEX IF NOT EXISTS idx_runs_media ON analysis_runs(source_media_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON analysis_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON analysis_runs(created_at);

-- ==============================================================================
-- TABLE 8: analysis_revisions
-- Stores reviewed/corrected examination results aggregated from multiple FOV
-- ==============================================================================

CREATE TABLE IF NOT EXISTS analysis_revisions (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id              INTEGER NOT NULL,
    revision_number             INTEGER NOT NULL CHECK(revision_number > 0),

    -- Aggregated metrics (from 1-4 FOV videos, after human correction)
    total_videos_analyzed       INTEGER NOT NULL CHECK(total_videos_analyzed > 0),

    -- Final motility summary
    final_pr_count              INTEGER CHECK(final_pr_count >= 0),
    final_np_count              INTEGER CHECK(final_np_count >= 0),
    final_im_count              INTEGER CHECK(final_im_count >= 0),

    final_pr_percentage         REAL CHECK(final_pr_percentage IS NULL OR (final_pr_percentage >= 0 AND final_pr_percentage <= 100)),
    final_np_percentage         REAL CHECK(final_np_percentage IS NULL OR (final_np_percentage >= 0 AND final_np_percentage <= 100)),
    final_im_percentage         REAL CHECK(final_im_percentage IS NULL OR (final_im_percentage >= 0 AND final_im_percentage <= 100)),

    -- Final movement metrics
    final_avg_speed_um_s        REAL CHECK(final_avg_speed_um_s IS NULL OR final_avg_speed_um_s >= 0),
    final_avg_linearity         REAL CHECK(final_avg_linearity IS NULL OR (final_avg_linearity >= 0 AND final_avg_linearity <= 1)),

    -- Concentration estimate (requires valid calibration)
    concentration_million_ml    REAL CHECK(concentration_million_ml IS NULL OR concentration_million_ml >= 0),
    concentration_method        TEXT,

    -- Combined visualization artifacts
    combined_heatmap_id         INTEGER,
    combined_trajectory_id      INTEGER,

    -- Classification rules used
    classification_rules        TEXT,           -- JSON format

    -- Review status
    is_submitted                INTEGER NOT NULL DEFAULT 0 CHECK(is_submitted IN (0, 1)),
    submitted_at                TEXT,
    submitted_by                INTEGER,

    -- Metadata
    notes                       TEXT,

    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(examination_id, revision_number),

    FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
    FOREIGN KEY (combined_heatmap_id) REFERENCES media_assets(id) ON DELETE SET NULL,
    FOREIGN KEY (combined_trajectory_id) REFERENCES media_assets(id) ON DELETE SET NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_revisions_exam ON analysis_revisions(examination_id);
CREATE INDEX IF NOT EXISTS idx_revisions_submitted ON analysis_revisions(is_submitted);
CREATE INDEX IF NOT EXISTS idx_revisions_number ON analysis_revisions(revision_number);

-- ==============================================================================
-- TABLE 9: revision_inputs
-- Many-to-many relationship between revisions and analysis runs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS revision_inputs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id             INTEGER NOT NULL,
    analysis_run_id         INTEGER NOT NULL,

    -- Per-run contribution to revision
    included_tracks         TEXT,               -- JSON array
    excluded_tracks         TEXT,               -- JSON array
    correction_notes        TEXT,

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(revision_id, analysis_run_id),

    FOREIGN KEY (revision_id) REFERENCES analysis_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_rev_inputs_revision ON revision_inputs(revision_id);
CREATE INDEX IF NOT EXISTS idx_rev_inputs_run ON revision_inputs(analysis_run_id);

-- ==============================================================================
-- TABLE 10: review_events
-- Audit trail for analyst corrections and physician review actions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS review_events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id          INTEGER NOT NULL,
    revision_id             INTEGER,

    event_type              TEXT NOT NULL
                            CHECK(event_type IN (
                                'ANALYST_CORRECTION',
                                'SUBMIT_FOR_REVIEW',
                                'PHYSICIAN_RETURN',
                                'PHYSICIAN_APPROVE'
                            )),

    actor_id                INTEGER NOT NULL,
    actor_role              TEXT NOT NULL,

    -- Event details
    target_type             TEXT,
    target_id               TEXT,
    action                  TEXT,
    reason                  TEXT,
    changes_json            TEXT,               -- JSON: before/after values

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES analysis_revisions(id) ON DELETE SET NULL,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_review_exam ON review_events(examination_id);
CREATE INDEX IF NOT EXISTS idx_review_revision ON review_events(revision_id);
CREATE INDEX IF NOT EXISTS idx_review_actor ON review_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_review_type ON review_events(event_type);
CREATE INDEX IF NOT EXISTS idx_review_created ON review_events(created_at);

-- ==============================================================================
-- TABLE 11: reports
-- Final reports with physician approval and digital signature
-- ==============================================================================

CREATE TABLE IF NOT EXISTS reports (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id              INTEGER NOT NULL,
    revision_id                 INTEGER NOT NULL,

    report_number               TEXT UNIQUE NOT NULL,
    report_version              INTEGER NOT NULL DEFAULT 1 CHECK(report_version > 0),

    -- Report status
    status                      TEXT NOT NULL DEFAULT 'DRAFT'
                                CHECK(status IN ('DRAFT', 'APPROVED', 'RELEASED', 'AMENDED')),

    -- Physician approval
    approved_by                 INTEGER,
    approved_at                 TEXT,

    -- Digital signature metadata
    signature_method            TEXT CHECK(signature_method IS NULL OR signature_method IN ('DRAWN', 'DIGITAL_CERT', 'AUTHENTICATED_APPROVAL')),
    signature_data              TEXT,
    physician_license           TEXT,

    -- Clinical interpretation
    clinical_interpretation     TEXT,
    clinical_diagnosis          TEXT,
    recommendations             TEXT,

    -- Report artifacts
    report_pdf_id               INTEGER,
    report_json                 TEXT,           -- Structured report data

    -- Release control
    released_at                 TEXT,
    released_by                 INTEGER,

    -- Limitations and disclaimers
    limitations_noted           TEXT,
    medical_disclaimer          TEXT,

    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(examination_id, report_version),

    FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE RESTRICT,
    FOREIGN KEY (revision_id) REFERENCES analysis_revisions(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (report_pdf_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_exam ON reports(examination_id);
CREATE INDEX IF NOT EXISTS idx_reports_revision ON reports(revision_id);
CREATE INDEX IF NOT EXISTS idx_reports_number ON reports(report_number);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_physician ON reports(approved_by);

-- ==============================================================================
-- TABLE 12: audit_logs
-- Comprehensive audit trail for all sensitive system actions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Actor identification
    actor_id                INTEGER,
    actor_email             TEXT,
    actor_role              TEXT,
    actor_ip                TEXT,

    -- Action details
    action_type             TEXT NOT NULL,

    target_type             TEXT,
    target_id               INTEGER,

    description             TEXT NOT NULL,

    -- State snapshots for sensitive changes
    before_state            TEXT,               -- JSON snapshot
    after_state             TEXT,               -- JSON snapshot

    -- Result
    result                  TEXT NOT NULL DEFAULT 'SUCCESS'
                            CHECK(result IN ('SUCCESS', 'FAILURE', 'UNAUTHORIZED')),
    error_message           TEXT,

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_logs(result);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ==============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ==============================================================================

-- Users table trigger
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Patients table trigger
CREATE TRIGGER IF NOT EXISTS trg_patients_updated_at
AFTER UPDATE ON patients
FOR EACH ROW
BEGIN
    UPDATE patients SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Examinations table trigger
CREATE TRIGGER IF NOT EXISTS trg_examinations_updated_at
AFTER UPDATE ON examinations
FOR EACH ROW
BEGIN
    UPDATE examinations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Calibration profiles table trigger
CREATE TRIGGER IF NOT EXISTS trg_calibration_updated_at
AFTER UPDATE ON calibration_profiles
FOR EACH ROW
BEGIN
    UPDATE calibration_profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Reports table trigger
CREATE TRIGGER IF NOT EXISTS trg_reports_updated_at
AFTER UPDATE ON reports
FOR EACH ROW
BEGIN
    UPDATE reports SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ==============================================================================
-- VIEWS: Convenient read-only views for common queries
-- ==============================================================================

-- View: Active examinations with patient info
CREATE VIEW IF NOT EXISTS vw_active_examinations AS
SELECT
    e.id,
    e.sample_code,
    e.status,
    e.collection_datetime,
    e.created_at,
    p.id AS patient_id,
    p.medical_record_number,
    p.full_name AS patient_name,
    p.date_of_birth,
    u_analyst.full_name AS analyst_name,
    u_physician.full_name AS physician_name
FROM examinations e
INNER JOIN patients p ON e.patient_id = p.id
LEFT JOIN users u_analyst ON e.current_analyst_id = u_analyst.id
LEFT JOIN users u_physician ON e.current_physician_id = u_physician.id
WHERE e.status NOT IN ('CANCELLED', 'RELEASED');

-- View: Pending physician reviews
CREATE VIEW IF NOT EXISTS vw_pending_reviews AS
SELECT
    e.id AS examination_id,
    e.sample_code,
    e.collection_datetime,
    p.medical_record_number,
    p.full_name AS patient_name,
    ar.id AS revision_id,
    ar.revision_number,
    ar.submitted_at,
    u.full_name AS submitted_by_name
FROM examinations e
INNER JOIN patients p ON e.patient_id = p.id
INNER JOIN analysis_revisions ar ON e.id = ar.examination_id
LEFT JOIN users u ON ar.submitted_by = u.id
WHERE e.status = 'PENDING_REVIEW' AND ar.is_submitted = 1;

-- View: Released reports
CREATE VIEW IF NOT EXISTS vw_released_reports AS
SELECT
    r.id AS report_id,
    r.report_number,
    r.report_version,
    r.released_at,
    e.sample_code,
    p.id AS patient_id,
    p.medical_record_number,
    p.full_name AS patient_name,
    u_physician.full_name AS physician_name,
    u_physician.license_number AS physician_license
FROM reports r
INNER JOIN examinations e ON r.examination_id = e.id
INNER JOIN patients p ON e.patient_id = p.id
LEFT JOIN users u_physician ON r.approved_by = u_physician.id
WHERE r.status = 'RELEASED';

-- ==============================================================================
-- SCHEMA VERIFICATION QUERY
-- ==============================================================================

-- Use this query to verify all tables were created successfully
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- ==============================================================================
-- END OF SCHEMA
-- ==============================================================================
