// Minimal EPUB reader: zip parsing via DecompressionStream, no dependencies.
(() => {
  const dec = new TextDecoder();

  async function inflate(data) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(data); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  async function readZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid EPUB (zip) file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let n = 0; n < count; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entries[name] = { method, csize, off };
      p += 46 + nl + el + cl;
    }
    return async name => {
      const e = entries[name];
      if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const raw = u8.subarray(start, start + e.csize);
      return dec.decode(e.method === 0 ? raw : await inflate(raw));
    };
  }

  const parse = (s, type) => new DOMParser().parseFromString(s, type);
  const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const resolve = (base, href) => {
    const parts = (base + decodeURIComponent(href)).split('/'), out = [];
    for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.') out.push(s); }
    return out.join('/');
  };

  function htmlToText(html) {
    const doc = parse(html, 'text/html');
    doc.querySelectorAll('script,style,nav').forEach(n => n.remove());
    doc.querySelectorAll('p,div,br,li,h1,h2,h3,h4,h5,h6,tr,blockquote').forEach(n => n.append('\n'));
    return (doc.body ? doc.body.textContent : '').replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  async function openEpub(file) {
    const read = await readZip(await file.arrayBuffer());
    const container = await read('META-INF/container.xml');
    if (!container) throw new Error('Missing container.xml');
    const opfPath = parse(container, 'text/xml').querySelector('rootfile').getAttribute('full-path');
    const base = dirOf(opfPath);
    const opf = parse(await read(opfPath), 'text/xml');
    const manifest = {};
    opf.querySelectorAll('manifest > item').forEach(i => (manifest[i.getAttribute('id')] = i));
    const spine = [...opf.querySelectorAll('spine > itemref')]
      .map(r => manifest[r.getAttribute('idref')]).filter(Boolean)
      .map(i => resolve(base, i.getAttribute('href')));

    // Table of contents: EPUB3 nav, else EPUB2 NCX, else spine order.
    let toc = [];
    const navItem = [...Object.values(manifest)].find(i => (i.getAttribute('properties') || '').split(' ').includes('nav'));
    const ncxItem = [...Object.values(manifest)].find(i => i.getAttribute('media-type') === 'application/x-dtbncx+xml');
    try {
      if (navItem) {
        const path = resolve(base, navItem.getAttribute('href'));
        const doc = parse(await read(path), 'text/html');
        const navs = [...doc.querySelectorAll('nav')];
        const tocNav = navs.find(n => (n.getAttribute('epub:type') || '').includes('toc')) || navs[0];
        tocNav.querySelectorAll('a[href]').forEach(a =>
          toc.push({ title: a.textContent.trim().replace(/\s+/g, ' '), path: resolve(dirOf(path), a.getAttribute('href').split('#')[0]) }));
      } else if (ncxItem) {
        const path = resolve(base, ncxItem.getAttribute('href'));
        parse(await read(path), 'text/xml').querySelectorAll('navPoint').forEach(np => {
          const t = np.querySelector('navLabel > text'), c = np.querySelector('content');
          if (t && c) toc.push({ title: t.textContent.trim(), path: resolve(dirOf(path), c.getAttribute('src').split('#')[0]) });
        });
      }
    } catch (_) { toc = []; }
    if (!toc.length) toc = spine.map((path, i) => ({ title: 'Section ' + (i + 1), path }));
    const seen = new Set();
    toc = toc.filter(t => !seen.has(t.path) && seen.add(t.path));

    const title = (opf.querySelector('metadata > title, metadata title') || {}).textContent || file.name;
    return {
      title: title.trim(),
      chapters: toc,
      getText: async ch => htmlToText(await read(ch.path) || ''),
    };
  }

  window.openEpub = openEpub;
})();
