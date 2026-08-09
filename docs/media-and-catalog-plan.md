# Konzept: Umzug auf fly.io · Mehrbenutzerbetrieb · Medien über Cloudflare · Katalog-Verwaltung

Stand: 2026-08-09 · Basis-Commit: `db1a06b`

---

## 1. Ausgangslage

### 1.1 Was heute läuft

**Deployment:** Render Free (`render.yaml`), Build baut Frontend + Backend, `npm run seed` im Build-Schritt.
**Datenbank:** Neon Postgres (extern), Schema-Migration über `initSchema()` beim App-Start.
**Medien:** Upload → multer (RAM) → `sharp` → WebP + Thumbnail → `backend/uploads/` → statisch unter `/uploads`.
**Übungen:** `id` = nanoid, `ref` = fortlaufende Ganzzahl (UNIQUE), zweisprachig, CSV-Import, Bulk-Medien über führende Ziffer im Dateinamen.
**Trainings:** `workouts.entries` als JSON-**Text**-Blob mit `{ exerciseId, exerciseName, sets }`, pro Nutzer über `user_id` getrennt.

### 1.2 Was der fly.io-Umzug am ursprünglichen Problem ändert

Die erste Fassung dieses Plans stufte den Medienverlust als dringendsten Punkt ein: Render-Free hat ein **ephemeres Dateisystem**, `backend/uploads/` verschwindet bei jedem Deploy und Spin-Down.

**Fly.io hat persistente Volumes.** Damit löst der Umzug dieses Problem selbst — Cloudflare wird vom Notnagel zur geplanten Weiterentwicklung. Passend, denn du hast noch keine Domain, und R2 ohne Custom Domain liefe nur über die `*.r2.dev`-Entwickler-URL (rate-limited, von Cloudflare ausdrücklich nicht für Produktion vorgesehen).

**Konsequenz:** Volume zuerst, R2 wenn die Domain steht. Damit das kein Wegwerf-Schritt wird, kommt die Storage-Driver-Abstraktion (§ 5.2) **sofort** — dann ist der Wechsel ein Env-Flag, kein Umbau.

### 1.3 Was unabhängig vom Hosting ein Problem bleibt

