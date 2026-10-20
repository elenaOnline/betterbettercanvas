import { describe, expect, it } from 'vitest';
import { createDom } from '../../src/core/dom.ts';
import { mountInSidePanel } from '../../src/core/side-panel.ts';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('side panel', () => {
  it('on the new dashboard, ignores the empty classic wrapper and mounts in the Courses tab only', async () => {
    document.body.innerHTML = `<div id="content"></div><div id="right-side-wrapper"><aside id="right-side"></aside></div>`;
    const dom = createDom();
    const host = document.createElement('div');
    const off = mountInSidePanel(dom, host, 10);
    const tab = document.createElement('div');
    tab.setAttribute('data-testid', 'courses-tab-content');
    document.getElementById('content')!.appendChild(tab);
    await tick();
    expect(host.parentElement?.parentElement).toBe(tab);
    expect(document.querySelectorAll('b2c-side-panel')).toHaveLength(1);
    off();
    expect(document.querySelectorAll('b2c-side-panel')).toHaveLength(0);
    dom.stopAll();
  });
  it('on the classic dashboard, mounts in the right column', () => {
    document.body.innerHTML = `<div id="content"><div id="dashboard_header_container"></div></div><div id="right-side-wrapper"><aside id="right-side"></aside></div>`;
    const dom = createDom();
    const host = document.createElement('div');
    const off = mountInSidePanel(dom, host, 10);
    expect(host.parentElement?.parentElement?.id).toBe('right-side-wrapper');
    off();
    dom.stopAll();
  });
});
