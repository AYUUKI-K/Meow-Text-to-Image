import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIconCSS,filterIcons,validFontAwesomeIcon,loadHostIcons} from '../src/ui/fontawesome-icons.js';

const css=String.raw`.fa-paw:before{content:"\f1b0"}.fa-star:before,.fa-favorite::before{content:'\f005'}.fa-0:before{content:"\30"}.fa-cat{--fa:"\f6be"}.fa-star-alias:before{content:"\f005"}`;
test('host icon catalog deduplicates aliases and parses legacy content and current glyph variables',()=>{
    const icons=parseIconCSS(css,'solid');assert.equal(icons.length,4);
    assert.deepEqual(icons.find(icon=>icon.name==='fa-star').names,['fa-star','fa-favorite','fa-star-alias']);
    assert.equal(icons.find(icon=>icon.name==='fa-0').unicode,'0030');assert.equal(icons.find(icon=>icon.name==='fa-cat').unicode,'f6be');
    assert.equal(parseIconCSS('<html>not CSS</html>','solid').length,0);
    assert.equal(parseIconCSS(String.raw`.fa-bad:before{content:"\110000"}.fa-surrogate:before{content:"\d800"}.evil .fa-star:before{content:"\f005"}`,'solid').length,0);
});
test('icon search supports aliases, class names, Unicode hex and decimal without confusing numeric icon names',()=>{
    const icons=[...parseIconCSS(css,'solid'),...parseIconCSS(String.raw`.fa-github:before{content:"\f09b"}`,'brands')];
    for(const query of ['paw','FA-PAW','f1b0','U+F1B0','0xf1b0','\\uf1b0','&#xf1b0;','61872'])assert.equal(filterIcons(icons,query)[0]?.name,'fa-paw',query);
    assert.equal(filterIcons(icons,'favorite')[0].name,'fa-star');assert.equal(filterIcons(icons,'0')[0].name,'fa-0');
    assert.equal(filterIcons(icons,'','brands')[0].name,'fa-github');assert.equal(filterIcons(icons,'github','solid').length,0);assert.equal(filterIcons(icons,'unknown icon').length,0);
});
test('persisted glyphs accept only recognized families, names and valid Unicode scalar values',()=>{
    assert.equal(validFontAwesomeIcon({name:'fa-paw',unicode:'f1b0',family:'solid'}),true);
    for(const patch of [{name:'<img src=x>'},{unicode:'d800'},{unicode:'110000'},{unicode:'f005; color:red'},{family:'unknown'}])assert.equal(validFontAwesomeIcon({name:'fa-star',unicode:'f005',family:'solid',...patch}),false);
});
test('failed host loading can retry and successful catalogs are reused without a network request per search',async()=>{
    await assert.rejects(loadHostIcons(async()=>new Response('missing',{status:404})));
    let reads=0;const icons=await loadHostIcons(async url=>{reads++;return new Response(url.includes('brands')?String.raw`.fa-github:before{content:"\f09b"}`:css);});
    assert.equal(reads,2);assert.equal(icons.length,5);assert.equal(await loadHostIcons(async()=>{throw Error('unexpected fetch');}),icons);
});
