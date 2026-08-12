# `justtally-export/v1`

Das Dateiformat für den verlustfreien Export/Import (§ 9 des Trainings-Feature-Plans).
Versioniert, damit eine künftige inkompatible Änderung als `v2`-Leser ankommt statt
`v1`-Dateien still falsch zu lesen — eine exportierte Datei muss so lange lesbar
bleiben, wie jemand sie noch hat.

## Aufbau

```jsonc
{
  "format": "justtally-export/v1",
  "exportedAt": 1786500000000,
  "displayUnit": "kg",           // rein informativ, s. u.
  "exercises": [
    { "id": "…", "ref": 42, "name": "Bankdrücken" }
    // musclesPrimary/musclesSecondary: reserviert für § 11, heute nie gesetzt
  ],
  "routines": [ /* vollständige Routine-Objekte, inkl. alternatives */ ],
  "bodyWeights": [
    { "date": 1786000000000, "kg": 82.4 }
    // reserviert für § 10, heute immer []
  ],
  "sessions": [ /* vollständige WorkoutSession-Objekte */ ]
}
```

`routines` und `sessions` sind unverändert die Objekte, wie sie das Sync-Protokoll
verwendet (`frontend/src/lib/types.ts`) — keine reduzierte oder abgeleitete Form.
`exercises` dagegen ist bewusst schlank: nur `id`, `ref`, `name`, damit eine Session
ohne diese Installation lesbar bleibt, ohne den gesamten Katalog (Medien,
Trainingshinweise in drei Sprachen) mitzuschleppen.

## Invarianten

- **Gewichte sind immer Kilogramm.** In `routines[].weeks[].days[].exercises[].targetWeight`
  genau wie in `sessions[].entries[].sets[].weight`. `displayUnit` am Root sagt nur,
  welche Einheit die exportierende Person zum Zeitpunkt des Exports sah — es
  beeinflusst keinen einzigen gespeicherten Wert und wird beim Import ignoriert.
- **Neue Felder sind additiv und optional**, mit definiertem Lese-Default — dieselbe
  Regel wie beim Sync-Protokoll. `musclesPrimary`/`musclesSecondary` und
  `bodyWeights` sind schon jetzt Teil des Schemas, obwohl die Daten dahinter (§ 10,
  § 11) noch nicht existieren: wenn sie kommen, braucht es keinen Format-Sprung.
- **`format` ist ein harter Gate.** Eine Datei mit falschem oder fehlendem Tag wird
  abgelehnt, nicht geraten-interpretiert.

## Rundreise (Round-Trip)

`import(export(x)) === x` für Dropsätze, Supersätze, RPE und Alternativen ist ein
eigener Testfall (`frontend/src/lib/importWorkouts.test.ts`) — ohne ihn ist
„verlustfrei" nur eine Behauptung. Einzelne fehlerhafte Zeilen in einer sonst
gültigen Datei lassen den restlichen Import nicht scheitern; sie werden übersprungen
und gemeldet (`errors` bzw. in der UI „N Zeilen übersprungen").

## Wege zur Datei

| Weg | Wo | Funktioniert offline |
|---|---|---|
| Client-Export | `frontend/src/lib/exportWorkouts.ts`, ausgelöst in Settings | ✅ — liest aus IndexedDB |
| Server-Export | `GET /api/export` (`backend/src/routes/export.js`) | ❌ — braucht Netzwerk |
| CSV-Export | `frontend/src/lib/exportCsv.ts` | ✅, aber **verlustbehaftet** — kein Rundreise-Pfad |

Der Import (`frontend/src/lib/importWorkouts.ts`) schreibt importierte Trainings/Pläne
mit Last-Write-Wins gegen den lokalen Stand: ein Eintrag, der lokal bereits eine
neuere `updatedAt` trägt, wird übersprungen statt überschrieben — dieselbe Regel wie
im Sync-Protokoll (`syncMerge.ts`), nur einmalig statt fortlaufend angewendet.
