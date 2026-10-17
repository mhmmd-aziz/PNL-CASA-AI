# Product Requirements Document (PRD) --- CASA-AI

-   **Product:** CASA-AI --- Computer-Assisted Sperm Analysis with AI
-   **Document status:** Draft for product and domain review
-   **Primary source:** `KITAB SUCI CASA-AI.pdf` (11 pages)
-   **Audience:** Product owner, software engineers, AI/ML engineers,
    laboratory analysts, responsible physicians, QA, and security
    reviewers

## 1. Product Summary

CASA-AI is a laboratory-assistance system intended to turn microscope
video of semen samples into structured, reviewable analysis outputs. The
planned system combines patient/examination registration, macroscopic
sample data, microscope calibration, AI-assisted detection and tracking,
motility classification, concentration estimation, movement
visualization, human review, physician approval, and controlled report
release.

The system is a decision-support and laboratory workflow tool. It must
not independently replace professional medical interpretation.

## 2. Problem Statement

Manual or fragmented workflows can make analysis time-consuming and
results difficult to standardize, review, trace, and report. Video-based
detection can also overcount objects, mistake debris for sperm, or
produce unreliable measurements if calibration and sampling assumptions
are not controlled.

CASA-AI aims to support a repeatable workflow with traceable source
media, explicit calibration, transparent metrics, human correction,
role-based access, and a controlled report lifecycle.

## 3. Goals

1.  Manage patient and examination records with clear sample identity.
2.  Capture relevant pre-analytical/macroscopic information.
3.  Store calibration settings used for every analysis.
4.  Upload and analyze microscopy video with traceable processing
    status.
5.  Provide PR, NP, and IM motility summaries and movement metrics.
6.  Reduce duplicate counting and make tracking artifacts reviewable.
7.  Display annotated video and trajectory/heatmap visualizations.
8.  Allow analysts to correct technical artifacts and submit a result
    revision.
9.  Require physician review and approval before final release.
10. Generate structured analysis data and a final PDF report.
11. Enforce role-based permissions and maintain an audit trail.

## 4. Non-Goals

-   Replacing a physician or laboratory professional.
-   Automatically making fertility-treatment decisions (e.g., IUI/IVF
    recommendations) without qualified clinical review.
-   Claiming regulatory approval or clinical validation without
    evidence.
-   Treating uncalibrated pixel measurements as valid physical units.
-   Exposing raw videos and internal AI data to patients by default.
-   Assuming every planned feature already exists in the current
    codebase.

## 5. Users and Roles

### 5.1 Front Office / Lab Admin

-   Register patients and examinations.
-   Record sample handoff details and abstinence duration.
-   Create/print sample label or barcode.
-   View registration status.
-   Cannot edit analysis results, approve diagnoses, sign, or release
    final reports.

### 5.2 Laboratory Analyst / ATLM

-   Enter macroscopic examination data.
-   Select an authorized device/chamber calibration profile.
-   Upload microscopy video(s) and start analysis.
-   Review detection overlay, tracks, and heatmap.
-   Correct or flag false detections/artifacts with a recorded audit
    event.
-   Submit a specific analysis revision to the physician.
-   Cannot approve/sign/release final reports.

### 5.3 Responsible Physician

-   Review submitted analysis and relevant sample data.
-   Return a case for correction or approve it.
-   Enter or edit clinical interpretation within authorized scope.
-   Sign and authorize report release.
-   Own final medical approval.

### 5.4 Patient (Optional Portal)

-   View/download only their own released, signed report.
-   Cannot view raw videos, internal analysis data, or another patient's
    record.

### 5.5 Super Admin / Head of Laboratory

-   Manage user accounts and roles.
-   Review audit events.
-   Manage system configuration and approved/locked calibration presets.
-   Administrative privileges do not automatically grant authority to
    approve or sign clinical reports.

## 6. Main Workflow

1.  **Registration:** create patient, examination, and unique sample
    identifiers.
2.  **Pre-analytical entry:** record abstinence duration and available
    macroscopic data.
