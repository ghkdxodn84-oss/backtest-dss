"""Config files shared by the web API and the Streamlit pages.

Layout::

    config/strategy.json         shared strategy (all accounts trade it)
    config/accounts/<id>.json    per-account: name + ACCOUNT_KEYS (gitignored)
    config/presets/<name>.json   saved strategy candidates (backups, Optuna results)

Strategy files never hold account keys and account files hold nothing else,
so saving one can never clobber the other.
"""

from __future__ import annotations

import json
from pathlib import Path


CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"
STRATEGY_PATH = CONFIG_DIR / "strategy.json"
ACCOUNTS_DIR = CONFIG_DIR / "accounts"
PRESETS_DIR = CONFIG_DIR / "presets"

ACCOUNT_KEYS = ("start_date", "init_cash", "spread_buy_levels", "spread_buy_step")
ACCOUNT_DEFAULTS = {"start_date": None, "init_cash": 10_000.0, "spread_buy_levels": 5, "spread_buy_step": 1}
DEFAULT_ACCOUNT_ID = "main"


def read_json(path: Path) -> dict:
    try:
        loaded = json.loads(Path(path).read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_json(path: Path, data: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def strategy_only(data: dict) -> dict:
    return {key: value for key, value in data.items() if key not in ACCOUNT_KEYS and key != "name"}


def load_strategy(path: Path = STRATEGY_PATH) -> dict:
    return strategy_only(read_json(path))


def save_strategy(data: dict, path: Path = STRATEGY_PATH) -> None:
    write_json(path, strategy_only(data))


def load_accounts(accounts_dir: Path = ACCOUNTS_DIR) -> list[dict]:
    """Accounts sorted by file name; each has ``id``, ``name`` and every ACCOUNT_KEY.

    With no account files there is a single default account, so callers never
    have to handle an empty list.
    """
    accounts = []
    paths = sorted(Path(accounts_dir).glob("*.json")) if Path(accounts_dir).is_dir() else []
    for path in paths:
        raw = read_json(path)
        account = {"id": path.stem, "name": raw.get("name") or path.stem}
        account.update({key: raw.get(key, default) for key, default in ACCOUNT_DEFAULTS.items()})
        accounts.append(account)
    if not accounts:
        accounts.append({"id": DEFAULT_ACCOUNT_ID, "name": "기본", **ACCOUNT_DEFAULTS})
    return accounts


def find_account(account_id: str | None, accounts_dir: Path = ACCOUNTS_DIR) -> dict:
    """The account with ``account_id``, else the first one."""
    accounts = load_accounts(accounts_dir)
    return next((account for account in accounts if account["id"] == account_id), accounts[0])


def save_account(account_id: str, data: dict, accounts_dir: Path = ACCOUNTS_DIR) -> Path:
    """Write the account keys of ``data``; the existing name is kept unless ``data`` has one."""
    path = Path(accounts_dir) / f"{account_id}.json"
    current = read_json(path)
    account = {"name": data.get("name") or current.get("name") or account_id}
    account.update({key: data.get(key, current.get(key)) for key in ACCOUNT_KEYS})
    write_json(path, account)
    return path


def strategy_files(presets_dir: Path = PRESETS_DIR, strategy_path: Path = STRATEGY_PATH) -> list[Path]:
    """strategy.json first, then presets newest first."""
    presets = sorted(Path(presets_dir).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True) if Path(presets_dir).is_dir() else []
    return ([Path(strategy_path)] if Path(strategy_path).exists() else []) + presets


def preset_path(name: str, presets_dir: Path = PRESETS_DIR) -> Path:
    name = name.strip().removesuffix(".json")
    return Path(presets_dir) / f"{name}.json"
