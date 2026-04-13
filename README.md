# Villa Association Management App

A web application for managing villa association operations — residents, dues, maintenance requests, announcements, and more.

## Tech Stack

- **React** — UI library
- **Vite** — build tool and dev server
- **Tailwind CSS v4** — utility-first styling

## Getting Started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Project Structure

```
src/
├── assets/          # Static assets (images, icons)
├── components/      # Reusable UI components
├── context/         # React context providers
├── hooks/           # Custom React hooks
├── pages/           # Page-level components (one per route)
├── services/        # API calls and external integrations
├── utils/           # Pure helper functions
├── App.jsx          # Root component
└── main.jsx         # Entry point
```

## Scripts

| Command             | Description               |
| ------------------- | ------------------------- |
| `npm run dev`       | Start dev server          |
| `npm run build`     | Production build          |
| `npm run preview`   | Preview production build  |
