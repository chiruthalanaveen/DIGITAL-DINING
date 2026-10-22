// Self-contained so maintenance does not depend on application services or JavaScript.
export const maintenancePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#f7f7f5">
    <title>Under maintenance | Digital Dine-In</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; background: #f7f7f5; color: #171717; font-family: Arial, Helvetica, sans-serif; }
      header { padding: 26px clamp(24px, 6vw, 80px); border-bottom: 1px solid #e5e5e5; }
      .brand { display: inline-flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 800; }
      .brand-mark { display: grid; place-items: center; width: 38px; height: 38px; background: #171717; color: white; border-radius: 12px; font-size: 12px; }
      main { flex: 1; display: grid; place-items: center; padding: 64px 24px; }
      .notice { width: 100%; max-width: 600px; text-align: center; }
      .icon { display: grid; place-items: center; width: 88px; height: 88px; margin: 0 auto 28px; border: 1px solid #fed7aa; border-radius: 28px; background: #fff0df; color: #c2410c; }
      .eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #c2410c; }
      h1 { margin: 0; font-size: clamp(36px, 7vw, 56px); line-height: 1.08; letter-spacing: -.04em; }
      .description { max-width: 440px; margin: 24px auto 0; color: #525252; font-size: 17px; line-height: 1.7; }
      .actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 16px; margin-top: 32px; }
      a { color: inherit; text-underline-offset: 4px; }
      .retry { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 26px; border-radius: 12px; background: #f97316; color: #171717; text-decoration: none; font-size: 14px; font-weight: 800; }
      .retry:hover { background: #fb923c; }
      .support { padding: 14px 8px; font-size: 14px; color: #525252; }
      a:focus-visible { outline: 3px solid #c2410c; outline-offset: 5px; }
      .reassurance { margin: 32px 0 0; color: #737373; font-size: 13px; line-height: 1.6; }
      footer { padding: 24px; border-top: 1px solid #e5e5e5; text-align: center; color: #737373; font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand"><span class="brand-mark" aria-hidden="true">DD</span>Digital Dine-In</div>
    </header>
    <main>
      <section class="notice" aria-labelledby="maintenance-title">
        <div class="icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4l-5 5a2.1 2.1 0 0 0 3 3l5-5a5 5 0 0 0 6.4-6.4l-3 3-3-3 3-3Z"/>
            <path d="M17 3h4M19 1v4"/>
          </svg>
        </div>
        <p class="eyebrow">Temporarily unavailable</p>
        <h1 id="maintenance-title">We&rsquo;ll be back shortly.</h1>
        <p class="description">Digital Dine-In is currently undergoing maintenance. Thank you for your patience while we get things ready for you.</p>
        <div class="actions">
          <a class="retry" href="">Try again</a>
          <a class="support" href="mailto:digitaldining077@gmail.com">Contact support</a>
        </div>
        <p class="reassurance">Please check back in a little while.</p>
      </section>
    </main>
    <footer>Digital Dine-In &middot; We appreciate your patience.</footer>
  </body>
</html>`
