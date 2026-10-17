# CLAUDE.md --- CASA-AI

## 1. Project Overview

CASA-AI (Computer-Assisted Sperm Analysis with AI) is a
laboratory-assistance application designed to analyze microscope videos
of semen samples, track sperm movement, calculate motility metrics,
visualize trajectories, and prepare structured examination reports for
review by qualified laboratory personnel and a responsible physician.

This file is the development guide for Claude Code and other coding
agents working in this repository. Treat the existing codebase as the
source of truth for current implementation. Treat
`KITAB SUCI CASA-AI.pdf` and `PRD.md` as the intended product direction.
Do not claim a feature is implemented until you have inspected and
tested it.

## 2. Core Product Principles

-   The system supports laboratory workflows; it must not independently
    issue a definitive medical diagnosis.
-   All analysis outputs must be traceable to the source video,
    calibration profile, algorithm/configuration version, and review
    actions.
-   Human review is required before a result is submitted for physician
    approval.
-   Only an authorized physician can approve/sign and release the final
    report.
-   Once released, a report is read-only. Corrections should create an
    auditable amendment or a new version rather than silently
    overwriting the released result.
-   Patient data and microscopy media are sensitive health information.
    Apply least-privilege access, secure storage, and audit logging.
-   Clearly label estimates, unverified results, missing calibration,
    and algorithmic limitations.
-   Do not present prototype thresholds or calculations as clinically
    validated without evidence and qualified review.

## 3. Intended Workflow

1.  **Registration** --- create a patient record and examination/sample
    identifier; avoid duplicate or mismatched samples.
2.  **Pre-analytical data** --- record abstinence duration and available
    macroscopic observations such as volume, liquefaction time,
    viscosity, and pH.
3.  **Device calibration** --- select the microscope/chamber profile and
    verify pixel scale (µm/px), frame rate (FPS), chamber depth (µm),
    and dilution factor.
4.  **Media intake** --- upload microscopy video(s), validate format and
    metadata, associate each video with the correct examination, and
    preserve the original file.
5.  **AI analysis** --- detect sperm candidates, track objects across
    frames, calculate movement features, and produce motility summaries
    and visualizations.
6.  **Human-in-the-loop review** --- show annotated video and
    trajectory/heatmap; allow authorized analysts to flag/remove false
    detections or correct results with an audit trail.
7.  **Submit for review** --- freeze the submitted analysis revision and
    route it to the responsible physician.
8.  **Physician review** --- physician reviews results, edits the
    clinical interpretation where permitted, approves/signs, or returns
    the case for correction.
9.  **Report release** --- generate a final PDF and make it available
    only to authorized recipients. Released report content is immutable.
10. **Audit and administration** --- manage users, locked calibration
    presets, access policies, processing status, and audit events.

## 4. Roles and Access Boundaries

Implement authorization on the server/API layer as well as in the UI.
Hiding a button is not access control.

-   **Front Office / Lab Admin:** register patients/examinations, manage
    registration details, record sample handoff, and print sample
    labels/barcodes. No access to edit or release medical results.
-   **Laboratory Analyst / ATLM:** enter macroscopic data, select
    permitted calibration profiles, upload media, run analysis, review
    detections, correct technical artifacts, and submit a result for
    physician review. Cannot release the final report.
-   **Responsible Physician:** review submitted results, enter/approve
    clinical interpretation, digitally sign, return a case for
    correction, and release the report.
-   **Patient (optional portal):** view/download only their own released
    report. No access to raw video or internal analysis data by default.
-   **Super Admin / Head of Laboratory:** manage users and roles,
    monitor audit logs, configure/lock approved calibration presets, and
    manage system settings. Administrative privileges do not
    automatically grant permission to alter or sign clinical results.

Use explicit permissions and policy checks. Add tests for cross-role
access and cross-patient data isolation.

## 5. Examination Lifecycle

Use these intended states, with validated transitions:

`REGISTERED` → `IN_PROGRESS` → `PENDING_REVIEW` → `APPROVED & SIGNED` →
`RELEASED`

Recommended additional exception states may include
`RETURNED_FOR_CORRECTION`, `CANCELLED`, and `FAILED_ANALYSIS`, but
introduce them deliberately and document transition rules. Reject
invalid transitions on the server. Record who performed each transition,
when, and any reason/comment.

-   `REGISTERED`: patient/examination created.
-   `IN_PROGRESS`: analyst enters examination data and runs analysis.
-   `PENDING_REVIEW`: analyst has reviewed the AI output and submitted a
    specific result revision.
-   `APPROVED & SIGNED`: physician has approved the submitted revision
    and completed the configured signature process.
-   `RELEASED`: final report is published/read-only for authorized
    access.

## 6. Analysis and Calibration Requirements

Calibration fields described in the project reference: - Pixel scale
(`µm/px`) - Frame rate (`FPS`) - Chamber depth (`µm`) - Dilution factor

Store calibration values with each analysis so that historical results
remain reproducible even if a preset changes. Record the selected
device/chamber, lens/magnification if available, operator, and
timestamp. Validate positive numeric ranges and units; do not silently
substitute defaults.

