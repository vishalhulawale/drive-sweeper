from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://driveclean:driveclean@localhost:5432/driveclean"
    frontend_origin: str = "http://localhost:5173"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    token_encryption_key: str = ""  # Fernet key
    # Archive extraction: where archives are downloaded and unpacked (one file at a time), and the RAR
    # tool (unrar, unar, bsdtar or 7z). Empty means the system temp folder / auto-detect.
    extract_dir: str = ""
    unrar_tool: str = ""


settings = Settings()
