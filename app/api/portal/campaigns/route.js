import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

const PLATFORMS = {
  google_ads: "Google Ads",
  meta: "Meta (Facebook & Instagram)",
  microsoft_ads: "Microsoft Ads (Bing)",
  tiktok: "TikTok Ads",
};

// POST /api/portal/campaigns — blue-pill ad self-service, one request at a
// time: either a whole state the tenant owns pages in, or a single city page.
// Creates a pending_launch ad_campaigns row plus an ai_action_queue proposal
// for human review. This must NEVER hit a real ad platform or spend money —
// no ads integration exists (see CLAUDE.md); launching stays human-approved.
export async function POST(request) {
  const email = await getAuthedEmail(request);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { scope, platform, state, page_id } = body || {};
  const budget = Number(body?.daily_budget);
  if (!["state", "city"].includes(scope) || !PLATFORMS[platform] || !(budget > 0) || budget > 10000) {
    return NextResponse.json(
      { error: "Provide scope (state|city), a supported platform, and a daily budget" },
      { status: 400 }
    );
  }

  try {
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account for this login" }, { status: 403 });
    if (tenant.plan_type !== "blue_pill") {
      // Red-pill tenants own no pages, so there is nothing for them to advertise.
      return NextResponse.json({ error: "Ad self-service is only available on the software plan" }, { status: 403 });
    }

    let campaignId;
    let targetDesc;

    if (scope === "state") {
      // Tenant must own at least one page in the state they want to advertise.
      const st = await pool.query(
        `select s.id, s.name, count(p.id)::int as owned
         from states s
         left join cities c on c.state_id = s.id
         left join pages p on p.location_city_id = c.id and p.tenant_id = $1
         where lower(s.abbreviation) = lower($2)
         group by s.id, s.name`,
        [tenant.id, String(state || "")]
      );
      if (st.rows.length === 0) return NextResponse.json({ error: "Unknown state" }, { status: 400 });
      if (st.rows[0].owned === 0) {
        return NextResponse.json({ error: "You have no pages in that state" }, { status: 400 });
      }
      const camp = await pool.query(
        `insert into ad_campaigns (tenant_id, state_id, platform, daily_budget, status)
         values ($1, $2, $3, $4, 'pending_launch') returning id`,
        [tenant.id, st.rows[0].id, platform, budget]
      );
      campaignId = camp.rows[0].id;
      targetDesc = `all ${st.rows[0].owned} of their ${st.rows[0].name} pages`;
    } else {
      const page = await pool.query(
        `select p.id, c.name as city, s.abbreviation as state
         from pages p join cities c on p.location_city_id = c.id join states s on c.state_id = s.id
         where p.id = $1 and p.tenant_id = $2`,
        [Number(page_id), tenant.id]
      );
      if (page.rows.length === 0) {
        return NextResponse.json({ error: "That page does not belong to you" }, { status: 400 });
      }
      const camp = await pool.query(
        `insert into ad_campaigns (tenant_id, page_id, platform, daily_budget, status)
         values ($1, $2, $3, $4, 'pending_launch') returning id`,
        [tenant.id, page.rows[0].id, platform, budget]
      );
      campaignId = camp.rows[0].id;
      targetDesc = `${page.rows[0].city}, ${page.rows[0].state}`;
    }

    await pool.query(
      `insert into ai_action_queue (action_type, target_table, target_id, proposed_action, reasoning)
       values ('launch_ad_campaign', 'ad_campaigns', $1, $2, $3)`,
      [
        campaignId,
        JSON.stringify({
          tenant_id: tenant.id,
          tenant: tenant.company_name,
          scope,
          platform,
          target: targetDesc,
          daily_budget: budget,
        }),
        `${tenant.company_name} requested ${PLATFORMS[platform]} for ${targetDesc} at $${budget}/day. Requires manual launch — no ad-platform integration exists.`,
      ]
    );

    return NextResponse.json({ success: true, campaign_id: campaignId });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
