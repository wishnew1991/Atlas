import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function getBrowserContext(): Promise<BrowserContext> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  if (!context) {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  }
  return context;
}

export async function swiggyLoginHandoff(userId: string): Promise<string> {
  // Real implementation would launch browser, go to swiggy, trigger OTP modal
  // and extract a session token or QR to hand off to the user.
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  try {
    // await page.goto("https://www.swiggy.com");
    // click login, wait for modal
    return `https://mock-handoff.swiggy.com/login?session=${userId}`;
  } finally {
    await page.close();
  }
}

export async function swiggySearch(query: string): Promise<any> {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  try {
    // await page.goto(`https://www.swiggy.com/search?q=${encodeURIComponent(query)}`);
    // parse results
    return {
      results: [
        { id: "rest_123", name: `Mock Restaurant for ${query}`, rating: 4.5 },
      ],
    };
  } finally {
    await page.close();
  }
}

export async function swiggyAddToCart(itemId: string, quantity: number): Promise<boolean> {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  try {
    // Navigate to restaurant, click add button matching itemId
    return true;
  } finally {
    await page.close();
  }
}

export async function swiggyCheckout(): Promise<string> {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  try {
    // Go to cart, click checkout, extract UPI link
    return "upi://pay?pa=swiggy@icici&pn=Swiggy&am=250.00";
  } finally {
    await page.close();
  }
}

export async function swiggyStatus(orderId: string): Promise<string> {
  return "CONFIRMED";
}
