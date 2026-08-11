# Plan: Vom Übungskatalog zum Trainings-Tracker

Stand: 2026-08-11 · Basis: § 6 Phase 3

Deckt **Priorität 1 vollständig**, **Priorität 2 ohne Wearables und Health-Integration**
sowie aus Priorität 3 **Analytics, Muskel-Erholungs-Heatmap und Hantelscheibenrechner** ab.

| Abschnitt | Stand |
|---|---|
| Quick-Wins (Auto-Sync, Vorwerte, Touch-Ziele, Plattenrechner) | ✅ `7af82ea` |
| § 3 Testbarkeit | ✅ `6be3f4a` |
| § 4 Phase 1 — Satz-Ausführung, Pausentimer, Einheiten | ✅ `e37e61e` |
| § 5 Phase 2 — Sync-Härtung | ✅ `c383095` |
| § 6 Phase 3 — Komplexe Methoden | ✅ (dieser Commit) |
| § 7–§ 11 | offen |

---

## 1. Ausgangslage

Was steht, ist die Infrastruktur: PWA mit Service Worker, IndexedDB als primärer
Speicher, ein funktionierendes Sync-Protokoll (Last-Write-Wins über `updatedAt`,
Tombstones für Löschungen), Auth mit Rollen, Medien-Pipeline, Deployment.

Was fehlt, ist der Trainings-Domänenkern. Konkret sind es **drei Modell-Lücken**,
an denen fast alle offenen Anforderungen hängen:

| Lücke | Blockiert |
|---|---|
| Ein Satz kennt nur `reps` und `weight` | Abhaken, Pausentimer, Auto-Scroll, Warm-up/Drop/RPE, ehrliche Statistik, verlustfreier Export |
| Es gibt keine Routine/Template-Entität | Vordefinierte Alternativen, Desktop-Planung, Periodisierung |
| Übungen kennen nur eine grobe `category` | Muskel-Erholungs-Heatmap |

Deshalb ist dieser Plan nicht nach Prioritätsliste sortiert, sondern nach
Abhängigkeit. Jede Phase ist für sich ausrollbar und liefert etwas Sichtbares.

### 1.1 Ausdrücklich nicht im Scope

- **Smartwatch-Apps** (Apple Watch, WearOS) — Priorität 2, bewusst ausgelassen.
- **Apple Health / Health Connect** — Priorität 2, bewusst ausgelassen.
- **Native iOS/Android-Apps** — es bleibt bei der PWA.

Was das kostet, damit es später keine Überraschung ist:

> **Ein Pausentimer, der bei ausgeschaltetem Display zuverlässig alarmiert, ist
> aus einer PWA nicht erreichbar.** Kein Web-API plant eine lokale Benachrichtigung
> zu einem künftigen Zeitpunkt (Notification Triggers wurde nie ausgeliefert), und
> Hintergrund-Timer werden von beiden Plattformen gedrosselt. § 4 beschreibt, wie
> weit es ohne nativen Code geht — und das ist nah dran, aber nicht identisch.

> **`navigator.vibrate()` gibt es in Safari/iOS nicht.** Auf dem iPhone bleiben Ton
> und Bildschirm als Signal. Kein Workaround, das ist eine Plattformentscheidung
> von Apple.

> **Körpergewicht muss von Hand kommen.** Ohne Health-Anbindung gibt es keinen
> automatischen Import — für die relative Kraft (§ 9) ist das ein Eingabefeld.

---

## 2. Zielbild des Datenmodells

Alles Neue folgt der Regel, die sich bei `workouts.entries` bereits bewährt hat:
**strukturierte Daten als `jsonb`, eine Zeile pro synchronisierbarem Objekt,
Felder additiv und optional.** Damit bleibt jede Erweiterung migrationsarm und
alte Clients brechen nicht.

```
users ──┬── workouts        (bestehend, erweitert)   ← protokollierte Sätze
        ├── routines        (neu)                    ← Trainingspläne (Vorlage)
        └── body_weights    (neu)                    ← manuelle Gewichtseinträge
  └─ unit_preference, sex   (neu, am Konto)          ← Anzeige + relative Kraft

exercises (bestehend, erweitert um Muskelgruppen)
```

### 2.1 Satz und Eintrag

```ts
type SetType = 'warmup' | 'working' | 'drop';

interface WorkoutSet {
  reps: number;
  /** IMMER Kilogramm, unabhängig von der Anzeigeeinheit (§ 2.5). */
  weight?: number;
  /** Default beim Lesen: 'working'. Alte Zeilen haben das Feld nicht. */
  type?: SetType;
  /** Abgehakt. Default beim Lesen: true — historische Sätze wurden ausgeführt. */
  done?: boolean;
  /** Zeitpunkt des Abhakens; Grundlage für den Pausentimer und die Satzdauer. */
  completedAt?: number;
  /** Gefühlte Anstrengung, 5–10 in 0,5-Schritten. */
  rpe?: number;
}

interface WorkoutEntry {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  sets: WorkoutSet[];
  /** Supersatz: Einträge mit gleicher groupId werden als Einheit geklammert. */
  groupId?: string;
  /** Aus welcher Plan-Übung dieser Eintrag entstand — auch nach einem Wechsel. */
  plannedExerciseId?: string;
}
```

Zwei Entscheidungen, die nicht offensichtlich sind:

