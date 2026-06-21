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
      name: 'Barbell Bench Press',
      category: 'chest',
      difficulty: 'intermediate',
      instructions:
        'Lie flat on the bench. Grip the bar slightly wider than shoulder width. Lower the bar to mid-chest, then press up until arms are extended.',
    },
    {
      name: 'Bodyweight Squat',
      category: 'legs',
      difficulty: 'beginner',
      instructions:
        'Stand with feet shoulder-width apart. Lower your hips back and down until thighs are parallel to the floor. Drive through your heels to stand.',
    },
    {
      name: 'Pull-Up',
      category: 'back',
      difficulty: 'advanced',
      instructions:
        'Hang from the bar with an overhand grip. Pull your chest toward the bar by driving your elbows down. Lower under control.',
    },
  ];

  const insert = db.prepare(
    `INSERT INTO exercises (id, name, category, difficulty, instructions, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const ex of samples) {
    insert.run(nanoid(), ex.name, ex.category, ex.difficulty, ex.instructions, adminId, now, now);
  }
  console.log(`Inserted ${samples.length} sample exercises.`);
}

seed();
