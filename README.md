# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Supabase 环境变量

本项目通过前端直连 Supabase（PostgREST / Auth）。必须配置以下环境变量（见 [.env.example](file:///Users/brucewang/Documents/AIYA/home/.env.example)）：

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

注意事项：

- `VITE_SUPABASE_ANON_KEY` 会被打包进前端代码，属于可公开的 anon key；权限控制必须依赖 Supabase 的 RLS/Policy。
- 不要把 `service_role` key 放到前端或任何会下发到浏览器的环境变量里。
- Vite 的 `VITE_` 变量是构建时注入：在 Vercel 修改 Environment Variables 后需要重新部署（触发重新构建）才能生效。

### Vercel 部署检查

- Project Settings → Environment Variables 配置上述变量（Production/Preview/Development 按需分别配置）。
- 部署后在浏览器 Network 里确认对 `https://<project>.supabase.co/rest/v1/...` 的请求带有 `apikey` header；缺失会导致请求失败（常见报错为 No API key found）。

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
