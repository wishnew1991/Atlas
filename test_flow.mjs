import https from 'node:https';

async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  console.log(`[1] Hitting ${baseUrl}/welcome...`);
  let res = await fetch(`${baseUrl}/welcome`);
  console.log(`Status: ${res.status}`);
  let cookies = res.headers.getSetCookie();
  console.log(`Set-Cookie:`, cookies);
  
  let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  if (!guestIdCookie) {
    console.log("NO GUEST ID COOKIE!");
    return;
  }
  let guestId = guestIdCookie.split(';')[0];
  console.log(`Extracted guest ID cookie: ${guestId}`);

  console.log(`\n[2] Hitting PATCH /api/profile...`);
  res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': guestId
    },
    body: JSON.stringify({ op: "seed_identity", name: "TestGuest" })
  });
  console.log(`Status: ${res.status}`);
  let text = await res.text();
  console.log(`Body: ${text}`);

  console.log(`\n[3] Simulating WelcomeScreen success, setting atlas-user-name=TestGuest client-side.`);
  let allCookies = `${guestId}; atlas-user-name=TestGuest`;

  console.log(`\n[4] Hitting GET /api/auth/status...`);
  res = await fetch(`${baseUrl}/api/auth/status`, {
    headers: {
      'Cookie': allCookies
    }
  });
  console.log(`Status: ${res.status}`);
  text = await res.text();
  console.log(`Body: ${text}`);
  
  console.log(`\n[5] Simulating layout.tsx and ProfileGateProvider behavior:`);
  console.log(`If body is null/empty profileName, ProfileGateProvider redirects to /welcome!`);
}

run().catch(console.error);
