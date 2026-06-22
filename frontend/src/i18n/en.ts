import type { TKey } from './de';

/** English UI strings. Typed against `TKey` so every key stays in sync with German. */
export const en: Record<TKey, string> = {
  // Common
  'common.email': 'Email',
  'common.password': 'Password',
  'common.name': 'Name',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'common.logout': 'Sign out',
  'common.admin': 'Admin',
  'common.offline': 'Offline',

  // Theme / language toggles
  'theme.toLight': 'Switch to light mode',
  'theme.toDark': 'Switch to dark mode',
  'lang.switch': 'Change language',

  // Mobile navigation
  'nav.exercises': 'Exercises',
  'nav.workout': 'Workout',
  'nav.history': 'History',
  'nav.users': 'Users',
  'layout.mobileView': 'Mobile view',

  // Login
  'login.subtitle': 'Sign in to load your exercises.',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.noAccount': 'No account yet?',
  'login.register': 'Sign up',
  'login.error': 'Sign-in failed',

  // Register
  'register.subtitle': 'Create an account to get started.',
  'register.passwordLabel': 'Password (min. 6 characters)',
  'register.submit': 'Sign up',
  'register.submitting': 'Signing up…',
  'register.haveAccount': 'Already have an account?',
  'register.login': 'Sign in',
  'register.error': 'Registration failed',

  // Exercise list
  'exercises.title': 'Exercises',
  'exercises.loading': 'Loading exercises…',
  'exercises.offlineCache': 'Offline — cached data',
  'exercises.searchPlaceholder': 'Search exercise…',
  'exercises.all': 'All',
  'exercises.emptyTitle': 'No exercises found',
  'exercises.emptyHint': 'Adjust your search or filter.',
  'exercises.loadError': 'Failed to load',

  // Exercise detail
  'detail.notFound': 'Exercise not found',
  'detail.back': 'Back',
  'detail.instructions': 'Instructions',
  'detail.noInstructions': 'No instructions provided.',
  'detail.addToWorkout': 'Add to workout',

  // Workout
  'workout.title': 'Workout',
  'workout.emptyTitle': 'No exercises yet',
  'workout.emptyHint': 'Add exercises to log your workout.',
  'workout.remove': 'Remove',
  'workout.set': 'Set',
  'workout.reps': 'Reps',
  'workout.weight': 'Weight (kg)',
  'workout.addSet': '+ Set',
  'workout.addExercise': '+ Add exercise',
  'workout.pickTitle': 'Choose exercise',

  // History
  'history.title': 'History',
  'history.emptyTitle': 'No workouts yet',
  'history.emptyHint': 'Your saved workouts appear here — on this device only.',
  'history.exercises': 'exercises',
  'history.sets': 'sets',

  // Admin — exercises
  'admin.ex.title': 'Manage exercises',
  'admin.ex.subtitle': 'Create and maintain exercises with instructions, photos and videos.',
  'admin.ex.new': '+ New exercise',
  'admin.ex.import': 'Import CSV',
  'admin.ex.importing': 'Importing…',
  'admin.ex.template': 'Download template',
  'admin.ex.colCategory': 'Category',
  'admin.ex.colDifficulty': 'Difficulty',
  'admin.ex.colMedia': 'Media',
  'admin.ex.emptyTitle': 'No exercises yet',
  'admin.ex.emptyHint': 'Create your first exercise.',
  'admin.ex.deleteConfirm': 'Really delete "{name}"? Its media will be removed too.',
  'admin.ex.editTitle': 'Edit exercise',
  'admin.ex.newTitle': 'New exercise',
  'admin.ex.loadError': 'Failed to load',
  'admin.ex.deleteError': 'Failed to delete',

  // Admin — CSV import result
  'import.resultTitle': 'Import result',
  'import.imported': '{count} imported',
  'import.skipped': '{count} skipped (duplicates)',
  'import.errorsTitle': 'Errors',
  'import.rowError': 'Row {row}: {message}',
  'import.error': 'Import failed',

  // Admin — exercise form
  'form.nameDe': 'Name (German)',
  'form.nameEn': 'Name (English)',
  'form.instructionsDe': 'Instructions (German)',
  'form.instructionsEn': 'Instructions (English)',
  'form.category': 'Category',
  'form.difficulty': 'Difficulty',
  'form.instructionsPlaceholder': 'Step-by-step instructions…',
  'form.saveChanges': 'Save changes',
  'form.create': 'Create exercise',
  'form.saving': 'Saving…',
  'form.media': 'Photos & videos',
  'form.upload': '+ Upload',
  'form.uploading': 'Uploading…',
  'form.saveFirst': 'Save the exercise first',
  'form.saveFirstHint': 'Save the exercise first to add media.',
  'form.noMedia': 'No media yet.',
  'form.nameRequired': 'At least one name (German or English) is required.',
  'form.saveError': 'Failed to save',
  'form.uploadError': 'Upload failed',
  'form.deleteError': 'Failed to delete',

  // Admin — users
  'users.title': 'Users',
  'users.subtitle': 'Manage accounts and roles.',
  'users.new': '+ User',
  'users.empty': 'No users',
  'users.role': 'Role',
  'users.you': '(you)',
  'users.deleteConfirm': 'Delete user "{name}"?',
  'users.newTitle': 'New user',
  'users.create': 'Create',
  'users.creating': 'Creating…',
  'users.loadError': 'Failed to load',
  'users.roleError': 'Failed to change role',
  'users.deleteError': 'Failed to delete',
  'users.createError': 'Failed to create',

  // Difficulty labels
  'difficulty.beginner': 'Beginner',
  'difficulty.intermediate': 'Intermediate',
  'difficulty.advanced': 'Advanced',

  // Category labels
  'category.chest': 'Chest',
  'category.back': 'Back',
  'category.legs': 'Legs',
  'category.shoulders': 'Shoulders',
  'category.arms': 'Arms',
  'category.core': 'Core',
  'category.cardio': 'Cardio',
  'category.other': 'Other',
};
