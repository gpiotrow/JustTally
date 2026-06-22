import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db, { initSchema } from './database.js';

/**
 * Seed the database with the first admin account and a few sample exercises.
 * Idempotent: skips creation if the admin already exists.
 */
function seed() {
  initSchema();

  const email = process.env.ADMIN_EMAIL || 'admin@justtally.local';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  const name = process.env.ADMIN_NAME || 'Admin';
  const now = Date.now();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.log(`Admin "${email}" already exists — skipping seed.`);
    return;
  }

  const adminId = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', ?, ?)`
  ).run(adminId, name, email, hash, now, now);
  console.log(`Created admin: ${email} / ${password}`);

  const samples = [
    {
      nameDe: 'Langhantel-Bankdrücken',
      nameEn: 'Barbell Bench Press',
      category: 'chest',
      difficulty: 'intermediate',
      instructionsDe:
        'Flach auf die Bank legen. Die Stange etwas weiter als schulterbreit greifen. Die Stange zur Brustmitte absenken, dann nach oben drücken, bis die Arme gestreckt sind.',
      instructionsEn:
        'Lie flat on the bench. Grip the bar slightly wider than shoulder width. Lower the bar to mid-chest, then press up until arms are extended.',
    },
    {
      nameDe: 'Kniebeuge (Körpergewicht)',
      nameEn: 'Bodyweight Squat',
      category: 'legs',
      difficulty: 'beginner',
      instructionsDe:
        'Schulterbreit hinstellen. Die Hüfte nach hinten und unten absenken, bis die Oberschenkel parallel zum Boden sind. Über die Fersen wieder hochdrücken.',
      instructionsEn:
        'Stand with feet shoulder-width apart. Lower your hips back and down until thighs are parallel to the floor. Drive through your heels to stand.',
    },
    {
      nameDe: 'Klimmzug',
      nameEn: 'Pull-Up',
      category: 'back',
      difficulty: 'advanced',
      instructionsDe:
        'Im Obergriff an der Stange hängen. Die Brust zur Stange ziehen, indem die Ellenbogen nach unten gedrückt werden. Kontrolliert ablassen.',
      instructionsEn:
        'Hang from the bar with an overhand grip. Pull your chest toward the bar by driving your elbows down. Lower under control.',
    },
  ];

  const insert = db.prepare(
    `INSERT INTO exercises
       (id, name, name_de, name_en, category, difficulty, instructions, instructions_de, instructions_en, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const ex of samples) {
    // Denormalized name/instructions = German-preferred resolved value.
    const name = ex.nameDe || ex.nameEn;
    const instructions = ex.instructionsDe || ex.instructionsEn;
    insert.run(
      nanoid(),
      name,
      ex.nameDe,
      ex.nameEn,
      ex.category,
      ex.difficulty,
      instructions,
      ex.instructionsDe,
      ex.instructionsEn,
      adminId,
      now,
      now
    );
  }
  console.log(`Inserted ${samples.length} sample exercises.`);
}

seed();
