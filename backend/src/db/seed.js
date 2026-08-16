import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db, { initSchema } from './database.js';

/**
 * Seed the database with the first admin account and a few sample exercises.
 * Idempotent: skips creation if the admin already exists.
 */
async function seed() {
  await initSchema();

  // The 'admin1234' fallback is a local-dev convenience only (see README quick
  // start) — production must set its own, or the admin account it creates is
  // guessable from this file. `fly.toml`'s release_command runs this on every
  // deploy, so a forgotten secret would otherwise fail silently, not loudly.
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    throw new Error(
      'ADMIN_PASSWORD is not set. Refusing to seed a production admin with the default password.'
    );
  }

  const email = process.env.ADMIN_EMAIL || 'admin@justtally.local';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  const name = process.env.ADMIN_NAME || 'Admin';
  const now = Date.now();

  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing[0]) {
    console.log(`Admin "${email}" already exists — skipping seed.`);
    await db.end();
    return;
  }

  const adminId = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'admin', $5, $6)`,
    [adminId, name, email, hash, now, now]
  );
  // Never log the password: this script runs as fly.toml's release_command on
  // every deploy, and deploy logs are not a safe place for it to live.
  console.log(`Created admin: ${email}`);

  const samples = [
    {
      nameDe: 'Langhantel-Bankdrücken',
      nameEn: 'Barbell Bench Press',
      nameEs: 'Press de banca con barra',
      category: 'chest',
      difficulty: 'intermediate',
      purposeDe: 'Kräftigt die Brustmuskulatur, vordere Schulter und Trizeps.',
      purposeEn: 'Builds the chest muscles, front shoulders, and triceps.',
      purposeEs: 'Fortalece el pecho, los hombros anteriores y el tríceps.',
      instructionsDe:
        'Flach auf die Bank legen. Die Stange etwas weiter als schulterbreit greifen. Die Stange zur Brustmitte absenken, dann nach oben drücken, bis die Arme gestreckt sind. Schulterblätter zusammenziehen und die Füße fest auf dem Boden halten.',
      instructionsEn:
        'Lie flat on the bench. Grip the bar slightly wider than shoulder width. Lower the bar to mid-chest, then press up until arms are extended. Retract your shoulder blades and keep your feet planted firmly.',
      instructionsEs:
        'Recuéstate en el banco. Agarra la barra un poco más ancho que el ancho de los hombros. Baja la barra hasta el centro del pecho y empuja hacia arriba hasta extender los brazos. Junta los omóplatos y mantén los pies firmes en el suelo.',
    },
    {
      nameDe: 'Kniebeuge (Körpergewicht)',
      nameEn: 'Bodyweight Squat',
      nameEs: 'Sentadilla con peso corporal',
      category: 'legs',
      difficulty: 'beginner',
      purposeDe: 'Trainiert Oberschenkel, Gesäß und Rumpfstabilität.',
      purposeEn: 'Trains the thighs, glutes, and core stability.',
      purposeEs: 'Entrena los muslos, los glúteos y la estabilidad del core.',
      instructionsDe:
        'Schulterbreit hinstellen. Die Hüfte nach hinten und unten absenken, bis die Oberschenkel parallel zum Boden sind. Über die Fersen wieder hochdrücken. Die Knie in Richtung der Zehen drücken und den Rücken gerade halten.',
      instructionsEn:
        'Stand with feet shoulder-width apart. Lower your hips back and down until thighs are parallel to the floor. Drive through your heels to stand. Push your knees out in line with your toes and keep your back straight.',
      instructionsEs:
        'Ponte de pie con los pies al ancho de los hombros. Baja la cadera hacia atrás y abajo hasta que los muslos queden paralelos al suelo. Empuja a través de los talones para levantarte. Lleva las rodillas en línea con los dedos de los pies y mantén la espalda recta.',
    },
    {
      nameDe: 'Klimmzug',
      nameEn: 'Pull-Up',
      nameEs: 'Dominada',
      category: 'back',
      difficulty: 'advanced',
      purposeDe: 'Baut den Latissimus, den oberen Rücken und die Griffkraft auf.',
      purposeEn: 'Builds the lats, upper back, and grip strength.',
      purposeEs: 'Desarrolla el dorsal ancho, la espalda alta y la fuerza de agarre.',
      instructionsDe:
        'Im Obergriff an der Stange hängen. Die Brust zur Stange ziehen, indem die Ellenbogen nach unten gedrückt werden. Kontrolliert ablassen. Ohne Schwung arbeiten und die Schultern vom Ohr wegziehen.',
      instructionsEn:
        'Hang from the bar with an overhand grip. Pull your chest toward the bar by driving your elbows down. Lower under control. Avoid swinging and keep your shoulders down away from your ears.',
      instructionsEs:
        'Cuélgate de la barra con agarre prono. Lleva el pecho hacia la barra empujando los codos hacia abajo. Baja de forma controlada. Evita balancearte y mantén los hombros alejados de las orejas.',
    },
  ];

  for (const ex of samples) {
    // Denormalized name/instructions = de -> en -> es preferred resolved value.
    const name = ex.nameDe || ex.nameEn || ex.nameEs;
    const instructions = ex.instructionsDe || ex.instructionsEn || ex.instructionsEs;
    await db.query(
      `INSERT INTO exercises
         (id, ref, name, name_de, name_en, name_es, category, difficulty,
          instructions, instructions_de, instructions_en, instructions_es,
          purpose_de, purpose_en, purpose_es,
          created_by, created_at, updated_at)
       VALUES ($1, nextval('exercise_ref_seq'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        nanoid(),
        name,
        ex.nameDe,
        ex.nameEn,
        ex.nameEs,
        ex.category,
        ex.difficulty,
        instructions,
        ex.instructionsDe,
        ex.instructionsEn,
        ex.instructionsEs,
        ex.purposeDe,
        ex.purposeEn,
        ex.purposeEs,
        adminId,
        now,
        now,
      ]
    );
  }
  console.log(`Inserted ${samples.length} sample exercises.`);
  await db.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
