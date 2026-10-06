# Cafe App

A full-stack cafe menu manager.

- **Backend** — FastAPI + SQLAlchemy 2.0 + MySQL (PyMySQL)
- **Frontend** — React + TypeScript (Vite)

The backend exposes a REST CRUD API for menu items; the frontend is a single-page
menu manager (add / edit / delete / toggle availability, grouped by category).

## Prerequisites

- Python 3.11+
- Node.js 18+
- A running MySQL server

Database config (already set in `backend/.env`):

| Setting  | Value       |
| -------- | ----------- |
| user     | `root`      |
| password | `prakhar`   |
| database | `food_app`  |
| host     | `localhost` |
| port     | `3306`      |

> The app **creates the `food_app` database and tables automatically** on startup —
> you don't need to create them manually. Just make sure MySQL is running and the
> `root` / `prakhar` credentials are valid.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows (PowerShell/CMD)
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

python seed.py                  # optional: load sample menu items
uvicorn app.main:app --reload --port 8000
```

- API root: http://localhost:8000
- Interactive docs (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

### API endpoints

| Method | Path                  | Description                        |
| ------ | --------------------- | ---------------------------------- |
| GET    | `/api/menu`           | List items (`?category=`, `?available_only=`) |
| POST   | `/api/menu`           | Create an item                     |
| GET    | `/api/menu/{id}`      | Get one item                       |
| PUT    | `/api/menu/{id}`      | Update an item                     |
| DELETE | `/api/menu/{id}`      | Delete an item                     |

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the backend on
port 8000, so run the backend first.

## Project layout

```
cafe_app/
├── backend/
│   ├── app/
│   │   ├── config.py        # env-driven settings
│   │   ├── database.py      # engine, session, auto-create DB
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── crud.py          # DB operations
│   │   ├── main.py          # FastAPI app + CORS + lifespan
│   │   └── routers/menu.py  # /api/menu routes
│   ├── seed.py              # sample data loader
│   ├── requirements.txt
│   └── .env
└── frontend/                # Vite + React + TypeScript
    ├── src/
    │   ├── api.ts           # typed API client
    │   ├── App.tsx          # menu manager UI
    │   └── App.css
    └── vite.config.ts       # dev proxy to :8000
```
