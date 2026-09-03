/**
 * Decides where a newly captured lead goes. The logic branches completely
 * depending on which "pill" the source page/tenant belongs to:
 *
 *   BLUE PILL (tenant owns the page): their traffic, their lead, always.
 *   No cap applies -- capping or reselling leads a tenant paid to generate
 *   themselves would break the entire "you own this" pitch.
 *
 *   RED PILL (page has no owning tenant): the lead is up for grabs. We find
 *   an active red-pill tenant for this service category with room left
 *   today (leads_per_day) and this month (lead_cap), and assign it to them.
 *   If every red-pill tenant is full, it goes to you (in_house) rather than
 *   sitting unassigned.
 *
 * Nothing here is autonomous in the sense of skipping the AI action queue for
 * anything beyond this one routing decision -- this only decides where a
 * lead's ownership lands, not whether it gets contacted, resold, etc.
 */
export async function routeLead(pool, { tenantId, serviceId }) {
  // ---------- BLUE PILL: lead came from a page a tenant owns ----------
  if (tenantId) {
    const { rows } = await pool.query(
      `select tc.status from tenant_categories tc
       join tenants t on t.id = tc.tenant_id
       where tc.tenant_id = $1 and tc.service_id = $2 and t.plan_type = 'blue_pill'`,
      [tenantId, serviceId]
    );

    if (rows.length === 0 || rows[0].status !== "active") {
      return { routing_mode: "marketplace", overflow_reason: "tenant_category_not_subscribed" };
    }

    // Their page, their paid traffic -- every lead is unconditionally theirs.
    return { routing_mode: "tenant", overflow_reason: null };
  }

  // ---------- RED PILL: platform-owned page, find a tenant with room ----------
  const { rows: candidates } = await pool.query(
    `select tc.tenant_id, tc.leads_per_day, tc.lead_cap
     from tenant_categories tc
     join tenants t on t.id = tc.tenant_id
     where tc.service_id = $1 and tc.status = 'active' and t.plan_type = 'red_pill'
       and t.receiving_leads and coalesce(t.status,'active') = 'active'
     order by tc.subscribed_at asc`,
    [serviceId]
  );

  for (const candidate of candidates) {
    const { rows: countRows } = await pool.query(
      `select
         count(*) filter (where created_at >= date_trunc('day', now()))::int as used_today,
         count(*) filter (where created_at >= date_trunc('month', now()))::int as used_month
       from leads
       where tenant_id = $1 and service_id = $2 and routing_mode = 'tenant'`,
      [candidate.tenant_id, serviceId]
    );
    const { used_today, used_month } = countRows[0];
    const underDaily = candidate.leads_per_day == null || used_today < candidate.leads_per_day;
    const underMonthly = candidate.lead_cap == null || used_month < candidate.lead_cap;

    if (underDaily && underMonthly) {
      return { routing_mode: "tenant", overflow_reason: null, assignedTenantId: candidate.tenant_id };
    }
  }

  // No red-pill tenant has room right now (or none exist for this category).
  // Before falling back to in-house, honor the admin's explicit "receiving
  // leads" selection: any tenant the admin flagged to receive inbound leads
  // gets platform-owned leads round-robin, fewest-this-month first. This is
  // what makes "send incoming leads to these tenants" work for tenants that
  // don't own the source page.
  const { rows: receivers } = await pool.query(
    `select t.id as tenant_id,
            (select count(*) from leads l
              where l.tenant_id = t.id
                and l.created_at >= date_trunc('month', now())) as used_month
     from tenants t
     where t.receiving_leads = true
       and coalesce(t.status, 'active') = 'active'
       and t.deleted_at is null
     order by used_month asc, t.id asc
     limit 1`
  );
  if (receivers.length > 0) {
    return { routing_mode: "tenant", overflow_reason: null, assignedTenantId: receivers[0].tenant_id };
  }

  // No tenant is flagged to receive leads -- work it yourself rather than
  // letting it sit unassigned.
  return {
    routing_mode: "in_house",
    overflow_reason: candidates.length ? "all_red_pill_tenants_at_cap" : "no_receiving_tenant",
  };
}
