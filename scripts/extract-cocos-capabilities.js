#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const editorMessageRoot = path.join(root, 'node_modules/@cocos/creator-types/editor/packages');
const engineTypesFile = path.join(root, 'node_modules/@cocos/creator-types/engine/cc.d.ts');
const outputFile = path.join(root, 'generated/cocos-capabilities.json');

function main() {
  // EN: Keep this output deterministic so regenerating the catalog does not create timestamp-only diffs.
  // ZH: 保持生成结果稳定，避免重新生成时产生只有时间戳变化的 diff。
  const editorMessages = extractEditorMessages();
  const runtime = fs.existsSync(engineTypesFile) ? summarizeEngineRuntime(fs.readFileSync(engineTypesFile, 'utf8')) : {};
  const payload = {
    source: '@cocos/creator-types',
    editorMessages,
    counts: {
      typedEditorMessages: editorMessages.length,
      runtimeClasses: runtime.classes ?? 0,
      runtimeFunctions: runtime.functions ?? 0,
      runtimeMethods: runtime.methods ?? 0,
      runtimeProperties: runtime.properties ?? 0,
      runtimeAccessors: runtime.accessors ?? 0,
    },
  };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Generated ${path.relative(root, outputFile)}`);
  console.log(JSON.stringify(payload.counts, null, 2));
}

function extractEditorMessages() {
  // EN: Cocos message declarations use quoted, double-quoted, and bare keys; parse all three forms.
  // ZH: Cocos message 声明同时存在单引号、双引号和裸 key，三种形式都要解析。
  if (!fs.existsSync(editorMessageRoot)) {
    return [];
  }
  const result = [];
  for (const packageName of fs.readdirSync(editorMessageRoot).sort()) {
    const file = path.join(editorMessageRoot, packageName, '@types/message.d.ts');
    if (!fs.existsSync(file)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const entry of parseMessageEntries(text)) {
      result.push({
        channel: packageName,
        message: entry.name,
        params: entry.params,
        result: entry.result,
      });
    }
  }
  return result.sort((left, right) => `${left.channel}:${left.message}`.localeCompare(`${right.channel}:${right.message}`));
}

function parseMessageEntries(text) {
  const entries = [];
  const nameRegex = /(?:['"]([^'"]+)['"]|^\s*([A-Za-z_$][\w$]*))\s*:\s*\{/gm;
  let match;
  while ((match = nameRegex.exec(text)) !== null) {
    const name = match[1] || match[2];
    if (!name || name === 'result' || name === 'params') {
      continue;
    }
    const block = readBalancedBlock(text, match.index);
    entries.push({
      name,
      params: extractParams(block),
      result: extractResult(block),
    });
  }
  return entries;
}

function readBalancedBlock(text, start) {
  const open = text.indexOf('{', start);
  if (open < 0) {
    return '';
  }
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(open, index + 1);
      }
    }
  }
  return text.slice(open);
}

function extractParams(block) {
  const paramsMatch = block.match(/params\s*:\s*([\s\S]*?),\s*result\s*:/m);
  if (!paramsMatch) {
    return [];
  }
  return paramsMatch[1]
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\]\s*\|\s*\[/)
    .map((part) => part.replace(/^[\s[]+|[\s\]]+$/g, ''))
    .filter(Boolean);
}

function extractResult(block) {
  const resultMatch = block.match(/result\s*:\s*([^,;\n}]+)/m);
  return resultMatch ? resultMatch[1].trim() : 'unknown';
}

function summarizeEngineRuntime(text) {
  return {
    classes: count(/\bexport\s+(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*/g, text),
    functions: count(/\bexport\s+function\s+[A-Za-z_$][\w$]*\s*\(/g, text),
    methods: count(/^\s*(?:public\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:/gm, text),
    properties: count(/^\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\s*:\s*[^;{]+/gm, text),
    accessors: count(/^\s*(?:get|set)\s+[A-Za-z_$][\w$]*\s*\(/gm, text),
  };
}

function count(regex, text) {
  return (text.match(regex) || []).length;
}

main();
