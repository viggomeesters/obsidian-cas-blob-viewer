import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let observers = 0;
let opens = 0;
const revoked = [];
class Plugin {
  cleanups = [];
  register(fn) { this.cleanups.push(fn); }
  registerDomEvent() {}
  registerEditorExtension() {}
  registerMarkdownPostProcessor() {}
  registerMarkdownCodeBlockProcessor() {}
  addCommand() {}
  addSettingTab() {}
  async loadData() { return {renderWikiEmbeds:false}; }
}
class Node {
  textContent = '';
  children = [];
  empty() { this.children = []; }
  addClass() {}
  setAttr() {}
  querySelectorAll() { return []; }
  createEl(tag, options) { const child = {tag, ...options,style:{}}; this.children.push(child); return child; }
  createDiv(options) { const child = new Node(); Object.assign(child,options); this.children.push(child); return child; }
}
const module = {exports:{}};
const context = vm.createContext({module,exports:module.exports,TextDecoder,Blob,
  URL:{createObjectURL:()=> 'blob:test', revokeObjectURL:url=>revoked.push(url)},
  window:{open:()=>opens++,setTimeout:()=>1,clearTimeout(){}},
  MutationObserver:class {constructor(){observers++;} observe(){} disconnect(){}},
  require(name){
    if(name==='obsidian') return {Plugin,PluginSettingTab:class {},Setting:class {},normalizePath:p=>p};
    if(name==='@codemirror/state') return {RangeSetBuilder:class {}};
    if(name==='@codemirror/view') return {WidgetType:class {},ViewPlugin:{},Decoration:{}};
    throw Error(name);
  }
});
vm.runInContext(fs.readFileSync('main.js','utf8'),context);
const plugin = new module.exports.default();
const payload = '<script>window.__executed=true</script><img src="https://example.invalid/leak">';
plugin.app = {workspace:{containerEl:new Node()},vault:{adapter:{
  stat:async()=>({size:payload.length}),readBinary:async()=>new TextEncoder().encode(payload).buffer
}}};
await plugin.onload();
assert.equal(observers,0,'disabled wiki rendering must not start observer');
for (const mime of ['text/html','application/xhtml+xml','text/plain','text/html;charset=utf-8']) {
  plugin.getMetadata=async()=>({mime_type:mime});
  const el=new Node();
  await plugin.renderReference(el,{hash:'a'.repeat(64)});
  assert.equal(el.children[0].tag,'pre');
  assert.equal(el.children[0].text,payload,'markup remains literal text');
}
assert.equal(opens,0,'active content must never open a browser window');
plugin.objectUrls.add('blob:pending');
plugin.onunload();
assert.ok(revoked.includes('blob:pending'));
const afterUnload=new Node();
await plugin.renderReference(afterUnload,{hash:'a'.repeat(64)});
assert.equal(afterUnload.children.length,0,'unloaded plugin must not render');
console.log('runtime security and lifecycle checks passed');