3.  **Calibration:** select device/chamber profile and confirm scale,
    FPS, depth, and dilution factor.
4.  **Video intake:** upload one or more short videos and associate each
    with the correct examination and field of view.
5.  **AI processing:** detect sperm candidates, track movement,
    calculate metrics, and generate visualization assets.
6.  **Analyst review:** inspect overlays/heatmap; remove or flag
    artifacts; record corrections.
7.  **Submission:** submit a defined analysis revision to physician
    review.
8.  **Physician review:** approve/sign or return for correction.
9.  **Release:** generate and lock the final PDF; grant access only to
    authorized users.
10. **Audit:** preserve a history of important actions and state
    changes.

## 7. Functional Requirements

Priority convention: **P0** = essential for a safe usable workflow;
**P1** = important planned capability; **P2** = optional or later
enhancement.

### FR-01 --- Authentication and Authorization (P0)

-   Users must authenticate before accessing protected records.
-   Every protected operation must be authorized server-side by role and
    record scope.
-   Patient access must be limited to their own released reports.
-   Unauthorized access attempts must be rejected and security-relevant
    events logged.

**Acceptance criteria** - A user without permission cannot access a
protected API by manually calling it. - A patient cannot retrieve
another patient's report by changing an identifier. - UI visibility and
server authorization remain consistent.

### FR-02 --- Patient and Examination Registration (P0)

-   Authorized front-office staff can create a patient and
    examination/sample record.
-   Records should include unique identifiers and timestamps.
-   Record abstinence duration and sample handoff details where
    applicable.
-   Support printable sample label/barcode if included in the deployed
    scope.

**Acceptance criteria** - Required fields are validated. -
Duplicate/mismatched sample identity is prevented or clearly flagged. -
Registration changes are traceable.

### FR-03 --- Macroscopic Data Entry (P0)

-   Authorized analysts can record semen volume (mL), liquefaction time
    (minutes), viscosity, and pH where available.
-   Preserve entered units and distinguish missing values from zero.
-   Record who entered or changed data and when.

**Acceptance criteria** - Invalid values are rejected or flagged for
review. - Missing information is not silently populated with a
default. - The data is visible in the examination review screen to
authorized users.

### FR-04 --- Calibration Profiles (P0)

-   Support pixel scale (µm/px), FPS, chamber depth (µm), and dilution
    factor.
-   Identify device/chamber and magnification where available.
-   Store an immutable snapshot of the calibration used for each
    analysis.
-   Authorized administrators may manage approved presets; analysts may
    select only permitted profiles.

**Acceptance criteria** - Invalid or absent required calibration blocks
physical-unit calculations or clearly marks them unavailable. - Updating
a preset does not alter prior analysis records. - Each report can
identify the calibration snapshot used.

### FR-05 --- Video Upload and Media Management (P0)

-   Upload microscopy video(s) to an examination.
-   Validate file type, size, and basic metadata.
-   Preserve the original file and associate it with the uploader,
    timestamp, examination, and field of view.
-   Display upload and processing status.

**Acceptance criteria** - Invalid files fail with a clear message. -
Files cannot be accessed through public or guessable URLs. - Failed
uploads/processing can be retried without creating duplicate examination
results.

### FR-06 --- AI Detection and Tracking (P0)

-   Run the configured detection and tracking pipeline against uploaded
    video.
-   Store analysis status, processing errors, model/algorithm version,
    and relevant configuration.
-   Provide an annotated output or equivalent review representation.
-   Never generate fabricated metrics when inference fails.

**Acceptance criteria** - A failed job is marked as failed and includes
a safe, actionable error. - Results are linked to the exact source video
and analysis revision. - Re-running an analysis creates a traceable new
run rather than silently overwriting history.

### FR-07 --- Motility Metrics (P0)

-   Produce PR, NP, and IM counts/percentages when the required inputs
    and calibration are valid.
-   The reference document describes average speed and linearity based
    on tracked centroid paths.
