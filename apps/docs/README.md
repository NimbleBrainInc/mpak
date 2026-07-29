> [!IMPORTANT]
> **These docs have moved.** Content is now maintained in
> [NimbleBrainInc/mpak-web](https://github.com/NimbleBrainInc/mpak-web) under
> `src/content/docs/docs/`, which serves it at `mpak.dev/docs`.
>
> Edit there, not here. This copy still builds `docs.mpak.dev` until that host
> is redirected, at which point this directory is deleted (#163).

# mpak Documentation

Documentation site for [mpak](https://mpak.dev), the package registry for agent capabilities.

Built with [Astro Starlight](https://starlight.astro.build).

## Development

```bash
pnpm install
pnpm dev
```

Open [localhost:4321](http://localhost:4321) to view the docs.

## Build

```bash
pnpm build
```

Output is in `./dist/`.

## Docker

```bash
docker build -t mpak-docs .
docker run -p 8080:80 mpak-docs
```

## Deployment

Deployed to https://docs.mpak.dev
