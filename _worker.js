export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

        return Response.json({
          success: true,
          database: "connected",
          tables: tables.results
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            error: String(error)
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
