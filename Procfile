api: cd backend && python -m alembic -c alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
worker: cd backend && python -m app.cli.run_feedback_worker
frontend: cd frontend && npm run build && npm run preview -- --host 0.0.0.0 --port $PORT