> **Ein Katalog-Komplettaustausch zerreißt die Trainings-Historie.**
> `workouts.entries[].exerciseId` zeigt auf die nanoid. `DELETE /api/exercises/:id` und `/bulk-delete` löschen hart. Werden alle Übungen gelöscht und neu importiert, bekommen sie **neue** IDs. Die Historie zeigt weiterhin `exerciseName` (denormalisiert) und *sieht deshalb heil aus* — aber jede Verknüpfung ist tot: kein Absprung in die Details, und jedes künftige Feature (Verlauf pro Übung, PR-Tracking, „letztes Gewicht") bricht **still**.

→ § 6

### 1.4 Funde aus dem Code

**Betrieb**

> **N+1-Query in der Übungsliste** (`exercises.js:182`). `Promise.all(rows.map(withMedia))` feuert **eine Query pro Übung**. Bei 500 Übungen sind das 501 Queries, serialisiert durch das Pool-Limit von 10. Liegen Neon und fly in verschiedenen Regionen, wird daraus ein mehrsekündiger Request — und das trifft bei mehreren Nutzern alle gleichzeitig. → § 3.5

> **Videos werden komplett in den RAM gepuffert** (`exercises.js:13`, Limit 200 MB). Auf einer 512-MB-Machine killt eine große Videodatei den Prozess — und damit die Sitzung *aller* Nutzer. → Phase 6

**Mehrbenutzer / Auth** — ausführlich in § 4:

> **`JWT_SECRET` fällt still auf `'dev-secret'` zurück** (`auth.js:3`). Ist das Secret auf fly nicht gesetzt, signiert die App mit einem im Repo stehenden Wert — jeder kann sich dann ein Admin-Token ausstellen. Fail-open an der kritischsten Stelle.

> **Die Rolle steckt im Token und wird nie gegen die DB geprüft** (`auth.js:10`, `auth.js:38`). Ein degradierter Admin bleibt bis zu 30 Tage Admin. Ein gelöschter Nutzer behält ein gültiges Token.

> **`POST /api/auth/register` ist völlig offen** (`auth.js:18`). Kein Invite, kein Gate.

> **`PATCH /api/users/:id/role` hat keinen Selbstschutz** (`users.js:56`). Der einzige Admin kann sich selbst degradieren und sperrt sich damit aus — reparierbar nur per SQL.

> **Nutzerlöschung vernichtet still die Trainingshistorie.** `workouts.user_id … ON DELETE CASCADE` (`database.js:70`), ohne Warnung, ohne Export.

Kleinere Punkte: `media.position` ohne Reorder-Endpoint; Bulk-Upload hart auf 20 Dateien ohne Client-Chunking; kein CSV-Export; `workouts.entries` ist `TEXT` statt `jsonb`.

---

## 2. Zielbild

```
Phase 1–4 (jetzt, ohne Domain)          Phase 5 (wenn Domain steht)
┌───────────────┐                       ┌───────────────┐
│  PWA / Client │                       │  PWA / Client │
└───────┬───────┘                       └───┬───────┬───┘
        │ https://justtally.fly.dev         │ API   │ Medien
        ▼                                   ▼       ▼
┌───────────────────────┐            ┌──────────┐ ┌──────────────┐
│  fly.io Machine (fra) │            │ fly.io   │ │ Cloudflare   │
│  Express + sharp      │            │ Machine  │ │ R2 + CDN     │
│         │             │            └────┬─────┘ └──────────────┘
│         ▼             │                 │
│  Volume /data/uploads │                 ▼
└───────┬───────────────┘            ┌──────────┐
        │                            │  Neon    │
        ▼                            │ Postgres │
   Neon Postgres (eu-central)        └──────────┘
```

**Leitprinzipien**

1. **Storage ist ein Driver, kein Ort.** `MEDIA_DRIVER=local|r2` — der Wechsel ist ein Deploy.
2. **Medien-Keys sind unveränderlich.** Neues Bild = neuer Key = neue URL.
3. **Übungs-IDs werden nie wiederverwendet und nie durch einen Import neu vergeben.**
4. **Deaktivieren ist der Standard, hartes Löschen die tippbestätigte Ausnahme** — für Übungen *und* für Nutzer.
5. **Mehrbenutzer heißt geschlossen, nicht einbenutzer.** Konten legt der Admin an; Rechte gelten sofort, nicht erst nach Token-Ablauf.

---

## 3. Teil A — Umzug auf fly.io

### 3.1 Was bleibt, was geht

| Komponente | Entscheidung |
|---|---|
| Neon Postgres | **bleibt** — managed, Free-Tier, funktioniert, kein Migrationsrisiko |
| Render | entfällt, `render.yaml` wird gelöscht |
| Frontend-Auslieferung | bleibt beim Express-Backend (`app.js:48`) → same-origin, CORS wird gegenstandslos |
| Medien | von Container-FS auf **fly Volume** |

> **Region:** `fra` (Frankfurt). **Prüfe, in welcher Region dein Neon-Projekt liegt.** Steht Neon in `us-east` und fly in `fra`, zahlt jede Query ~100 ms Transatlantik-Latenz — zusammen mit dem N+1 aus § 1.4 wird die Übungsliste unbenutzbar. Beides nach `eu-central-1`.

> **Fly Postgres als Alternative?** Nein. Fly's selbstgehostetes Postgres ist ausdrücklich unmanaged („du bist der DBA"). Neon läuft, hat Backups und Branching.

### 3.2 `Dockerfile`

Multi-Stage, damit Build-Tools nicht ins Runtime-Image wandern. Das Layout `/app/backend/src` + `/app/frontend/dist` muss erhalten bleiben, weil `app.js:48` relativ dorthin auflöst.

```dockerfile
# ---- Frontend build ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Zur Build-Zeit in den Service Worker gebacken; erst ab Phase 5 relevant.
ARG VITE_MEDIA_ORIGIN=""
ENV VITE_MEDIA_ORIGIN=$VITE_MEDIA_ORIGIN
RUN npm run build

# ---- Runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
EXPOSE 4000
CMD ["node", "src/app.js"]
```

> **`node:22-slim`, nicht `-alpine`:** `sharp` liefert für glibc fertige Binaries mit gebündeltem libvips. Auf Alpine (musl) ist der Pfad fehleranfälliger — der Größenunterschied ist die Ruhe nicht wert.

`.dockerignore`:

```
node_modules
**/node_modules
frontend/dist
backend/uploads
backend/data
.git
*.log
.env
```

### 3.3 `fly.toml`

```toml
app = "justtally"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "4000"
  UPLOADS_DIR = "/data/uploads"
  MEDIA_DRIVER = "local"

# Läuft in einer temporären Machine vor dem Umschalten.
# Kein Volume gemountet — unkritisch, weil seed nur Postgres anfasst.
[deploy]
  release_command = "node src/db/seed.js"

[[mounts]]
  source = "justtally_data"
  destination = "/data"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/api/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

- **`min_machines_running = 0`** — Machine stoppt bei Inaktivität, Kaltstart kostet Sekunden. Für eine private Gym-App in Ordnung, die PWA funktioniert offline weiter.
- **`/api/health` existiert bereits** (`app.js:38`).
- **Genau eine Machine.** Ein fly-Volume hängt an *einer* Machine in *einer* Region. Bei zwei Machines hätte jede ihr eigenes, halbleeres Volume — Bilder wären mal da, mal nicht. Solange `MEDIA_DRIVER=local`: nicht skalieren. Ab R2 (Phase 5) fällt das weg.
- **512 MB**, nicht 256 — `sharp` braucht bei großen JPEGs Luft.

### 3.4 Volume und Secrets

```bash
fly launch --no-deploy --name justtally --region fra
fly volumes create justtally_data --region fra --size 3
```

```bash
fly secrets set \
  DATABASE_URL="postgres://…neon…" \
  JWT_SECRET="$(openssl rand -base64 48)" \
  ADMIN_EMAIL="…" \
  ADMIN_PASSWORD="…" \
  ADMIN_NAME="…"
```

> **JWT_SECRET neu erzeugen, nicht von Render übernehmen.** Ein Secret, das schon anderswo ausgerollt war, ist kein frisches Secret. Nebeneffekt: alle bestehenden Tokens werden ungültig — beim Umzug ohnehin der richtige Moment.

`CLIENT_ORIGIN` entfällt (same-origin).

**Zwingende Codeänderung:** `mediaService.js:9` hardcodet `UPLOADS_DIR`. Ohne das greift das Volume nicht:

```js
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR || join(__dirname, '..', '..', 'uploads');
```

### 3.5 Quick Win: N+1 beseitigen

Gehört vor den ersten großen CSV-Import, nicht danach:

```js
// Einmal alle Medien holen, dann in JS gruppieren.
const { rows: allMedia } = await db.query(
  'SELECT * FROM media WHERE exercise_id = ANY($1) ORDER BY position, created_at',
  [rows.map((r) => r.id)]
);
const byExercise = new Map();
for (const m of allMedia) {
  const list = byExercise.get(m.exercise_id) ?? [];
  list.push(m);
  byExercise.set(m.exercise_id, list);
}
```

Aus 501 Queries werden 2. `withMedia()` bleibt für `GET /:id`.

### 3.6 Umzugsreihenfolge

1. `Dockerfile`, `.dockerignore`, `fly.toml`; `UPLOADS_DIR` env-fähig
2. Lokal testen (`docker build` + `docker run`)
3. Neon-Region prüfen, ggf. angleichen
4. Volume + Secrets, `fly deploy`
5. `/api/health` prüfen, als Admin einloggen, Übung mit Foto anlegen
6. **Volume-Persistenz verifizieren:** erneut `fly deploy` → Foto muss noch da sein. Dieser Test ist der ganze Zweck des Umzugs.
7. Render löschen, `render.yaml` entfernen, README anpassen

> **Datenmigration:** keine. Die DB liegt bei Neon und wird nur umgehängt. Medien auf Render sind mit hoher Wahrscheinlichkeit ohnehin weg — verwaiste `media`-Zeilen bereinigt § 5.5.

---

## 4. Teil B — Mehrbenutzerbetrieb

### 4.1 Was schon mehruserfähig ist

Das **Datenmodell** ist es bereits, und zwar sauber:

- `users` mit Rollen `admin` / `user`, `workouts.user_id` mit FK
- `POST /api/workouts/sync` filtert konsequent auf `req.user.sub` — keine Query ohne `user_id`-Bedingung (`workouts.js:61,112,134`)
- Admin-Nutzerverwaltung existiert (`users.js`, `UserManagement.tsx`): anlegen, Rolle ändern, löschen
- Der Übungskatalog ist bewusst global, nur Admins schreiben ihn

**Registrierung zu schließen macht die App nicht einbenutzerfähig.** Konten legt dann der Admin an (`POST /api/users` gibt es bereits, inklusive Rollenwahl) statt sie selbst zu erzeugen. Mehrbenutzer bleibt vollständig erhalten — nur der Zugang wird kontrolliert.

### 4.2 Was nicht mehruserfähig ist: der Auth-Lebenszyklus

Das ist die eigentliche Lücke. Fünf Punkte, alle in `auth.js` / `users.js`:

**a) `JWT_SECRET` fällt still auf `'dev-secret'` zurück** (`auth.js:3`)

```js
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
```

Ist die Variable auf fly nicht gesetzt, läuft die App mit einem im Repo stehenden Signaturschlüssel — jeder kann sich ein Admin-Token bauen. **Fix:** Fail-fast beim Start, exakt wie `database.js:10` es für `DATABASE_URL` vormacht. Ein fehlendes Secret muss den Start verhindern, nicht die Sicherheit.

**b) Die Rolle kommt aus dem Token, nie aus der DB** (`auth.js:10`, `auth.js:38`)

`signToken` schreibt `role` ins JWT, `requireAdmin` liest `req.user.role`. Folge bei 30 Tagen Laufzeit:

| Aktion | Erwartung | Realität |
|---|---|---|
| Admin degradieren | verliert Adminrechte | behält sie bis zu 30 Tage |
| Nutzer zum Admin machen | bekommt Rechte | erst nach Neuanmeldung |
| Nutzer löschen | Zugang weg | Token bleibt gültig, Katalog weiter lesbar |

**Fix:** `requireAuth` lädt den Nutzer per Primärschlüssel und nutzt `row.role` statt der Token-Rolle; fehlt die Zeile → 401.

```js
const { rows } = await db.query(
  'SELECT id, role, disabled_at, token_version FROM users WHERE id = $1',
  [payload.sub]
);
const row = rows[0];
if (!row || row.disabled_at) return res.status(401).json({ error: 'Account is not active' });
if ((payload.tv ?? 0) !== row.token_version) {
  return res.status(401).json({ error: 'Session expired, please sign in again' });
}
req.user = { sub: row.id, role: row.role };
```

> **Kostet das eine DB-Abfrage pro Request?** Ja — ein Primärschlüssel-Lookup, bei Neon in derselben Region im Bereich von ein bis zwei Millisekunden. Das ist der richtige Tausch: Rechteänderungen und Sperrungen greifen sofort statt in bis zu 30 Tagen. Voraussetzung ist allerdings, dass § 3.1 (gleiche Region) eingehalten wird — sonst kostet jeder Request einen Transatlantik-Roundtrip.

**c) `token_version` für „alle Geräte abmelden"**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
```

Wird in den Token als `tv` mitsigniert und beim Passwortwechsel oder auf Knopfdruck hochgezählt → alle bestehenden Sitzungen dieses Nutzers sind sofort ungültig. Bei mehreren Nutzern auf mehreren Geräten ist das die Funktion, die man irgendwann braucht — und rückwirkend nachzurüsten ist teurer als sie jetzt mitzunehmen.

**d) Kein Selbstschutz beim Rollenwechsel** (`users.js:56`)

