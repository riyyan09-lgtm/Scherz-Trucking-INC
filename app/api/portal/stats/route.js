import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

// Tenant portal data — see lib/portalAuth.js for the auth model.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const email = await getAuthedEmail(request);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) {
      return NextResponse.json({ error: "No tenant account for this login" }, { status: 403 });
    }

    const base = {
      company: tenant.company_name,
      planType: tenant.plan_type,
      planTier: tenant.plan_tier,
    };

    if (tenant.plan_type === "blue_pill") {
      const [pages, totals, topState, creatives, campaigns, allowance, recent] = await Promise.all([
        pool.query(
          `select p.id, c.name as city, s.abbreviation as state, sv.name as service,
                  count(l.id) filter (where l.created_at >= date_trunc('month', now()))::int as leads_month
           from pages p
           join cities c on p.location_city_id = c.id
           join states s on c.state_id = s.id
           join services sv on p.service_id = sv.id
           left join leads l on l.source_page_id = p.id
           where p.tenant_id = $1
           group by p.id, c.name, s.abbreviation, sv.name
           order by leads_month desc, c.name`,
          [tenant.id]
        ),
        pool.query(
          `select count(*) filter (where created_at >= date_trunc('month', now()))::int as leads_month,
                  count(*) filter (where created_at >= date_trunc('month', now())
                                     and status in ('booked','closed')
                                     and coalesce(total_tariff,0) - coalesce(carrier_pay,0) > 0)::int as converted_month
           from leads where tenant_id = $1`,
          [tenant.id]
        ),
        pool.query(
          `select s.name as state, count(*)::int as n
           from leads l
           join pages p on l.source_page_id = p.id
           join cities c on p.location_city_id = c.id
           join states s on c.state_id = s.id
           where l.tenant_id = $1 and l.created_at >= date_trunc('month', now())
           group by s.name order by n desc limit 1`,
          [tenant.id]
        ),
        pool.query(
          `select distinct ac.id, ac.headline
           from ad_creatives ac
           join tenant_categories tc on tc.service_id = ac.service_id
           where tc.tenant_id = $1 and ac.is_active
           order by ac.id`,
          [tenant.id]
        ),
        pool.query(
          `select ac.id, ac.status, ac.daily_budget, ac.requested_at, ac.platform,
                  c.name as city, coalesce(s.abbreviation, s2.abbreviation) as state,
                  s2.name as state_name
           from ad_campaigns ac
           left join pages p on ac.page_id = p.id
           left join cities c on p.location_city_id = c.id
           left join states s on c.state_id = s.id
           left join states s2 on ac.state_id = s2.id
           where ac.tenant_id = $1
           order by ac.requested_at desc limit 20`,
          [tenant.id]
        ),
        pool.query(
          `select coalesce(sum(page_allowance), 0)::int as allowance
           from tenant_categories where tenant_id = $1 and status = 'active'`,
          [tenant.id]
        ),
        pool.query(
          `select l.id, l.name, l.phone, l.created_at, l.vehicles, l.assigned_agent_id, a.name as agent_name,
                  l.vehicle_year, l.vehicle_make, l.vehicle_model,
                  l.origin_city, l.origin_state, l.destination_city, l.destination_state,
                  sv.name as service
           from leads l join services sv on l.service_id = sv.id left join agents a on l.assigned_agent_id = a.id
           where l.tenant_id = $1
           order by l.created_at desc limit 15`,
          [tenant.id]
        ),
      ]);
      return NextResponse.json({
        ...base,
        pages: pages.rows,
        pagesLive: pages.rows.length,
        pageAllowance: allowance.rows[0].allowance || null,
        leadsMonth: totals.rows[0].leads_month,
        convertedMonth: totals.rows[0].converted_month,
        topState: topState.rows[0] || null,
        creatives: creatives.rows,
        campaigns: campaigns.rows,
        recentLeads: recent.rows,
      });
    }

    // red_pill
    const [quota, counts, today] = await Promise.all([
      pool.query(
        `select coalesce(sum(leads_per_day), 0)::int as leads_per_day,
                coalesce(sum(lead_cap), 0)::int as lead_cap,
                max(price_per_lead) as price_per_lead
         from tenant_categories where tenant_id = $1 and status = 'active'`,
        [tenant.id]
      ),
      pool.query(
        `select count(*) filter (where created_at >= date_trunc('day', now()))::int as used_today,
                count(*) filter (where created_at >= date_trunc('month', now()))::int as used_month,
                count(*) filter (where created_at >= date_trunc('month', now())
                                   and status in ('booked','closed')
                                   and coalesce(total_tariff,0) - coalesce(carrier_pay,0) > 0)::int as converted_month
         from leads where tenant_id = $1 and routing_mode = 'tenant'`,
        [tenant.id]
      ),
      pool.query(
        `select l.id, l.name, l.phone, l.created_at, l.vehicles, l.assigned_agent_id, a.name as agent_name,
                l.vehicle_year, l.vehicle_make, l.vehicle_model,
                l.origin_city, l.origin_state, l.destination_city, l.destination_state,
                sv.name as service
         from leads l join services sv on l.service_id = sv.id left join agents a on l.assigned_agent_id = a.id
         where l.tenant_id = $1 and l.routing_mode = 'tenant'
         order by l.created_at desc limit 15`,
        [tenant.id]
      ),
    ]);
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
    return NextResponse.json({
      ...base,
      leadsPerDay: quota.rows[0].leads_per_day || null,
      leadCap: quota.rows[0].lead_cap || null,
      pricePerLead: quota.rows[0].price_per_lead ? Number(quota.rows[0].price_per_lead) : null,
      usedToday: counts.rows[0].used_today,
      usedMonth: counts.rows[0].used_month,
      convertedMonth: counts.rows[0].converted_month,
      avgPerDay: Math.round((counts.rows[0].used_month / dayOfMonth) * 10) / 10,
      daysRemaining: daysInMonth - dayOfMonth,
      recentLeads: today.rows,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
