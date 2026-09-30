# Modular OpenAPI — Fortnite Brasil Admin API

This package refactors the original `openapi.yaml` into a modular structure while preserving the existing paths, schemas, tags, servers, and security scheme.

## Structure

```text
openapi/
├── index.yaml                 # main entrypoint
├── components/
│   └── security.yaml          # shared components
├── domains/
│   ├── auth/
│   │   ├── index.yaml         # domain aggregator
│   │   ├── paths/
│   │   └── schemas/
│   ├── groups/
│   │   ├── index.yaml         # domain aggregator
│   │   ├── paths/
│   │   └── schemas/
│   ├── members/
│   ├── vips/
│   ├── announcements/
│   └── giveaways/
├── all-paths.yaml              # technical path aggregator
├── all-schemas.yaml            # technical schema aggregator
└── dist/
    └── openapi.yaml            # optional generated artifact
```

## Why this organization?

Each domain has an `index.yaml` that acts as an aggregator. Within each domain, endpoints are split by functional area and schemas are kept in individual files. This prevents files such as `groups.yaml` from growing indefinitely as new group sub-routes are added.

The `all-paths.yaml` and `all-schemas.yaml` files provide the technical aggregation required by the root `index.yaml` without duplicating API contracts.

## Bundling tool

The **Redocly CLI** is used to validate and bundle the OpenAPI files. It resolves external `$ref` references and produces a single OpenAPI document consumable by OpenAPI Generator.

Local installation:

```bash
npm install
```

Or install globally if preferred:

```bash
npm install -g @redocly/cli
```

## Bundle command

From the package/project root:

```bash
npx redocly bundle openapi/index.yaml -o ./openapi.yaml
```

Because `package.json` already defines the equivalent script, you can also use:

```bash
cd v1
    npm run openapi:bundle
```


## OpenAPI Generator

After bundling, use **`openapi.yaml`** as the OpenAPI Generator input. Generic example:

```bash
openapi-generator-cli generate -i openapi.yaml ...
```

Replace the remaining parameters (`-g`, `-o`, `-c`, etc.) with the parameters already used by your project.

## Maintenance rule

Do not edit `openapi.yaml` manually. It is a generated artifact.

To add a new feature:

1. Edit or create the functional file inside `domains/<domain>/paths/`.
2. Edit or create the corresponding schema inside `domains/<domain>/schemas/`.
3. Add the `$ref` entries to `domains/<domain>/index.yaml`.
4. Run `npm run openapi:build`.
5. Use `openapi.yaml` with OpenAPI Generator.

## `$ref` note

Domain files are aggregators and do not need to be complete OpenAPI documents. The root `index.yaml` is the main OpenAPI document. Redocly resolves `$ref` references during bundling and produces the final consolidated document.

## Compatibility note

API field names and existing enum values are intentionally preserved, including values currently used by the backend such as `pt-BR`, `Geral`, `Membro`, and other domain literals. These are contract values rather than documentation text; translating them would change the API contract. Human-readable summaries, descriptions, and comments are written in English.
