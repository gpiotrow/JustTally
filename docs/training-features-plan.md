# Plan: Vom Übungskatalog zum Trainings-Tracker

Stand: 2026-08-12 · Basis: § 7 Phase 4

Deckt **Priorität 1 vollständig**, **Priorität 2 ohne Wearables und Health-Integration**
sowie aus Priorität 3 **Analytics, Muskel-Erholungs-Heatmap und Hantelscheibenrechner** ab.

| Abschnitt | Stand |
|---|---|
| Quick-Wins (Auto-Sync, Vorwerte, Touch-Ziele, Plattenrechner) | ✅ `7af82ea` |
| § 3 Testbarkeit | ✅ `6be3f4a` |
| § 4 Phase 1 — Satz-Ausführung, Pausentimer, Einheiten | ✅ `e37e61e` |
| § 5 Phase 2 — Sync-Härtung | ✅ `c383095` |
| § 6 Phase 3 — Komplexe Methoden | ✅ `69e274b` |
| § 7 Phase 4 — Routinen und Alternativen | ✅ `c78aedb` |
| § 8 Phase 5 — Desktop-Planer | ✅ |
| § 9 Phase 6 — Export und Import | ✅ |
| § 10 Phase 7 — Analytics | ✅ |
| § 11 Phase 8 — Muskel-Erholungs-Heatmap | ✅ |
| § 16 Übungsauswahl (Favoriten, Muskelgruppen, Suche) | ✅ `365edb0` |

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

> **`createSyncedCollection<T>()`: nachgezogen in § 7.** Geteilt war hier zunächst
> nur die riskante Hälfte — Merge- und Queue-Arithmetik in `syncMerge.ts`. Der
> Rest (IndexedDB-Schlüssel, React-State-Verdrahtung) hatte zu diesem Zeitpunkt
> genau einen Aufrufer, und die Abstraktion wartete bewusst auf den zweiten. Mit
> Routinen als zweitem Aufrufer ist sie jetzt in `lib/syncedCollection.ts`
> gebaut, `useWorkouts.ts` läuft selbst darüber (Regressionstests + Build nach
> der Umstellung weiterhin grün) — s. § 7.1.

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

## 7. Phase 4 — Routinen und vordefinierte Alternativen — ✅ erledigt

*Erfüllt: P1 „Vordefinierte Übungs-Alternativen"*

Die größte Einzelphase, weil sie eine neue Entität mitsamt Sync, Offline-Pfad und
zwei Oberflächen einführt.

### 7.1 Backend

- ✅ `createSyncedCollection<T>()` aus § 5 nachgezogen — `lib/syncedCollection.ts`
  extrahiert die IndexedDB-/React-Verdrahtung (Dirty-Queue, Tombstones,
  Cross-Instanz-Benachrichtigung, In-Flight-Dedupe) aus `useWorkouts.ts`, oben
  auf `lib/syncMerge.ts` (unverändert). `useWorkouts.ts` läuft jetzt selbst
  darüber — die App-Legacy-Migration (`adoptLegacyCache`) bleibt Workout-eigen
  und wird als optionaler `prepare`-Hook durchgereicht, statt generalisiert zu
  werden, weil sie an genau eine historische Schlüsselmenge gebunden ist.
  `useRoutines.ts` ist der zweite, dünne Aufrufer.
- ✅ Tabelle `routines` (id, user_id, name, description, `weeks` jsonb,
  created_at, updated_at, deleted_at) analog zu `workouts`, direkt als jsonb
  angelegt — anders als `workouts.entries` gibt es hier keine text-Spalte
  abzulösen.
- ✅ `POST /api/routines/sync` — dasselbe Protokoll, dieselbe Validierungsstrenge
  (`backend/src/routes/routines.js`, 16 Testfälle)
- ✅ Validierung: `exerciseId` von Haupt- und Alternativ-Übungen wird in einem
  Round-Trip gegen `exercises` geprüft; ein Routine-Upsert mit einer
  nicht-existenten Referenz wird komplett abgewiesen, nicht teilweise
  gespeichert

### 7.2 Mobil

- ✅ Neuer Reiter **Pläne** (`pages/mobile/Routines.tsx`), Bottom-Nav von drei auf
  vier Spalten erweitert
- ✅ „Training starten" instanziiert Tag → Session (§ 2.3) über die reine
  Funktion `lib/routineInstantiate.ts` (7 Testfälle): vorbelegte, leere Sätze
  in der Zielanzahl, `plannedExerciseId` gesetzt, Supersatz-`groupId` aus dem
  Plan übernommen
