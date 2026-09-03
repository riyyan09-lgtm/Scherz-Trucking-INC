import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { resolveAgent } from "../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET /api/search?q=term  -> { leads, carriers } matched by ILIKE
//   - leads are scoped to the authenticated agent (assigned_agent_id)
//   - carriers are scoped to the agent's tenant (each broker's own roster)
// The tenant directory is intentionally NOT searchable here: agents must not
// see other companies' contact details.
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ leads: [], carriers: [] });
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const like = `%${q}%`;
    const [leads, carriers] = await Promise.all([
      pool.query(
        `select id, name, email, phone, origin_city, destination_city, status
           from leads
          where assigned_agent_id = $1 and deleted_at is null
            and (name ilike $2 or email ilike $2 or phone ilike $2
                 or origin_city ilike $2 or destination_city ilike $2)
          order by created_at desc limit 15`,
        [agent.id, like]
      ),
      pool.query(
        `select id, name, mc_number, equipment
           from carriers
          where tenant_id = $1 and (name ilike $2 or mc_number ilike $2)
          order by name limit 15`,
        [agent.tenant_id, like]
      ),
    ]);

    return NextResponse.json({ leads: leads.rows, carriers: carriers.rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
