from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402


def create_app_entry():
    return create_app()


app = create_app_entry()
