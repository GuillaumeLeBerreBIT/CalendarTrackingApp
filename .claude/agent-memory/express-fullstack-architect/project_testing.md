---
name: Project testing setup
description: Vitest configuration, ESM mock paths, and a confirmed path trap for vi.mock in this project
type: project
---

Vitest is installed as a devDependency (v4.1.0). The test script in package.json is `vitest run`.

Test files live in `tests/` at the project root. The folder layout is:

```
CalanderTracking/
  db/
  tests/
  utils/
```

`tests/` and `utils/` are siblings. To mock or import anything from `db/` in a test file, the correct relative path is `../db/supabase.js` (one level up), NOT `../../db/supabase.js`.

**Why:** `../../db/supabase.js` from `tests/` resolves two levels above the project root and lands outside the repo entirely. This causes `vi.mock` to target the wrong module, so the real Supabase client runs instead of the mock — producing `mockResolvedValueOnce is not a function` errors.

**How to apply:** Whenever writing or reviewing test imports in this project, verify that paths from `tests/` use `../` to reach peer directories like `db/`, `utils/`, `routes/`, etc.

## ESM mock pattern confirmed working

```js
vi.mock("../db/supabase.js", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      refreshSession: vi.fn(),
    },
  };
  return { default: mockSupabase };
});

import supabase from "../db/supabase.js"; // same path as vi.mock
```

The `default` key in the factory return is required because `supabase.js` uses `export default`. The spy functions created inside the factory ARE the same objects the middleware sees — `vi.clearAllMocks()` in `beforeEach` resets call history without replacing the functions.
