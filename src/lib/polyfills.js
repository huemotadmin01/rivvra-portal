// Polyfills for APIs that pdfjs-dist 5.x assumes but older-yet-common
// browsers lack. Public signing pages are opened by external signers on
// whatever browser they have, so we can't rely on evergreen versions.

// URL.parse — Chrome 126+ / Firefox 126+ / Safari 18+
if (typeof URL.parse !== 'function') {
  URL.parse = function parse(url, base) {
    try {
      return new URL(url, base)
    } catch {
      return null
    }
  }
}

// Promise.withResolvers — Chrome 119+ / Firefox 121+ / Safari 17.4+
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
