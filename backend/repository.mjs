import { randomUUID } from 'node:crypto';

export class AuthRepository {
  constructor(pool) { this.pool = pool; }
  async login(profile, issue) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize the same subject; the UNIQUE email/provider constraints handle different subjects racing.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`google:${profile.provider_user_id}`]);
      const identity = await db.query(`SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id
        WHERE i.provider = 'google' AND i.provider_user_id = $1 FOR UPDATE OF u`, [profile.provider_user_id]);
      let user;
      if (identity.rows[0]) {
        // Subject is authoritative: never relink an existing identity just because its email changed.
        const r = await db.query(`UPDATE users SET name=$2, avatar_url=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [identity.rows[0].id, profile.name, profile.avatar_url]);
        user = r.rows[0];
      } else {
        // Match the legacy UNIQUE(email) schema while preserving an existing user's original email casing.
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`email:${profile.email.toLowerCase()}`]);
        const existing = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) ORDER BY created_at LIMIT 2 FOR UPDATE', [profile.email]);
        if (existing.rows.length > 1) throw new Error('Ambiguous legacy email');
        if (existing.rows[0]) {
          const r = await db.query('UPDATE users SET name=$2, avatar_url=$3, updated_at=NOW() WHERE id=$1 RETURNING *',
            [existing.rows[0].id, profile.name, profile.avatar_url]);
          user = r.rows[0];
        } else {
          const r = await db.query('INSERT INTO users(id,email,name,avatar_url) VALUES($1,$2,$3,$4) RETURNING *',
            [`usr-${randomUUID()}`, profile.email, profile.name, profile.avatar_url]);
          user = r.rows[0];
        }
        await db.query(`INSERT INTO user_identities(id,user_id,provider,provider_user_id,email)
          VALUES($1,$2,'google',$3,$4)`, [`ident-${randomUUID()}`, user.id, profile.provider_user_id, profile.email]);
      }
      await db.query(`UPDATE user_identities SET email=$2 WHERE provider='google' AND provider_user_id=$1`, [profile.provider_user_id, profile.email]);
      const session = issue(user);
      await db.query('INSERT INTO auth_sessions(session_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',
        [session.session_id, user.id, session.token_hash, session.expires_at]);
      await db.query('COMMIT');
      return { user: publicUser(user), token: session.token };
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }
  async session(claims, hash) {
    const r = await this.pool.query(`SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id
      WHERE s.session_id=$1 AND s.user_id=$2 AND s.token_hash=$3 AND s.expires_at>NOW()`, [claims.session_id, claims.sub, hash]);
    return r.rows[0] ? publicUser(r.rows[0]) : null;
  }
  async logout(claims, hash) {
    await this.pool.query('DELETE FROM auth_sessions WHERE session_id=$1 AND user_id=$2 AND token_hash=$3', [claims.session_id, claims.sub, hash]);
  }
  async getPetProgress(userId) {
    const r = await this.pool.query('SELECT states, selected_pet_id FROM user_pet_progress WHERE user_id=$1', [userId]);
    if (!r.rows[0]) return { states: {}, selected_pet_id: null };
    return { states: r.rows[0].states || {}, selected_pet_id: r.rows[0].selected_pet_id ?? null };
  }
  async savePetProgress(userId, incomingDoc) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`pet:${userId}`]);
      const current = await db.query('SELECT states, selected_pet_id FROM user_pet_progress WHERE user_id=$1 FOR UPDATE', [userId]);
      const existingDoc = current.rows[0]
        ? { states: current.rows[0].states || {}, selected_pet_id: current.rows[0].selected_pet_id }
        : { states: {}, selected_pet_id: null };

      const mergedStates = mergePetStates(existingDoc.states, incomingDoc.states || {});
      const selectedPetId = incomingDoc.selected_pet_id || existingDoc.selected_pet_id || null;

      await db.query(`
        INSERT INTO user_pet_progress (user_id, states, selected_pet_id, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET states=$2, selected_pet_id=$3, updated_at=NOW()
      `, [userId, JSON.stringify(mergedStates), selectedPetId]);

      await db.query('COMMIT');
      return { states: mergedStates, selected_pet_id: selectedPetId };
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      db.release();
    }
  }
}

export function mergePetStates(s1 = {}, s2 = {}) {
  const merged = { ...s1 };
  for (const [petId, nextState] of Object.entries(s2)) {
    if (!merged[petId]) {
      merged[petId] = nextState;
    } else {
      const prev = merged[petId];
      const mergedDays = { ...(prev.days || {}) };
      if (nextState.days) {
        for (const [dayKey, val] of Object.entries(nextState.days)) {
          mergedDays[dayKey] = Math.max(Number(mergedDays[dayKey] || 0), Number(val || 0));
        }
      }
      const achievements = Array.from(new Set([
        ...(Array.isArray(prev.unlocked_achievements) ? prev.unlocked_achievements : []),
        ...(Array.isArray(nextState.unlocked_achievements) ? nextState.unlocked_achievements : [])
      ]));

      merged[petId] = {
        ...prev,
        ...nextState,
        xp: Math.max(Number(prev.xp || 0), Number(nextState.xp || 0)),
        total_tokens: Math.max(Number(prev.total_tokens || 0), Number(nextState.total_tokens || 0)),
        total_meals: Math.max(Number(prev.total_meals || 0), Number(nextState.total_meals || 0)),
        streak_days: Math.max(Number(prev.streak_days || 0), Number(nextState.streak_days || 0)),
        tokens_today: Math.max(Number(prev.tokens_today || 0), Number(nextState.tokens_today || 0)),
        meals_today: Math.max(Number(prev.meals_today || 0), Number(nextState.meals_today || 0)),
        token_carry: Math.max(Number(prev.token_carry || 0), Number(nextState.token_carry || 0)),
        last_fed_at: (prev.last_fed_at && nextState.last_fed_at)
          ? Math.max(prev.last_fed_at, nextState.last_fed_at)
          : (nextState.last_fed_at || prev.last_fed_at || null),
        days: mergedDays,
        unlocked_achievements: achievements
      };
    }
  }
  return merged;
}
function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url ?? null };
}
