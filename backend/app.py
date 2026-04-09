from typing import Tuple
from datetime import datetime, timezone
from urllib.parse import urlparse

from flask import Flask, request, redirect, jsonify
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__, instance_relative_config=True)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///ticketveriguard.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


class ClickLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    destination_url = db.Column(db.Text, nullable=False)
    normalized_url = db.Column(db.Text, nullable=True)
    final_url = db.Column(db.Text, nullable=True)
    event_name = db.Column(db.String(255), nullable=True)
    section = db.Column(db.String(100), nullable=True)
    row = db.Column(db.String(100), nullable=True)
    source = db.Column(db.String(100), nullable=True)
    referrer = db.Column(db.Text, nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    affiliate_applied = db.Column(db.Boolean, nullable=False, default=False)

    def __repr__(self):
        return f"<ClickLog {self.id} {self.destination_url}>"


def normalize_url(url: str) -> str:
    return str(url or "").strip()


def is_valid_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def maybe_apply_affiliate_link(url: str) -> Tuple[str, bool]:
    """
    Placeholder for future affiliate logic.
    For now, return the original URL unchanged.
    """
    return url, False


@app.route("/", methods=["GET"])
def home():
    return "Ticket VeriGuard backend is running.", 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/out", methods=["GET"])
def outbound_redirect():
    destination_url = normalize_url(request.args.get("url", ""))
    event_name = normalize_url(request.args.get("event", ""))
    section = normalize_url(request.args.get("section", ""))
    row = normalize_url(request.args.get("row", ""))
    source = normalize_url(request.args.get("source", ""))

    if not destination_url:
        return jsonify({"error": "Missing required query parameter: url"}), 400

    if not is_valid_http_url(destination_url):
        return jsonify({"error": "Invalid destination URL"}), 400

    normalized = normalize_url(destination_url)
    final_url, affiliate_applied = maybe_apply_affiliate_link(normalized)

    referrer = request.referrer
    user_agent = request.headers.get("User-Agent")

    try:
        click = ClickLog(
            destination_url=destination_url,
            normalized_url=normalized,
            final_url=final_url,
            event_name=event_name or None,
            section=section or None,
            row=row or None,
            source=source or None,
            referrer=referrer,
            user_agent=user_agent,
            affiliate_applied=affiliate_applied,
        )
        db.session.add(click)
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        app.logger.error("Failed to log outbound click: %s", error)

    return redirect(final_url, code=302)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)