`DELETE /:id` verhindert Selbstlöschung, `PATCH /:id/role` verhindert **nichts**. Der einzige Admin kann sich degradieren und ist ausgesperrt — reparierbar nur per SQL an der Neon-Konsole.

**Fix:** zwei Regeln — man kann die eigene Rolle nicht ändern, und der letzte verbleibende Admin kann nicht degradiert oder gelöscht werden.

**e) Nutzerlöschung vernichtet still die Historie**

`workouts.user_id … ON DELETE CASCADE` (`database.js:70`): Ein Klick löscht alle Trainings des Nutzers, ohne Warnung, ohne Export, ohne Undo.

**Entscheidung — analog zum Übungs-Archiv:**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at BIGINT;
```

- **Standardaktion ist „Deaktivieren":** `disabled_at` setzen, `token_version` hochzählen → sofort ausgesperrt, Historie bleibt, jederzeit reaktivierbar
- **Hartes Löschen** nur mit Abtippen der E-Mail-Adresse, und der Dialog bietet vorher einen JSON-Export der Trainings an
- Deaktivierte Nutzer werden in `UserManagement.tsx` ausgegraut statt versteckt

Damit gilt dasselbe Prinzip in der ganzen App: **deaktivieren/archivieren als Standard, hartes Löschen als tippbestätigte Ausnahme.**

### 4.3 Registrierung: drei Modi statt eines Booleans

```
ALLOW_REGISTRATION = off | invite | open      (Default: off)
REGISTRATION_INVITE_CODE = …                  (nur bei invite)
```

| Modus | Verhalten | wofür |
|---|---|---|
| `off` | `POST /register` → 403, Admin legt Konten an | jetzt |
| `invite` | Registrierung nur mit gültigem Code im Body | wenn du Trainingspartner dazunimmst, ohne für jeden ein Passwort zu setzen |
| `open` | wie heute | vermutlich nie |

Der Modus wird über einen schlanken `GET /api/config` (unauthentifiziert, nur `{ registration: 'off'|'invite'|'open' }`) ans Frontend gemeldet, damit Login-Seite und Route sich entsprechend verhalten.

> Der `invite`-Modus ist der Grund, das nicht als Boolean zu bauen: Genau er ist der realistische nächste Schritt, sobald ein zweiter Mensch die App nutzt.

### 4.4 Brute-Force-Schutz mit Mehrbenutzer-Fallstrick

`auth.js:26` erlaubt Passwörter ab 6 Zeichen. Auf einer öffentlichen URL ohne Limit ist das frei durchprobierbar.

**Rate-Limit auf `/api/auth/login` — aber zweidimensional:**

- pro **IP**: großzügig (z. B. 30 Versuche / 15 min)
- pro **E-Mail**: streng (z. B. 5 Versuche / 15 min)

> **Warum nicht nur pro IP?** Mehrere Nutzer im selben WLAN oder hinter demselben Mobilfunk-NAT teilen sich eine IP. Ein strenges IP-Limit sperrt dann den halben Haushalt aus, während ein Angreifer mit wechselnden IPs unbehelligt bleibt. Das Limit pro Konto trifft den Angreifer, das Limit pro IP bremst breites Scannen.

Dazu: Passwort-Mindestlänge auf 10 Zeichen, und `ADMIN_PASSWORD` darf nicht auf dem `admin1234` aus `.env.example` stehenbleiben.

### 4.5 Sync-Robustheit bei mehreren Nutzern

`workouts.id` ist ein **globaler** Primärschlüssel. In `POST /api/workouts/sync` sucht der Upsert mit `WHERE id = $1 AND user_id = $2` (`workouts.js:61`). Gehört die ID einem anderen Nutzer, findet er nichts, geht in den INSERT-Zweig und läuft in eine PK-Verletzung → 500 → `ROLLBACK` → **die komplette Synchronisation dieses Nutzers schlägt fehl**, dauerhaft, bis er lokale Daten löscht.

Eine nanoid-Kollision ist astronomisch unwahrscheinlich; ein geklontes Gerät, ein eingespieltes Backup oder ein manipulierter Client sind es nicht.

**Fix:** `ON CONFLICT (id) DO NOTHING` beim Insert und den betroffenen Eintrag in der Antwort als übersprungen melden, statt den Batch zu kippen. Billig, und macht den Sync-Endpunkt gegen fremde IDs unempfindlich.

---

## 5. Teil C — Medien

### 5.1 Zwei Stufen

| | Stufe 1 (jetzt) | Stufe 2 (wenn Domain steht) |
|---|---|---|
| Ablage | fly Volume `/data/uploads` | Cloudflare R2 |
| Ausliefern | Express static | Cloudflare CDN |
| Domain nötig | nein | ja |
| Egress | fly-Bandbreite | **0 €** |
| Skalierung | genau eine Machine | beliebig |

Der Sprung dazwischen kostet fast nichts — *sofern* die Abstraktion von Anfang an steht.

### 5.2 Storage-Driver (sofort, Phase 1)

```
backend/src/services/storage/
├── index.js         Driver-Auswahl über MEDIA_DRIVER
├── localDriver.js   Dateisystem (fly Volume)
└── r2Driver.js      S3-Client gegen R2   ← Phase 5
```

```js
/**
 * @typedef {object} StorageDriver
 * @property {(key: string, body: Buffer, contentType: string) => Promise<void>} put
 * @property {(key: string) => Promise<void>} remove
 * @property {(key: string) => string} publicUrl
 * @property {(key: string, contentType: string) => Promise<string>} presignPut
 */