- ✅ **Wechsel auf Plan B/C**: Wischen (Pointer-Events, Schwelle 25 % der
  Kartenbreite über `lib/swipeGesture.ts`, 5 Testfälle) tauscht auf die erste
  Alternative; Tippen auf den Namen öffnet eine Liste aller Alternativen plus
  „zurück zum Plan" (sobald abgewichen wurde) plus „andere Übung wählen" für
  den vollen Katalog. Ein Toast mit „Rückgängig" fängt Fehlwischer ab und zeigt
  beim allerersten Wechsel auf diesem Gerät zusätzlich den Hinweis „Gilt nur
  für dieses Training — der Plan bleibt unverändert."
- ✅ Die Vorlage bleibt strukturell unangetastet: browserverifiziert (Plan
  angelegt → Training gestartet → auf die Alternative gewischt → gespeichert →
  `routines`-Eintrag in IndexedDB zeigt weiterhin auf die ursprüngliche Übung,
  die gespeicherte Session trägt `exerciseId` der Alternative und
  `plannedExerciseId` der ursprünglich geplanten Übung)
- ✅ Ziel-Wiederholungen/-Gewicht/-RPE aus dem Plan werden als Hinweiszeile
  unter dem Übungsnamen angezeigt (s. § 7.4, Abweichung von der Planung)
- ✅ Eine plangebundene Pausendauer (`restSeconds`) überschreibt den globalen
  Timer-Default beim Abhaken eines Satzes dieser Übung — genau das in § 4.2
  offen gelassene „Dauer pro Übung im Plan hinterlegbar (Phase 4)"

### 7.3 Offline

✅ Routinen sind über `createSyncedCollection` von Grund auf offline-first —
derselbe Mechanismus wie Workouts, kein separater Lese-Cache nötig, weil es
sich (anders als der schreibgeschützte Übungskatalog) um eine synchronisierte
Kollektion mit eigenem Schreibpfad handelt.

### 7.4 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| Mobile Oberfläche für beliebig viele Wochen (Periodisierung) | Mobiler Editor erzeugt genau **eine** Woche pro Routine | Wochen duplizieren mit prozentualer Steigerung ist explizit § 8 (Desktop-Planer). Eine volle Wochen-Verwaltung am Telefon vor diesem Baustein zu bauen hieße, dieselbe Mechanik zweimal zu bauen. Das Datenmodell (`weeks: RoutineWeek[]`) trägt mehrere Wochen bereits – der Desktop-Planer muss nichts migrieren, nur die zweite und dritte Woche hinzufügen können. |
| Zielgewicht/-RPE/-Pausendauer im mobilen Formular editierbar | Nur **Ziel-Sätze** und **Ziel-Wiederholungen** sind im mobilen Editor setzbar; `targetWeight`/`targetRpe`/`restSeconds` sind im Modell und im Backend voll unterstützt (und werden beim Start als Hinweis angezeigt, falls vorhanden), aber ohne Eingabefeld im mobilen Formular | Auf 320 px sind zwei Zahlenfelder plus Text ohnehin das Maximum an vertretbarer Dichte für eine erste Version; die fehlenden Felder sind rein additiv nachrüstbar, sobald der Desktop-Planer (mit mehr Platz) sie ohnehin braucht. |
| „Zielwiederholungen als Platzhalter" im Zahlenfeld | Ziel als eigene **Hinweiszeile** unter dem Übungsnamen, das Zahlenfeld-Placeholder bleibt der Vorwert aus der letzten Sitzung | Das Placeholder-Feld zeigt bereits „was beim letzten Mal lag" — die Zahl, die während des Satzes am meisten zählt. Das Ziel dort hineinzudrängen hätte eine der beiden Informationen verdeckt; eine zusätzliche Zeile zeigt beides gleichzeitig statt eine durch die andere zu ersetzen. |
| Alternativen: „Plan C" als eigenständiges UI-Konzept | Modell trägt beliebig viele Alternativen (`alternatives[]`); mobiler Editor kann beliebig viele hinzufügen (wiederholtes „+ Alternative"), aber wischen tauscht immer auf `alternatives[0]` | Die Wisch-Geste kennt per Definition nur eine Richtung; „Plan C" bleibt über „Tippen → Liste aller Alternativen" erreichbar. Deckt sich mit dem Wortlaut „tauscht direkt auf die erste Alternative". |

**Aufwand: XL** (5–7 Tage), wie geplant.

---

## 8. Phase 5 — Desktop-Planer — ✅ erledigt

*Erfüllt: P2 „Nahtlose Web-App / Desktop-Version"*

- ✅ Eigene Route `/plan` (`pages/plan/Plan.tsx` + `PlanLayout.tsx`), die aus dem
  `max-w-md`-Korsett der Mobilansicht ausbricht: dreispaltig — Übungskatalog
  links (`PlanCatalog.tsx`), Wochen/Tage-Raster in der Mitte
  (`PlanWeekGrid.tsx`), Detailfeld für die ausgewählte Übung rechts
  (`PlanDetailPanel.tsx`: Sätze, Zielwiederholungen, -gewicht, -RPE,
  Pausendauer, Alternativen).
