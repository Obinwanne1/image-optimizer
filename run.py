import os

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    # Off by default: Flask's debug mode wires in the Werkzeug interactive debugger, which
    # allows arbitrary code execution to anyone who can trigger an unhandled exception and
    # reach it. Opt in explicitly for local development only.
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(debug=debug, threaded=True, host="127.0.0.1", port=5000)
