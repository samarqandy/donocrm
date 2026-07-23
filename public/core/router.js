export class PageRouter {
  constructor(root) { this.root = root; this.pages = new Map(); this.current = null; }
  register(name, page) { this.pages.set(name, page); return this; }
  async navigate(name, context = {}) {
    const page = this.pages.get(name);
    if (!page) throw new Error(`Unknown page: ${name}`);
    this.current?.page.unmount?.(this.current.context);
    const model = await page.load(context);
    this.root.innerHTML = page.render(model);
    const mounted = { ...context, model, root: this.root, navigate: this.navigate.bind(this) };
    page.mount?.(mounted);
    this.current = { name, page, context: mounted };
  }
}
