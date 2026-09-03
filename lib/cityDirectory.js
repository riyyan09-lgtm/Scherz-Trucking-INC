import { getPool } from "./db";

// Every published car-shipping page, grouped by state — the internal
// linking backbone for both the homepage's popular-cities preview and the
// full /locations directory.
export async function getDirectory() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select s.name as state_name, s.abbreviation,
              c.name as city_name,
              lower(s.abbreviation) as state_slug,
              lower(replace(c.name, ' ', '-')) as city_slug
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where sv.slug = 'car-shipping' and p.status = 'published'
       order by s.name asc, c.population desc nulls last`
    );
    const byState = new Map();
    for (const r of rows) {
      if (!byState.has(r.state_name)) byState.set(r.state_name, { abbr: r.abbreviation, cities: [] });
      byState.get(r.state_name).cities.push(r);
    }
    return [...byState.entries()];
  } catch {
    return [];
  }
}
