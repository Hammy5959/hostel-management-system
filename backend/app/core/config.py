"""Application settings loaded from environment variables / .env file.

All secrets are read from the environment (via python-dotenv / pydantic-settings)
and are never hard-coded in source.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App -----------------------------------------------------------------
    app_name: str = "Hostel Management System API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # --- Supabase -------------------------------------------------------------
    supabase_url: str
    # The spec names the env var SUPABASE_SERVICE_ROLE_KEY; older scaffold used
    # SUPABASE_SERVICE_KEY. Support both, preferring the spec name.
    supabase_service_role_key: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    )

    # --- JWT ------------------------------------------------------------------
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    # JWT lifetime in seconds (spec: JWT_EXPIRATION).
    jwt_expiration_seconds: int = Field(default=5184000, validation_alias=AliasChoices("JWT_EXPIRATION", "JWT_EXPIRATION_SECONDS"))

    # --- OTP ------------------------------------------------------------------
    otp_length: int = 6
    otp_expiration_seconds: int = 300
    otp_max_attempts: int = 5

    # --- Initial super admin (bootstrap, created by the seeder) ----------------
    # Required from the environment only (see .env.example) — no default here,
    # matching supabase_url / jwt_secret above. The seeder stores ONLY the
    # Argon2id hash of this password (never the plaintext) and only sets it
    # when the account has no password yet — so re-running the seeder never
    # overwrites a changed password.
    super_admin_email: str
    super_admin_first_name: str = "Super"
    super_admin_last_name: str = "Admin"
    super_admin_password: str

    # --- CORS -----------------------------------------------------------------
    # Comma-separated list of allowed origins.
    cors_origins: str = "http://localhost:3000"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> str:
        if isinstance(v, str):
            return v
        if isinstance(v, (list, tuple)):
            return ",".join(str(x) for x in v)
        return str(v)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
