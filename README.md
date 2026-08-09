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
| Backend   | Node.js · Express · Postgres (`pg`, z. B. Neon) |
| Auth      | JWT · bcryptjs |
| Medien    | `sharp` (Bild-Komprimierung → WebP + Thumbnails) hinter einem Storage-Driver |
| Hosting   | fly.io (Docker + persistentes Volume) |
| Offline   | Service Worker (Workbox) · IndexedDB (`idb-keyval`) |

## Voraussetzungen

- **Node.js ≥ 22** (getestet mit Node 24)
- npm
- Eine Postgres-Datenbank (`DATABASE_URL`) — z. B. ein kostenloses [Neon](https://neon.tech)-Projekt

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
cd backend && npm start           # API + liefert frontend/dist statisch aus
```

## Deployment (fly.io)

Einmalig:

```bash
fly launch --no-deploy --name justtally --region fra
```

```bash
fly volumes create justtally_data --region fra --size 3
```

```bash
fly secrets set DATABASE_URL="postgres://…" JWT_SECRET="$(openssl rand -base64 48)" ADMIN_EMAIL="…" ADMIN_PASSWORD="…" ADMIN_NAME="…"
```

Danach bei jedem Release:

```bash
fly deploy
```

`fly deploy` baut standardmäßig auf den Buildern von fly — ein lokaler Docker-Daemon
ist nicht nötig. Für einen lokalen Build stattdessen `fly deploy --local-only`.

**Wichtig:**

- **Nur eine Machine**, solange `MEDIA_DRIVER=local` gilt. Ein fly-Volume hängt an
  genau einer Machine; eine zweite bekäme ihr eigenes, leeres Volume und würde
  Bilder je nach Zufall ausliefern oder nicht.
- **Neon in dieselbe Region** wie die fly-App (`fra` → `eu-central-1`). Sonst zahlt
  jede Query einen interkontinentalen Roundtrip.
- Nach dem ersten Deploy prüfen, dass Medien einen Deploy überleben: Foto hochladen,
  `fly deploy`, Foto muss noch da sein.

### Medien-Storage

Uploads laufen über einen austauschbaren Driver (`backend/src/services/storage/`):

| `MEDIA_DRIVER` | Ablage | Einsatz |
|---|---|---|
| `local` | Dateisystem unter `UPLOADS_DIR` | lokal (`backend/uploads`) und fly-Volume (`/data/uploads`) |

Ein `r2`-Driver für Cloudflare R2 ist vorbereitet — siehe
[docs/media-and-catalog-plan.md](docs/media-and-catalog-plan.md).

## Projektstruktur

```
just-tally/
├── backend/          Express-API + Postgres + Medien-Upload
│   └── src/
│       ├── routes/   auth · exercises · users · workouts
│       ├── middleware/auth.js (JWT)
│       ├── services/ mediaService.js (sharp) · storage/ (Driver) · csvImport.js
│       └── db/       database.js · seed.js
└── frontend/         React-PWA (mobile + admin)
    └── src/
        ├── pages/    auth · mobile · admin
        ├── api/      client · exercises · users
        ├── hooks/    useAuth · useExercises · useWorkouts · useOnline
        └── components/
```

## Sicherheit / Produktion

- **`JWT_SECRET` unbedingt setzen und ändern.** Fehlt die Variable, fällt
  `auth.js` derzeit still auf einen im Repo stehenden Wert zurück — offener Punkt,
  siehe Phase 2 in [docs/media-and-catalog-plan.md](docs/media-and-catalog-plan.md).
- **`POST /api/auth/register` ist aktuell offen.** Auf einer öffentlich
  erreichbaren URL kann sich jeder ein Konto anlegen. Ebenfalls Phase 2.
- Hinter HTTPS betreiben — auf fly.io erledigt das `force_https` in `fly.toml`.
- `.env` und `backend/data/`, `backend/uploads/` sind in `.gitignore`.
