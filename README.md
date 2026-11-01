This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Maintenance mode

Maintenance mode applies across public page URLs, including
the website, dashboards, QR menus, and installed app routes. Visitors receive a
maintenance notice with HTTP 503, a retry link, and support contact details.
Responses are not cached, and the original URL is preserved when retrying.

Sign in at `/admin`, then open **System → Maintenance Mode** to turn maintenance
on or off. Admin pages remain accessible in either mode. Changes are stored in
the existing Supabase `platform_settings` row with `key=website_status`
(`Not Working` means maintenance on; `Working` means off), and take effect on
subsequent page requests without a restart or deployment. No new table is needed.

The saved admin setting takes precedence. If no setting exists or the database is
unavailable, maintenance defaults to on; `MAINTENANCE_MODE=false` changes this
fallback to off. The control reports database errors instead of claiming an
unsaved change succeeded. Refresh already-open pages to see the updated mode.

API endpoints, authentication handlers, service workers, and static assets remain
available. Maintenance does not replace their authorization checks or pause backend
jobs. Normal builds and restored pages still require the app's Supabase settings.

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