**Supersätze über `groupId`, nicht über Verschachtelung.** Eine verschachtelte
Struktur (`groups[].entries[].sets[]`) wäre sauberer zu lesen, würde aber jeden
bestehenden Leser brechen — Backend-Validierung, Export, Statistik, Historie,
`relinkWorkoutEntries.js`. Ein flaches Array mit optionaler Gruppen-ID bleibt
abwärtskompatibel und die Klammerung ist reine Darstellung.

**Dropsätze sind ein Satz-Typ, keine eigene Struktur.** Ein Dropsatz ist
definitionsgemäß der Satz direkt nach einem Arbeitssatz, mit weniger Gewicht und
ohne Pause. `type: 'drop'` genügt: die UI hängt ihn optisch an den Vorgänger, und
der Pausentimer startet nach ihm bewusst *nicht* (§ 4.2).

`type` trägt außerdem die Statistik: Aufwärmsätze dürfen nicht ins Volumen und
nicht in die 1RM-Schätzung (§ 9). Ohne dieses Feld ist jede Auswertung falsch.

### 2.2 Routinen

```ts
interface RoutineExercise {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  /** Plan B, Plan C — in dieser Reihenfolge. */
  alternatives: { exerciseId: string; exerciseRef?: number; exerciseName: string }[];
  targetSets: number;
  targetReps?: string;      // "8-12", "5", "AMRAP" — Text, nicht Zahl
  targetWeight?: number;
  targetRpe?: number;
  groupId?: string;         // Supersatz bereits im Plan
  notes?: string;
}

interface RoutineDay { id: string; name: string; exercises: RoutineExercise[]; }
interface RoutineWeek { id: string; name?: string; days: RoutineDay[]; }

interface Routine {
  id: string;
  name: string;
  description?: string;
  weeks: RoutineWeek[];     // Periodisierung: mehrere Wochen, je eigene Vorgaben
  updatedAt: number;
}
```

`targetReps` ist **Text**, weil reale Pläne „8–12" oder „AMRAP" sagen. Eine Zahl
zu erzwingen würde die Vorlage ärmer machen als den Zettel, den sie ersetzt.

### 2.3 Der Kern der Anforderung „Basis-Template nicht überschreiben"

Ein Training entsteht durch **Kopie**, nicht durch Referenz:

```
Routine (Vorlage)  ──instanziieren──▶  WorkoutSession (Kopie)
   RoutineExercise                        WorkoutEntry
     alternatives[]        ──Wechsel──▶     exerciseId := alternative.exerciseId
                                            plannedExerciseId := original
```

Die Session hält `routineId`, `weekIndex`, `dayId`. Ein Wechsel auf Plan B ändert
ausschließlich die Kopie. Damit ist die Anforderung nicht durch Disziplin erfüllt,
sondern strukturell: es gibt keinen Schreibpfad von der Session zurück in die
Routine. `plannedExerciseId` bleibt erhalten, damit die Statistik später weiß,
dass die Kniebeuge-Alternative an der Stelle der Kniebeuge stand.

### 2.4 Muskelgruppen an den Übungen

```sql
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS muscles_primary   JSONB NOT NULL DEFAULT '[]';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS muscles_secondary JSONB NOT NULL DEFAULT '[]';
```

Feste Werteliste (~16 Gruppen, passend zur Körperkarte in § 10):
`chest · lats · traps · lower_back · front_delts · side_delts · rear_delts ·
biceps · triceps · forearms · abs · obliques · glutes · quads · hamstrings ·
calves`.

> **Der teure Teil hier ist nicht der Code, sondern die Daten.** Ein Katalog mit
> mehreren hundert Übungen muss zugeordnet werden. Der Plan sieht deshalb drei
> Wege vor: ein Backfill, der aus der bestehenden `category` eine plausible
> Primärgruppe setzt, zwei zusätzliche CSV-Spalten für Massenpflege im
> Tabellenprogramm, und Felder im Admin-Formular. Ohne diese Daten bleibt die
> Heatmap leer — das ist die reale Vorbedingung von § 10, nicht das Rendering.

