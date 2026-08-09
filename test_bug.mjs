import https from 'node:https';

async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  
  console.log(`Simulating SECOND SESSION where /welcome was served from client cache (no cookie yet).`);
  console.log(`Hitting PATCH /api/profile with NO cookie...`);
  let res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: "seed_identity", name: `StuckGuest` })
  });
  
  let cookies = res.headers.getSetCookie();
  console.log(`Set-Cookie from PATCH:`, cookies);
  let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  let guestId = guestIdCookie ? guestIdCookie.split(';')[0] : null;
  console.log(`Received guestId from PATCH response: ${guestId}`);
  
  let text = await res.text();
  console.log(`PATCH Body: ${text}`);

  console.log(`\nNow client has the cookie, hits GET /api/auth/status...`);
  let getRes = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { 'Cookie': guestId }
  });
  let getText = await getRes.text();
  console.log(`GET returns: ${getText}`);
}

run().catch(console.error);
