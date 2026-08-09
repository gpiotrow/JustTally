# Just Tally 🏋️

Ein lokal lauffähiger Gym-Tracker als **Progressive Web App (PWA)** für iPhone und Android.

**Live:** [justtally.org](https://justtally.org)

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
| Hosting   | fly.io (Docker + persistentes Volume) · Domain via Cloudflare |
| Offline   | Service Worker (Workbox) · IndexedDB (`idb-keyval`) |
| Tests     | vitest · supertest (Backend) |

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

## Tests

```bash
cd backend
npm test              # vitest, mockt die DB — kein Postgres nötig
```

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

### Eigene Domain (Cloudflare)

```bash
fly certs add justtally.org
fly certs add www.justtally.org
```

Zeigt die nötigen DNS-Werte an (`A`/`AAAA` auf die fly-App). Bei Cloudflare unter
**DNS → Records** eintragen — Proxy-Status auf **„DNS only"** (graue Wolke), nicht
die orangene Proxy-Wolke: fly.io terminiert TLS selbst, ein zusätzlicher Cloudflare-
Proxy kollidiert damit ohne `SSL/TLS`-Modus „Full (strict)".

```bash
fly certs check justtally.org
```

### Medien-Storage

Uploads laufen über einen austauschbaren Driver (`backend/src/services/storage/`):

| `MEDIA_DRIVER` | Ablage | Ausliefern |
|---|---|---|
| `local` | Dateisystem unter `UPLOADS_DIR` | Express static, eine fly-Machine |
| `r2` | Cloudflare R2 | CDN, 0 € Egress, beliebig skalierbar |

**Umstieg auf R2** (sobald der Bucket + Custom Domain stehen):

1. In Cloudflare: R2-Bucket anlegen, Custom Domain (`media.<domain>`) daran binden,
   API-Token „Object Read & Write" auf diesen Bucket beschränkt erzeugen.
2. Secrets setzen:
   ```bash
   fly secrets set MEDIA_DRIVER=r2 \
     R2_ACCOUNT_ID="…" R2_ACCESS_KEY_ID="…" R2_SECRET_ACCESS_KEY="…" \
     R2_BUCKET=justtally-media MEDIA_PUBLIC_BASE_URL="https://media.<domain>"
   ```
3. Bestehende lokale Medien migrieren:
   ```bash
   fly ssh console -C "node src/scripts/mediaDoctor.js --to-r2"          # Trockenlauf
   fly ssh console -C "node src/scripts/mediaDoctor.js --to-r2 --apply"  # schreibt tatsächlich
   ```
   Migriert Zeile für Zeile: Upload → verifizieren → DB-Zeile umstellen →
   **erst dann** die lokale Kopie löschen. Bricht eine Zeile ab, bleibt sie
   unverändert lokal.
4. `VITE_MEDIA_ORIGIN` beim Frontend-Build setzen (`Dockerfile`-`ARG`), damit
   der Service Worker die CDN-Origin zusätzlich zu `/uploads` cached.

`mediaDoctor.js --report` findet verwaiste `media`-Zeilen (Datei/Objekt fehlt,
z. B. Render-Altbestand), `--prune` löscht sie aus der DB.

## Projektstruktur

```
just-tally/
├── backend/          Express-API + Postgres + Medien-Upload
│   └── src/
│       ├── routes/   auth · exercises · users · workouts (+ *.test.js)
│       ├── middleware/auth.js (JWT)
│       ├── services/ mediaService.js (sharp) · storage/ (Driver) ·
│       │             csvImport.js/csvExport.js · exerciseUsage.js
│       ├── lib/      validation.js · loginLockout.js
│       ├── scripts/  backfillWorkoutRefs.js · relinkWorkoutEntries.js
│       └── db/       database.js · seed.js
└── frontend/         React-PWA (mobile + admin)
    └── src/
        ├── pages/    auth · mobile · admin/exercise-manager
        ├── api/      client · exercises · users
        ├── hooks/    useAuth · useExercises · useWorkouts · useOnline
        └── components/
```

## Sicherheit / Produktion

- **`JWT_SECRET` ist Pflicht, kein Fallback.** Fehlt die Variable, startet das
  Backend gar nicht erst (`middleware/auth.js`).
- **Rolle wird bei jedem Request live aus der DB gelesen**, nicht aus dem Token —
  eine Rollenänderung oder Deaktivierung wirkt sofort, nicht erst nach Ablauf
  des 30-Tage-Tokens.
- **Selbstregistrierung ist standardmäßig aus** (`ALLOW_REGISTRATION=off`).
  Admins legen Konten über **Admin → Benutzer** an; `open` erlaubt öffentliche
  Registrierung als `user`.
- **Login-Rate-Limit:** 20 Versuche / 15 Min pro IP, zusätzlich Sperre eines
  Kontos für 15 Min nach 5 Fehlversuchen.
- **Nutzer werden deaktiviert, nicht gelöscht** (`disabled_at`) — Trainingshistorie
  und `exercises.created_by` bleiben referenzierbar.
- **Übungen werden archiviert statt gelöscht**, sobald ein Training darauf verweist
  (`archived_at`) — verhindert, dass ein Löschen fremde Trainingshistorien zerstört.
- Hinter HTTPS betreiben — auf fly.io erledigt das `force_https` in `fly.toml`.
- `.env` und `backend/data/`, `backend/uploads/` sind in `.gitignore`.

Details und Hintergrund: [docs/media-and-catalog-plan.md](docs/media-and-catalog-plan.md).
