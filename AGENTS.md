# ShepherdConnect

Vue 3 + Vite + Tailwind CSS project.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.ts` - Vue entrypoint; imports `src/index.css` and mounts the Vue app into the `#root` element
- `src/Root.vue` - Vue Router outlet
- `src/App.vue` - Primary application component and the usual starting point for UI work
- `src/components/` - Shared Vue UI components
- `src/router.ts` - Vue Router route definitions
- `src/app/state.ts` - Reactive demo/application state
- `src/lib/supabase.ts` - Configurable Supabase auth and API client
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.ts`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with Vue, Tailwind CSS v4, and the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: Vue 3 and Vue Router
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript, `@vitejs/plugin-vue`, and `vue-tsc`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in Vue templates and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.ts` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure Vue SFC templates are valid and all tags are closed.
- Export reusable Vue SFC components as default exports.