-   Keep classification rules configurable and versioned.

**Prototype rules in the source document --- not verified clinical
standards** - PR: speed \> 25.0 µm/s and linearity \> 0.5. - IM: average
speed \< 5.0 µm/s. - NP: other cases between those rules. -
Track-duration filtering: remove tracks shorter than 15 frames.

**Acceptance criteria** - The UI/report shows the rule/configuration
version used. - Missing calibration does not result in a physical speed
being presented as valid. - Boundary cases and unit conversions have
automated tests. - Clinical thresholds are not labelled as WHO-approved
until independently verified.

### FR-08 --- Canonical Count / Duplicate-Count Mitigation (P1)

-   The source describes using the median number of detected objects per
    frame and filtering tracks shorter than 15 frames as a way to
    mitigate duplicate counts/noise.
-   If implemented, expose the method and its assumptions in technical
    documentation.

**Acceptance criteria** - Tests cover empty frames, short tracks, track
ID switches, and variable object counts. - The UI does not describe
median per-frame count as a direct exact count of unique sperm unless
validated for that interpretation. - Any concentration calculation based
on this count is explicitly labelled as an estimate.

### FR-09 --- Concentration Estimate (P1; domain validation required)

-   Estimate concentration (millions/mL) only when geometry,
    calibration, chamber depth, dilution, and sampling assumptions are
    available.
-   Preserve intermediate values and the calculation version for
    audit/reproducibility.
-   Validate the formula with a qualified domain expert before clinical
    use.

**Acceptance criteria** - Unit conversion tests cover pixel scale, area,
volume, and mL conversion. - Missing or invalid inputs prevent the
calculation or result in a clearly marked unavailable value. - Reports
identify the value as an estimate until its methodology is validated.

### FR-10 --- Multi-Field-of-View Analysis (P1)

-   Support 2--4 videos from different fields of view as proposed in the
    source document.
-   Store per-video results and the aggregate result separately.
-   Document the aggregation method; do not silently average or pool
    incompatible measurements.

**Acceptance criteria** - Each source video can be traced to its own
metrics. - Aggregate outputs disclose how they were calculated. -
Partial processing failures are visible and do not masquerade as
complete analysis.

### FR-11 --- Visual Review and Artifact Correction (P0)

-   Show video overlay and trajectory/heatmap where available.
-   Allow authorized analysts to flag/remove false detections such as
    debris or other artifacts.
-   Store corrections as review events tied to the analysis revision.

**Acceptance criteria** - A correction records actor, timestamp, target,
and action. - The original AI output remains available for audit. -
Changes update the reviewable result without erasing provenance.

### FR-12 --- Physician Review and Approval (P0)

-   Analysts submit a defined revision for review.
-   Physicians can inspect the result and approve/sign or return it for
    correction.
-   Only the authorized physician role can complete approval/signature.

**Acceptance criteria** - An analyst cannot call the approval endpoint
successfully. - A physician cannot approve an analysis that is not in
the correct state. - The approved result revision is locked against
silent changes.

### FR-13 --- Report Generation and Release (P0)

-   Generate a structured JSON report and readable report output; PDF is
    the intended final deliverable.
-   Include patient/examination identifiers, relevant macroscopic data,
    calibration, metrics, charts/heatmap where available, timestamps,
    reviewer/approver details, and a medical disclaimer as appropriate.
-   Include clinic header and signature field only when configured and
    authorized.
-   Make final PDF downloadable only after approval/signature and
    release.

**Acceptance criteria** - Draft and final reports are visibly
distinguishable. - Released reports are read-only. - A patient cannot
download a draft or another patient's report. - A report can be traced
to its approved analysis revision.

### FR-14 --- Examination Lifecycle (P0)

Use the intended lifecycle: `REGISTERED` → `IN_PROGRESS` →
`PENDING_REVIEW` → `APPROVED & SIGNED` → `RELEASED`

The implementation may add documented exception states such as
`RETURNED_FOR_CORRECTION`, `CANCELLED`, or `FAILED_ANALYSIS`.

