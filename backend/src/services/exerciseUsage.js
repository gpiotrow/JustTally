/**
 * @typedef {object} ExerciseUsage
 * @property {number} workouts Live workouts referencing the exercise.
 * @property {number} users    Distinct users those workouts belong to.
 */

/**
 * Count, per exercise, how many live workouts reference it and how many
 * distinct people those belong to.
 *
 * The user count is the part that matters operationally: with several accounts
 * an admin deleting an exercise cannot see whose history they are about to
 * rewrite, so "used by 3 workouts across 2 users" is the warning, not
 * "in use".
 *
 * Matching is by `entries @> [{"exerciseId": ...}]` — jsonb containment matches
 * an array element on a subset of its keys, so extra fields on the entry
 * (sets, exerciseName, exerciseRef) do not affect it. Deleted workouts are
 * excluded: a tombstoned session is not history worth protecting.
 *
 * @param {{query: Function}} runner Pool or transaction client.
 * @param {string[]} exerciseIds
 * @returns {Promise<Map<string, ExerciseUsage>>} One entry per requested id.
 */
export async function countExerciseUsage(runner, exerciseIds) {
  const result = new Map(exerciseIds.map((id) => [id, { workouts: 0, users: 0 }]));
  if (exerciseIds.length === 0) return result;

  const { rows } = await runner.query(
    `SELECT x.id                          AS exercise_id,
            COUNT(w.id)::int              AS workouts,
            COUNT(DISTINCT w.user_id)::int AS users
       FROM unnest($1::text[]) AS x(id)
       LEFT JOIN workouts w
         ON w.deleted_at IS NULL
        AND w.entries @> jsonb_build_array(jsonb_build_object('exerciseId', x.id))
      GROUP BY x.id`,
    [exerciseIds]
  );

  for (const row of rows) {
    result.set(row.exercise_id, { workouts: row.workouts, users: row.users });
  }
  return result;
}
