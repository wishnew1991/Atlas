const PUBLIC_INTEGRATIONS = "/integrations";

export interface IntegrationBranding {
  logo?: string;
  png?: string;
  accent?: string;
  darkLogo?: string;
  marketplace?: {
    category?: string;
    featured?: boolean;
  };
}

export const integrationBranding: Record<string, IntegrationBranding> = {
  swiggy: {
    logo: `${PUBLIC_INTEGRATIONS}/swiggy/logo.svg`,
  },
  zomato: {
    logo: `${PUBLIC_INTEGRATIONS}/zomato/logo.svg`,
  },
  zepto: {
    logo: `${PUBLIC_INTEGRATIONS}/zepto/logo.svg`,
  },
  uber: {
    logo: `${PUBLIC_INTEGRATIONS}/uber/logo.svg`,
  },
  dhan: {
    logo: `${PUBLIC_INTEGRATIONS}/dhan/logo.svg`,
  },
  upstox: {
    logo: `${PUBLIC_INTEGRATIONS}/upstox/logo.svg`,
  },
  tapetide: {
    logo: `${PUBLIC_INTEGRATIONS}/tapetide/logo.svg`,
  },
  google: {
    logo: `${PUBLIC_INTEGRATIONS}/google/logo.svg`,
  },
  fewsats: {
    logo: `${PUBLIC_INTEGRATIONS}/fewsats/logo.svg`,
  },
};
