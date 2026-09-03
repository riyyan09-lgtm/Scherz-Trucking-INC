// One-off bulk lead import for red_pill tenant 54 (rehan / ra@gmail.com).
// Parses a pasted "Name<phone><email>" block, verifies tenant 54 + service 1
// exist, then inserts every valid row into `leads` inside ONE transaction
// (all-or-nothing). Run:  node import_redpill_leads.js
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const f = path.join(__dirname, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const clean = line.replace(/\r$/, "");
    const m = clean.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---- pasted data (name, 10-digit phone, email concatenated) ----
const RAW = `
Erin Packham8017038650epackham@yahoo.com
Deanna Reed4196279949dee_8221@yahoo.com
Brian Hansen7074161318afhansen1@gmail.com
David Halonen7757413250davidhalonen086@gmail.com
Joseph Mavaro2032587210joemavaro@gmail.com
Jessica Drews9858692473januarydrews@gmail.com
Regina Hays3108966454reginahays81@gmail.com
Michael 2095593861mrdieselrepair@yahoo.com
Tyler George2086812671tylergeorge33@aol.com
JosÃ 7072099523Mejiajuan1819@gmail.com
matt 7604031819mathyew420@gmail.com
Ryan Lindquist4195750835darock39480@hotmail.com
Devin O'Connell6035081802devoconnell@yahoo.com
Julie Toca3524189729julietd2517@gmail.com
Jerry Spaulding2073225054jerspaulding@yahoo.com
D Friedman6268723274deadorinjail@yahoo.com
Kevin nason2079431111Kdnason16@gmail.com
Jermaine Mosby9167763473jermaine.mosby@icloud.com
Andrea Franz6103596905andreafranz@verizon.net
Iliana Alonso8329289941mena737@hotmail.com
Salem M Abuawad9739283033historicgp@gmail.com
Atlas Baker4192308389Atlas.baker@icloud.com
Kalise Dyton3023675067dytonka@yahoo.com
Ahlbb 9702658522gangulyabhilash@gmail.com
anthony ruiz7632884191anthonyyspam1@gmail.com
Eric Guevara9512414430ericguev@gmail.com
ELAINE KLEIN9413570967elainerustia@gmail.com
jose cruz4243126735Jcruz.jc95.jc@gmail.com
Orlando Horton jr3462424210Orlandohortonjr@gmail.com
Brenna Earley4805991264brennabarkley@gmail.com
Travis McVay8109560931Travismcvay1227@gmail.com
Kayla Cash3347408258kaylacash@outlook.com
DAVID HODD7156136254freebirdsdkh@gmail.com
Moneka Brown4122585268Monekabrown@yahoo.com
Sheila Moore2604661135gerold3362@gmail.com
Frank Zelnik7345525055frankzelnik@yahoo.com
Jerry 8645060002lathanjerry@yahoo.com
ISAAC hAMMOND4848026709Atokwamena@aol.com
Tiffany Hallgren Crook8172668083Tiffanylhallgren@gmail.com
Huma Salman5106732501Salman.huma@gmail.com
David B Morin5082580467davidbmorin@gmail.com
Matthew jackson5083955309jacksonmatthew70@yahoo.com
Quinn palamar4072746464Qpalamar@gmail.com
AareOna Coleman7693613415aareonaomc@gmail.com
john son5184565859kdc60@hotmail.com
Andrew Gause5012699440gauseandrew3@gmail.com
paul smith5208500137pjsmith2810@me.com
Christine Bustamante5102464270sskxver@gmail.com
Olivia Rockwood8052522006olivia.e.rockwood@icloud.com
Jayce France3862996864Fireball0943@gmail.com
Ashley Hunt8177508210Ashleyjhunt1991@hotmail.com
Alex Franco7738705202alexfranco412@gmail.com
Kade McCann7156516173kadeo629@gmail.com
R 9545551212bothan.ambassador@gmail.com
Mike Hoyt4022109219mikesellsomaha@gmail.com
Pamela Ward2565082747pamelaward72@yahoo.com
Leona Bird2694621050leonabird647@gmail.com
Josephine Glenn6199329612josephineglenn2001@gmail.com
Ines Gates4133358733inesgates89@gmail.com
Nate & Karen Oellien5075306599gemcap77@yahoo.com
Ruben Hernandez3617018576Ruben2165@yahoo.com
Dong Wang9803392457dongwang2000@gmail.com
Allison Hobbs9512632326allisonhobbs548@gmail.com
Kim To5622257926phuocto38@hotmail.com
Jay hall2062227099Justscapes@yahoo.com
Brenden Chadock9708173585chadockb@icloud.com
Jacqueline L Singel7175033951jackielsingel@gmail.com
kumar dalla3166835611kumarpdalla@gmil.com
DELBERT NEESE2102608264DLNEESE8@AOL.COM
Bridgette Small5623311687iambsmall15@gmail.com
Malaya hopkins3132146117malayahopkins2201@gmail.com
Fran Lehmann5124286156fran@franland.net
Tania Alexandre2152511463alexandretania24@gmail.com
Johnny 5617025150dpanthers_1@yahoo.com
Sarah Giovannetti5099416576chipmunkchic1@gmail.com
Antavian 2522037241Antavian0305@gmail.com
Amy Chao2158099433amychao275@gmail.com
Thomas Harris6208990675thomasharris574@gmail.com
Phyllis Gipson2253262335Gipsonphyllis@yahoo.com
Gary Nielsen4024836113garynielsen969@gmail.com
Sarah 2154235880Sarahgal891@gmail.com
Brandee Jaeger2064374613Brandee.gresham@yahoo.com
MICHAEL D keith3173848409mm98darwin@att.net
Alex Alvarez9286006884alex.alvarez@nau.edu
amy tripp8478735485Trippcamy@gmail.com
Arielle Cogborn3134343909aribella17@icloud.com
Maria Bautista5622122871pennyautosales14@gmail.com
Dawn Esman2699984261Dawn.esman@gmail.com
Shelley Baker8163353817crazy3dogs@comcast.net
Danny McNeely9035786856mcneelydanny@gmail.com
Pernell Baker5404467913pernellb58@gmail.com
Alex Iwaniuk5204619721amacias5250@yahoo.com
Donald Coy3172500327popeye1959@msn.com
adam peterson2145789514adamlpeterson@gmail.com
thomas bettinger2185564014trbetting@yahoo.com
Sriram Bettagere2489714636sriramb6@yahoo.com
Nitin Bhavanam9259156102pandupaapa40@gmail.com
Daud Azariah7076137737daud.azariahsd@gmail.com
Steve Wagner7406293455ohioturkeyhunter@hotmail.com
Dennis 2623276605dgcannon8@outlook.com
Chad White4705477888Chadt.white@gmail.com
Gianna Venuti6318138514whoevenisgia@gmail.com
Christian jones8134143785nnem8723@gmail.com
Brennen Hunter6824104678Hubrennen1@gmail.com
Kara Tran4104997056traman1108@gmail.com
Dan Kneeland2532558897dan@dickson.net
Carlos Pedraza7792338330carlos.pedraza8716@gmail.com
Jose la aca3126477997Freddylanda32@hotmail.com
Carl Zalesski2086799982carlczb@yahoo.com
JIM 5084461052JIM02917@GMAIL.COM
Matt 3303018181Matthewpgh02@aol.com
David Tincher7039307915d10cher5@icloud.com
Linda 9786497958l_j_souza@yahoo.com
Jeremy 7147268912Adv0720@yahoo.com
Mark Hogan6613130375smoknsox@pacbell.net
Lacey 6616002929Jordennsmom23@icloud.com
Eric Paukune9032799245therebelsix@gmail.com
Brent Robinson6155843061islandboyempire40@gmail.com
Nathan Malof5135051741nmalof@aol.com
Dino Gochis4358304778dgochis@hotmail.com
Lydia 3526158909Lydia79@yahoo.com
Mike Groves9074604704bbqshackpnw@gmail.com
Cynthia weix4157164862Pweix@yahoo.com
Andrea Bennett7314453162andybsemb@yahoo.com
Lauren Campbell5615103590lamandac@icloud.com
Patrick Moore7197745688mrdonp2023@yahoo.com
Jerry Stevens5042285551Jwstevens.js@gmail.com
Megan Dawson6164907381megandawson022@gmail.com
Kingsley Ogujiofor3054910576kingsleybase@gmail.com
Josh lopez4326381578jlpainting07@gmail.com
Afnan Ahmed3098322567Afnan.ahmed0017@gmail.com
zoila 7863075169zoilasosa37@yahoo.com
Breanne Gilbert6037813722bregilbert13@gmail.com
English (US)9789143252robynlynns0521@gmail.com
C 5105551212coleeb30@gmail.com
Jonathan Niper8029221728juanniperio@gmail.com
John Laird7145985003lairjo1960@gmail.com
Jon Baitson8178748692jon110763@gmail.com
Philip Chavez5055733661Chavez.philip@gmail.com
Marny 2098822181mfernrn@sbcglobal.net
Nicole M Shirley5129470120misytic007@aol.com
KeâDarrius Williams2252452328kedarriuswilliams2013@gmail.com
Sierra Sears4062268781Minimeow99@gmail.com
Paul Eric Watson4104585626watson.eric88@gmail.com
Thomas Schmidt7022779430thomasschmidtt34@gmail.com
Steve behm4406687950Sbehm22@yahoo.com
`;

function parse(raw) {
  const rows = [];
  const skipped = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^name\s*phone\s*email$/i.test(t)) continue; // header
    // name = everything before the 10-digit phone; email = everything after it
    const m = t.match(/^(.*?)(\d{10})(.*)$/);
    if (!m) { skipped.push(t); continue; }
    const name = m[1].trim();
    const phone = m[2];
    const email = m[3].trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped.push(t); continue; }
    rows.push({ name, phone, email });
  }
  return { rows, skipped };
}

