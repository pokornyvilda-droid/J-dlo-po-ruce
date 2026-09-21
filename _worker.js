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
      const cleaned = html.replace(/<span class="count-fix[^>]*>[^<]*<\\/span>/g, "").replaceAll('href="#oblibene"', 'href="#oblubene"')
        .replace(
          'window.meals=meals;',
          `window.meals=meals;
for(let i=1;i<=185;i++){
  if(window.meals[i])continue;
  const sec=document.getElementById('j'+i);
  if(!sec)continue;
  const title=sec.querySelector('h1')?.textContent?.replace(/^\\d+\\.\\s*/,'').trim()||('Jídlo '+i);
  const pill=sec.querySelector('.pill')?.textContent||'';
  const tm=pill.match(/(\\d+)\\s*min/);
  window.meals[i]=[title,tm?Number(tm[1]):99,'normal','doma'];
}`
        )
        .replace(
          'init();window.addEventListener',
          `const originalRenderFavs=renderFavs;
function renderFavs(){
  const list=document.querySelector('#favList');
  if(!list)return;
  if(!S.favs.length){
    list.innerHTML='<div class="note">❤️ Zatím tu nemáš žádné oblíbené jídlo.<br>U jídla klepni na „Přidat do oblíbených“.</div>';
    return;
  }
  list.innerHTML=S.favs.map(id=>{
    const m=window.meals[id];
    if(!m)return '';
    return '<div class="meal fav-item"><a href="#j'+id+'" style="flex:1"><div><h3>'+m[0]+'</h3><div class="meta">'+(m[1]||'')+' min</div></div></a><button type="button" class="btn secondary fav-remove" data-fav-id="'+id+'">✕ Odebrat</button></div>';
  }).join('');
  list.querySelectorAll('.fav-remove').forEach(btn=>{
    btn.onclick=async()=>{
      const id=Number(btn.dataset.favId);
      S.favs=S.favs.filter(x=>x!==id);
      renderFavs();
      injectMealActions();
      try{await save();}catch(e){console.warn('Oblíbené se nepodařilo uložit:',e);}
    };
  });
}
init();window.addEventListener`
        );
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