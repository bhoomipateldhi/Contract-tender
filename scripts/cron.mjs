import 'dotenv/config';
import cron from 'node-cron';
import nodemailer from 'nodemailer';

const CRON_TZ = process.env.CRON_TZ || "Europe/London";
const recipients = (process.env.ALERT_RECIPIENTS||"").split(',').map(s=>s.trim()).filter(Boolean);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT||587),
  secure: (process.env.SMTP_SECURE||"false")==="true",
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

async function runOnce() {
  const res = await fetch("http://localhost:3000/api/search", { method:"POST", headers:{'content-type':'application/json'}, body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`/api/search failed ${res.status}`);
  const data = await res.json();
  if (!recipients.length || !data.items?.length) return;
  const html = `<p>Found ${data.count} technology-related notices.</p>` +
    `<ul>` + data.items.slice(0,20).map(n=>`<li><a href="${n.link}">${n.title}</a> — ${n.noticeType||""} — ${n.noticeStatus||""} — ${n.organisationName||""}</li>`).join("") + `</ul>`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "alerts@example.com",
    to: recipients.join(','),
    subject: `Daily NHS Tech Procurement Alerts (${new Date().toLocaleDateString()})`,
    html
  });
  console.log("Alert sent to", recipients.join(','));
}

cron.schedule("35 6 * * *", runOnce, { timezone: CRON_TZ });
console.log("Cron scheduled at 06:35", CRON_TZ);
