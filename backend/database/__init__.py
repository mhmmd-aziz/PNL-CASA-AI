"""
CASA-AI Database Package

This package provides database connectivity, models, and utilities
for the CASA-AI laboratory assistance system.

Usage:
    from database import get_connection, get_transaction
    from database.models import UserCreate, ExaminationResponse
    from database.db_connection import execute_query, log_audit_event

Quick Start:
    # Initialize database
    python -m database.db_connection init

    # Seed development data
    python -m database.seeds.seed_data

    # Verify integrity
    python -m database.db_connection verify
"""

__version__ = "1.0.0"
__author__ = "CASA-AI Development Team"

# Import commonly used functions for convenience
from .db_connection import (
    get_connection,
    get_transaction,
    initialize_database,
    execute_query,
    execute_update,
    row_to_dict,
    rows_to_dict_list,
    log_audit_event,
    verify_database
)

# Import commonly used models
from .models import (
    UserRole,
    ExaminationStatus,
    AnalysisStatus,
    ReportStatus,
    UserCreate,
    UserResponse,
    PatientCreate,
    PatientResponse,
    ExaminationCreate,
    ExaminationUpdate,
    ExaminationResponse,
    CalibrationProfileCreate,
    CalibrationProfileResponse,
    AnalysisRunResponse,
    ReportResponse
)

__all__ = [
    # Connection functions
    "get_connection",
    "get_transaction",
    "initialize_database",
    "execute_query",
    "execute_update",
    "row_to_dict",
    "rows_to_dict_list",
    "log_audit_event",
    "verify_database",

    # Enums
    "UserRole",
    "ExaminationStatus",
    "AnalysisStatus",
    "ReportStatus",

    # Request/Response Models
    "UserCreate",
    "UserResponse",
    "PatientCreate",
    "PatientResponse",
    "ExaminationCreate",
    "ExaminationUpdate",
    "ExaminationResponse",
    "CalibrationProfileCreate",
    "CalibrationProfileResponse",
    "AnalysisRunResponse",
    "ReportResponse",
]
