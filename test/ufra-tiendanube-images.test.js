import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTiendanubeImages, filterImagesBySku } from '../lib/ufra-tiendanube-images.js';

const base = 'https://www.ufra.com.mx/productos/abercrombie-fitch-100-passion-man-100ml-edt-16670/';
const image = 'https://dcdn-us.mitiendanube.com/stores/008/228/574/products/16670_2-e3c34e2f2c1b6ddfe317919235498444-1024-1024.webp';

test('reads Tiendanube image from Product JSON-LD', () => {
  const html = '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Abercrombie',image:[image]})+'</script>';
  assert.deepEqual(extractTiendanubeImages(html,base),[image]);
});
test('deduplicates meta and structured data', () => {
  const html = '<meta property="og:image" content="'+image+'"><script type="application/ld+json">'+JSON.stringify({'@type':'Product',image})+'</script>';
  assert.deepEqual(extractTiendanubeImages(html,base),[image]);
});
test('rejects old UFRA URLs and nonimage external URLs', () => {
  const html = '<meta property="og:image" content="https://ufra.com.mx/media/catalog/product/old.jpg">';
  assert.deepEqual(extractTiendanubeImages(html,base),[]);
});

test('SKU filter removes unrelated recommended products', () => {
  const other = 'https://dcdn-us.mitiendanube.com/stores/008/228/574/products/14938_2-test-480-0.webp';
  assert.deepEqual(filterImagesBySku([other, image], '16670'), [image]);
});
test('SKU filter fails closed for missing SKU', () => {
  assert.deepEqual(filterImagesBySku([image], ''), []);
});
