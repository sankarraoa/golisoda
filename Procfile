api: cd backend && alembic -c alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
worker: python scripts/process_feedback_queue.py --limit 100 --poll-seconds 2
frontend: cd frontend && npm run build && npm run preview -- --host 0.0.0.0 --port $PORT
