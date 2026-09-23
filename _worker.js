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

    // Při servírování indexu odstraníme pouze staré HTML textové záplaty,
    // aby se přes nový vizuál nevykreslovaly bílé obdélníky.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const response = await env.ASSETS.fetch(request);
      const html = await response.text();
      const cleaned = html;
      return new Response(cleaned, {
        status: response.status,
        headers: response.headers
      });
    }


    // Proxy obrázků jídel přes Worker – mobilní prohlížeč tak nemusí načítat Wikimedia přímo.
    if (url.pathname === "/api/food-image" && request.method === "GET") {
      const dish = url.searchParams.get("dish");
      const images = {
        "64": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Hospodsky_gulasek.jpg/1024px-Hospodsky_gulasek.jpg"
      };
      const source = images[dish];
      if (!source) return new Response("Obrázek nenalezen.", { status: 404 });
      try {
        const image = await fetch(source, {
          headers: { "User-Agent": "JidloPoRuce/1.0" },
          cf: { cacheEverything: true, cacheTtl: 86400 }
        });
        if (!image.ok) return new Response("Obrázek se nepodařilo načíst.", { status: 502 });
        const headers = new Headers(image.headers);
        headers.set("Cache-Control", "public, max-age=86400");
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(image.body, { status: 200, headers });
      } catch (error) {
        return new Response("Chyba při načítání obrázku.", { status: 502 });
      }
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

    return env.ASSETS.fetch(request);
  }
};