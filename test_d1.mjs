import https from 'node:https';

async function run() {
  const baseUrl = 'https://preview.atlas-9um.pages.dev';
  
  for(let i=0; i<10; i++) {
    let res = await fetch(`${baseUrl}/welcome`);
    let cookies = res.headers.getSetCookie();
    let guestIdCookie = cookies.find(c => c.startsWith('atlas-user-id='));
    let guestId = guestIdCookie.split(';')[0];
    
    await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': guestId
      },
      body: JSON.stringify({ op: "seed_identity", name: `TestGuest${i}` })
    });

    let getRes = await fetch(`${baseUrl}/api/auth/status`, {
      headers: {
        'Cookie': guestId
      }
    });
    let text = await getRes.text();
    console.log(`Iter ${i}: GET returns ${text}`);
  }
}

run().catch(console.error);
