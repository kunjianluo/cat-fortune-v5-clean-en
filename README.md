# Meowracle Hat V5 English Toggle Experiment

This is an English-toggle experiment copy of the clean runtime-only V5 baseline.

The source clean baseline remains untouched.

Chinese remains the default language. The language toggle is experimental and only wires a small amount of UI text for now.

This copy intentionally excludes source CSVs, scripts, PRDs, old git history, and music files.

Local test command:

```sh
python3 -m http.server 4174
```

Then open:

```text
http://localhost:4174
```

Cloudflare deploy uses `wrangler.jsonc` and deploys project root.
