# Deploying

Vercel needs nothing beyond the environment variables: the framework is detected and the build and
output settings are left alone.

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables from `.env.example` under **Settings → Environment Variables**, for
   every environment. Take the Supabase values from `.env.local` and generate a fresh bootstrap
   token for the deployment rather than reusing the local one:

   ```bash
   openssl rand -hex 32   # the production BOOTSTRAP_TOKEN
   ```

   `SUPABASE_SECRET_KEY` is not optional on a deployment: the public API reads with it, so without
   it every API request answers 500.

   `SITE_URL` should be the public origin once you have a domain, so invite links are built from a
   configured value rather than a request header. Vercel's own deployment hostname is used until
   then.

   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are inlined at build time,
   so both have to exist before the deployment is built.

   `UPTIMEROBOT_API_KEY` is optional and must be a **read-only** key: `/status` reads it to show the
   uptime history, and a key that can pause a monitor would be a key the status page could lose.
   Without it the page still runs its own live check and says that no monitor is configured.

3. Deploy, and note the domain it lands on.

## Moving the passkeys to that domain

A passkey is bound to the domain it was created on, and the WebAuthn relying party is a single
project-wide setting. A passkey registered against `localhost` therefore cannot be used on the
deployment, or the other way round. Once the domain is known, point the relying party at it in the
dashboard, under **Authentication → Passkeys**:

- **Relying party ID**: the registrable domain, without a scheme and without `www`, for example
  `backtosstv.org`. A relying party ID also covers its subdomains, so a single value serves both the
  apex and `www`, and keeps working whichever of the two is set as primary. Vercel redirects the
  apex to the host marked primary, so check which one actually serves traffic before deciding.
- **Allowed origins**: every host the app answers on, with its scheme, such as
  `https://backtosstv.org` and `https://www.backtosstv.org`. Browsers treat `localhost` as a secure
  context over plain HTTP, but a real domain has to be HTTPS.

A `*.vercel.app` host works the same way: `vercel.app` is on the public suffix list, so a subdomain
of it counts as a registrable domain.

After that switch, `/shack/bootstrap` refuses an account that already holds a passkey, so the
`localhost` one has to go before the flow reopens. Remove it from `/shack/settings` while still
signed in on `localhost`, then register a fresh passkey on the deployment domain. Every
administrator added from then on gets a passkey bound to the same domain.