```

`mediaService.js` wird umgebaut: `sharp` bleibt vollständig, nur `.toFile(...)` weicht `.toBuffer()` + `driver.put(...)`. Der `localDriver` schreibt dorthin, wo heute geschrieben wird — Verhalten identisch, nur die Naht ist gezogen.

### 5.3 Key-Layout

```
img/{mediaId}.webp          Vollbild, max 1280 px
img/{mediaId}.thumb.webp    Thumbnail, 320 px
vid/{mediaId}.mp4
```

Flach und **ohne `ref` im Pfad**: `ref` ist änderbar, `mediaId` nicht. Ein Key wird nie überschrieben — „Bild ersetzen" heißt neue Zeile + neuer Key, alte Zeile + alter Key werden gelöscht.

### 5.4 Schema-Änderung `media`

```sql
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage    TEXT NOT NULL DEFAULT 'local';
ALTER TABLE media ADD COLUMN IF NOT EXISTS object_key TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS thumb_key  TEXT;
```

URL-Auflösung zur Laufzeit in `withMedia()`:

```js
function mediaUrl(row) {
  if (row.storage === 'local') return row.url;                     // Altbestand + Stufe 1
  return `${process.env.MEDIA_PUBLIC_BASE_URL}/${row.object_key}`; // Stufe 2
}
```

**Warum nicht die absolute URL speichern?** Ein Domainwechsel wird so zur Env-Var-Änderung statt zur Datenmigration über alle Zeilen. Die API-Antwort bleibt formgleich — `lib/types.ts` muss nicht angefasst werden.

### 5.5 `mediaDoctor.js`

- `--report` : `media`-Zeilen ohne Datei/Objekt (Render-Altbestand), als CSV mit `ref`-Nummern
- `--prune` : verwaiste Zeilen löschen
- `--to-r2` : Stufe 1 → Stufe 2 (Phase 5)

Nach `--report` liefern die `ref`-Nummern direkt die Liste, welche Fotos per Bulk-Upload neu einzuspielen sind.

### 5.6 Cloudflare R2 — Vorbereitung für Phase 5

| | **R2** | Cloudflare Images | Cloudflare Stream |
|---|---|---|---|
| Bilder | ✅ (`sharp` bleibt) | ✅ (ersetzt `sharp`) | ❌ |
| Videos | ✅ (als MP4) | ❌ | ✅ (adaptiv) |
| Egress | **0 €** | im Preis | im Preis |
| Free Tier | 10 GB Storage | ❌ | ❌ |

Realistisch: 500 Übungen × 3 Fotos ≈ 250 MB, Videos ≈ 2,5 GB → **~2,8 GB, komplett im Free-Tier.** Cloudflare Images kostete monatlich bei identischem Nutzen — `sharp` erzeugt die Varianten bereits.

Wenn die Domain da ist:
1. Bucket `justtally-media`, Custom Domain `media.<domain>` daran binden
2. API-Token `Object Read & Write`, auf diesen Bucket beschränkt
3. CORS: `GET`/`HEAD` für die App-Origin (`PUT` ab Phase 6)
4. Env: `MEDIA_DRIVER=r2`, `MEDIA_PUBLIC_BASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
5. Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
6. `r2Driver.js` wirft beim Start bei fehlenden Variablen — wie `database.js:10`

