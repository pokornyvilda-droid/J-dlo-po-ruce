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

    // Home image: replace the two old "60" labels without touching the source image.
    // The original PNG remains available internally via ?original=1.
    if (url.pathname === "/rs-hero.png") {
      if (url.searchParams.get("original") === "1") {
        return env.ASSETS.fetch(request);
      }

      const origin = new URL(request.url);
      origin.search = "?original=1";
      const originalUrl = origin.toString();

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="850" height="1850" viewBox="0 0 850 1850">
  <image x="0" y="0" width="850" height="1850" preserveAspectRatio="none" href="${originalUrl}"/>
  <rect x="285" y="800" width="105" height="43" rx="4" fill="#f7f1e5"/>
  <text x="337" y="829" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#174f3d">185 jídel</text>
  <rect x="128" y="1442" width="170" height="67" rx="4" fill="#f7f1e5"/>
  <text x="213" y="1470" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#174f3d">VŠECH 185</text>
  <text x="213" y="1499" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#174f3d">JÍDEL</text>
</svg>`;

      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-cache"
        }
      });
    }

    // Remove the temporary HTML overlays that were causing the large white boxes.
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const response = await env.ASSETS.fetch(request);
      const html = await response.text();
      const cleaned = html
        .replace(/\.count-fix\{[\s\S]*?\}\n\.count-fix-top\{[\s\S]*?\}\n\.count-fix-bottom\{[\s\S]*?\}\n/, "")
        .replace(/<span class="count-fix count-fix-top">185 jídel<\/span>/, "")
        .replace(/<span class="count-fix count-fix-bottom">VŠECH 185 JÍDEL<\/span>/, "");

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