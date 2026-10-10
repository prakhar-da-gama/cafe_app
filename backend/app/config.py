from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    db_user: str = "root"
    db_password: str = "prakhar"
    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "food_app"

    cors_origins: str = "http://localhost:5173"

    # JWT auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # OTP
    otp_ttl_minutes: int = 5
    otp_length: int = 6

    # SMTP email. If smtp_host is blank, OTPs are logged instead of emailed (dev mode).
    # In production these come from .env (GoDaddy / Secureserver mailbox).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Envelope/From address — the no-reply alias on the mailbox.
    smtp_from: str = "no-reply@ordersbuddy.in"
    # STARTTLS on 587 (default) vs. implicit SSL on 465. Set smtp_use_ssl=true
    # and smtp_port=465 if your provider requires SSL.
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @property
    def server_url(self) -> str:
        """Connection URL without a database, used to create the database."""
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/?charset=utf8mb4"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
