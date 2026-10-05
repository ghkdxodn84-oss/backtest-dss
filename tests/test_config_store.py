"""Strategy / account config files stay separate."""
from engines.config_store import (
    find_account,
    load_accounts,
    load_strategy,
    preset_path,
    read_json,
    save_account,
    save_strategy,
    strategy_files,
)


def test_save_strategy_drops_account_keys(tmp_path):
    path = tmp_path / "strategy.json"
    save_strategy({"target": "SOXL", "start_date": "2026-06-01", "init_cash": 1, "spread_buy_step": 3}, path)
    assert read_json(path) == {"target": "SOXL"}
    assert load_strategy(path) == {"target": "SOXL"}


def test_save_account_keeps_name_and_drops_strategy_keys(tmp_path):
    (tmp_path / "sub.json").write_text('{"name": "서브", "init_cash": 1000}')
    save_account("sub", {"start_date": "2026-09-01", "init_cash": 2000, "target": "TQQQ"}, tmp_path)
    saved = read_json(tmp_path / "sub.json")
    assert saved["name"] == "서브"
    assert saved["init_cash"] == 2000
    assert "target" not in saved


def test_find_account_falls_back_to_first(tmp_path):
    (tmp_path / "a.json").write_text('{"name": "A"}')
    (tmp_path / "b.json").write_text('{"name": "B"}')
    assert find_account("b", tmp_path)["name"] == "B"
    assert find_account("missing", tmp_path)["name"] == "A"
    assert load_accounts(tmp_path)[0]["spread_buy_step"] == 1


def test_strategy_files_lists_strategy_then_presets(tmp_path):
    strategy = tmp_path / "strategy.json"
    strategy.write_text("{}")
    presets = tmp_path / "presets"
    save_strategy({"target": "X"}, preset_path("old", presets))
    assert strategy_files(presets, strategy) == [strategy, presets / "old.json"]
    assert preset_path("new.json", presets) == presets / "new.json"


def test_accounts_sort_by_order_then_file_name(tmp_path):
    (tmp_path / "a.json").write_text('{"name": "A"}')
    (tmp_path / "b.json").write_text('{"name": "B", "order": 2}')
    (tmp_path / "c.json").write_text('{"name": "C", "order": 1}')
    assert [a["id"] for a in load_accounts(tmp_path)] == ["c", "b", "a"]
    assert find_account(None, tmp_path)["id"] == "c"


def test_save_account_keeps_order(tmp_path):
    (tmp_path / "sub.json").write_text('{"name": "서브", "order": 3}')
    save_account("sub", {"init_cash": 2000}, tmp_path)
    assert read_json(tmp_path / "sub.json")["order"] == 3
