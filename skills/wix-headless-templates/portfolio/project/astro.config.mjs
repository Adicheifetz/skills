import cacheWix from "@wix/astro-wix-hosting-adapter/cache";
import tailwindcss from "@tailwindcss/vite";
// @ts-check
import { defineConfig } from 'astro/config';
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";

import react from "@astrojs/react";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";

// https://astro.build/config
export default defineConfig({
  cache: { provider: cacheWix() },
  routeRules: {
    "/portfolio": {"maxAge":3600},
    "/portfolio/[slug]": {"maxAge":3600},
    "/projects/[slug]": {"maxAge":3600},
  },
  vite: { plugins: [tailwindcss()] },
  integrations: [wix(), wixPages(), react()],
  security: { checkOrigin: false },
  adapter: wixHostingAdapter(),

  image: {
    domains: ["static.wixstatic.com"],
  },

  output: "server",
});