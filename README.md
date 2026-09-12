# Eve

Eve is an open-source canvas engine for designing and prototyping visual interfaces. It brings pages, reusable components, instances, assets, variables, and theme modes together in an editor built to scale to large documents.

The project is organized as a monorepo so the web application and future shared packages can live in a single workspace.

## Requirements

- Node.js 22 or later
- pnpm 11 or later

## Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The web application will be available at `http://localhost:5173`.

## Commands

- `pnpm build`: type-checks and builds every workspace package.
- `pnpm test`: runs the functional test suite with Vitest.
- `pnpm test:performance`: runs performance budgets with scenes containing up to one million geometric bounds.
- `pnpm typecheck`: checks TypeScript types across the monorepo.

## Performance

The performance suite is kept separate from the functional tests to avoid adding noise to the normal development cycle. It covers spatial-index construction and queries, the transferable format used by Web Workers, large-scale variable resolution, and immutable updates on large documents.

Each scenario validates its result against a deliberately generous performance budget designed to catch major regressions rather than small differences between machines. The suite reports elapsed time, processed volume, and compact-buffer memory usage. You can adjust scene sizes with `PERF_SCENE_ELEMENTS` and `PERF_BOUND_COUNT` for more demanding local runs.

## Repository structure

```text
apps/
  web/             Eve's browser-based editor
package.json       Root workspace commands
pnpm-workspace.yaml
```

## License

Eve is released under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for the full terms.
