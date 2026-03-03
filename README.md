# illustrator-mcp

An implementation of MCP server for Adobe Illustrator.
It enables text, image, and path manipulation and information retrieval.
This tool only works on macOS.

## Usage

Add the following to your MCP client configuration file.

```json
{
  "mcpServers": {
    "illustrator": {
      "command": "node",
      "args": [
        "~/Documents/web/illustrator-mcp/build/index.js"
      ]
    }
  }
}
```

## Development

```bash
yarn
yarn test
```

## Illustrator Update Smoke Test

Run this test set every time Illustrator or macOS is updated.

```bash
yarn build
yarn test
yarn test:smoke
```

Prerequisites for `test:smoke`:

- Adobe Illustrator is running on macOS.
- Terminal/Cursor has permission to control Illustrator (Automation/Accessibility).

`test:smoke` validates these runtime operations in order:

- `create_document`
- `layer_manage` (`create` / `list`)
- `create_rects`
- `export_artifact` (SVG and SVGZ)

The smoke script writes:

- `tmp-smoke.svg`
- `tmp-smoke-compressed.svgz`

You can override output paths with environment variables:

- `SMOKE_SVG_PATH`
- `SMOKE_SVGZ_PATH`

Temporary script directory can also be overridden:

- `ILLUSTRATOR_MCP_TMP_DIR`

## Manual E2E Checklist (for failures)

If `yarn test:smoke` fails, run this checklist in your MCP client and confirm each response:

1. `create_document` -> should include `Document created.`
2. `layer_manage` with `create` -> should include your layer name
3. `layer_manage` with `list` -> should include the created layer
4. `create_rects` -> should include `Created successfully.`
5. `export_artifact` (`compressed: false`) -> `.svg` file exists
6. `export_artifact` (`compressed: true`) -> `.svgz` file exists

## Export Behavior Notes

- Export logic is centralized in `src/features/export.ts`.
- Timeout/file-existence fallback is preserved:
  - if Illustrator response times out but artifact exists, the tool returns a warning and treats export as completed.
- For SVG with `compressed: true`, output path is normalized to `.svgz`.
