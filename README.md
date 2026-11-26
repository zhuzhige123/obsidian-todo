# TODO

Obsidian sidebar task manager with three views:

- **My Day** — hand-picked focus list for today (stored in plugin data)
- **Suggestions** — smart push for overdue and upcoming due tasks; `+` adds to My Day and removes from suggestions
- **Day workspace** — calendar + day task list + search

Compatible with common [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) emoji markers (`📅` `⏳` `➕` `✅` `🔁` priorities).

## Install (local / BRAT)

1. `npm install`
2. `npm run build`
3. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/todo/`
4. Enable **TODO** in Community plugins

## Develop

```bash
npm install
npm run dev
```

## Notes

- Plugin id: `todo`
- Display name: `TODO`
- Independent product (not part of Weave)
