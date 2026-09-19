export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Pomocná funkce pro JSON odpovědi
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    // =========================
    // API: UŽIVATEL
    // =========================

    // GET /api/user?id=1
    if (url.pathname === "/api/user" && request.method === "GET") {
      const id = url.searchParams.get("id");

      if (!id) {
        return json({ success: false, error: "Chybí id uživatele." }, 400);
      }

      try {
        const user = await env.DB
          .prepare(`
            SELECT id, name, people, budget, created_at, preferences
            FROM users
            WHERE id = ?
          `)
          .bind(id)
          .first();

        if (!user) {
          return json({ success: false, error: "Uživatel nenalezen." }, 404);
        }

        return json({
          success: true,
          user
        });
      } catch (error) {
        return json({
          success: false,
          error: String(error)
        }, 500);
      }
    }

    // POST /api/user
    if (url.pathname === "/api/user" && request.method === "POST") {
      try {
        const body = await request.json();

        const name = body.name || "";
        const people = Number(body.people) || 1;
        const budget = Number(body.budget) || 0;
        const preferences = body.preferences
          ? JSON.stringify(body.preferences)
          : null;

        const result = await env.DB
          .prepare(`
            INSERT INTO users
              (name, people, budget, preferences)
            VALUES (?, ?, ?, ?)
            RETURNING id, name, people, budget, created_at, preferences
          `)
          .bind(name, people, budget, preferences)
          .first();

        return json({
          success: true,
          user: result
        }, 201);
      } catch (error) {
        return json({
          success: false,
          error: String(error)
        }, 500);
      }
    }

    // =========================
    // TEST DATABÁZE
    // =========================

    if (url.pathname === "/api/db-test") {
      try {
        const tables = await env.DB
          .prepare(`
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
          `)
          .all();

        return json({
          success: true,
          database: "connected",
          tables: tables.results
        });
      } catch (error) {
        return json({
          success: false,
          error: String(error)
        }, 500);
      }
    }

    // =========================
    // WEB
    // =========================

    return env.ASSETS.fetch(request);
  }
};
