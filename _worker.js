export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    // Opravený domovský vizuál: starý PNG zůstává jako zdroj,
    // ale pro uživatele servírujeme asset s korektním počtem 185 jídel.
    if (url.pathname === "/rs-hero.png" && !url.searchParams.has("raw")) {
      const assetUrl = new URL("/rs-hero-185.svg", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    // Při servírování indexu odstraníme pouze staré HTML textové záplaty,
    // aby se přes nový vizuál nevykreslovaly bílé obdélníky.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const response = await env.ASSETS.fetch(request);
      const html = await response.text();
      const cleaned = html.replace(/<span class="count-fix[^>]*>[^<]*<\/span>/g, "");
      return new Response(cleaned, {
        status: response.status,
        headers: response.headers
      });
    }

    // Načtení uživatele
    if (url.pathname === "/api/user" && request.method === "GET") {
      const id = url.searchParams.get("id");

      if (!id) {
        return json({ success: false, error: "Chybí id." }, 400);
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

        return json({ success: true, user });
      } catch (error) {
        return json({ success: false, error: String(error) }, 500);
      }
    }

    // Vytvoření uživatele
    if (url.pathname === "/api/user" && request.method === "POST") {
      try {
        const body = await request.json();

        const result = await env.DB
          .prepare(`
            INSERT INTO users
              (name, people, budget, preferences)
            VALUES (?, ?, ?, ?)
            RETURNING id, name, people, budget, created_at, preferences
          `)
          .bind(
            body.name || "Uživatel",
            Number(body.people) || 1,
            Number(body.budget) || 0,
            JSON.stringify(body.preferences || {})
          )
          .first();

        return json({ success: true, user: result }, 201);
      } catch (error) {
        return json({ success: false, error: String(error) }, 500);
      }
    }

    // Aktualizace stavu aplikace
    if (url.pathname === "/api/user" && request.method === "PUT") {
      const id = url.searchParams.get("id");

      if (!id) {
        return json({ success: false, error: "Chybí id." }, 400);
      }

      try {
        const body = await request.json();

        const result = await env.DB
          .prepare(`
            UPDATE users
            SET preferences = ?
            WHERE id = ?
            RETURNING id, name, people, budget, created_at, preferences
          `)
          .bind(
            JSON.stringify(body.preferences || {}),
            id
          )
          .first();

        if (!result) {
          return json({ success: false, error: "Uživatel nenalezen." }, 404);
        }

        return json({ success: true, user: result });
      } catch (error) {
        return json({ success: false, error: String(error) }, 500);
      }
    }

    // Test / diagnostika D1
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
        return json({ success: false, error: String(error) }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};