"""
Database models module for CASA-AI

This module provides Pydantic models for data validation and type safety
"""

from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums for type safety
# ============================================================================

class UserRole(str, Enum):
    FRONT_OFFICE = "FRONT_OFFICE"
    ANALYST = "ANALYST"
    PHYSICIAN = "PHYSICIAN"
    PATIENT = "PATIENT"
    SUPER_ADMIN = "SUPER_ADMIN"


class ExaminationStatus(str, Enum):
    REGISTERED = "REGISTERED"
    IN_PROGRESS = "IN_PROGRESS"
    PENDING_REVIEW = "PENDING_REVIEW"
    RETURNED_FOR_CORRECTION = "RETURNED_FOR_CORRECTION"
    APPROVED = "APPROVED"
    RELEASED = "RELEASED"
    CANCELLED = "CANCELLED"
    FAILED_ANALYSIS = "FAILED_ANALYSIS"


class AnalysisStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ReportStatus(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    RELEASED = "RELEASED"
    AMENDED = "AMENDED"


class ViscosityLevel(str, Enum):
    NORMAL = "NORMAL"
    INCREASED = "INCREASED"
    DECREASED = "DECREASED"


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"


class MediaAssetType(str, Enum):
    VIDEO_SOURCE = "VIDEO_SOURCE"
    ANNOTATED_VIDEO = "ANNOTATED_VIDEO"
    HEATMAP = "HEATMAP"
    TRAJECTORY = "TRAJECTORY"
    REPORT_PDF = "REPORT_PDF"


# ============================================================================
# Request/Response Models
# ============================================================================

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=3)
    role: UserRole
    phone_number: Optional[str] = None
    license_number: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    phone_number: Optional[str]
    license_number: Optional[str]
    created_at: str
    last_login_at: Optional[str]

    class Config:
        from_attributes = True


class PatientCreate(BaseModel):
    medical_record_number: str
    full_name: str = Field(..., min_length=3)
    date_of_birth: str  # ISO format: YYYY-MM-DD
    gender: Optional[Gender] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None

    @validator('date_of_birth')
    def validate_dob(cls, v):
        try:
            datetime.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError('date_of_birth must be in YYYY-MM-DD format')


class PatientResponse(BaseModel):
    id: int
    medical_record_number: str
    full_name: str
    date_of_birth: str
    gender: Optional[str]
    phone_number: Optional[str]
    email: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class ExaminationCreate(BaseModel):
    patient_id: int
    sample_code: str
    collection_datetime: Optional[str] = None
    abstinence_duration_hours: Optional[int] = Field(None, ge=0)
    volume_ml: Optional[float] = Field(None, ge=0)
    liquefaction_time_min: Optional[int] = Field(None, ge=0)
    viscosity: Optional[ViscosityLevel] = None
    ph_value: Optional[float] = Field(None, ge=0, le=14)
    appearance: Optional[str] = None
    macroscopic_notes: Optional[str] = None


class ExaminationUpdate(BaseModel):
    abstinence_duration_hours: Optional[int] = Field(None, ge=0)
    volume_ml: Optional[float] = Field(None, ge=0)
    liquefaction_time_min: Optional[int] = Field(None, ge=0)
    viscosity: Optional[ViscosityLevel] = None
    ph_value: Optional[float] = Field(None, ge=0, le=14)
    appearance: Optional[str] = None
    macroscopic_notes: Optional[str] = None


class ExaminationResponse(BaseModel):
    id: int
    patient_id: int
    sample_code: str
    status: ExaminationStatus
    collection_datetime: Optional[str]
    abstinence_duration_hours: Optional[int]
    volume_ml: Optional[float]
    liquefaction_time_min: Optional[int]
    viscosity: Optional[str]
    ph_value: Optional[float]
    appearance: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class CalibrationProfileCreate(BaseModel):
    profile_name: str
    microscope_model: Optional[str] = None
    camera_model: Optional[str] = None
    chamber_type: Optional[str] = None
    magnification: Optional[str] = None
    pixel_scale_um: float = Field(..., gt=0)
    frame_rate_fps: float = Field(..., gt=0)
    chamber_depth_um: float = Field(..., gt=0)
    dilution_factor: float = Field(default=1.0, gt=0)
    calibration_method: Optional[str] = None
    notes: Optional[str] = None


class CalibrationProfileResponse(BaseModel):
    id: int
    profile_name: str
    microscope_model: Optional[str]
    chamber_type: Optional[str]
    magnification: Optional[str]
    pixel_scale_um: float
    frame_rate_fps: float
    chamber_depth_um: float
    dilution_factor: float
    is_locked: bool
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class AnalysisRunResponse(BaseModel):
    id: int
    examination_id: int
    source_media_id: int
    status: AnalysisStatus
    algorithm_version: Optional[str]
    pr_count: Optional[int]
    np_count: Optional[int]
    im_count: Optional[int]
    pr_percentage: Optional[float]
    np_percentage: Optional[float]
    im_percentage: Optional[float]
    avg_speed_um_s: Optional[float]
    avg_linearity: Optional[float]
    canonical_count: Optional[int]
    created_at: str

    class Config:
        from_attributes = True


class AnalysisRevisionCreate(BaseModel):
    examination_id: int
    total_videos_analyzed: int = Field(..., gt=0)
    final_pr_count: Optional[int] = Field(None, ge=0)
    final_np_count: Optional[int] = Field(None, ge=0)
    final_im_count: Optional[int] = Field(None, ge=0)
    concentration_million_ml: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class ReportCreate(BaseModel):
    examination_id: int
    revision_id: int
    report_number: str
    clinical_interpretation: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    recommendations: Optional[str] = None


class ReportResponse(BaseModel):
    id: int
    examination_id: int
    revision_id: int
    report_number: str
    report_version: int
    status: ReportStatus
    approved_by: Optional[int]
    approved_at: Optional[str]
    released_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


# ============================================================================
# Database Entity Models (for ORM-like usage)
# ============================================================================

class User(BaseModel):
    id: int
    email: str
    password_hash: str
    full_name: str
    role: str
    is_active: bool
    phone_number: Optional[str]
    license_number: Optional[str]
    created_at: str
    updated_at: str
    last_login_at: Optional[str]

    class Config:
        from_attributes = True


class Patient(BaseModel):
    id: int
    medical_record_number: str
    full_name: str
    date_of_birth: str
    gender: Optional[str]
    phone_number: Optional[str]
    email: Optional[str]
    address: Optional[str]
    user_id: Optional[int]
    created_at: str
    updated_at: str
    created_by: Optional[int]

    class Config:
        from_attributes = True


class Examination(BaseModel):
    id: int
    patient_id: int
    sample_code: str
    collection_datetime: Optional[str]
    received_datetime: Optional[str]
    abstinence_duration_hours: Optional[int]
    volume_ml: Optional[float]
    liquefaction_time_min: Optional[int]
    viscosity: Optional[str]
    ph_value: Optional[float]
    appearance: Optional[str]
    macroscopic_notes: Optional[str]
    status: str
    created_at: str
    updated_at: str
    created_by: Optional[int]
    current_analyst_id: Optional[int]
    current_physician_id: Optional[int]

    class Config:
        from_attributes = True


class CalibrationProfile(BaseModel):
    id: int
    profile_name: str
    microscope_model: Optional[str]
    camera_model: Optional[str]
    chamber_type: Optional[str]
    magnification: Optional[str]
    pixel_scale_um: float
    frame_rate_fps: float
    chamber_depth_um: float
    dilution_factor: float
    version: int
    is_locked: bool
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
