import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against a running dev server (NAV_BASE, skipped otherwise): the bigger drop targets of the editor.
// A metric dragged from the panel can land below a block's widgets, on the "new block" zone, or anywhere on the block;
// a drop on an occupied cell pushes the widget there down instead of overlapping it; size presets resize a widget.
// Every change is undone at the end so the demo report keeps its layout.
const base = process.env.NAV_BASE;

test('editor drop targets: below the widgets, on the block, on the new-block zone; size presets; no overlaps', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1800 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${base}/login`);
    await page.fill('#email', 'admin@demo.local');
    await page.fill('#password', 'demo1234');
    await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
    await page.goto(`${base}/reports`);
    const href = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).find((h) => /^\/reports\/\d+$/.test(h || '')));
    assert.ok(href, 'a report to edit');
    await page.goto(base + href);
    const block = page.locator('section[data-block]').first();
    await block.waitFor();
    const blocksBefore = await page.locator('section[data-block]').count();
    const widgetsIn = () => block.locator('.rgrid-edit > .ritem:not(.rplaceholder)').count();
    const before = await widgetsIn();
    // open the panel for the first block and take the first metric
    await block.locator('button:has-text("Add metrics")').click();
    const item = page.locator('aside button[draggable="true"]').first();
    await item.waitFor();
    // a real pointer drag (HTML5 drag events in Chromium); the target is read after the drag starts, when the drop areas grow
    const drag = async (target: () => Promise<{ x: number; y: number }>) => {
      const b = (await item.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10, { steps: 5 });
      await page.waitForTimeout(150);
      let p = await target();
      // keep the target on screen: scroll while dragging, then read it again
      if (p.y > 1700 || p.y < 40) {
        await page.evaluate((dy) => window.scrollBy(0, dy), p.y - 900);
        await page.waitForTimeout(200);
        p = await target();
      }
      await page.mouse.move(p.x, p.y, { steps: 20 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.waitForTimeout(400);
    };

    // 1. drop below the existing widgets: the grid has room there only while dragging
    const grid = block.locator('.rgrid-edit');
    const gridBefore = (await grid.boundingBox())!;
    await drag(async () => {
      const g = (await grid.boundingBox())!;
      assert.ok(g.height > gridBefore.height + 100, 'the grid grows a drop area while dragging');
      void gridBefore;
      return { x: g.x + 60, y: g.y + g.height - 40 };
    });
    assert.equal(await widgetsIn(), before + 1, 'dropped below the widgets');
    const overlaps = await grid.evaluate((g) => {
      const rects = [...g.querySelectorAll(':scope > .ritem:not(.rplaceholder)')].map((e) => e.getBoundingClientRect());
      return rects.some((a, i) => rects.slice(i + 1).some((b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1));
    });
    assert.equal(overlaps, false, 'no widget overlaps another');

    // 2. drop on the block header: it goes to the first free place
    await drag(async () => {
      const h = (await block.locator('[data-block-options-toggle]').first().boundingBox())!;
      return { x: h.x - 40, y: h.y + h.height / 2 };
    });
    assert.equal(await widgetsIn(), before + 2, 'dropped on the block header');

    // 3. drop on the new-block zone after the first block
    const zone = page.locator('.newblock-drop').first();
    await drag(async () => {
      await zone.scrollIntoViewIfNeeded();
      const z = (await zone.boundingBox())!;
      return { x: z.x + z.width / 2, y: z.y + z.height / 2 };
    });
    assert.equal(await page.locator('section[data-block]').count(), blocksBefore + 1, 'a new block from the drop');

    // 4. size presets on the last widget of the first block
    const last = block.locator('.rgrid-edit > .ritem:not(.rplaceholder)').last();
    await last.hover();
    await last.locator('button[title^="Settings"]').click();
    const settings = page.locator('[data-size-presets]');
    await settings.locator('button:has-text("Full width")').click();
    await page.waitForTimeout(300);
    assert.equal((await settings.locator('button[aria-pressed="true"]').innerText()).trim(), 'Full width');
    const w = await last.evaluate((e) => e.getBoundingClientRect().width);
    const gw = await grid.evaluate((e) => e.getBoundingClientRect().width);
    assert.ok(Math.abs(w - gw) < 4, 'full width: ' + w + ' of ' + gw);

    // undo everything (four or five steps) and wait for the save
    for (let i = 0; i < 6; i++) await page.keyboard.press('Control+z');
    await page.waitForTimeout(2500);
  } finally {
    await browser.close();
  }
});
