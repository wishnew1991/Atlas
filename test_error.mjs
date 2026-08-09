async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  
  let res = await fetch(`${baseUrl}/welcome`);
  let cookies = res.headers.getSetCookie();
  let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  let guestId = guestIdCookie.split(';')[0];
  console.log(`[1] guestId: ${guestId}`);
  
  await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': guestId },
    body: JSON.stringify({ op: "seed_identity", name: `ErrorTest` })
  });

  console.log(`\n[2] Hitting GET /api/activity...`);
  res = await fetch(`${baseUrl}/api/activity`, {
    headers: { 'Cookie': guestId }
  });
  let text = await res.text();
  console.log(`GET /api/activity returned ${res.status}:`, text);

  console.log(`\n[3] Hitting GET /api/executions (Tasks)...`);
  res = await fetch(`${baseUrl}/api/executions`, {
    headers: { 'Cookie': guestId }
  });
  text = await res.text();
  console.log(`GET /api/executions returned ${res.status}:`, text);
}

run().catch(console.error);
