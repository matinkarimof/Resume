"""
بک‌اند سایت رزومه.

- GET  /                 صفحه اصلی
- GET  /api/resume       اطلاعات رزومه (از data/resume.json)
- POST /api/contact      ثبت پیام تماس با اعتبارسنجی
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RESUME_FILE = DATA_DIR / "resume.json"
DB_FILE = DATA_DIR / "messages.db"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_NAME_LEN = 100
MAX_EMAIL_LEN = 254
MIN_MESSAGE_LEN = 5
MAX_MESSAGE_LEN = 2000


# ---------- داده‌ها ----------

def load_resume() -> dict:
    with RESUME_FILE.open(encoding="utf-8") as f:
        return json.load(f)


# ---------- دیتابیس ----------

@contextmanager
def db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                email      TEXT    NOT NULL,
                message    TEXT    NOT NULL,
                created_at TEXT    NOT NULL
            )
            """
        )


def save_message(name: str, email: str, message: str) -> None:
    with db_connection() as conn:
        conn.execute(
            "INSERT INTO messages (name, email, message, created_at) VALUES (?, ?, ?, ?)",
            (name, email, message, datetime.now(timezone.utc).isoformat()),
        )


# ---------- اعتبارسنجی ----------

def validate_contact(payload: dict) -> tuple[dict, dict]:
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    message = str(payload.get("message", "")).strip()

    errors: dict[str, str] = {}
    if not name or len(name) > MAX_NAME_LEN:
        errors["name"] = "نام الزامی است و نباید بیشتر از ۱۰۰ کاراکتر باشد."
    if len(email) > MAX_EMAIL_LEN or not EMAIL_RE.match(email):
        errors["email"] = "یک ایمیل معتبر وارد کنید."
    if not (MIN_MESSAGE_LEN <= len(message) <= MAX_MESSAGE_LEN):
        errors["message"] = "پیام باید بین ۵ تا ۲۰۰۰ کاراکتر باشد."

    return {"name": name, "email": email, "message": message}, errors


# ---------- ساخت اپ ----------

def create_app() -> Flask:
    app = Flask(__name__)
    init_db()

    @app.after_request
    def set_security_headers(response: Response) -> Response:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/resume")
    def api_resume():
        try:
            return jsonify(load_resume())
        except (OSError, json.JSONDecodeError):
            return jsonify({"error": "اطلاعات رزومه در دسترس نیست."}), 500

    @app.post("/api/contact")
    def api_contact():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "درخواست نامعتبر است."}), 400

        # فیلد تله برای ربات‌ها: اگر پر شد، وانمود می‌کنیم پیام ثبت شده
        if payload.get("website"):
            return jsonify({"message": "پیام شما ارسال شد."}), 201

        clean, errors = validate_contact(payload)
        if errors:
            return jsonify({"error": "لطفاً خطاها را برطرف کنید.", "fields": errors}), 422

        save_message(clean["name"], clean["email"], clean["message"])
        return jsonify({"message": "پیام شما با موفقیت ارسال شد. به زودی پاسخ می‌دهم."}), 201

    @app.errorhandler(404)
    def not_found(_):
        if request.path.startswith("/api/"):
            return jsonify({"error": "مسیر پیدا نشد."}), 404
        return render_template("index.html"), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1", port=int(os.getenv("PORT", 5000)))
