import https from 'node:https';

async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  
  console.log(`[1] FIRST SESSION: Hitting ${baseUrl}/welcome...`);
  let res = await fetch(`${baseUrl}/welcome`);
  let cookies = res.headers.getSetCookie();
  let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  let guestId_A = guestIdCookie.split(';')[0];
  console.log(`guestId_A: ${guestId_A}`);
  
  console.log(`[2] FIRST SESSION: Hitting PATCH /api/profile...`);
  res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': guestId_A },
    body: JSON.stringify({ op: "seed_identity", name: `Vishnu` })
  });
  console.log(`PATCH 1 Status: ${res.status}`);

  console.log(`[3] FIRST SESSION: Hitting GET /api/auth/status...`);
  res = await fetch(`${baseUrl}/api/auth/status`, { headers: { 'Cookie': `${guestId_A}; atlas-user-name=Vishnu` } });
  console.log(`GET 1 Status: ${res.status}`);

  // Simulating LOGOUT
  console.log(`[4] LOGOUT: Clearing cookies locally (just dropping them from our state).`);
  
  console.log(`[5] SECOND SESSION: Hitting ${baseUrl}/welcome (no cookies)...`);
  res = await fetch(`${baseUrl}/welcome`);
  let cookies2 = res.headers.getSetCookie();
  let guestIdCookie2 = cookies2.find(c => c.startsWith('atlas-user-id='));
  let guestId_B = guestIdCookie2.split(';')[0];
  console.log(`guestId_B: ${guestId_B}`);

  console.log(`[6] SECOND SESSION: Hitting PATCH /api/profile...`);
  res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': guestId_B },
    body: JSON.stringify({ op: "seed_identity", name: `Vishnu` })
  });
  console.log(`PATCH 2 Status: ${res.status}`);
  let text = await res.text();
  console.log(`PATCH 2 Body: ${text}`);

  console.log(`[7] SECOND SESSION: Hitting GET /api/auth/status...`);
  res = await fetch(`${baseUrl}/api/auth/status`, { headers: { 'Cookie': `${guestId_B}; atlas-user-name=Vishnu` } });
  console.log(`GET 2 Status: ${res.status}`);
  text = await res.text();
  console.log(`GET 2 Body: ${text}`);
}

run().catch(console.error);
