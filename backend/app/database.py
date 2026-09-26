from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Driver named explicitly (SQLAlchemy's default changed between versions).
# client_encoding=utf8: databases created as SQL_ASCII (older installs) would
# otherwise hand text back as raw bytes.
SQLALCHEMY_DATABASE_URL = (
    f"postgresql+psycopg://{quote_plus(settings.db_user)}:{quote_plus(settings.db_password)}"
    f"@{settings.db_host}:{settings.db_port}/{settings.db_name}?client_encoding=utf8"
)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
