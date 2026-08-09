import https from 'node:https';

async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  
  console.log(`[TEST] FIRST GUEST`);
  console.log(`[1] Hit /welcome (page load)...`);
  let res = await fetch(`${baseUrl}/welcome`);
  let cookies = res.headers.getSetCookie();
  let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  let guestId_A = guestIdCookie.split(';')[0];
  console.log(`UUID_A: ${guestId_A}`);

  console.log(`[2] Hit PATCH /api/profile with UUID_A...`);
  res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': guestId_A },
    body: JSON.stringify({ op: "seed_identity", name: `Vishnu` })
  });
  let data = await res.json();
  console.log(`UserProfile.userId = ${data.profile.userId}`);
  if (data.profile.userId !== guestId_A.replace('atlas-user-id=', '')) {
    console.error(`ERROR: UserProfile.userId does not match UUID_A`);
  }

  console.log(`\n[TEST] SECOND GUEST (Simulating Soft Navigation / Client Cache)`);
  console.log(`[1] Hit PATCH /api/profile with NO cookies...`);
  res = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: "seed_identity", name: `Alice` })
  });
  cookies = res.headers.getSetCookie();
  guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
  let guestId_B = guestIdCookie.split(';')[0];
  console.log(`UUID_B: ${guestId_B}`);
  data = await res.json();
  console.log(`UserProfile.userId = ${data.profile.userId}`);
  
  if (data.profile.userId === "anonymous") {
    console.error(`FAIL: Profile was seeded as "anonymous"! The bug is still present.`);
  } else if (data.profile.userId === guestId_B.replace('atlas-user-id=', '')) {
    console.log(`SUCCESS: Profile seeded perfectly under UUID_B!`);
  } else {
    console.log(`WARNING: Profile seeded under unexpected ID: ${data.profile.userId}`);
  }

  console.log(`\n[TEST] Verifying /api/auth/status for UUID_B...`);
  res = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { 'Cookie': guestId_B }
  });
  data = await res.json();
  console.log(`Auth Status returns:`, data);
  if (data.profileName === 'Alice') {
    console.log(`SUCCESS: Auth status correctly found Alice!`);
  } else {
    console.error(`FAIL: Auth status returned: ${data.profileName}`);
  }

}

run().catch(console.error);
