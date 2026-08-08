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
  amazon: {
    logo: `${PUBLIC_INTEGRATIONS}/amazon/logo.svg`,
  },
  uber: {
    logo: `${PUBLIC_INTEGRATIONS}/uber/logo.svg`,
  },
  ola: {
    logo: `${PUBLIC_INTEGRATIONS}/ola/logo.svg`,
  },
  makemytrip: {
    logo: `${PUBLIC_INTEGRATIONS}/makemytrip/logo.svg`,
  },
  google: {
    logo: `${PUBLIC_INTEGRATIONS}/google/logo.svg`,
  },
  fewsats: {
    logo: `${PUBLIC_INTEGRATIONS}/fewsats/logo.svg`,
  },
};
