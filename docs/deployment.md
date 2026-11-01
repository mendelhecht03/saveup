# Deployment boundaries

## Existing phone preview

URL: https://saveup-inbox-lab-mendel.mendelhecht770.chatgpt.site/

This is the existing owner-private, temporary Sites deployment. Open it in iPhone Safari and sign in with the owning ChatGPT account if prompted. No automatic expiry is configured.

The imported snapshot came from Sites commit `f251cfc61ddfa5143c21cfbcd381ed78dff7bcaf`. GitHub is now the source for future development, but **a push here does not update that hosted snapshot**.

To publish a future prototype update, use the Sites workflow to deploy the validated contents of `prototype/dist/` to the existing Site, retaining its owner-private access. The original Sites checkout is separate and has its own hosting identity. Do not replace its Git remote with this GitHub remote or copy deployment credentials into this repository. Record the source GitHub commit when deploying so the hosted version is traceable. If the current assistant has no Sites access, it can still edit/test here and must say that the hosted preview was not updated.

No Sites hosting metadata, credentials, automatic GitHub deployment, or new public prototype URL was added during the repository import.

## Existing public GitHub Pages site

URL: https://mendelhecht03.github.io/saveup/

GitHub Pages builds from `main`, at the repository root, using Jekyll. The existing `index.html` and `privacy.html` remain public. The private repository setting does not make this Pages site private.

`_config.yml` excludes the prototype, specification, agent instructions, and development files from the Pages output. Keep those exclusions when adding new internal files. Do not add `.nojekyll`, which would bypass Jekyll's exclusions. Publishing the prototype publicly or changing the Pages source is a separate deployment decision.

After repository changes, verify the Pages build succeeded, the landing/privacy pages still load, and internal paths such as `/saveup/prototype/dist/app.js` and `/saveup/docs/product-spec.md` return 404.

The GitHub Actions `public-pages-boundary` check builds with Jekyll and runs `npm run check:pages` against the actual output. It requires exactly the two existing HTML files, byte-for-byte unchanged by the build. If you intentionally add public assets later, update that allowlist as part of the same reviewed change. Do not loosen it to allow all repository files.

## Local preview

`npm start` serves only `prototype/dist/` at http://127.0.0.1:4187. It is accessible from this computer, not your iPhone. Browser state on localhost is separate from state on the hosted preview.