**Acceptance criteria** - Invalid state transitions are rejected
server-side. - Every transition records actor, timestamp, and reason
where applicable. - Release cannot occur before approval/signature.

### FR-15 --- User Administration and Audit Trail (P0)

-   Super Admin manages accounts and role assignments.
-   Record relevant events including registration changes, calibration
    changes, media upload, analysis runs, manual corrections, review
    submission, approval/signature, report release, and account/role
    changes.
-   Protect audit records from ordinary user modification.

**Acceptance criteria** - Audit entries identify actor, action, target,
and timestamp. - Ordinary users cannot edit or delete audit events. -
Logs avoid unnecessary patient-identifiable details.

## 8. Data Entities (Logical Model)

The exact schema must be reconciled with the existing repository before
implementation. Suggested logical entities:

-   **User:** id, display name, login identifier, role, active status,
    timestamps.
-   **Patient:** id, medical record number or internal identifier,
    required demographics per clinic policy, timestamps.
-   **Examination:** id, patient id, sample identifier, registration
    data, abstinence duration, macroscopic values, status, timestamps.
-   **CalibrationProfile:** id, device/chamber, pixel scale, FPS,
    chamber depth, dilution factor, version, active/locked status.
-   **CalibrationSnapshot:** examination/analysis id, copied calibration
    values, operator, timestamp.
-   **MediaAsset:** id, examination id, private storage key, checksum,
    metadata, field-of-view index, uploader, timestamp.
-   **AnalysisRun:** id, source media ids, status, algorithm/model
    version, configuration, metrics, errors, created/finished
    timestamps.
-   **Track/Detection data:** coordinates and features needed for review
    and reproducibility, subject to storage/performance decisions.
-   **ReviewEvent:** id, analysis revision, actor, action/correction,
    reason, timestamp.
-   **ClinicalApproval:** id, examination, physician, approved revision,
    interpretation, signature metadata, timestamp.
-   **Report:** id, examination, approved revision, version, status,
    private storage key, checksum, released timestamp.
-   **AuditEvent:** actor, action, target type/id, timestamp, safe
    before/after metadata.

Do not store raw passwords. Minimize patient data and define
retention/access rules with the institution.

## 9. Non-Functional Requirements

### Security and Privacy

-   Least-privilege access and server-side authorization.
-   Private storage for microscopy media and reports.
-   Secure authentication and secret management.
-   Protection against common web vulnerabilities and unsafe file
    uploads.
-   Auditability for sensitive actions.
-   Data minimization and institution-approved retention/deletion
    policy.

### Reliability

-   Long-running analysis should expose progress/status and support safe
    retry.
-   Failed jobs must not publish partial or misleading final reports.
-   State transitions and report release should be transactional where
    possible.

### Performance

-   Upload and inference must not block ordinary UI interactions.
-   Establish measurable targets after inspecting expected video size,
    hardware, concurrency, and deployment environment.
-   Show progress for long-running work rather than inventing fixed
    completion times.

### Usability and Accessibility

-   Provide role-specific navigation.
-   Clearly distinguish draft, pending, approved, and released data.
-   Provide understandable validation errors and loading/empty/error
    states.
-   Use consistent units and labels.

### Traceability

-   Preserve source media references, calibration snapshot,
    algorithm/configuration version, analyst corrections, physician
    approval, and report version.

## 10. Reporting Requirements

A report should include, where applicable: - Clinic/laboratory identity
and report identifier. - Patient/examination/sample identifiers
appropriate to privacy policy. - Sample collection/receipt and analysis
timestamps. - Abstinence duration and macroscopic parameters. -
Device/chamber and calibration values. - Per-video and aggregate
analysis metrics. - PR/NP/IM counts and percentages. - Speed/linearity
metrics and concentration estimate with methodology/version. -
Trajectory/heatmap or representative annotated output. - Analyst review
status and physician approval/signature metadata. - Limitations and
medical disclaimer. - Version, status, and verification information.

