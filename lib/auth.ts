import { betterAuth } from "better-auth";
import { createPool } from "mysql2/promise";

// Build socialProviders object conditionally
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

console.log("BetterAuth Config:", {
  emailAndPassword: "enabled",
  google: socialProviders.google ? "enabled" : "disabled (missing env vars)",
  database: "mysql"
});

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_MODE == "DEV"
  ? "http://localhost:3000"
  : "https://one-league.vercel.app",
  emailAndPassword: { enabled: true },
  socialProviders,
  trustedOrigins: [
    "http://localhost:3000",
    "https://*.vercel.app"
  ],
  database: createPool({
    host: process.env.MYSQL_HOST!,
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!
  }),
});