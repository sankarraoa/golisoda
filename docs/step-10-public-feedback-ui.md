# Step 10 - Public Feedback UI

This step adds the first frontend surface: the customer-facing feedback form for QR scan links.

## What Exists

- Vite + React + TypeScript app in `frontend/`
- Design tokens in `frontend/src/styles/tokens.css`
- Shared base/component styles in `frontend/src/styles/`
- Public feedback form at `/f/{channelCode}`
- One question per screen
- NPS, CSAT, single select, multi select, dropdown, and text question rendering
- Required-question validation on the current screen
- Tenant color injection for public UI only
- Submit to `POST /f/{channelCode}/submit`
- Loading skeleton, error state, and thank-you state

## Local Run

Start the backend first:

```bash
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload
```

Then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173/f/<channel_code>
```

For example, from the previous smoke data:

```text
http://localhost:5173/f/-SIGSr_UYKw
```

## Configuration

The frontend defaults to:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Override this in `frontend/.env` when pointing to Railway or another API host.

## Verification

Run:

```bash
cd frontend
npm run build
```

The backend CORS allowlist already includes `http://localhost:5173`.
