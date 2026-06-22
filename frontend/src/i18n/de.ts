/**
 * German UI strings — the source of truth for the available translation keys.
 * `{name}`-style placeholders are filled in by the `t(key, params)` helper.
 */
export const de = {
  // Common
  'common.email': 'E-Mail',
  'common.password': 'Passwort',
  'common.name': 'Name',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.close': 'Schließen',
  'common.loading': 'Laden…',
  'common.logout': 'Abmelden',
  'common.admin': 'Admin',
  'common.offline': 'Offline',

  // Theme / language toggles
  'theme.toLight': 'Hellen Modus aktivieren',
  'theme.toDark': 'Dunklen Modus aktivieren',
  'lang.switch': 'Sprache wechseln',

  // Mobile navigation
  'nav.exercises': 'Übungen',
  'nav.workout': 'Training',
  'nav.history': 'Verlauf',
  'nav.users': 'Benutzer',
  'layout.mobileView': 'Mobile Ansicht',

  // Login
  'login.subtitle': 'Melde dich an, um deine Übungen zu laden.',
  'login.submit': 'Anmelden',
  'login.submitting': 'Anmelden…',
  'login.noAccount': 'Noch kein Konto?',
  'login.register': 'Registrieren',
  'login.error': 'Anmeldung fehlgeschlagen',

  // Register
  'register.subtitle': 'Erstelle ein Konto, um loszulegen.',
  'register.passwordLabel': 'Passwort (min. 6 Zeichen)',
  'register.submit': 'Registrieren',
  'register.submitting': 'Registrieren…',
  'register.haveAccount': 'Bereits ein Konto?',
  'register.login': 'Anmelden',
  'register.error': 'Registrierung fehlgeschlagen',

  // Exercise list
  'exercises.title': 'Übungen',
  'exercises.loading': 'Übungen laden…',
  'exercises.offlineCache': 'Offline — zwischengespeicherte Daten',
  'exercises.searchPlaceholder': 'Übung suchen…',
  'exercises.all': 'Alle',
  'exercises.emptyTitle': 'Keine Übungen gefunden',
  'exercises.emptyHint': 'Passe Suche oder Filter an.',
  'exercises.loadError': 'Laden fehlgeschlagen',

  // Exercise detail
  'detail.notFound': 'Übung nicht gefunden',
  'detail.back': 'Zurück',
  'detail.instructions': 'Anleitung',
  'detail.noInstructions': 'Keine Anleitung hinterlegt.',
  'detail.addToWorkout': 'Zum Training hinzufügen',

  // Workout
  'workout.title': 'Training',
  'workout.emptyTitle': 'Noch keine Übungen',
  'workout.emptyHint': 'Füge Übungen hinzu, um dein Training zu protokollieren.',
  'workout.remove': 'Entfernen',
  'workout.set': 'Satz',
  'workout.reps': 'Wdh.',
  'workout.weight': 'Gewicht (kg)',
  'workout.addSet': '+ Satz',
  'workout.addExercise': '+ Übung hinzufügen',
  'workout.pickTitle': 'Übung wählen',

  // History
  'history.title': 'Verlauf',
  'history.emptyTitle': 'Noch keine Trainings',
  'history.emptyHint': 'Deine gespeicherten Trainings erscheinen hier — nur auf diesem Gerät.',
  'history.exercises': 'Übungen',
  'history.sets': 'Sätze',

  // Admin — exercises
  'admin.ex.title': 'Übungen verwalten',
  'admin.ex.subtitle': 'Erstelle und pflege Übungen mit Anleitung, Fotos und Videos.',
  'admin.ex.new': '+ Neue Übung',
  'admin.ex.import': 'CSV importieren',
  'admin.ex.importing': 'Importieren…',
  'admin.ex.template': 'Vorlage herunterladen',
  'admin.ex.colCategory': 'Kategorie',
  'admin.ex.colDifficulty': 'Schwierigkeit',
  'admin.ex.colMedia': 'Medien',
  'admin.ex.emptyTitle': 'Noch keine Übungen',
  'admin.ex.emptyHint': 'Lege deine erste Übung an.',
  'admin.ex.deleteConfirm': '„{name}" wirklich löschen? Medien werden ebenfalls entfernt.',
  'admin.ex.editTitle': 'Übung bearbeiten',
  'admin.ex.newTitle': 'Neue Übung',
  'admin.ex.loadError': 'Laden fehlgeschlagen',
  'admin.ex.deleteError': 'Löschen fehlgeschlagen',

  // Admin — CSV import result
  'import.resultTitle': 'Import-Ergebnis',
  'import.imported': '{count} importiert',
  'import.skipped': '{count} übersprungen (Duplikate)',
  'import.errorsTitle': 'Fehler',
  'import.rowError': 'Zeile {row}: {message}',
  'import.error': 'Import fehlgeschlagen',

  // Admin — exercise form
  'form.nameDe': 'Name (Deutsch)',
  'form.nameEn': 'Name (Englisch)',
  'form.instructionsDe': 'Anleitung (Deutsch)',
  'form.instructionsEn': 'Anleitung (Englisch)',
  'form.category': 'Kategorie',
  'form.difficulty': 'Schwierigkeit',
  'form.instructionsPlaceholder': 'Schritt-für-Schritt Anleitung…',
  'form.saveChanges': 'Änderungen speichern',
  'form.create': 'Übung erstellen',
  'form.saving': 'Speichern…',
  'form.media': 'Fotos & Videos',
  'form.upload': '+ Hochladen',
  'form.uploading': 'Hochladen…',
  'form.saveFirst': 'Zuerst die Übung speichern',
  'form.saveFirstHint': 'Speichere die Übung zuerst, um Medien hinzuzufügen.',
  'form.noMedia': 'Noch keine Medien.',
  'form.nameRequired': 'Mindestens ein Name (Deutsch oder Englisch) ist erforderlich.',
  'form.saveError': 'Speichern fehlgeschlagen',
  'form.uploadError': 'Upload fehlgeschlagen',
  'form.deleteError': 'Löschen fehlgeschlagen',

  // Admin — users
  'users.title': 'Benutzer',
  'users.subtitle': 'Verwalte Konten und Rollen.',
  'users.new': '+ Benutzer',
  'users.empty': 'Keine Benutzer',
  'users.role': 'Rolle',
  'users.you': '(du)',
  'users.deleteConfirm': 'Benutzer „{name}" löschen?',
  'users.newTitle': 'Neuer Benutzer',
  'users.create': 'Erstellen',
  'users.creating': 'Erstellen…',
  'users.loadError': 'Laden fehlgeschlagen',
  'users.roleError': 'Rolle ändern fehlgeschlagen',
  'users.deleteError': 'Löschen fehlgeschlagen',
  'users.createError': 'Erstellen fehlgeschlagen',

  // Difficulty labels
  'difficulty.beginner': 'Anfänger',
  'difficulty.intermediate': 'Fortgeschritten',
  'difficulty.advanced': 'Profi',

  // Category labels
  'category.chest': 'Brust',
  'category.back': 'Rücken',
  'category.legs': 'Beine',
  'category.shoulders': 'Schultern',
  'category.arms': 'Arme',
  'category.core': 'Rumpf',
  'category.cardio': 'Cardio',
  'category.other': 'Sonstige',
} as const;

export type TKey = keyof typeof de;
