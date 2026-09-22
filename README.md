# TempMail Shelf

Production URL: https://tempmail.utilityshelf.site/

Browser-only UtilityShelf micro utility for checking emails, domains, and URLs against disposable or temporary email providers.

## Features

- Batch checks emails, domains, and URLs.
- Matches disposable domains and disposable subdomains.
- Supports custom allowlist and blocklist overrides.
- Copies a plain text review report.
- Downloads results as CSV.
- Runs entirely in the browser with no backend.

## Source Attribution

The bundled disposable-domain list and validation approach are adapted from:

- `tempmail-checker`: https://github.com/Eahtasham/tempmail-checker
- License: MIT
- Domain list source credited by that project: https://github.com/disposable-email-domains/disposable-email-domains

This site ports the useful browser-safe pieces into a static UtilityShelf page. It does not use the Node package at runtime.

## Local Preview

Open `index.html` directly in a browser, or serve the folder with any static server.

## Publishing

This static site can be published on Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any standard web host.