### 2.5 Einheiten und Profil — umgesetzt in § 4

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_preference TEXT NOT NULL DEFAULT 'kg'
  CHECK (unit_preference IN ('kg','lb'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS sex TEXT
  CHECK (sex IS NULL OR sex IN ('male','female'));
```

**Kilogramm sind kanonisch.** Gespeichert, synchronisiert und exportiert wird
ausschließlich kg; Pfund existieren nur an der Grenze, an der ein Wert angezeigt
oder getippt wird (`frontend/src/lib/units.ts`). Eine Präferenz, die sich ändern
kann, darf niemals umdeuten können, was bereits geschrieben wurde.

Beide Felder hängen am **Konto, nicht am Gerät** — anders als Theme und Sprache,
die in `localStorage` liegen. Die Einheit beschreibt, wie jemand trainiert, nicht
wo er gerade sitzt; zwei Geräte desselben Kontos dürfen sich nicht darüber
uneinig sein, was „60" bedeutet. Geschrieben wird über `PATCH /api/auth/me`,
lokal gecacht, damit ein Offline-Start die richtige Einheit kennt.

`sex` ist bewusst nullable und optional: es existiert nur, um für Wilks/DOTS
(§ 10) den Koeffizientensatz zu wählen, und niemand muss es beantworten, um die
App zu benutzen. Es bleibt aus der Admin-Benutzerliste heraus — ein Admin hat
keinen Grund, es an fremden Konten zu lesen.

---

## 3. Vorarbeit: Testbarkeit — ✅ erledigt (`6be3f4a`)

Das Frontend hatte **keinen Test-Runner**. Ab hier entsteht Logik, die man nicht
durch Hinsehen prüft: Timer-Arithmetik, 1RM-Formeln, Volumenaggregation,
Export-Round-Trip, Erholungs-Decay, Einheitenumrechnung, Plattenmathematik.

- ✅ `vitest` + `@testing-library/react` + `jsdom` im Frontend, eigene
  `vitest.config.ts` — damit Testläufe den VitePWA-Service-Worker-Build nicht
  mitziehen, dieselbe Trennung wie im Backend
- ✅ `npm test` in `frontend/`
- ✅ Rückwirkend: Unit-Tests für `lib/plates.ts`

Stand nach § 4: **74 Frontend-Tests** (plates, units, restTimer), 169 im Backend.

---

## 4. Phase 1 — Satz-Ausführung, Pausentimer, Einheiten — ✅ erledigt (`e37e61e`)

*Erfüllt: P1 „Gym-UI" (Rest), P1 „Historischer Kontext & Pausentimer" (Rest),
sowie die Einheiten-Entscheidung aus § 15.6*

Die Phase mit dem höchsten Alltagswert. Danach ist die App im Studio benutzbar.

Was im Browser nachgewiesen wurde: Fokus springt beim Abhaken auf den nächsten
offenen Satz (Satz 1 → „Satz 2 — Wdh."), der Timer steht nach einem vollständigen
Seiten-Reload mitten in der Pause bei 1:06 statt neu bei 1:30 (90 s minus 24 s
tatsächlich vergangener Zeit), 82,5 kg gespeichert erscheinen als 181.88 lb, und
der Stepper springt in Pfund um 5 statt um 2,5.

### 4.1 Abhaken und Auto-Scroll

- Pro Satzzeile ein **Häkchen-Ziel über die volle Zeilenhöhe** (mindestens 56 px),
  rechts neben Gewicht. Abhaken setzt `done: true` und `completedAt`.
- Ein abgehakter Satz wird optisch zurückgenommen (gedämpft, Häkchen gefüllt) —
  der Blick soll auf dem nächsten offenen Satz landen.
- **Auto-Scroll**: beim Abhaken bekommt das erste Feld des nächsten offenen Satzes
  den Fokus, die Zeile wird mit `scrollIntoView({ block: 'center' })` mittig
  gezogen. Der Fokuswechsel auf ein Feld mit Ziffern-Tastatur hält diese offen —
  gewollt.
- Bei Supersätzen (Phase 3) läuft die Reihenfolge A1 → B1 → A2 → B2.
- **Stepper `−` / `+`** an beiden Feldern (Wdh. ±1, Gewicht ±2,5 kg bzw. ±5 lb,
  langes Drücken beschleunigt). Tippen auf einer Zifferntastatur ist die
  schlechteste Eingabeart unter Belastung; die Platzhalter aus der letzten Sitzung
  plus zwei Stepper-Taps decken den Normalfall ab.

> **Korrektur gegenüber der ersten Fassung dieses Plans.** Hier stand
> `input[type=number]`. Das ist beim Bauen durchgefallen: ein Number-Input
> verwirft bei jedem Tastendruck einen abschließenden Dezimaltrenner, `"62,"`
> kann also nie zu `"62,5"` werden — und das Komma ist der Trenner auf jeder
> deutschen Ziffern-Tastatur. Die Felder sind jetzt `type="text"` mit
> `inputMode="decimal"`; der Rohtext bleibt während der Eingabe stehen und wird
> **einmal** beim Speichern geparst (`DraftSet` in `Workout.tsx`). Damit fallen
> Dezimaltrenner, Locale-Komma und die kg/lb-Umrechnung in eine Lösung zusammen.

### 4.2 Pausentimer

- Startet automatisch beim Abhaken eines Satzes mit `type !== 'drop'`.
  Dropsätze starten ihn nicht — das ist ihre Definition.
- Dauer pro Übung im Plan hinterlegbar (Phase 4), sonst globaler Default aus den
  Einstellungen (90 s), im laufenden Training mit ± 15 s korrigierbar.
- **Zeitstempel-basiert, nicht tick-basiert**: gespeichert wird `restStartedAt` und
  `restSeconds`; die Anzeige rechnet gegen `Date.now()`. Ein gedrosseltes oder
  ausgesetztes Intervall verschiebt damit nichts, und ein Reload mitten in der
  Pause findet den Timer korrekt wieder (Ablage in IndexedDB).
- Anzeige als schmale, fixierte Leiste über der Bottom-Nav — sichtbar, ohne die
  Satzliste zu verdecken.
- **Alarm**: Ton (WebAudio, beim Abhaken entsperrt — der Tap ist die nötige
  Nutzergeste) + `navigator.vibrate()` wo vorhanden + deutliche visuelle Änderung.
- **Wake Lock API** während der Pause, damit das Display an bleibt und der Alarm
  überhaupt eine Chance hat. Abschaltbar in den Einstellungen.
- Ehrlicher Hinweis in den Einstellungen, was bei gesperrtem Display passiert —
  nämlich nichts Zuverlässiges. Lieber vorher sagen als im Studio erleben.

### 4.3 Modell und Backend

- `WorkoutSet` um `type`, `done`, `completedAt`, `rpe` erweitern (§ 2.1)
- `isValidEntries()` in `backend/src/routes/workouts.js` erweitert prüfen: neue
  Felder optional, aber bei falschem Typ **abweisen statt speichern** — dieselbe
  Linie wie bei `exerciseRef`
- Leseseitig Defaults (`type ?? 'working'`, `done ?? true`), damit alte Sitzungen
  in Statistik und Export korrekt landen

### 4.4 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| `PATCH /api/users/me` | `PATCH /api/auth/me` | `users.js` ist durchgehend Admin-only; `auth.js` hat bereits `GET /me` mit dem passenden Serializer. Eine Selbstbedienungs-Route in einen Admin-Router zu legen, hätte die Reihenfolge gegenüber `/:id`-Routen zu einer stillen Falle gemacht. |
| `input[type=number]` | `type="text"` + `inputMode="decimal"` | s. Kasten in § 4.1 — Dezimalkomma. |
| `requestAnimationFrame` für den Fokus-Sprung | `useEffect` nach dem Commit | rAF ist in einem verborgenen Dokument ausgesetzt; der Sprung wäre dort still ausgefallen. Gebraucht wird ohnehin „nachdem React die Zeile gerendert hat", und genau dann läuft ein Effekt. Beim Verifizieren aufgefallen. |

**Aufwand: L** (3–4 Tage) · **Offen geblieben:** Wake Lock und Audio-Entsperrung
sind nur im Desktop-Browser geprüft — der iOS-Test steht noch aus. Ebenso die
Drop-Satz-Ausnahme beim Timer: der Pfad ist gebaut (`type !== 'drop'`), aber erst
mit dem Satz-Typ-Schalter aus § 6 überhaupt erreichbar.

---

## 5. Phase 2 — Sync-Härtung — ✅ erledigt (`c383095`)

*Erfüllt: P1 „Offline-First" (Rest)*

Geplant war Sparsamkeit und Sichtbarkeit. Beim Lesen des bestehenden `sync()`
kamen **drei Wege dazu, ein Training zu verlieren** — alle drei nur, wenn während
eines laufenden Requests weitertrainiert wird, was auf Studio-WLAN der Normalfall
ist. Sie sind der eigentliche Inhalt dieser Phase geworden.

| Fenster | Was passierte | Behoben durch |
|---|---|---|
| Sitzungsliste aus dem Closure | `persist(merged)` schrieb den Stand von *vor* dem Request zurück; ein währenddessen gespeichertes Training war aus IndexedDB überschrieben, nicht bloß ungesynct | Jeder Lesevorgang frisch aus dem Speicher, vor dem Senden **und** nach der Antwort |
| Server-Echo gewann bedingungslos | Der Server schickt jede Zeile zurück, die er für neuer hält — auch die eben gepushte. Eine Bearbeitung dazwischen wurde vom eigenen, älteren Upload überschrieben | Last-Write-Wins auch clientseitig (`mergeSynced`) |
| Löschwarteschlange pauschal geleert | Eine Löschung während des Requests fiel aus der Queue, ohne gesendet worden zu sein: lokal weg, auf dem Server am Leben, beim nächsten Pull zurück | Beide Warteschlangen per Snapshot leeren (`remainingDirty` / `remainingDeletes`) |

Die Arithmetik liegt als reine Funktionen in `frontend/src/lib/syncMerge.ts`
(22 Testfälle). Zusätzlich entfernt ein Remote-Delete keine Sitzung mehr, die noch
ungepushte lokale Änderungen trägt.

Der geplante Teil:

- ✅ **Inkrementeller Push** über `jt_workouts_dirty:<userId>`. Ein sauberer Stand
  sendet 56 Bytes statt der kompletten Historie.
- ✅ **Migration mitgedacht:** ein Gerät, das in diesen Build aktualisiert, hat
  Sitzungen und *keine* Warteschlange. „Fehlt" als „leer" zu lesen hätte bedeutet,
  dass offline Protokolliertes nie wieder gepusht wird — `seedDirtyQueue`
  unterscheidet die beiden Fälle.
- ✅ **`visibilitychange`** als dritter Auslöser. In der Praxis der wichtigste:
  Telefone werden öfter entsperrt, als sie eine Offline/Online-Grenze überqueren.
- ✅ **Abzeichen „n Änderungen warten"** statt eines Zeitstempels, der gleich
  aussieht, ob nichts anliegt oder ein ganzes Training wartet.
- ✅ Kein Background-Sync-API, wie geplant.

> **Offen geblieben: `createSyncedCollection<T>()`.** Geteilt ist bisher die
> riskante Hälfte — Merge- und Queue-Arithmetik in `syncMerge.ts`. Der Rest wäre
> IndexedDB-Schlüssel und React-State-Verdrahtung, und dafür gibt es genau einen
> Aufrufer. Die Abstraktion entsteht besser mit dem zweiten (§ 7, Routinen), wenn
> sichtbar ist, was beide wirklich teilen, statt jetzt gegen einen einzigen Fall
> geraten zu werden. **Damit ist § 7 nicht mehr durch § 5 vorentlastet** — der
> Punkt wandert dorthin.

---

## 6. Phase 3 — Komplexe Trainingsmethoden — ✅ erledigt

*Erfüllt: P2 „Logik für komplexe Trainingsmethoden"*

Modell stand bereits aus Phase 1 (`type`, `rpe` auf `WorkoutSet`); diese Phase hat
`groupId`/`plannedExerciseId` auf `WorkoutEntry` ergänzt und die Bedienung gebaut.

- **Satz-Typ** pro Zeile umschaltbar: Warm-up (W), Arbeitssatz (•), Drop (↓),
  ersetzt die reine Satznummer. Aufwärmsätze werden gedämpft dargestellt
  (`opacity-55`, wie abgehakte Sätze) und sind aus dem Satz-Summen-Zähler in der
  Historie ausgenommen (`setType(set) !== 'warmup'`).
- **RPE** als optionales drittes Feld, per Einstellung in den Settings
  ein-/ausblendbar (`useRpeVisibility`, gerätelokal wie der Wake-Lock-Schalter —
  keine Kontoeinstellung, dafür ist es zu sehr Geschmackssache). Eingabe über
  eine Tap-Reihe 5 · 6 · 7 · 7,5 · 8 · 8,5 · 9 · 9,5 · 10 statt Tastatur.
- **Supersätze**: Checkbox pro Übungskarte, „Als Supersatz klammern" ab zwei
  Auswahlen. Darstellung als eine Karte mit Akzentlinie links und Buchstaben
  A/B/C; „Auflösen" jederzeit. Auto-Scroll und Pausentimer respektieren die
  Klammerung: die Traversierung läuft A1 → B1 → A2 → B2 (`buildAutoScrollOrder`
  in `lib/supersets.ts`), und nur das *letzte* Mitglied der Gruppe startet den
  Pausentimer (`isLastGroupMember`) — der Sinn eines Supersatzes ist ja gerade,
  zwischen den eigenen Übungen nicht zu pausieren, sondern erst nach der Runde.
  Die gesamte Gruppierungs-Arithmetik liegt als reine, getestete Funktionen in
  `lib/supersets.ts` (20 Testfälle): Buchstabenvergabe, Traversierung,
  Gruppieren/Auflösen, Render-Blöcke für nicht-zusammenhängende Mitglieder.
- Backend (`isValidEntries`) validiert `groupId`/`plannedExerciseId` als
  optionale Strings, gleiche Linie wie die übrigen additiven Felder.

### 6.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| Segment-Schalter mit drei sichtbaren Optionen | Ein Button, der bei Tap durch working → warmup → drop zyklt | Drei gleichzeitige 44-px-Ziele passen bei 320 px nicht neben Wdh. und Gewicht in dieselbe Zeile, ohne selbst unter 44 px zu fallen. Ein zyklischer Button bleibt ein einzelnes volles Ziel. Bei 320 px geprüft (s. u.). |
| RPE-Auswahlreihe mit ≥ 44-px-Zielen | Chips zu 32 px (`min-h-8`), die bei Bedarf umbrechen | Neun Werte zu je 44 px sind bei 320 px Kartenbreite nicht darstellbar (9 × 44 px > verfügbare Breite). Bewusste Ausnahme von der 44-px-Regel für dieses sekundäre, optionale Feld; die Reihe bricht lieber um, als Ziele weiter zu schrumpfen. |
| — | Historie: Satz-Summe zählt Aufwärmsätze nicht mit | Nicht explizit in der Task-Liste, aber direkte Konsequenz von „aus Summen ausgenommen" — die Historie war die einzige bestehende Stelle, die Sätze aufsummiert; „echte" Statistik kommt erst mit § 10. |

**320-px-Prüfung:** Der Browser-Vorschau-Tab dieser Session hat eine Mindestbreite
von ca. 389 px und lässt sich nicht unter dieses Maß verkleinern. Geprüft wurde
stattdessen, indem der App-Wrapper per `element.style.width` direkt auf 320 px
gesetzt und Grid-/Flex-Überlauf gemessen wurde (`scrollWidth` vs. `clientWidth`)
— das prüft dieselbe Layout-Mathematik wie eine echte 320-px-Anzeige, nur ohne
den Viewport selbst zu verkleinern. Ergebnis: Satzzeile 254/254 px (kein
Überlauf), RPE-Reihe bricht um, kein horizontales Scrollen.

**Aufwand: M–L** (2–3 Tage), wie geplant.

---

## 7. Phase 4 — Routinen und vordefinierte Alternativen

*Erfüllt: P1 „Vordefinierte Übungs-Alternativen"*

Die größte Einzelphase, weil sie eine neue Entität mitsamt Sync, Offline-Pfad und
zwei Oberflächen einführt.

### 7.1 Backend

- **Zuerst:** `createSyncedCollection<T>()` aus § 5 nachziehen. Der Punkt wurde
  dort bewusst zurückgestellt, weil es nur einen Aufrufer gab; hier gibt es zwei,
  und erst daran wird sichtbar, was Workouts und Routinen wirklich teilen.
  `lib/syncMerge.ts` liefert die riskante Hälfte bereits fertig und getestet.
- Tabelle `routines` (id, user_id, name, description, `weeks` jsonb, created_at,
  updated_at, deleted_at) analog zu `workouts`
- `POST /api/routines/sync` — dasselbe Protokoll, dieselbe Validierungsstrenge
- Validierung: Alternativen müssen auf existierende Übungen zeigen; ungültige
  Einträge abweisen, nicht stillschweigend leeren

### 7.2 Mobil

- Neuer Reiter **Pläne**: Liste der Routinen, pro Routine die Wochen/Tage
- „Training starten" instanziiert Tag → Session (§ 2.3), mit vorbelegten
  Sätzen, Zielwiederholungen als Platzhalter und den Vorwerten der letzten
  Sitzung darunter
- **Wechsel auf Plan B/C**: Wischen nach links auf der Übungskarte tauscht direkt
  auf die erste Alternative, langes Drücken oder Tippen auf den Namen öffnet die
  Auswahl aller hinterlegten Alternativen plus „andere Übung wählen".
  Ein Toast mit „Rückgängig" fängt Fehlwischer ab.
- Gewischt wird mit Pointer-Events und einer Schwelle von ~25 % der Kartenbreite;
  keine zusätzliche Bibliothek, und die Aktion bleibt per Tap erreichbar, damit
  sie nicht nur für Wischkundige existiert.
- Die Vorlage bleibt unangetastet — sichtbar gemacht durch einen Hinweis „nur für
  dieses Training" beim ersten Wechsel.

### 7.3 Offline

Routinen werden wie Übungen gecacht und wie Workouts synchronisiert. Ein Plan,
den man im Studio nicht öffnen kann, ist wertlos.

**Aufwand: XL** (5–7 Tage)

---

## 8. Phase 5 — Desktop-Planer

*Erfüllt: P2 „Nahtlose Web-App / Desktop-Version"*

- Eigene Route `/plan`, die aus dem `max-w-md`-Korsett der Mobilansicht ausbricht:
  dreispaltig — Übungskatalog links, Wochen/Tage-Raster in der Mitte,
  Detailfeld für die ausgewählte Übung rechts (Sätze, Zielwerte, Pausendauer,
  Alternativen).
- **Drag & Drop**: Übungen aus dem Katalog ins Raster ziehen, Übungen zwischen
  Tagen verschieben, Tage zwischen Wochen kopieren, Reihenfolge sortieren.
  Alternativen werden per Drop auf die Übungskarte hinterlegt.
- **Neue Abhängigkeit: `@dnd-kit/core` + `@dnd-kit/sortable`** (~12 kB gzip).
  Das im Admin bereits genutzte HTML5-Drag-and-Drop reicht für eine Bildergalerie,
  aber nicht für verschachteltes Sortieren — und es funktioniert auf Touch nicht.
  dnd-kit kann beides und ist tastaturbedienbar.
- **Periodisierung**: Wochen duplizieren mit prozentualer Steigerung
  („alle Zielgewichte +2,5 %"), damit ein 8-Wochen-Block nicht achtmal von Hand
  entsteht.
- **„Live"-Sync zum Handy**: Sync bei `visibilitychange`, nach jeder Planänderung
  (entprellt, 2 s) und beim Öffnen des Plan-Reiters am Handy. Das ist kein Push —
  echte Live-Übertragung bräuchte SSE oder WebSocket am Backend. Praktisch heißt
  das: Änderung am Desktop, Handy hochheben, Plan ist da. Ein SSE-Endpunkt bleibt
  als spätere Option offen, wenn sich das als zu träge anfühlt.

**Aufwand: L–XL** (4–6 Tage)

---

## 9. Phase 6 — Verlustfreier Export und Import

*Erfüllt: P1 „Verlustfreier Datenexport"*

- **Eigenes, dokumentiertes Schema** `justtally-export/v1` — entschieden, s. § 15.1.
  Das Vertrauensversprechen entsteht durch ein **dokumentiertes Format mit
  verlustfreiem Round-Trip**, nicht durch den Namen darauf.
- Selbstständig lesbar: die Datei enthält die referenzierten Übungen mit,
  damit sie ohne diese Installation auswertbar bleibt.
- Gewichte sind im Export **immer kg** (kanonisch, s. § 15.6); `displayUnit` am
  Root ist rein informativ und beeinflusst keinen gespeicherten Wert.

```json
{
  "format": "justtally-export/v1",
  "exportedAt": 1786500000000,
  "displayUnit": "kg",
  "exercises": [{ "id": "…", "ref": 42, "name": "Bankdrücken",
                  "musclesPrimary": ["chest"], "musclesSecondary": ["triceps"] }],
  "routines": [ /* vollständig, inkl. alternatives */ ],
  "bodyWeights": [{ "date": 1786000000000, "kg": 82.4 }],
  "sessions": [{
    "id": "…", "startedAt": 1786400000000, "durationMin": 74, "title": "Push A",
    "routineId": "…", "entries": [{
      "exerciseId": "…", "exerciseRef": 42, "exerciseName": "Bankdrücken",
      "groupId": "sg1", "plannedExerciseId": "…",
      "sets": [
        { "reps": 10, "weight": 40,   "type": "warmup",  "done": true },
        { "reps": 8,  "weight": 80,   "type": "working", "done": true, "rpe": 8 },
        { "reps": 6,  "weight": 62.5, "type": "drop",    "done": true }
      ]
    }]
  }]
}
```

- **Export läuft im Client** aus IndexedDB — funktioniert damit auch offline, was
  für ein Feature, dessen Zweck Unabhängigkeit ist, die richtige Bauform ist.
  Zusätzlich ein Server-Endpunkt für den vollständigen Kontoexport.
- **Import mit Round-Trip-Test**: `import(export(x)) === x` als Testfall über einen
  Datensatz, der Dropsätze, Supersätze, RPE und Alternativen enthält. Ohne diesen
  Test ist „verlustfrei" eine Behauptung.
- Zusätzlich ein flacher CSV-Export für Tabellenkalkulation — ausdrücklich als
  verlustbehaftete Bequemlichkeit gekennzeichnet.

**Aufwand: M** (2 Tage) · Muss nach Phase 1, 3 und 4 liegen, sonst beschreibt das
Format nur die Hälfte.

---

## 10. Phase 7 — Analytics

*Erfüllt: P3 „Tiefgreifende Post-Workout-Analytics"*

Rechnet vollständig im Client aus den ohnehin lokalen Daten: kein Backend-Aufwand,
funktioniert offline, keine zusätzliche Latenz.

- `lib/analytics/` mit reinen, getesteten Funktionen:
  - **Volumen** = Σ (Wdh. × Gewicht) über Arbeits- und Dropsätze. Aufwärmsätze
    zählen nicht — dafür existiert `type`.
  - **e1RM (Epley)**: `w × (1 + r/30)`, je Übung der beste Satz der Sitzung.
    Oberhalb von ~12 Wiederholungen wird die Formel unzuverlässig; die App zeigt
    den Wert dann mit Vorbehalt statt so zu tun, als sei er eine Messung.
  - **Rekorde** je Übung: höchstes Gewicht, höchstes e1RM, höchstes Satzvolumen,
    jeweils mit Datum. PR-Hinweis direkt nach dem Speichern.
  - **Verlauf** je Übung: e1RM und Volumen über die Zeit.
- **Körpergewicht**: neue Kollektion `body_weights` (manuelle Eingabe, § 1.1),
  Verlaufskurve, Grundlage für relative Kraft.
- **Wilks / DOTS**: geschlechtsspezifische Koeffizienten, deshalb ein *optionales*
  Profilfeld. Mit klarer Einordnung in der UI — beide Formeln sind für den
  Wettkampf-Dreikampf-Total gedacht; auf eine Einzelübung angewandt sind sie eine
  Näherung zum Vergleich mit sich selbst, kein Ligawert.
- **Diagramme als handgeschriebenes SVG**, keine Chart-Bibliothek. Die
  Darstellungen sind einfach (Linie, Balken, Punkte), die Icons im Projekt sind
  ebenfalls handgeschrieben, und eine Bibliothek würde das Bundle für zwei
  Diagrammtypen um ein Vielfaches der eigenen Lösung vergrößern — bei einem
  Bundle-Budget von 300 kB für App-Seiten ein schlechter Tausch.

**Aufwand: L** (3–4 Tage)

---

## 11. Phase 8 — Muskel-Erholungs-Heatmap

*Erfüllt: P3 „Muskel-Erholungs-Heatmaps"*

1. **Taxonomie und Daten** (§ 2.4): Migration, Backfill aus `category`, zwei neue
   CSV-Spalten in Im- und Export, Felder im Admin-Formular. **Das ist der
   Löwenanteil und teils Datenpflege, nicht Programmierung.**
2. **Belastungsmodell**: pro Muskel die Summe aus Arbeitssatz-Volumen, primär
   gewichtet 1,0, sekundär 0,5, abklingend über ein muskelabhängiges
   Erholungsfenster (große Gruppen 72 h, kleine 48 h). Ergebnis je Muskel: ein
   Wert zwischen 0 (erholt) und 1 (frisch stark belastet).
3. **Körperkarte**: SVG in Vorder- und Rückansicht, ein `<path>` je Muskelgruppe,
   Füllung aus dem Wert. Farbskala mit dem bestehenden Token-System, in beiden
   Themes geprüft, und **nicht allein über Farbe kodiert** — Tippen auf eine
   Gruppe zeigt Zahl und Zeitpunkt der letzten Belastung, damit die Karte auch
   bei Farbfehlsichtigkeit funktioniert.
4. Hinweis in der UI, dass dies eine Volumenbuchhaltung ist und keine
   physiologische Messung.

> **Offene Beschaffung:** die Körperkarte braucht ein SVG mit sauber getrennten
> Muskelpfaden. Entweder selbst gezeichnet (Aufwand) oder eine Vorlage mit
> passender Lizenz (Prüfung nötig — keine Grafik ohne geklärte Lizenz ins Repo).

**Aufwand: L** (3–4 Tage, davon ein spürbarer Anteil Datenpflege)

---

## 12. Hantelscheibenrechner — erledigt

*Erfüllt: P3 „Integrierter Hantelscheibenrechner"*

Steht (`lib/plates.ts`, `components/PlateCalculator.tsx`): pro Seite
aufgeschlüsselt, maßstäbliche Scheibendarstellung, Rest-Warnung bei nicht
darstellbaren Gewichten, Rechnung in Ganzzahl-Hundertsteln.

Seit § 4 **einheiten-neutral**: metrisch 25/20/15/10/5/2,5/1,25 kg an Stangen
20/15/10/ohne, imperial 45/35/25/10/5/2,5 lb an 45/35/15/ohne. Gerechnet wird
**nativ in der Anzeigeeinheit**, nie durch Umrechnung eines metrischen Ergebnisses
— das Resultat muss auf Scheiben landen, die am Ständer wirklich hängen, und
20 kg sind nicht 45 lb. Die Farben sind metrisch die Wettkampfnorm; imperiale
Bumper-Farben sind zwischen Herstellern uneinheitlich und deshalb nur
indikativ — es identifiziert die Zahl auf der Scheibe, nicht die Farbe.

| Nachtrag | Stand |
|---|---|
| Unit-Tests für `computePlates` | ✅ § 3 (15 Fälle, metrisch + imperial, Rest, Rundung, leerer/negativer Scheibensatz) |
| Zielgewicht aus der Satzzeile übernehmen | ✅ § 4 (letztes gefülltes Gewicht der Übung, sonst der Vorwert) |
| Pfund-Einheiten (imperialer Scheiben-/Stangensatz) | ✅ § 4, s. § 15.6 |
| Zurückschreiben des gerechneten Gewichts in die Satzzeile | offen, klein |
| Eigener Scheibenbestand pro Studio (Anzahl je Größe) | später, optional |

---

## 13. Reihenfolge, Abhängigkeiten, Aufwand

```
§3  Testbarkeit         S    ✅ ──┐
§4  Satz + Timer        L    ✅ ◀─┘  (Modell für alles Weitere)
§5  Sync-Härtung        M    ✅ ◀── unabhängig
§6  Komplexe Methoden   M–L  ✅ ◀── braucht §4
§7  Routinen + Alt.     XL      ◀── braucht §4, §5
§8  Desktop-Planer      L–XL    ◀── braucht §7
§9  Export/Import       M       ◀── braucht §4, §6, §7
§10 Analytics           L       ◀── braucht §4 (Satz-Typen)
§11 Heatmap             L       ◀── braucht §10 + Datenpflege
```

Grobe Summe: **23–33 Arbeitstage**, davon rund 4 erledigt. Das ist eine
Größenordnung für die Planung, keine Zusage — die drei Posten mit der größten
Streuung sind der Desktop-Planer (Drag & Drop über verschachtelte Ebenen), die
Wischgeste in Phase 4 und die Datenpflege für die Heatmap.

Sinnvolle Auslieferungsschnitte:

| Release | Enthält | Nutzen |
|---|---|---|
| **A** | §3 ✅, §4 ✅, §5 ✅ | Die App ist im Studio wirklich benutzbar — **fertig** |
| **B** | §6 ✅, §7 | Trainieren nach Plan, Alternativen bei besetztem Gerät |
| **C** | §8, §9 | Planung am Desktop, Daten gehören dem Nutzer |
| **D** | §10, §11 | Auswertung und Erholungsübersicht |

---

## 14. Querschnittsregeln

- **Jede neue Kollektion bringt ihren Offline-Pfad mit.** Kein Feature gilt als
  fertig, solange es online-only ist — das ist die Kernanforderung der App, kein
  Zusatz.
- **Neue Felder sind optional, mit definiertem Lese-Default.** Ein Client mit
  altem Stand darf an neuen Daten nicht scheitern.
- **Das Backend weist ungültige Strukturen ab, statt sie zu speichern.** Bestehende
  Linie aus `isValidEntries`.
- **Gewichte immer kanonisch in kg** (§ 2.5) — Pfund nur an der Anzeige- und
  Eingabegrenze. Kein gespeicherter Wert darf von einer Einstellung abhängen.
- **Touch-Ziele ≥ 44 px** in allen Trainingsansichten, geprüft bei 320 px Breite.
- **Beide Themes** bei jeder neuen Oberfläche, Kontrast geprüft.
- **Reine Logik in `lib/` mit Tests** — Timer, Statistik, Export, Erholung,
  Platten. Oberflächen dürfen dünn bleiben.
- **Alle drei Sprachen** (de/en/es) bei jedem neuen Text; `TKey` erzwingt das
  ohnehin beim Typcheck.

---

## 15. Offene Fragen

> **Status 2026-08-11:** Fragen 1, 2, 3 und 6 sind entschieden — s. u. Der
> vollständige, mit diesen Entscheidungen durchgezogene Umsetzungsplan liegt in
> `C:\Users\maiks\.claude\plans\proud-cuddling-spring.md` (genehmigt), inklusive
> Modellwahl (Opus 5 / Sonnet 5 / Haiku 4.5) pro Phase. Dieses Dokument bleibt das
> ausführliche Hintergrunddokument; bei Widerspruch zwischen beiden gilt der
> genehmigte Plan.

1. ~~**Exportformat.**~~ **Entschieden:** kein etablierter Standard bestätigt →
   eigenes, dokumentiertes Schema `justtally-export/v1` (§ 9) mit Round-Trip-Test;
   CSV bleibt zusätzlich als bewusst verlustbehaftete Zugabe.
2. ~~**`@dnd-kit`**~~ **Entschieden:** wird eingesetzt (~12 kB gzip) — einzige
   neue Laufzeit-Abhängigkeit im Frontend, tastatur- und touch-fähig.
3. ~~**Geschlechtsangabe im Profil**~~ **Entschieden:** optionales Profilfeld.
   Ohne Angabe nur „Kraft pro Körpergewicht", mit Angabe zusätzlich Wilks/DOTS,
   jeweils mit Hinweis, dass die Formeln für den Wettkampf-Total gedacht sind.
4. **Körperkarten-SVG**: selbst zeichnen oder nach lizenzfreier Vorlage suchen?
   *Weiterhin offen* — Entscheidung fällt zu Beginn von § 11 / Phase 8.
5. **Muskelzuordnung des Bestandskatalogs**: reicht der Backfill aus `category`
   als Startpunkt, oder soll die Pflege gleich vollständig über CSV laufen?
   *Weiterhin offen.*
6. ~~**Einheiten**~~ **Entschieden:** kg + lb umschaltbar. kg bleibt intern
   kanonisch (Speicherung, Sync, Export); lb ist reine Anzeige-/Eingabeschicht
   pro Nutzerkonto (`unit_preference`, nicht gerätelokal). Der Plattenrechner
   bekommt einen zweiten, imperialen Scheiben-/Stangensatz und rechnet nativ in
   der gewählten Einheit statt über Umrechnung — die Mathematik muss auf echten
   Scheiben landen.