**PWA-Anpassung** (`vite.config.ts`) — der Workbox-Match auf `/uploads` greift bei fremdem Origin nicht mehr:

```ts
urlPattern: ({ url }) =>
  url.origin === import.meta.env.VITE_MEDIA_ORIGIN || url.pathname.startsWith('/uploads'),
```

Der `/uploads`-Zweig bleibt, solange Altbestand existiert. `maxEntries` von 200 hochsetzen — 500 Übungen mit Bild + Thumbnail sprengen das sofort.

---

## 6. Teil D — Identität und Lebenszyklus der Übungen

### 6.1 Drei Identitätsebenen

| Ebene | Feld | Stabilität | Wofür |
|---|---|---|---|
| Technisch | `id` (nanoid) | **für immer, nie wiederverwendet** | FK aus `media`, Referenz in `workouts.entries`, Routen |
| Fachlich | `ref` (int, UNIQUE) | stabil, mit Bedacht änderbar | CSV-Matching, Dateinamen-Matching |
| Anzeige | `name_de` / `name_en` | frei änderbar | UI, Fallback-Matching im Import |

### 6.2 Invarianten

- **I1** — Eine Übungs-`id` wird nie wiederverwendet.
- **I2** — Ein Import erzeugt **nie** eine neue `id` für eine bestehende Übung (Match: `ref` → Name).
- **I3** — Eine Übung, auf die ein Training verweist, wird **archiviert, nicht gelöscht**.
- **I4** — Medien-Keys sind unveränderlich.
- **I5** — Jede Mutation setzt `exercises.updated_at` → Clients synchronisieren nach.

I2 allein löst den Normalfall; I3 fängt ab, wenn trotzdem gelöscht wird.

> **Mehrbenutzer-Bezug:** I3 wiegt mit mehreren Nutzern schwerer. Eine Übung kann in den Trainings *anderer* Leute stecken — der Admin sieht beim Löschen nicht, wessen Historie er trifft. Deshalb meldet die Referenzprüfung nicht nur „wird verwendet", sondern **von wie vielen Nutzern**.

### 6.3 Soft-Delete / Archiv

```sql
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS archived_at BIGINT;
CREATE INDEX IF NOT EXISTS idx_exercises_archived ON exercises(archived_at);
```

**Entschieden — archivierte Übungen in der Mobile-App:** aus der Übungsliste **unsichtbar**, über die Historie weiterhin erreichbar, mit dezentem „Archiviert"-Hinweis in der Detailansicht. Kein separater Archiv-Bereich: Wer eine alte Übung sucht, sucht sie über sein Training, nicht über eine zweite Liste.

- `GET /api/exercises` → nur aktive; `?includeArchived=1` für Admin
- `GET /api/exercises/:id` → liefert archivierte weiterhin, mit `archived: true`
- Medien archivierter Übungen bleiben liegen

**Entschieden — hartes Löschen:** nur für **unreferenzierte** Übungen, Dialog verlangt das **Abtippen des Übungsnamens**. Referenzierte Übungen sind über die UI gar nicht hart löschbar. **Kein `?force=true`** — die Ausnahme, die man sich für Notfälle offenhält, ist genau die, die im Alltag versehentlich benutzt wird. Wer wirklich muss, geht per SQL ran.

- `DELETE /:id` und `/bulk-delete`: referenziert → archivieren, sonst hart löschen inkl. Medienobjekten
- Antwort: `{ archived: n, deleted: m }`

### 6.4 `workouts.entries` → `jsonb`

```sql
ALTER TABLE workouts ALTER COLUMN entries TYPE jsonb USING entries::jsonb;
CREATE INDEX IF NOT EXISTS idx_workouts_entries
  ON workouts USING GIN (entries jsonb_path_ops);
```

```sql
-- "Wie viele Nutzer verwenden diese Übung?"
SELECT COUNT(DISTINCT user_id) FROM workouts
WHERE deleted_at IS NULL AND entries @> $1::jsonb;
```

> **Folgeänderung, leicht zu übersehen:** `workouts.js:16` macht `JSON.parse(row.entries || '[]')`. Bei `jsonb` liefert `pg` bereits ein Objekt — der Parse muss weg, sonst wirft `serialize()`. Beim Schreiben bleibt `JSON.stringify(...)`, aber mit explizitem `$5::jsonb`-Cast.

### 6.5 `exerciseRef` in den Trainings-Einträgen

```ts
export interface WorkoutEntry {
  exerciseId: string;
  /** Referenznummer zum Zeitpunkt der Aufzeichnung — erlaubt Re-Linking, falls IDs verloren gehen. */
  exerciseRef?: number;
  exerciseName: string;
  sets: WorkoutSet[];
}
```

Die Absicherung *hinter* den Invarianten: Sollte doch einmal Delete+Reimport passieren, lassen sich Einträge über `exerciseRef` wieder anhängen — und zwar für **alle** Nutzer in einem Durchlauf.

- `isValidEntries()` (`workouts.js:21`) bleibt kompatibel, das Feld ist optional
- Auflösung in der App: `exerciseId` → `exerciseRef` → `exerciseName`
- Skripte: `backfillWorkoutRefs.js`, `relinkWorkoutEntries.js` (beide über alle Nutzer)

---

## 7. Teil E — Verwaltungs-Workflows

### 7.1 Einzelne Übung bearbeiten

