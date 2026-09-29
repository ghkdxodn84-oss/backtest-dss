# -*- coding: utf-8 -*-
"""Shared UI utilities for Streamlit pages."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

# Re-export from engine so existing callers keep working
from engines.dongpa_engine import (
    CapitalParams,
    ModeParams,
    StrategyParams,
    compute_trade_metrics,  # noqa: F401
)

# Config files live in engines.config_store; re-exported for the pages.
from engines.config_store import (  # noqa: F401
    ACCOUNT_KEYS,
    STRATEGY_PATH,
    find_account,
    load_accounts,
    load_strategy,
    preset_path,
    save_account,
    save_strategy,
    strategy_files,
)

# ---------------------- Constants ----------------------

NAV_LINKS = [
    ("pages/1_backtest.py", "backtest"),
    ("pages/2_order_book.py", "orderBook"),
    ("pages/3_optuna.py", "Optuna"),
]

LOOKBACK_DAYS = 1000  # Extra days for weekly RSI EMA warm-up convergence

DEFAULT_PARAMS = {
    "target": "SOXL",
    "momentum": "QQQ",
    "bench": "SOXX",
    "log_scale": True,
    "mode_switch_strategy_index": 0,
    "ma_short": 3,
    "ma_long": 7,
    "roc_period": 4,
    "btc_ticker": "BTC-USD",
    "btc_lookback_days": 1,
    "btc_threshold_pct": 0.0,
    "rsi_high_threshold": 65.0,
    "rsi_mid_high": 60.0,
    "rsi_neutral": 50.0,
    "rsi_mid_low": 40.0,
    "rsi_low_threshold": 35.0,
    "enable_netting": True,
    "allow_fractional": False,
    "cash_limited_buy": False,
    "init_cash": 10000,
    "defense_slices": 7,
    "defense_buy": 3.0,
    "defense_tp": 0.2,
    "defense_sl": 0.0,
    "defense_hold": 30,
    "offense_slices": 7,
    "offense_buy": 5.0,
    "offense_tp": 2.5,
    "offense_sl": 0.0,
    "offense_hold": 7,
}


# ---------------------- Navigation ----------------------

def render_navigation() -> None:
    st.markdown(
        """
        <style>
        [data-testid='stSidebarNav'] {display: none;}
        </style>
        """,
        unsafe_allow_html=True,
    )
    st.sidebar.markdown("### Pages")
    for path, label in NAV_LINKS:
        st.sidebar.page_link(path, label=label)
    st.sidebar.divider()


# ---------------------- Settings I/O ----------------------

def load_settings(config_path: Path | None = None, account_id: str | None = None) -> dict:
    """Strategy file (strategy.json or a preset) merged with one account's values.

    ``account_id`` picks the account; ``None`` means the first one.
    """
    result = load_strategy(config_path or STRATEGY_PATH)
    account = find_account(account_id)
    result.update({key: account[key] for key in ACCOUNT_KEYS if account[key] is not None})
    return result


def save_settings(payload: dict, account_id: str | None = None) -> None:
    """Strategy keys → strategy.json, account keys → that account's file."""
    save_strategy(payload)
    save_account(account_id or find_account(None)["id"], payload)


def save_preset(name: str, payload: dict) -> Path:
    """Save the strategy keys of ``payload`` as config/presets/<name>.json."""
    path = preset_path(name)
    save_strategy(payload, path)
    return path


# ---------------------- Strategy Params Builder ----------------------

# Maps UI radio labels to internal strategy keys
_MODE_SWITCH_MAP = {
    "RSI": "rsi",
    "Golden Cross": "ma_cross",
    "ROC": "roc",
    "BTC Overnight": "btc_overnight",
}


def build_strategy_params(ui_values: dict) -> tuple[StrategyParams, CapitalParams]:
    """Build StrategyParams + CapitalParams from a flat UI-values dict.

    Shared by ``backtest.py`` and ``pages/2_orderBook.py`` so that
    the StrategyParams construction logic lives in exactly one place.
    """
    defense = ModeParams(
        buy_cond_pct=ui_values["defense_buy"],
        tp_pct=ui_values["defense_tp"],
        max_hold_days=int(ui_values["defense_hold"]),
        slices=int(ui_values["defense_slices"]),
        stop_loss_pct=float(ui_values["defense_sl"]) if ui_values["defense_sl"] > 0 else None,
    )
    offense = ModeParams(
        buy_cond_pct=ui_values["offense_buy"],
        tp_pct=ui_values["offense_tp"],
        max_hold_days=int(ui_values["offense_hold"]),
        slices=int(ui_values["offense_slices"]),
        stop_loss_pct=float(ui_values["offense_sl"]) if ui_values["offense_sl"] > 0 else None,
    )

    strategy_dict: dict = {
        "target_ticker": ui_values["target"],
        "momentum_ticker": ui_values["momentum"],
        "enable_netting": ui_values.get("enable_netting", True),
        "allow_fractional_shares": ui_values.get("allow_fractional", False),
        "cash_limited_buy": ui_values.get("cash_limited_buy", False),
        # Step buy qty from the order book settings; absent → legacy fill.
        "spread_buy_step": (
            int(ui_values["spread_buy_step"]) if "spread_buy_step" in ui_values else None
        ),
        "defense": defense,
        "offense": offense,
    }

    mode_switch = ui_values.get("mode_switch_strategy", "RSI")
    internal_key = _MODE_SWITCH_MAP.get(mode_switch, "rsi")
    strategy_dict["mode_switch_strategy"] = internal_key

    if internal_key == "ma_cross":
        strategy_dict["ma_short_period"] = int(ui_values["ma_short"])
        strategy_dict["ma_long_period"] = int(ui_values["ma_long"])
    elif internal_key == "roc":
        strategy_dict["roc_period"] = int(ui_values.get("roc_period", 4))
    elif internal_key == "btc_overnight":
        strategy_dict["btc_lookback_days"] = int(ui_values.get("btc_lookback_days", 1))
        strategy_dict["btc_threshold_pct"] = float(ui_values.get("btc_threshold_pct", 0.0))
    else:
        # RSI (default)
        strategy_dict["rsi_period"] = 14
        strategy_dict["rsi_high_threshold"] = float(ui_values.get("rsi_high_threshold", 65.0))
        strategy_dict["rsi_mid_high"] = float(ui_values.get("rsi_mid_high", 60.0))
        strategy_dict["rsi_neutral"] = float(ui_values.get("rsi_neutral", 50.0))
        strategy_dict["rsi_mid_low"] = float(ui_values.get("rsi_mid_low", 40.0))
        strategy_dict["rsi_low_threshold"] = float(ui_values.get("rsi_low_threshold", 35.0))

    strategy = StrategyParams(**strategy_dict)
    capital = CapitalParams(initial_cash=float(ui_values["init_cash"]))
    return strategy, capital