(async () => {
  const { rows, skipped } = parse(RAW);
  console.log(`Parsed ${rows.length} valid rows; ${skipped.length} skipped.`);
  if (skipped.length) { console.log("SKIPPED:"); skipped.forEach((s) => console.log("  " + s)); }

  const client = await pool.connect();
  try {
    // pre-checks
    const t = await client.query("SELECT id, plan_type, contact_email FROM tenants WHERE id=$1", [54]);
    if (t.rowCount === 0) throw new Error("tenant 54 not found");
    console.log(`Tenant 54: ${t.rows[0].plan_type} / ${t.rows[0].contact_email}`);
    const s = await client.query("SELECT id, slug FROM services WHERE id=$1", [1]);
    if (s.rowCount === 0) throw new Error("service 1 not found");
    console.log(`Service 1: ${s.rows[0].slug}`);

    await client.query("begin");
    let inserted = 0;
    for (const r of rows) {
      await client.query(
        `INSERT INTO leads (tenant_id, service_id, routing_mode, name, phone, email, is_validated, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,'new',now())`,
        [54, 1, "tenant", r.name, r.phone, r.email]
      );
      inserted++;
    }
    await client.query("commit");
    console.log(`INSERTED ${inserted} leads into tenant 54.`);
  } catch (e) {
    try { await client.query("rollback"); } catch {}
    console.error("IMPORT FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