Bleibt wie heute, plus Warnung bei `ref`-Änderung (Dateinamen-Matching bezieht sich ab dann auf die neue Nummer; aufgezeichnete Trainings sind nicht betroffen) und **Archivieren** statt „Löschen" bei referenzierten Übungen.

### 7.2 Delta-Import (CSV)

Aus dem Boolean `overwrite` wird ein expliziter `mode`:

| `mode` | Verhalten | heute |
|---|---|---|
| `merge` | neue anlegen, bestehende **überspringen** | `overwrite=false` |
| `upsert` | neue anlegen, bestehende **aktualisieren** | `overwrite=true` |
| `replace` | wie `upsert`, **zusätzlich**: alles nicht in der CSV → archivieren | **neu** |

`overwrite` bleibt übergangsweise als Alias.

### 7.3 Katalog-Komplettaustausch (`mode=replace`)

1. CSV mit dem **kompletten** neuen Katalog hochladen
2. Server matcht: `ref` → Name (bestehende Logik, `exercises.js:278`)
3. Match → **Update in-place**, `id` bleibt → Historie aller Nutzer intakt (I2)
4. Kein Match → Insert mit neuer `id`
5. Bestehende ohne CSV-Zeile → `archived_at = now()` (I3), **kein Delete**
6. Antwort: `{ imported, updated, archived, skipped, errors }`

**Vorschau ist Pflicht, nicht optional.** `?dryRun=1` rechnet alles durch, schreibt nichts:

```
  12 neue Übungen
 483 werden aktualisiert
   7 werden archiviert   ⚠  davon 3 in Trainings von 2 Nutzern verwendet
   2 Fehler (Zeile 88, 214)
```

Die Nutzerzahl in der Warnung ist der Mehrbenutzer-Teil: Der Admin trifft Entscheidungen über fremde Historien und soll das sehen. Die SAVEPOINT-Logik pro Zeile (`exercises.js:329`) bleibt — eine kaputte Zeile kippt nicht den Batch.

### 7.4 Bulk-Medien-Upload

1. **Erweitertes Schema:** `{ref}[_{position}][_beliebig].{ext}` → `42_1_front.jpg` = Übung 42, Position 1 = Coverbild
2. **Client-Chunking:** Auswahl in Blöcke von 20 (`MAX_BULK_FILES`) zerlegen, sequenziell mit Fortschrittsbalken → 500 Fotos in einem Rutsch auswählbar
   > **Fehlerquelle Nummer eins:** `overwrite=true` darf **nur im ersten Chunk** gesetzt werden. Sonst löscht Chunk 2 die Bilder, die Chunk 1 gerade hochgeladen hat. Dafür gehört ein Test geschrieben.
3. **Reorder-Endpoint:** `PUT /api/exercises/:id/media/order` mit `{ mediaIds: string[] }`, im Admin per Drag & Drop
4. **Trockenlauf:** vorab zeigen, welche Datei auf welche Übung mappt

### 7.5 CSV-Export (Round-Trip)

`GET /api/exercises/export.csv` (admin) — exakt die Import-Spalten, mit **befüllter `ref`**.

```
Export  →  in Excel bearbeiten  →  Import mode=replace + dryRun  →  bestätigen
```

Weil `ref` gefüllt ist, matcht der Reimport exakt — kein Namensraten, keine Dubletten.

> `csvTemplate()` (`api/exercises.ts:110`) lässt `ref` bewusst leer — für *neue* Übungen richtig. Der Export ist der andere Fall.

---

## 8. Teil F — Frontend

| Datei | Änderung | Phase |
|---|---|---|
| `pages/auth/Login.tsx`, `Register.tsx` | Registrierungsmodus aus `/api/config`, Invite-Code-Feld | 2 |
| `pages/admin/UserManagement.tsx` | Deaktivieren/Reaktivieren, Tippbestätigung + Export beim Löschen, Letzter-Admin-Schutz | 2 |
| `hooks/useAuth.tsx` | 401 wegen `token_version` → sauber ausloggen statt Endlosschleife | 2 |
| `lib/types.ts` | `Exercise.archived?`, `WorkoutEntry.exerciseRef?`, `User.disabledAt?` | 2–3 |
| `pages/mobile/Workout.tsx` | `exerciseRef` beim Anlegen mitschreiben | 3 |
| `pages/mobile/History.tsx` | Auflösung `id → ref → name`, archivierte markieren | 3 |
| `api/exercises.ts` | `mode` statt `overwrite`, `dryRun`, `exportCsv()`, `reorderMedia()`, Chunking | 4 |
| `pages/admin/ExerciseManager.tsx` | Vorschau-Dialog, Archiv-Tab, Fortschritt, Export-Button | 4 |
| `pages/admin/ExerciseForm.tsx` | Medien-Drag & Drop, Cover-Markierung, Archivieren statt Löschen | 4 |
| `i18n/de.ts`, `en.ts` | Strings für Archiv, Vorschau, Fortschritt, Export, Kontostatus | 2–4 |
| `vite.config.ts` | Workbox-Match auf Medien-Origin, `maxEntries` hoch | 5 |

`ExerciseManager.tsx` liegt bei 398 Zeilen und wächst durch Vorschau-Dialog und Archiv-Tab deutlich. Nach der 800-Zeilen-Regel: Import-Panel und Medien-Panel nach `pages/admin/exercise-manager/` ziehen, **bevor** die Features dazukommen.

---

## 9. Phasenplan mit Modellempfehlung

Die Modellwahl folgt einer Regel (Begründung in § 10): **Opus 5** für Entscheidungen, deren Fehler ein Rewrite oder ein Sicherheitsloch ist. **Sonnet 5** für den Großteil der Implementierung. **Haiku 4.5** für mechanische, eng umrissene, sofort verifizierbare Änderungen.

### Phase 1 — Umzug auf fly.io (M, ~1 Tag)

