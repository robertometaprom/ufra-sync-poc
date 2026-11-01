import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTiendanubeImages } from '../lib/ufra-tiendanube-images.js';

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
