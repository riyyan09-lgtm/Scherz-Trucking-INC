-- Run this once against your database after running schema.sql.
-- Populates the three core service categories used throughout the app.

INSERT INTO services (name, slug, category) VALUES
  ('Car Shipping', 'car-shipping', 'car'),
  ('Freight Trucking', 'freight-shipping', 'freight'),
  ('Container Shipping', 'container-shipping', 'container')
ON CONFLICT (slug) DO NOTHING;

-- States and cities: import these from the manifest.csv generated alongside
-- your 500 landing pages (500-landing-pages.zip), or write a small script to
-- bulk-insert from it. Each row in that CSV maps directly to a `pages` row
-- once you have matching `states` and `cities` rows in place.