| Task | Modell | Warum |
|---|---|---|
| Storage-Driver-Interface entwerfen | **Opus 5** | Alles ab Phase 5 hängt daran; ein falscher Schnitt ist ein Rewrite |
| `Dockerfile`, `.dockerignore`, `fly.toml` | **Sonnet 5** | Bekannte Muster, aber Multi-Stage-Layout muss zu `app.js:48` passen |
| `localDriver` implementieren | **Sonnet 5** | Verhalten muss bitgenau dem heutigen entsprechen |
| `UPLOADS_DIR` env-fähig (`mediaService.js:9`) | **Haiku 4.5** | Eine Zeile, sofort verifizierbar |
| N+1 in `GET /api/exercises` beseitigen (§ 3.5) | **Sonnet 5** | Umbau einer heißen Query, Gruppierungslogik muss stimmen |
| Neon-Region prüfen / angleichen | *manuell* | Konsolenarbeit |
| Volume + Secrets + `fly deploy` | *manuell* | Secrets gehören nicht in einen Agentenlauf |
| **Volume-Persistenz verifizieren** | *manuell* | Foto → `fly deploy` → noch da? Der Zweck des Umzugs |
| `render.yaml` löschen, README anpassen | **Haiku 4.5** | Mechanisch |

Beim Integrationstest zusätzlich aufgetaucht und miterledigt:

| Task | Warum |
|---|---|
| SPA-Fallback antwortete nie auf `/uploads/*` und unbekannte `/api/*` | `app.get('*')` prüfte beide Präfixe heraus, rief dann aber weder `res` noch `next()` — die Verbindung hing bis zum Client-Timeout. Nach dem Render-Medienverlust hätte **jedes tote Bild** eine Browser-Verbindung blockiert; sechs davon legen die Seite lahm. Jetzt 404 in ~7 ms, API-404 vor den Catch-all gezogen. |
| `ssl` in `database.js` war unbedingt gesetzt | Gegen ein lokales Postgres ohne TLS war *gar keine* Verbindung möglich — lokale Entwicklung ohne Neon unmöglich. Jetzt schaltet `?sslmode=disable` TLS ab, die Produktions-URL verhält sich unverändert. |

### Phase 2 — Mehrbenutzer & Zugang (M, ~1 Tag) · direkt nach dem Deploy

| Task | Modell | Warum |
|---|---|---|
| Auth-Lebenszyklus entwerfen (§ 4.2): DB-Rolle, `token_version`, `disabled_at` | **Opus 5** | Auth-Design; Fehler hier sind Rechteausweitung, nicht Bugs |
| `JWT_SECRET` Fail-fast (`auth.js:3`) | **Haiku 4.5** | Drei Zeilen nach dem Vorbild `database.js:10` |
| `requireAuth` gegen DB, `requireAdmin` auf DB-Rolle | **Sonnet 5** | Klar spezifiziert, aber sicherheitskritisch |
| `ALLOW_REGISTRATION` (off/invite/open) + `/api/config` | **Sonnet 5** | Drei Modi, Frontend hängt dran |
| Rate-Limit pro IP **und** pro E-Mail (§ 4.4) | **Sonnet 5** | Die zweidimensionale Auslegung ist der Punkt |
| Letzter-Admin-Schutz, kein Selbst-Rollenwechsel | **Sonnet 5** | Kleine Logik, hohe Aussperrgefahr |
| Nutzer deaktivieren + Export vor Hard-Delete | **Sonnet 5** | Datenverlust-Pfad |
| Sync `ON CONFLICT (id) DO NOTHING` (§ 4.5) | **Sonnet 5** | Transaktionsverhalten muss stimmen |
| Passwort-Mindestlänge, `ADMIN_PASSWORD` setzen | **Haiku 4.5** | Konstante + Secret |
| `rejectUnauthorized: true` für die DB-Verbindung | **Sonnet 5** | Aktuell wird das Zertifikat nicht geprüft (`database.js`), die DB-Verbindung ist damit MITM-angreifbar. Neon nutzt ein öffentlich vertrauenswürdiges Zertifikat, der Umstieg sollte also gehen — muss aber gegen die echte DB verifiziert werden, weil ein Fehlgriff jede Verbindung bricht. |
| Frontend: Login/Register/UserManagement | **Sonnet 5** | Mehrere Komponenten, Zustandslogik |
| **security-reviewer über die ganze Phase** | **Opus 5** | Auth-Änderungen — laut euren Regeln ohnehin Pflicht |

### Phase 3 — Guardrails gegen Datenverlust (S, ~½ Tag)

| Task | Modell | Warum |
|---|---|---|
| `exercises.archived_at`, `users.disabled_at`, `token_version` — Migrationen | **Sonnet 5** | Idempotent im Stil von `initSchema()` |
| `workouts.entries` → `jsonb` + GIN (**`JSON.parse` in `workouts.js:16` raus**) | **Sonnet 5** | Die Folgeänderung ist die Falle |
| Referenzprüfung inkl. Nutzerzahl, archivieren statt löschen | **Sonnet 5** | Kernlogik von I3 |
| `?includeArchived=1` | **Haiku 4.5** | Ein Query-Zweig |
| `WorkoutEntry.exerciseRef` schreiben | **Haiku 4.5** | Feld durchreichen |
| `backfillWorkoutRefs.js`, `relinkWorkoutEntries.js` | **Sonnet 5** | Schreiben über alle Nutzerdaten |
| Tests der Invarianten I1–I3 (tdd-guide) | **Sonnet 5** | Diese Tests sind die eigentliche Absicherung |

### Phase 4 — Katalog-Workflows (M, ~2 Tage)

| Task | Modell | Warum |
|---|---|---|
| `ExerciseManager.tsx` aufteilen (**vor** den Features) | **Sonnet 5** | Reines Refactoring, Verhalten unverändert |
| `mode=replace` + `dryRun` | **Opus 5** | Höchste Einsatzhöhe der App: entscheidet, was im ganzen Katalog archiviert wird — über alle Nutzer hinweg |
| Bulk-Upload-Chunking (**`overwrite` nur Chunk 1**) | **Sonnet 5** | Bekannte Falle, braucht einen gezielten Test |
| Medien-Reorder-Endpoint + Drag & Drop | **Sonnet 5** | Zustand über Backend und UI |
| CSV-Export | **Haiku 4.5** | Spalten spiegeln, gut verifizierbar |
| Admin-UI: Vorschau-Dialog, Archiv-Tab, Fortschritt | **Sonnet 5** | Mehrere Komponenten |
| i18n-Strings | **Haiku 4.5** | Mechanisch |

