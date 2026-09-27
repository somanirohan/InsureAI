# InsureAI — Frontend Client

React + Tailwind CSS frontend for the InsureAI Insurance Policy Intelligence platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (Vite) |
| Styling | Tailwind CSS 3 + custom design system |
| HTTP Client | Axios with JWT interceptors |
| Real-time | WebSocket (streaming chat via `/api/chat/ws`) |
| Charts | Recharts |
| Icons | Lucide React |

## Project Structure

```
client/
├── public/                    # Static assets
├── src/
│   ├── main.jsx               # App entry point
│   ├── App.jsx                # Root layout + routing
│   ├── index.css              # Global design system (tokens, components)
│   ├── constants/
│   │   └── index.js           # API URLs, policy types, treatments, WS endpoint
│   ├── context/
│   │   └── AuthContext.jsx    # JWT auth state (login, register, logout)
│   ├── services/
│   │   └── api.js             # Axios instance with JWT interceptors
│   ├── components/
│   │   ├── auth/              # Login & Register forms
│   │   ├── dashboard/         # Dashboard metrics, PolicyCard, UploadPolicyModal (real status polling)
│   │   ├── chat/              # ChatBox (WebSocket streaming + REST fallback)
│   │   ├── cost/              # CostEstimatorView (what-if simulator)
│   │   └── comparison/        # ComparisonView (side-by-side policy diff)
├── .env.example               # Environment variable template
├── tailwind.config.js         # Tailwind design tokens
├── vite.config.js             # Vite build config
└── package.json
```

## Getting Started

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```env
VITE_API_URL=http://localhost:5001/api
VITE_WS_URL=ws://localhost:5001/api/chat/ws
```

### 3. Run Development Server
```bash
npm run dev
```
The React frontend starts at **http://localhost:5173**.

## Production Build & Linting

```bash
npm run lint     # Lint check (oxlint)
npm run build    # Production build → dist/
npm run preview  # Preview production build
```