The reference document describes these intended outputs: - Motility
groups: Progressive (PR), Non-progressive (NP), and Immotile (IM),
expressed as counts and percentages. - Movement features such as average
speed and linearity. - Canonical count intended to reduce duplicate
counting, described in the reference as median per-frame count with a
minimum track-duration filter. - Sperm concentration estimate
(millions/mL), subject to valid calibration, chamber geometry, dilution
factor, and a documented calculation. - Trajectory/heatmap image and/or
annotated video. - Structured report data (JSON) and readable report
(Markdown/PDF).

The reference document mentions example rules of
`PR: speed > 25.0 µm/s and linearity > 0.5`, `IM: speed < 5.0 µm/s`, and
otherwise `NP`; it also mentions filtering tracks shorter than 15
frames. Treat these as **prototype rules from the reference, not
clinically validated thresholds**. Keep thresholds configurable and
versioned. Do not hard-code them across the application or represent
them as WHO-approved without independent verification.

Before implementing or changing concentration calculations, inspect the
current code and write unit tests for units and conversions. The
reference's description of area/volume conversion is not a substitute
for a verified mathematical specification. Flag the calculation for
domain review, especially the pixel-area conversion, video field of
view, chamber depth, dilution, and representative sampling assumptions.

Do not label an estimate as a definitive diagnosis. Clinical
interpretation must be reviewed by the responsible professional. WHO
reference limits and terminology must be tied to a specified manual
edition and verified by qualified domain stakeholders before being shown
as authoritative.

## 7. Multi-Video and Analysis Reproducibility

The reference proposes 2--4 short videos from different fields of view
and combining results. If implemented: - Keep each video and
field-of-view result separately identifiable. - Preserve per-video
metrics and document the aggregation method. - Do not simply pool counts
or average percentages without a defined, tested methodology. - Show
warnings when video quality, duration, frame rate, calibration, or
tracking quality is insufficient. - Persist algorithm/model version,
configuration, timestamps, source-file checksum, and processing logs. -
Support safe retries and prevent duplicate jobs or duplicate reports.

## 8. Security, Privacy, and Auditability

-   Use secure password handling and established authentication/session
    mechanisms.
-   Enforce least privilege and deny access by default.
-   Validate ownership and authorization on every patient, examination,
    media, and report request.
-   Protect uploaded files against unsafe formats, excessive size, path
    traversal, and unauthorized direct access.
-   Store sensitive files privately; use expiring authorized download
    links where applicable.
-   Avoid patient-identifiable data in application logs, exception
    messages, filenames, analytics, and model prompts.
-   Log security-relevant actions: login failures, patient/examination
    creation, media upload/deletion, analysis runs, manual corrections,
    calibration changes, status transitions, report
    approval/signature/release, and account/role changes.
-   Audit records should include actor, action, target, timestamp, and
    relevant before/after values without unnecessarily duplicating
    sensitive data.
-   Never expose raw patient media to the patient portal unless an
    explicitly approved policy requires it.
-   Use environment variables/secrets management; never commit
    credentials or production patient data.

## 9. Engineering Workflow for Coding Agents

Before coding: 1. Inspect repository structure, README, dependency
manifests, environment examples, migrations, tests, and current
application entry points. 2. Identify the actual stack and existing
conventions. Do not assume a framework or rewrite the application based
on this guide alone. 3. Map each requested change to the PRD requirement
and existing code. 4. Check whether a feature already exists before
creating a duplicate implementation. 5. Identify migration, privacy,
authorization, and backward-compatibility risks.

While coding: - Make the smallest coherent change that fits existing
architecture. - Follow existing formatting, naming, validation,
error-handling, and test conventions. - Keep UI components separate from
domain logic where the current architecture permits. - Validate inputs
on both client and server. - Use database transactions for multi-step
state changes. - Avoid destructive schema changes and preserve existing
data. - Do not fabricate AI results when inference fails; return a clear
failure state. - Do not silently fall back to uncalibrated units or
default medical thresholds. - Add tests for success, failure,
authorization denial, edge cases, and state transitions. - Keep secrets
and sample patient information out of fixtures and commits.

After coding: 1. Run relevant tests, lint, type checks, and build
commands available in the repository. 2. Report exactly which commands
ran and whether they passed. 3. Explain migrations/configuration changes
and any manual setup. 4. List known limitations and requirements that
still need clinical/domain verification. 5. Do not claim tests passed if
they were not run.

## 10. Definition of Done

A change is complete only when: - The behavior matches the relevant PRD
requirement. - Server-side authorization and validation are in place
where applicable. - Loading, empty, error, and success states are
handled. - Auditability is maintained for sensitive workflow changes. -
Relevant automated tests are added/updated and executed when possible. -
Documentation and configuration examples are updated. - No unsupported
claim of clinical validity is introduced.

## 11. Source of Truth and Conflict Resolution

Priority order: 1. Existing repository behavior and verified tests for
what is currently implemented. 2. Explicit decisions made by the project
owner. 3. `PRD.md` for intended product requirements. 4.
`KITAB SUCI CASA-AI.pdf` for the supplied workflow, roles, calibration
fields, and proposed algorithm behavior. 5. General engineering best
practices, clearly distinguished from the source document.

If the reference document conflicts with verified code, do not silently
rewrite either. Describe the discrepancy and propose a
migration/decision. If medical thresholds, WHO criteria, formulas,
signatures, or regulatory requirements are unclear, flag them for
domain-owner review rather than guessing.
