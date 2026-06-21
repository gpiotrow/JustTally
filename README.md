# Just Tally 🏋️

Ein lokal lauffähiger Gym-Tracker als **Progressive Web App (PWA)** für iPhone und Android.

- **Mobile App** (jeder Benutzer): Übungen mit Anleitung, Fotos und Videos durchsuchen, offline nutzen, Trainings protokollieren.
- **Web-Admin** (Admin-Rolle): Übungen anlegen/bearbeiten, Medien hochladen, Benutzer & Rollen verwalten.
- **Multi-User**: Mehrere Konten, rollenbasierter Zugriff (admin / user), JWT-Authentifizierung.
- **Offline-fähig**: Übungen werden lokal (IndexedDB + Service Worker) zwischengespeichert; Trainings bleiben auf dem Gerät.

## Tech-Stack

| Bereich   | Technologie |
|-----------|-------------|
| Frontend  | React 18 · TypeScript · Vite · Tailwind · vite-plugin-pwa |
| Backend   | Node.js · Express · `node:sqlite` (eingebaut, keine native Kompilierung) |
| Auth      | JWT · bcryptjs |
| Medien    | `sharp` (Bild-Komprimierung → WebP + Thumbnails), Videos im Dateisystem |
| Offline   | Service Worker (Workbox) · IndexedDB (`idb-keyval`) |

## Voraussetzungen

- **Node.js ≥ 22** (für `node:sqlite`; getestet mit Node 24)
- npm

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # Werte bei Bedarf anpassen (JWT_SECRET!)
npm run seed                  # Erstellt Admin + Beispiel-Übungen
npm start                     # http://localhost:4000
```

Standard-Admin (aus `.env`): **admin@justtally.local / admin1234**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Der Vite-Dev-Server proxyt `/api` und `/uploads` automatisch ans Backend (Port 4000).

## Nutzung

1. Backend + Frontend starten (siehe oben).
2. Im Browser **http://localhost:5173** öffnen, als Admin anmelden.
3. Unter **Admin → Übungen** Übungen anlegen und Fotos/Videos hochladen.
4. **Mobile Ansicht** öffnen oder die Seite auf dem Handy aufrufen.
5. Auf dem Handy: Browser-Menü → **„Zum Startbildschirm hinzufügen"** → läuft als App, offline-fähig.

> Für den Zugriff vom Handy im selben WLAN: Frontend mit `npm run dev -- --host` starten
> und `http://<PC-IP>:5173` aufrufen. Für PWA-Installation/Offline ist HTTPS bzw.
> `localhost` nötig — siehe Hinweise in `docs/`.

## Produktions-Build

```bash
cd frontend && npm run build      # erzeugt frontend/dist
cd backend && npm start           # API + kann dist statisch ausliefern (optional erweitern)
```

## Projektstruktur

```
just-tally/
├── backend/          Express-API + SQLite + Medien-Upload
│   └── src/
│       ├── routes/   auth · exercises · users
│       ├── middleware/auth.js (JWT)
│       ├── services/ mediaService.js (sharp)
│       └── db/       database.js · seed.js
└── frontend/         React-PWA (mobile + admin)
    └── src/
        ├── pages/    auth · mobile · admin
        ├── api/      client · exercises · users
        ├── hooks/    useAuth · useExercises · useWorkouts · useOnline
        └── components/
```

## Sicherheit / Produktion

- **`JWT_SECRET` in `.env` unbedingt ändern.**
- Hinter HTTPS betreiben (Reverse-Proxy wie Nginx/Caddy).
- `.env` und `backend/data/`, `backend/uploads/` sind in `.gitignore`.
