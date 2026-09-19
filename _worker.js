export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // TEST D1
    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return Response.json({
          success: true,
          database: "connected",
          result
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

    // Všechno ostatní necháme obsloužit webem
    return env.ASSETS.fetch(request);
  }
};
