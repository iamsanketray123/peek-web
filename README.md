This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Use Peek from other code projects

Peek includes a local [ASO MCP server](mcp/README.md) for keyword-position checks,
competitor research, public listings, reviews and snapshot history. Medo/Dosey and
Tether have built-in watchlists; any app can be queried by App Store ID or URL.

With Node 22+ installed, clone this **whole repository**, then:

```sh
npm --prefix mcp ci
npm --prefix mcp test
node mcp/client-config.mjs
```

The last command prints MCP client configuration with paths for your installation.
You do not need the website's dependencies, database or API credentials. Register
once in your coding client and use it from any app directory. See the
[connection instructions](mcp/README.md#connect) for Codex and other clients.
This is a local MCP integration, not a hosted endpoint; iTunes result positions
are proxies, not verified on-device App Store ranks.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