Do not include diagnostic labels, reference ranges, or clinical
recommendations as authoritative until the chosen WHO edition and
applicable laboratory policy are verified by qualified stakeholders.

## 11. UX / Screen Inventory

1.  Login and account recovery.
2.  Role-specific dashboard and examination queue.
3.  Patient/examination registration.
4.  Macroscopic data entry.
5.  Calibration profile selection/management.
6.  Video upload and processing status.
7.  Analysis results: metrics, video overlay, trajectory/heatmap.
8.  Analyst correction/review workspace.
9.  Submission and physician review queue.
10. Physician approval/signature screen.
11. Report preview, release, and download.
12. Patient portal (optional; released reports only).
13. User/role administration.
14. Audit log and system configuration.

Screen inventory is a target design, not evidence that these screens
currently exist.

## 12. Risks and Open Questions

1.  **Clinical validation:** Are the proposed motility thresholds and
    reference limits approved by the laboratory's clinical stakeholders?
    Which WHO manual edition is authoritative?
2.  **Concentration formula:** What exact pixel-to-area and
    area-to-volume conversion is used in the current implementation? How
    is the sampled volume determined?
3.  **Counting method:** Is median per-frame count sufficient for the
    intended concentration estimate, and how is unique-object counting
    validated?
4.  **Sampling:** How are 2--4 fields of view combined? What is the
    minimum acceptable video duration and quality?
5.  **Tracking:** How are occlusion, ID switches, debris, leukocytes,
    and overlapping sperm handled?
6.  **Calibration:** How is pixel scale measured and verified for each
    camera/lens/chamber combination?
7.  **Digital signature:** Is a drawn signature, authenticated approval
    event, or legally compliant electronic-signature service required?
8.  **Patient identity:** Which fields are required by the institution,
    and what data may be displayed in a patient portal?
9.  **Data governance:** What are the retention, deletion, backup,
    access-review, and incident-response policies?
10. **Deployment:** What are the actual stack, inference hardware, queue
    system, storage, and expected concurrency?
11. **Regulatory status:** What local medical-device/software, privacy,
    and laboratory requirements apply before clinical deployment?

## 13. Suggested Delivery Phases

### Phase 0 --- Repository and domain audit

-   Inspect current code, architecture, database schema, tests, and
    model pipeline.
-   Map existing features against this PRD.
-   Validate formulas, thresholds, and workflow with domain
    stakeholders.
-   Produce a gap list before large changes.

### Phase 1 --- Safe workflow foundation

-   Authentication, RBAC, patient/examination records, lifecycle, audit
    events, and secure media storage.
-   Calibration profiles and immutable snapshots.
-   Automated tests for access boundaries and state transitions.

### Phase 2 --- Analysis and analyst review

-   Video intake, inference job management, metrics, visualization,
    artifact correction, and reproducible analysis versions.
-   Unit tests for physical units and calculations.
-   Clear warnings for failed or uncalibrated analysis.

### Phase 3 --- Physician approval and reports

-   Review queue, approval/signature workflow, report generation,
    controlled release, and immutable final reports.
-   Tests for unauthorized approval and patient report isolation.

### Phase 4 --- Multi-FOV and operational hardening

-   Multi-video aggregation, monitoring, backups, performance testing,
    security review, and operational documentation.
-   Clinical/domain validation before any real clinical use.

## 14. Acceptance Criteria for Product Readiness

The product is ready for controlled pilot evaluation only when: - All P0
workflows are implemented and tested. - Role and patient-data isolation
tests pass. - Analysis outputs are traceable and reproducible. -
Calibration and calculation logic are unit-tested and domain-reviewed. -
Analysts can review/correct outputs without erasing the original AI
result. - Physician approval is required before release. - Final reports
are immutable and access-controlled. - Audit trail, backup, retention,
and incident processes are documented. - Clinical stakeholders approve
terminology, reference values, limitations, and intended use.

Passing software acceptance criteria does not, by itself, establish
clinical validity or regulatory approval.