### Phase 5 — Cloudflare R2 (M, ~1 Tag) · **wenn die Domain steht**

| Task | Modell | Warum |
|---|---|---|
| Cloudflare-Setup (Bucket, Domain, Token, CORS) | *manuell* | Konsole + Secrets |
| `r2Driver.js` | **Sonnet 5** | S3-SDK ist gut dokumentiert, Interface steht seit Phase 1 |
| `media`-Schema + URL-Auflösung in `withMedia()` | **Sonnet 5** | Dual-Mode local/r2 muss beides bedienen |
| `mediaDoctor.js --to-r2` | **Sonnet 5** | Datenmigration, schlecht rückgängig zu machen |
| Workbox-Anpassung | **Sonnet 5** | Falsch gesetzt bleibt die App offline ohne Bilder |
| Volume als Fallback behalten, nicht sofort löschen | *manuell* | — |

### Phase 6 — Video (M, ~1–2 Tage)

| Task | Modell | Warum |
|---|---|---|
| Presigned-Upload entwerfen (Scope, TTL, `HeadObject`) | **Opus 5** | Eine zu weit gefasste presigned URL ist ein offener Bucket |
| `/media/presign` + `/media/confirm` | **Sonnet 5** | Sicherheitsnah, Design steht |
| Client-Upload mit Fortschritt und Abbruch | **Sonnet 5** | Nebenläufigkeit, Fehlerpfade |
| Videoplayer in `ExerciseDetail.tsx` | **Haiku 4.5** | Überschaubare Komponente |
| Cloudflare Stream | *vertagt* | Erst mit echten Nutzungsdaten entscheiden |

---

## 10. Warum diese Modellzuordnung

**Die Regel dahinter ist nicht „schwierig = großes Modell", sondern: Was kostet ein Fehler?**

| Modell | Einsatz | Kriterium |
|---|---|---|
| **Opus 5** | Storage-Interface, Auth-Lebenszyklus, `mode=replace`, presigned Uploads | Ein Fehler ist ein Rewrite, ein Datenverlust über alle Nutzer, oder ein Sicherheitsloch. Fünf davon im ganzen Plan — bewusst wenige. |
| **Sonnet 5** | der Großteil | Klar spezifiziert, aber mit Fallstricken, die Kontextverständnis brauchen: `jsonb`-Folgeänderung, `overwrite`-nur-Chunk-1, Dual-Mode-Storage. |
| **Haiku 4.5** | Env-Vars, i18n, CSV-Export, Feld-Durchreichung | Eng umrissen, das Ergebnis ist in Sekunden prüfbar. Genau das Profil aus eurer `performance.md`. |

**Fable 5** lasse ich bewusst aus: Ich habe kein belastbares Bild seines Stärkenprofils für diese Art Arbeit und will keine Empfehlung erfinden.

**Drei Dinge, die die Modellwahl nicht ersetzt:**

1. **`code-reviewer` nach jeder Phase, `security-reviewer` verpflichtend über Phase 2.** Ein größeres Modell ist kein Ersatz für den Review-Schritt — auch Opus-Code geht durch.
2. **Kontextfenster beachten.** Nach eurer `performance.md`: die letzten 20 % nicht für Phase-4-Refactorings nutzen. Lieber neue Sitzung als ein halb erinnertes `ExerciseManager.tsx`.
3. **Das Modell hoch, wenn eine Aufgabe kippt.** Wenn Haiku beim CSV-Export dreimal danebenliegt, ist die Aufgabe nicht so eng umrissen wie gedacht — hochstufen statt nachbessern.

---

## 11. Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| `JWT_SECRET` auf fly nicht gesetzt | App signiert mit `'dev-secret'` → Admin-Token fälschbar | Fail-fast, Phase 2, zuerst |
| Rolle nur im Token | Degradierter Admin bleibt 30 Tage Admin, gelöschter Nutzer behält Zugang | DB-Lookup in `requireAuth`, Phase 2 |
| Offene Registrierung auf öffentlicher URL | Fremde legen Konten an, lesen den Katalog | `ALLOW_REGISTRATION=off`, Phase 2 |
| Einziger Admin degradiert sich | Adminfunktionen gesperrt, nur per SQL lösbar | Letzter-Admin-Schutz, Phase 2 |
| Nutzerlöschung kaskadiert | Trainingshistorie unwiederbringlich weg | Deaktivieren als Standard + Export, Phase 2 |
| Zweite Machine bei `MEDIA_DRIVER=local` | Bilder mal da, mal nicht | Nicht skalieren bis Phase 5; im README festhalten |
| Neon in anderer Region als fly | Jede Query +100 ms — mit dem Auth-Lookup pro Request doppelt bitter | Region vor dem Deploy angleichen |
| Render-Altbestand an Medien schon weg | Fotos müssen neu hoch | `mediaDoctor --report`, dann Bulk-Upload |
| `overwrite` über mehrere Chunks | Fotos löschen sich gegenseitig | Nur Chunk 1, mit Test abgesichert |
| Sync-PK-Kollision zwischen Nutzern | Kompletter Sync eines Nutzers schlägt dauerhaft fehl | `ON CONFLICT DO NOTHING`, Phase 2 |
| `jsonb`-Migration bei großer Tabelle | kurzer Table-Lock | Bei aktueller Größe unkritisch |

> **Kosten:** fly.io hat sein Free-Tier-Modell seit Ende 2024 umgestellt. `shared-cpu-1x`/512 MB mit `min_machines_running = 0` plus 3 GB Volume ist der günstigste sinnvolle Zuschnitt — die tatsächlichen Preise bitte im fly-Dashboard prüfen, bevor du dich festlegst. Neon und R2 bleiben in ihren Free-Tiers.
