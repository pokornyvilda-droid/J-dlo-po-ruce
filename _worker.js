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


    // JPR-DYNAMIC-COMMONS-V1 – vyhledání a proxy fotek jídel z Wikimedia Commons.
    if (url.pathname === "/api/food-image" && request.method === "GET") {
      const name = (url.searchParams.get("name") || "").trim();
      if (!name) return new Response("Chybí název jídla.", { status: 400 });
      try {
        // Ověřené mapování pro nejčastější recepty, kde automatické hledání může trefit kategorii místo fotografie.
        const known = {
          "kuřecí na paprice s rýží": {
            url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Ku%C5%99e_na_paprice_-_Czech_Republic.jpg?width=900",
            credit: "Pohled 111 / Wikimedia Commons",
            license: "CC BY-SA 4.0"
          }
        };
        const direct = known[name.toLocaleLowerCase("cs-CZ")];
        if (direct) {
          const image = await fetch(direct.url, { headers: { "User-Agent": "JidloPoRuce/1.0" }, cf: { cacheEverything: true, cacheTtl: 604800 } });
          if (image.ok) {
            const headers = new Headers(image.headers);
            headers.set("Cache-Control", "public, max-age=604800");
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Access-Control-Expose-Headers", "X-JPR-Photo-Credit, X-JPR-Photo-License");
            headers.set("X-JPR-Photo-Credit", direct.credit);
            headers.set("X-JPR-Photo-License", direct.license);
            return new Response(image.body, { status: 200, headers });
          }
        }
        // Zkusíme několik variant názvu. U českých receptů bývá název příliš dlouhý
        // a Commons pak vrátí spíš obecný obrázek nebo nic.
        const baseName = name.replace(/\s+s\s+.*$/i, "").trim();
        const shortName = name.split(/\s+/).slice(0, 3).join(" ").trim();
        const queries = [...new Set([name + " food", baseName + " food", shortName + " food"].filter(Boolean))];

        let page = null;
        for (const query of queries) {
          const api = new URL("https://commons.wikimedia.org/w/api.php");
          api.searchParams.set("action", "query");
          api.searchParams.set("generator", "search");
          api.searchParams.set("gsrsearch", query);
          api.searchParams.set("gsrnamespace", "6");
          api.searchParams.set("gsrlimit", "8");
          api.searchParams.set("prop", "imageinfo");
          api.searchParams.set("iiprop", "url|mime|extmetadata");
          api.searchParams.set("iiurlwidth", "900");
          api.searchParams.set("format", "json");
          const search = await fetch(api.toString(), { headers: { "User-Agent": "JidloPoRuce/1.0" } });
          if (!search.ok) continue;
          const data = await search.json();
          const pages = Object.values(data?.query?.pages || {});
          const candidate = pages.find(p => {
            const info = p?.imageinfo?.[0];
            const mime = info?.thumbmime || info?.mime || "";
            const title = String(p?.title || "").toLowerCase();
            return /^image\//i.test(mime) && info?.thumburl &&
              !/logo|icon|map|flag|diagram|coat of arms|symbol/.test(title);
          });
          if (candidate) { page = candidate; break; }
        }

        if (!page) return new Response("Fotka nenalezena.", { status: 404 });
        const info = page.imageinfo[0];
        const image = await fetch(info.thumburl, { headers: { "User-Agent": "JidloPoRuce/1.0" }, cf: { cacheEverything: true, cacheTtl: 604800 } });
        if (!image.ok) return new Response("Fotku se nepodařilo načíst.", { status: 502 });
        const headers = new Headers(image.headers);
        headers.set("Cache-Control", "public, max-age=604800");
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Expose-Headers", "X-JPR-Photo-Credit, X-JPR-Photo-License, X-JPR-Photo-Source");
        const meta = info.extmetadata || {};
        const artist = String(meta.Artist?.value || "").replace(/<[^>]*>/g, "").trim();
        const license = String(meta.LicenseShortName?.value || "").replace(/<[^>]*>/g, "").trim();
        headers.set("X-JPR-Photo-Credit", (artist ? artist + " / " : "") + "Wikimedia Commons");
        headers.set("X-JPR-Photo-License", license || "Wikimedia Commons");
        headers.set("X-JPR-Photo-Source", "https://commons.wikimedia.org/wiki/" + encodeURIComponent(page.title).replace(/%2F/g, "/"));
        return new Response(image.body, { status: 200, headers });
      } catch (error) {
        return new Response("Chyba při hledání fotky.", { status: 502 });
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