// Default invoice = the Nest Auto Transport signed agreement / certificate
// layout (blue section bands, two-column origin/destination, vehicle list,
// and a Digital Signature Certificate block with QR). Used whenever a tenant
// has no active custom template. Tokens are filled by lib/invoiceTokens.js +
// buildTokenValues(); {{{...}}} is server-built (never customer data).
export const DEFAULT_HTML_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: Letter; margin: 0.55in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #16243a; margin: 0; font-size: 12.5px; line-height: 1.4; }
  .band { background: #2669b3; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          font-size: 12px; padding: 7px 12px; margin: 16px 0 10px; }
  .header { text-align: center; border-bottom: 3px solid #2669b3; padding-bottom: 12px; margin-bottom: 4px; }
  .header .co { font-size: 22px; font-weight: 800; color: #16243a; }
  .header .addr { font-size: 12px; color: #444; margin-top: 2px; }
  .orderbar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; }
  .orderbar .on { font-weight: 800; color: #2669b3; font-size: 14px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .col .lbl { font-weight: 700; color: #2669b3; display: block; margin-bottom: 2px; }
  .kv { margin-bottom: 4px; }
  .kv .k { font-weight: 700; color: #444; }
  .veh { margin: 4px 0 0 14px; }
  .veh div { margin-bottom: 2px; }
  .pay { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .pay .right { text-align: left; }
  .amt { font-size: 14px; font-weight: 800; }
  .terms-box { border: 1px solid #bcd4ee; background: #f3f8fd; border-radius: 4px; padding: 6px 8px; min-height: 26px; margin-top: 4px; color: #333; }
  .siglegal { font-size: 11px; color: #555; margin: 4px 0 12px; }
  .sigwrap { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
  .sigleft .line { margin-bottom: 8px; }
  .sigleft .line .k { font-weight: 700; color: #444; }
  .qr { text-align: center; }
  .qr img { width: 110px; height: 110px; }
  .qr .cap { font-size: 10px; color: #666; max-width: 130px; margin: 4px auto 0; }
  .barcode { display: flex; align-items: center; gap: 14px; border-top: 1px solid #cdd9e8; margin-top: 16px; padding-top: 10px; }
  .barcode .chklbl { font-size: 10px; color: #666; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .barcode .chkv { font-family: monospace; font-size: 10px; color: #444; word-break: break-all; max-width: 60%; }
  .footer { text-align: center; font-size: 10px; color: #888; margin-top: 18px; }
</style>
</head>
<body>

  <div class="header">
    <div class="co">{{company_name}}</div>
    <div class="addr">{{company_address}}</div>
    <div class="addr">Phone: {{company_phone}}</div>
    <div class="orderbar">
      <span class="on">ORDER # {{order_number}}</span>
      <span>Multi-Factor Digital Fingerprint Checksum</span>
    </div>
  </div>

  <div class="grid2">
    <div>
      <div class="lbl">Customer:</div>
      <div class="kv">{{customer_name}}</div>
      <div class="kv">Phone: {{customer_phone}}</div>
      <div class="kv">Email: {{customer_email}}</div>
    </div>
    <div>
      <div class="lbl">Order Date:</div>
      <div class="kv">{{order_date}}</div>
    </div>
  </div>

  <div class="band">Price and Payment</div>
  <div class="pay">
    <div>
      <div class="kv"><span class="k">Payment Method:</span> {{payment_method}}</div>
    </div>
    <div class="right">
      <div class="kv"><span class="k">Price and Terms:</span></div>
      <div class="kv">First Payment: <span class="amt">{{broker_fee}}</span></div>
      <div class="kv">Payment Due: {{payment_due_when}}</div>
      <div class="kv">Total Tariff: <span class="amt">{{invoice_total}}</span></div>
    </div>
  </div>

  <div class="band">Shipment Details</div>
  <div class="grid2">
    <div>
      <div class="kv"><span class="k">Transport Type:</span> {{trailer_type}}</div>
      <div class="kv"><span class="k">First Available Pickup Date:</span> {{load_date}}</div>
    </div>
    <div></div>
  </div>

  <div class="grid2" style="margin-top:10px;">
    <div>
      <div class="lbl">Origin:</div>
      <div class="kv">{{pickup_contact}}</div>
      <div class="kv">{{pickup_phone}}</div>
      <div class="kv">{{pickup_address}}</div>
    </div>
    <div>
      <div class="lbl">Destination:</div>
      <div class="kv">{{dropoff_contact}}</div>
      <div class="kv">{{dropoff_phone}}</div>
      <div class="kv">{{dropoff_address}}</div>
    </div>
  </div>

  <div class="band">Vehicles</div>
  {{{vehicle_list}}}

  <div class="lbl" style="margin-top:12px;">Special Terms</div>
  <div class="terms-box">{{special_terms}}</div>

  <div class="band">Digital Signature Certificate</div>
  <div class="siglegal">
    By selecting "I Agree" and entering my full name as a binding electronic signature, I understand that an
    electronic signature has the same legal effect and can be enforced in the same way as a written signature.
    Furthermore, I hereby accept terms and conditions of service as described in the "Terms and Conditions" section below.
  </div>
  <div class="sigwrap">
    <div class="sigleft">
      <div class="line"><span class="k">Electronic Signature:</span> {{customer_signature}}</div>
      <div class="line"><span class="k">Signature IP Address:</span> {{signed_ip}}</div>
      <div class="line"><span class="k">Signed and Accepted On:</span> {{signed_at}}</div>
    </div>
    <div class="qr">
      {{{qr_img}}}
      <div class="cap">QR Code represents the permanent URL of this signed document.</div>
    </div>
  </div>

  <div class="barcode">
    <div>
      <div class="chklbl">Multi-Factor Digital Fingerprint Checksum</div>
      <div class="chkv">{{doc_checksum}}</div>
    </div>
  </div>

  <div class="footer">{{company_name}} &middot; Generated {{invoice_date}}</div>
</body>
</html>`;
