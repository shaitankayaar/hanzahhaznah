# Network Hub

A product-based network marketing platform: members, sponsor/referral tree, shop, orders, multi-level commissions, wallet, withdrawals and a full admin panel.

Commissions are paid ONLY on confirmed product orders. Joining is free and nothing is paid for recruiting alone.

## Features
**Public:** landing page, products, rewards plan, register (with sponsor code), login.
**Member:** dashboard (balance, earnings, team size, rank progress), referral link, shop and checkout, my orders, team tree by level, earnings ledger, withdrawals, profile.
**Admin:** overview stats, members (search, suspend, reset password, balance adjustment), products, orders (confirm / reject / deliver / refund), withdrawals (mark paid / reject), settings (company name, commission levels, ranks, payment instructions, withdrawal rules), database backup download.

## How money works
1. A member places an order and pays you manually (JazzCash, Easypaisa, bank) then enters the transaction ID.
2. You check your account and press **Confirm** in Admin > Orders.
3. Commission is credited to the sponsor line: order BV x level % (default 10, 5, 3, 2, 1).
4. Members request withdrawals. You send the money, then press **Mark paid**.
5. Refunding an order automatically reverses the commissions paid on it.

BV (business volume) is set per product and is the amount commissions are calculated on. It cannot exceed the product price.

## Run locally
Needs Node.js 22.13 or newer. No npm packages to install.
```bash
npm start
```
Open http://localhost:3000. On first run the admin account is created and the password is printed in the terminal (or set `ADMIN_USERNAME` and `ADMIN_PASSWORD` first).

Run the tests: `npm test`

## Deploy on Railway
1. Push this folder to GitHub (all files, including the `public` folder).
2. Railway > New Project > Deploy from GitHub repo.
3. Variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `DATA_DIR=/data`.
4. IMPORTANT: add a **Volume** to the service and mount it at `/data`. Without a volume the database is erased on every redeploy.
5. Settings > Networking > Generate Domain.
6. Open the site, log in as admin, go to Settings and enter your company name and payment account details, then add products.

## Before you go live
- Change the admin password and keep `ADMIN_PASSWORD` secret.
- Download a database backup regularly (Admin > Settings).
- There is no email system, so password resets are done by the admin (Members > Manage).
- Payments are manual by design. Online payment gateways can be added later.
- Make sure your company and products are real and registered. Check the direct selling / MLM rules for your country (in Pakistan, SECP rules apply) and add terms and a refund policy. Never promise guaranteed income.

## Structure
```
server.js        backend (zero dependencies: node http + node:sqlite)
test.js          end-to-end test of the commission and wallet logic
public/
  index.html     shell + Tailwind config
  app.jsx        React app (all pages)
  style.css      small custom styles
```
