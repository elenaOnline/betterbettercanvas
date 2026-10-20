if (!('b2cAgent' in window)) { let n = 0; Object.defineProperty(window, 'b2cAgent', { value: Object.freeze({ v: 1,
  describe: (req = {}) => new Promise((ok, no) => {
    const id = req.id != null ? String(req.id) : 'b2c-' + Date.now().toString(36) + '-' + n++;
    const done = () => { clearTimeout(t); document.removeEventListener('b2c:described', h); };
    const t = setTimeout(() => { done(); no(new Error('b2c: no answer')); }, 2000);
    const h = e => { let d; try { d = JSON.parse(e.detail); } catch (x) { return; } if (d && d.id === id) { done(); ok(d); } };
    document.addEventListener('b2c:described', h);
    document.dispatchEvent(new CustomEvent('b2c:describe', { detail: JSON.stringify({ ...req, v: 1, id }) }));
  }) }) }); }