- ✅ **Drag & Drop** über `@dnd-kit/core`: Übungen aus dem Katalog auf einen Tag
  ziehen legt eine neue Routine-Übung an; auf eine bestehende Übungskarte
  ziehen hinterlegt sie als Alternative; eine Übungskarte auf eine andere
  ziehen sortiert um oder verschiebt zwischen Tagen. Die gesamte
  Index-Arithmetik dafür liegt als reine Funktionen in `lib/planGrid.ts`
  (16 Testfälle) — s. § 8.1, warum das hier wichtiger war als sonst.
- ✅ **Neue Abhängigkeit: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`**
  wie geplant, keine zusätzlichen Sicherheitswarnungen gegenüber dem
  bestehenden `npm audit`-Stand.
- ✅ **Periodisierung**: „Woche duplizieren" mit Prozentfeld
  (`lib/periodization.ts`, 7 Testfälle) — bumpt jedes `targetWeight` in der
  neuen Woche, lässt Übungen ohne Zielgewicht unverändert, rundet sauber.
  Browserverifiziert: 2,5 % auf 60 kg → 61,5 kg in der duplizierten Woche.
- ✅ **„Live"-Sync zum Handy**: entprellter Push+Sync 2 s nach der letzten
  Änderung (§ 8.3), plus der bereits aus § 7 vorhandene `visibilitychange`-/
  Mount-Sync in `lib/syncedCollection.ts` — kein zusätzlicher Code nötig, der
  Baustein deckt „Plan-Reiter am Handy öffnen" bereits ab. Browserverifiziert
  end-to-end: Zielgewicht/-Wiederholungen im Planer geändert → nach der
  Debounce-Zeit in IndexedDB persistiert → in der mobilen Pläne-Liste
  sichtbar → „Training starten" zeigt den neuen Zielwert als Hinweiszeile.

### 8.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| Tage per Drag zwischen Wochen kopieren | Dropdown + Button („⧉" auf der Tageskarte) | Zwei unterschiedliche Drop-Ziele (Umsortieren innerhalb der Woche vs. Kopieren in eine andere Woche) über dieselbe Geste zu unterscheiden, ist ein Quell für Fehlbedienung; ein expliziter Button ist eindeutig und genauso schnell. Die Drag-Mechanik bleibt für die beiden Fälle reserviert, die sie eindeutig lösen: Katalog → Raster und Umsortieren/Verschieben. |
| Ende-zu-Ende-Browserverifikation der Drag-Interaktion selbst | Nicht direkt browserverifiziert; stattdessen die komplette Zieh-Logik (Einfügen, Verschieben innerhalb eines Tages vorwärts/rückwärts, Verschieben über Tage, Anhängen ans Ende, Alternative hinzufügen, No-op-Fälle) in `lib/planGrid.ts` extrahiert und mit 16 Testfällen abgedeckt, `onDragEnd` per Code-Review gegen diese Funktionen geprüft | Der Browser-Tab dieser Session kompositiert keine Frames (der Screenshot-Pfad, den der Drag-Tool-Aufruf voraussetzt, schlägt fehl), und synthetisch dispatchte `PointerEvent`s haben dnd-kits Sensor-Aktivierung nicht zuverlässig ausgelöst — auch mit `isPrimary`, mehreren `pointermove`-Schritten und Verzögerungen nicht. Die eigentlich fehleranfällige Stelle (Index-Verschiebung beim Umsortieren) ist damit härter geprüft als es ein einzelner erfolgreicher Klick-und-Zieh-Durchlauf gezeigt hätte — sollte aber vor dem ersten echten Einsatz einmal von Hand in einem echten Browser bestätigt werden. |
| Echter Cross-Device-Push-Test | Verifiziert wurde der geteilte Lese-/Schreibpfad (Desktop-Planer-Änderung landet in derselben IndexedDB, die die mobile Pläne-Liste liest) statt eines echten zweiten Geräts über den Server | In dieser Session steht kein Postgres bereit (`DATABASE_URL` fehlt), wie bereits in § 4–§ 7 vermerkt. Der Sync-Mechanismus selbst (`lib/syncedCollection.ts`) ist seit § 7 durch 172 Backend- und mehrere Frontend-Tests abgedeckt; was hier neu und ungeprüft wäre, ist ausschließlich die Übertragung über echte Netzwerk-Hardware, nicht die Anwendungslogik. |

**Aufwand: L–XL** (4–6 Tage), wie geplant.

---

## 9. Phase 6 — Verlustfreier Export und Import — ✅ erledigt

*Erfüllt: P1 „Verlustfreier Datenexport"*

Umgesetzt wie geplant: eigenes Schema `justtally-export/v1`
(`frontend/src/lib/exportSchema.ts`), dokumentiert in
[docs/export-format.md](export-format.md), Client-Export aus IndexedDB
(`lib/exportWorkouts.ts`), Server-Endpunkt `GET /api/export`
(`backend/src/routes/export.js` + `services/exportAccount.js`), Import mit
Validierung und Last-Write-Wins gegen den lokalen Stand (`lib/importWorkouts.ts`),
flacher CSV-Export (`lib/exportCsv.ts`), UI-Einstiegspunkt in
`pages/mobile/Settings.tsx`.

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

### 9.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| `musclesPrimary`/`musclesSecondary` im Export-Beispiel gesetzt | Felder existieren im Schema (optional), werden aber nie befüllt | § 11 (Muskeltaxonomie) ist noch offen — `Exercise` trägt diese Daten heute schlicht nicht. Die Felder sind additiv reserviert, damit § 11 keinen Format-Sprung braucht, sondern nur anfängt, ein längst vorhandenes optionales Feld zu füllen. |
| `bodyWeights` mit Beispieldaten | Immer `[]` | Die Körpergewichts-Kollektion (§ 10) existiert noch nicht. Dasselbe additive Muster wie bei den Muskelgruppen. |
| Import-Verhalten nicht im Detail spezifiziert | Last-Write-Wins gegen den lokalen Stand (`updatedAt`-Vergleich), fehlerhafte Zeilen werden übersprungen und gemeldet statt die ganze Datei abzulehnen | Ein altes Backup darf frischere lokale Änderungen nicht stumm überschreiben — dieselbe Regel, die das Sync-Protokoll schon für genau diesen Fall durchsetzt (`syncMerge.ts`). Und eine einzelne kaputte Zeile in einer sonst gültigen Fremddatei sollte den Import nicht insgesamt verhindern. |

**Aufwand: M** (2 Tage), wie geplant. **Offen geblieben:** der Server-Export
(`GET /api/export`) ist nur gegen einen SQL-Mock getestet — ein echter
Ende-zu-Ende-Lauf gegen Postgres steht aus, da in dieser Session weiterhin kein
`DATABASE_URL` verfügbar war (wie bereits in § 4–§ 8 vermerkt). Der Client-Pfad
(Export → Import, inklusive Round-Trip mit Dropsätzen, Supersätzen, RPE und
Alternativen) wurde dagegen live im Browser gegen echte IndexedDB-Daten geprüft,
nicht nur per Unit-Test.

---

## 10. Phase 7 — Analytics — ✅ erledigt

*Erfüllt: P3 „Tiefgreifende Post-Workout-Analytics"*

Rechnet vollständig im Client aus den ohnehin lokalen Daten: kein Backend-Aufwand,
funktioniert offline, keine zusätzliche Latenz.

Umgesetzt wie geplant: `frontend/src/lib/analytics/` (Volumen, e1RM, Rekorde,
Verlauf, Wilks/DOTS — 96 Testfälle), `lib/charts.ts` + `components/charts/TrendChart.tsx`
(handgeschriebenes SVG), neue Seite `pages/mobile/ExerciseStats.tsx`
(verlinkt von `ExerciseDetail.tsx`), PR-Banner in `History.tsx` nach dem Speichern
in `Workout.tsx`, neue synchronisierte Kollektion `body_weights`
(`backend/src/routes/bodyWeights.js` + `hooks/useBodyWeights.ts`) und ein
Geschlecht-Auswahlfeld in `Settings.tsx` — die Backend-Route und das
Frontend-Feld dafür existierten aus § 4 bereits vollständig, nur ohne
UI-Einstiegspunkt.

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

### 10.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| Wilks/DOTS-Koeffizienten aus einer Referenz übernehmen | Koeffizienten aus den öffentlich dokumentierten Formeln (Wilks 1994, DOTS 2020) übernommen, aber nur gegen eine unabhängig berechnete Kontrollrechnung getestet — nicht gegen einen dritten Taschenrechner/Dienst gegengeprüft | In dieser Session stand kein externer Referenzrechner zur Verfügung. Die Tests (`relativeStrength.test.ts`) fangen Tippfehler in der Formel ab (das eigentliche Risiko bei einer Konstantenliste), sind aber ausdrücklich keine Bestätigung, dass die Koeffizienten selbst korrekt sind — nur, dass der Code sie korrekt anwendet. Vor einem Produktiveinsatz lohnt ein Abgleich gegen einen etablierten Rechner. |
| „Wilks/DOTS mit klarer Einordnung in der UI" | Umgesetzt als Hinweistext unter den beiden Werten auf der Statistikseite | Wie geplant — hier nur festgehalten, weil es der einzige Ort ist, an dem die Formel überhaupt auftaucht: kein Wilks/DOTS-Wert erscheint ohne den Einordnungssatz direkt daneben. |
| Relative Kraft je Punkt im e1RM-Verlauf | Nur für den e1RM-**Rekord** berechnet (ein Wert, nicht eine Kurve) | Eine Kurve hätte für jeden Sitzungspunkt den zeitlich nächsten Körpergewichtseintrag gesucht — machbar, aber ohne zusätzlichen Erkenntnisgewinn gegenüber dem einen Rekordwert, den die App tatsächlich hervorhebt. Kleinerer, ehrlicherer Schnitt für die erste Version. |
| PR-Erkennung als Teil des Speicherns | Umgesetzt über `router`-State: `Workout.tsx` berechnet die Rekorde vor dem Speichern und übergibt sie an `/history`, das den Banner zeigt | „Direkt nach dem Speichern" ist wörtlich genommen — die Seite wechselt ohnehin zu `/history`, ein Banner dort ist die natürliche Stelle, ohne die Navigation aufzuhalten oder einen Modal-Dialog einzuschieben. |

**Aufwand: L** (3–4 Tage), wie geplant. **Offen geblieben:** wie schon bei § 9
war in dieser Session kein Postgres verfügbar; `bodyWeights.test.js` läuft nur
gegen den SQL-Mock. Der komplette Client-Pfad (Rekorde, Diagramme inkl. des
hohlen Markers für unzuverlässige e1RM-Schätzungen, Körpergewicht speichern,
PR-Banner nach dem Speichern eines Trainings) wurde dagegen live im Browser
gegen echte IndexedDB-Daten und von Hand nachgerechnete Werte geprüft.

---

## 11. Phase 8 — Muskel-Erholungs-Heatmap — ✅ erledigt

*Erfüllt: P3 „Muskel-Erholungs-Heatmaps"*

Umgesetzt wie geplant: 16er-Taxonomie als `muscles_primary`/`muscles_secondary`
(JSONB, `backend/src/db/database.js`), Validierung in `backend/src/routes/exercises.js`
gegen die Allow-Liste in `backend/src/services/muscles.js`, Backfill-Skript
`backend/src/scripts/backfillMuscles.js` mit Trockenlauf (`--report`) als
Standard und explizitem `--apply`, zwei neue CSV-Spalten (Komma-getrennt
innerhalb der Zelle, `;` bleibt der Spaltentrenner) in `csvImport.js`/
`csvExport.js`, Mehrfachauswahl-Felder im Admin-Formular
(`pages/admin/ExerciseForm.tsx`), Belastungs-/Abklingmodell
(`frontend/src/lib/recovery.ts`, 17 Testfälle) und die Körperkarte
(`components/BodyMap.tsx`) auf der neuen Seite `pages/mobile/Recovery.tsx`,
verlinkt über einen fünften Bottom-Nav-Eintrag.

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

> **Offene Beschaffung — entschieden:** selbst gezeichnet, vereinfacht. Zwei
> schematische Körpersilhouetten (kein anatomischer Anspruch), ein `<path>`
> je Muskelgruppe, im gleichen handgezeichneten SVG-Stil wie `icons.tsx` und
> `TrendChart.tsx` — keine Lizenzfrage, weil nichts extern beschafft wurde.

### 11.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| „Summe aus Arbeitssatz-Volumen … Ergebnis je Muskel: 0…1" ohne Normierungsregel | Pro Sitzung wird die abklingend gewichtete Volumensumme je Muskel gebildet, das **Maximum über alle Sitzungen** genommen (nicht die Summe über Sitzungen) und gegen die eigene aktuell stärkstbelastete Muskelgruppe normiert | Eine reine Summe über mehrere Sitzungen hätte die 0…1-Zusage gebrochen, sobald ein Muskel z. B. zweimal innerhalb des Fensters trainiert wurde — der Wert wäre über 1 gestiegen. Das Maximum ist die konservative, immer beschränkte Variante, und die Normierung gegen die eigene stärkste Gruppe braucht keine globale, für jeden Nutzer unterschiedlich richtige Volumenkonstante — dieselbe „gegen sich selbst vergleichen"-Logik wie bei Wilks/DOTS in § 10. |
| Abklingkurve nicht spezifiziert | Linear von 1 auf 0 über das Erholungsfenster | Eine Exponentialkurve erreicht nie exakt 0 — ein vor Wochen trainierter Muskel hätte für immer einen Rest-Wert behalten, was auf einer Karte, deren ganzer Zweck „was ist heute frisch" ist, als Rauschen gelesen würde. |
| Backfill auch für Sekundärgruppen (eine der zur Wahl gestellten Optionen) | Backfill setzt nur `muscles_primary` aus `category`, `muscles_secondary` bleibt immer leer | Entscheidung im Dialog vor Beginn der Phase: Empfehlung „Backfill als Startpunkt, CSV zum Nachschärfen" angenommen, ausdrücklich ohne geratene Sekundärgruppen — eine geratene Sekundärzuordnung wäre schwerer als „noch ungepflegt" erkennbar als eine leere. |
| CSV-Import einer alten Datei (ohne Muskel-Spalten) | Fehlende Spalten lassen gespeicherte Muskeldaten unangetastet (`COALESCE` gegen `NULL`), statt sie zu leeren | Nicht explizit im Plan, aber notwendige Konsequenz aus „Backfill als Startpunkt, CSV zum Nachschärfen": ein Reimport eines vor dieser Phase exportierten Katalogs darf gepflegte Daten nicht rückgängig machen. |
| Muskel-Mehrfachauswahl im Admin-Formular als eigene Komponente | Primär- und Sekundärliste sind strukturell gegenseitig exklusiv — Auswahl eines Muskels als sekundär entfernt ihn automatisch aus der Primärliste und umgekehrt | Ein Muskel doppelt gelistet hätte im Belastungsmodell 1,0 **und** 0,5 seines Volumens erhalten. Als UI-Zustand unmöglich gemacht statt als Validierungsfehler abgefangen. |

**Aufwand: L** (3–4 Tage, davon ein spürbarer Anteil Datenpflege), wie geplant.
**Offen geblieben:** wie bei § 9–§ 10 war in dieser Session kein Postgres
verfügbar — Backend-Tests laufen gegen den SQL-Mock, kein Lauf der Migration
und des Backfill-Skripts gegen eine echte Datenbank. Die Wilks/DOTS-Einschränkung
aus § 10.1 (Koeffizienten nicht gegen einen externen Rechner gegengeprüft)
gilt unverändert fort. Der komplette Client-Pfad (Belastungsmodell mit von
Hand nachgerechneten Werten, Körperkarte inkl. Farbwerte, Tippen für
Zahl/Zeitpunkt, Admin-Formular inkl. gegenseitigem Ausschluss, beide Themes,
320-px-Breite) wurde live im Browser geprüft.

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
§7  Routinen + Alt.     XL   ✅ ◀── braucht §4, §5
§8  Desktop-Planer      L–XL ✅ ◀── braucht §7
§9  Export/Import       M    ✅ ◀── braucht §4, §6, §7
§10 Analytics           L    ✅ ◀── braucht §4 (Satz-Typen)
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
| **B** | §6 ✅, §7 ✅ | Trainieren nach Plan, Alternativen bei besetztem Gerät — **fertig** |
| **C** | §8 ✅, §9 ✅ | Planung am Desktop, Daten gehören dem Nutzer — **fertig** |
| **D** | §10 ✅, §11 ✅ | Auswertung und Erholungsübersicht — **fertig** |

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
4. ~~**Körperkarten-SVG**~~ **Entschieden (im Dialog zu Beginn von § 11):**
   selbst gezeichnet, vereinfacht — passend zum handgezeichneten Icon-Stil,
   keine Lizenzfrage. S. § 11.1 für die konkrete Umsetzung.
5. ~~**Muskelzuordnung des Bestandskatalogs**~~ **Entschieden (im Dialog zu
   Beginn von § 11):** Backfill aus `category` als Startpunkt (nur
   Primärgruppen, nie geraten für Sekundärgruppen), CSV und Admin-Formular
   zum Nachschärfen. S. § 11.1.
6. ~~**Einheiten**~~ **Entschieden:** kg + lb umschaltbar. kg bleibt intern
   kanonisch (Speicherung, Sync, Export); lb ist reine Anzeige-/Eingabeschicht
   pro Nutzerkonto (`unit_preference`, nicht gerätelokal). Der Plattenrechner
   bekommt einen zweiten, imperialen Scheiben-/Stangensatz und rechnet nativ in
   der gewählten Einheit statt über Umrechnung — die Mathematik muss auf echten
   Scheiben landen.

---

## 16. Übungsauswahl — Favoriten, Muskelgruppen, Suche — ✅ erledigt

*Eigenständiger Auftrag, unabhängig von § 1–§ 15 — dieser Plan war bereits
vollständig abgearbeitet. Detailkonzept in
`C:\Users\maiks\.claude\plans\das-bungen-hinzuf-gen-funktioniert-quirky-glacier.md`
(genehmigt). Umgesetzt in zwei Modell-Stufen: Opus 5 (API-Entwurf, `Modal`-Umbau,
`lib/`-Kern) → Sonnet 5 (Aufrufer-Migration, Feinschliff, Verifikation).*

Ersetzt die ungefilterte Vollliste beim Hinzufügen einer Übung durch
`components/ExercisePicker.tsx`: vier Einstiege (Favoriten+Zuletzt, Muskelgruppe,
Alle, Suche — Suche schlägt immer den aktiven Modus), Mehrfachauswahl beim
Hinzufügen, Einzelauswahl mit sofortigem Commit beim Ersetzen/bei Alternativen.
Eine Komponente ersetzt die beiden zuvor zeilengleich duplizierten Picker-Modals
in `Workout.tsx` und `Routines.tsx` (inkl. des dort verschachtelten Falls).

Reine Logik in `lib/exerciseSearch.ts` (Diakritika-faltende Suche),
`lib/exerciseRecency.ts` (Zuletzt-verwendet-Auswertung aus den Sessions) und
`lib/exercisePicker.ts` (Gruppierung: Favoriten vor Zuletzt dedupliziert, primär
vor sekundär, leere Blöcke fallen weg) — 44 Tests. `components/ui.tsx`s `Modal`
wurde additiv um optionale `toolbar`/`footer`-Slots erweitert (Panel als
Flex-Spalte, nur der Rumpf scrollt); alle acht bestehenden Aufrufer unverändert
geprüft.

### 16.1 Abweichungen von der Planung

| Geplant | Umgesetzt | Warum |
|---|---|---|
| Keine Aussage zur Mehrfachauswahl beim Hinzufügen einer Übung *innerhalb einer Routine* | Einzelauswahl mit sofortigem Commit, wie beim Ersetzen/bei Alternativen — nicht Mehrfachauswahl wie im Workout-„Hinzufügen" | Das bestehende Verhalten von `Routines.tsx` committete schon immer mit einem Tap pro Übung; das Additiv-Prinzip des Umbaus („bestehende Aufrufer dürfen sich nicht verhalten ändern") hatte hier Vorrang vor einer stillschweigenden Funktionserweiterung, die der Plan nicht verlangt hatte. |
| Suche via `name.toLowerCase().includes(query.toLowerCase())` implizit als Referenzverhalten | `matchesQuery` prüft whitespace-getrennte Tokens statt eines einzigen Substrings | Echte Obermenge des alten Verhaltens (kein Treffer geht verloren) und nötig, damit „bank drucken" (mit Leerzeichen) „Bankdrücken" findet — ein Fall, den ein einzelner `includes`-Test nie abdeckt hätte. |
| — (nicht Teil des Auftrags) | `FavoriteButton` um ein optionales `className`-Prop erweitert, im Picker auf `min-h-11 min-w-11` gesetzt | Die geteilte Komponente lag mit `p-2` bei 36×36 px — unter der projektweiten 44-px-Vorgabe. Im Browser bei 320 px gemessen und additiv behoben (Default für `ExerciseList.tsx`/`ExerciseDetail.tsx` unverändert), statt die Vorgabe für die neue, tap-dichte Liste zu unterlaufen. |

**Verifikation:** `npx tsc -b`, `npm test` (295/295 Frontend, 233/233 Backend),
`npm run build` — alle grün. Im Browser gegen eine vorbefüllte IndexedDB
geprüft (kein lokaler Postgres verfügbar, wie bereits in § 4–§ 11 vermerkt):
alle vier Picker-Modi, Mehrfachauswahl, das verschachtelte Routine-Modal, der
Plattenrechner als unveränderter `Modal`-Aufrufer, 320 px ohne Überlauf (nach
der Herz-Korrektur oben), beide Themes, Offline-Zustand (Herz deaktiviert,
Liste bleibt aus dem Cache lesbar).

**Nicht behoben, weil außerhalb des Auftrags:** bei 320 px überläuft die
Kopfzeile der App (Sprachumschalter, Theme, Einstellungen, Abmelden) unabhängig
von diesem Feature um rund 69 px — vorbestehend, nicht durch diese Änderung
verursacht. Als separate Aufgabe vorgemerkt.

---

## 17. Übungsauswahl — Filter-Panel, Mehrfachauswahl in Routinen, Planer-Katalog, Training → Routine — ✅ erledigt

*Löst die in § 16.1 dokumentierte Abweichung auf ("Einzelauswahl im
Routine-Editor") und behebt zwei zum Zeitpunkt von § 16 offene Lücken: der
Desktop-Planer-Katalog (`pages/plan/PlanCatalog.tsx`) hatte nie mehr als ein
Namens-Suchfeld, und es gab keinen Weg von einem absolvierten Training zurück
zu einer Routine.*

**Filter-Panel statt drei Chip-Reihen.** `category`/`difficulty`/`equipment`
waren in `buildPickerGroups` bislang nur im Tab „Alle" wirksam — in „Für dich",
„Muskel" und bei aktiver Suche griffen sie nicht, ohne dass die UI das kenntlich
machte. `lib/exercisePicker.ts` nimmt jetzt ein `PickerFilters`-Objekt
(`{category, difficulty, equipment}`, `EMPTY_FILTERS`, `activeFilterCount`) und
wendet es vor der Modus-Verzweigung an — auch auf Suchtreffer. Die drei zuvor
immer sichtbaren, seitlich scrollenden Chip-Reihen sind einem einklappbaren
Panel gewichen (`components/ExerciseFilterBar.tsx`): eingeklappt eine Zeile mit
Filter-Button (Badge zeigt die Anzahl aktiver Achsen), den aktiven Filtern als
entfernbaren Chips und dem Trefferzähler — jetzt in jedem Tab statt nur in
„Alle". Aufgeklappt drei Abschnitte mit umbrechenden statt scrollenden Chips.

**Ein Zustand für drei Oberflächen.** `hooks/useExercisePicker.ts` zieht den
bisher in `ExercisePicker.tsx` liegenden Zustand (Suche, Tab, Muskel, Filter,
Favoriten/Zuletzt-Anbindung) heraus. `ExercisePicker.tsx` (das Modal),
`PlanCatalog.tsx` (die Desktop-Planer-Spalte) und `ExerciseList.tsx` (unverändert
im Verhalten, nur auf das `filters`-Objekt umgestellt) rufen denselben Hook und
dieselbe `buildPickerGroups`-Regel auf — der Katalog im Planer hatte bislang
weder Favoriten noch Zuletzt-trainiert noch Muskelgruppen-Filter und war rein
namensbasiert; jetzt zeigt er dieselben vier Einstiege und Gruppen-Überschriften
(`lib/pickerGroupLabels.ts`) wie das mobile Modal, Drag-and-drop unverändert.

**Mehrfachauswahl im Routine-Editor.** `Routines.tsx` öffnet den Picker beim
Befüllen eines Tages jetzt im Modus `'add'` statt `'single'` — mehrere Übungen
sammeln und mit einem Tap auf „N hinzufügen" committen, wie im Workout-Editor.
Eine Alternative füllt weiterhin genau einen Platz und committet sofort
(`'single'`). `addExercisesToDay` baut die neue Liste aus dem `setDays`-Updater
heraus statt aus der `days`-Closure zu lesen — sonst würde eine Schleife über
mehrere ausgewählte Übungen alle bis auf die letzte verlieren.

**Training → Routine.** `lib/sessionToRoutine.ts` ist die Umkehrung von
`lib/routineInstantiate.ts`: `routineDayFromSession`/`routineFromSession` bauen
aus einem `WorkoutSession` einen `RoutineDay`/`Routine`-Entwurf. Nur
Arbeitssätze zählen (`setType(set) !== 'warmup'`, dieselbe Regel, die
`History.tsx` für die Satzzahl nutzt); die Zielfelder richten sich nach dem am
Eintrag **eingefrorenen** Tracking-Modus (`entryTracking`), nie nach dem
aktuellen Katalogwert. `targetReps` wird "10" bei gleicher Wiederholungszahl,
sonst "min-max"; `targetWeight`/`targetDurationSec`/`targetDistanceM` kommen
vom jeweils stärksten Arbeitssatz. RPE und Pause bleiben unbelegt. In
`History.tsx` öffnet „Als Routine" (ausgeblendet ohne Einträge) den
Routine-Editor über `Routines.tsx` mit dem Entwurf vorbefüllt (Name/Tag-Name =
Trainingstitel, sonst formatiertes Datum) — Router-State, per `useEffect` einmal
gelesen und danach mit `replace: true, state: null` gelöscht, damit ein Reload
den Dialog nicht erneut öffnet. Gespeichert wird erst mit „Speichern"; bis
dahin ist nichts geschrieben, und es bleibt bei der in § 2.3 festgelegten
Kopie-nicht-Referenz-Regel.

**Verifikation:** `npx tsc -b`, `npm run build`, `npm test` — 422/422 Frontend
(davon neu: Filter-Tests in allen drei Modi in `exercisePicker.test.ts`, 18 neue
Tests in `sessionToRoutine.test.ts`), 337/337 Backend (unverändert, kein
Backend-Code berührt). Im Browser gegen eine lokale Postgres-Instanz geprüft:
Filter-Panel auf/zu, Filterchip entfernen, „Zurücksetzen", Filter bleiben beim
Tab- und Suchwechsel sichtbar aktiv; Routine-Editor mit Mehrfachauswahl (Footer
„2 hinzufügen") und weiterhin sofort committender Alternative; `/plan` zeigt
dieselbe Filterleiste in der Katalogspalte; „Als Routine" aus der Historie →
vorbefüllter Editor (Ziel-Sätze/Ziel-Wdh. korrekt aus den geloggten
Arbeitssätzen) → Speichern → „Training starten" aus der neuen Routine liefert
dieselben Werte (10 Wdh. · 60 kg) zurück.
