# Citation

Flask-based citation analysis platform with login, journal filtering, year-based citation analytics, Excel export, and CNKI-oriented journal catalog support.

## Runtime files included

- `app.py`
- `journal_catalog.py`
- `wsgi.py`
- `templates/`
- `static/`
- `citations_shard_01.db`
- `citations_shard_02.db`
- `citations_shard_03.db`
- `（最新目录）2025-2026 CSSCI及扩展版期刊目录（语言文学类）.xlsx`

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Open `http://127.0.0.1:5000`.

## Notes

- The app auto-detects `citations_shard_*.db` and uses sharded mode by default.
- `users.json` and `search_log.log` are generated at runtime and are intentionally not committed.
- `citations.db` and `database.csv` are excluded because they are not required for serving the site and are poor fits for GitHub storage limits.

## Deployment

See `DEPLOY_ORACLE.md` for VM deployment guidance.
