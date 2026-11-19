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
    archive_upload_workers: int = 12  # files uploaded at the same time within one archive
    # Organizer content classification (optional). The Anthropic SDK also finds credentials on its own
    # (ANTHROPIC_API_KEY in the environment or an `ant auth login` profile); this is for a key in .env.
    anthropic_api_key: str = ""
    # "anthropic" (the Claude API) or "foundry" (Claude in Microsoft Foundry). On Foundry the model is the
    # deployment name, and the resource (the <resource> in https://<resource>.services.ai.azure.com) or a full
    # base URL is required along with the key.
    classifier_provider: str = "anthropic"
    classifier_model: str = "claude-opus-5-5"
    # Thinking effort for the classification requests; empty leaves it out. It is left out automatically for
    # models that do not take it (Claude Haiku 4.5, Sonnet 4.5); set it empty yourself for a Foundry deployment
    # of such a model whose name does not say which model it is.
    classifier_effort: str = "low"
    anthropic_foundry_api_key: str = ""
    anthropic_foundry_resource: str = ""
    anthropic_foundry_base_url: str = ""


settings = Settings()
