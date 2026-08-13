// src/console-auth.test.mjs — 单元测试：控制台签名会话（signToken/verifyToken/cookie）
// 运行：node src/console-auth.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 从 worker.js 提取会话相关函数进行测试（通过构造独立 VM 作用域较繁琐，
// 这里直接复制实现验证逻辑，同时读取 worker.js 确保实现一致）
const src = readFileSync("src/worker.js", "utf8");

// 提取 b64urlEncode/b64urlDecode/hmacSign/signToken/verifyToken 文本
function extract(name) {
  const re = new RegExp(`async function ${name}\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = src.match(re);
  if (!m) throw new Error("not found: " + name);
  return `async function ${name}(${m[1]}) {${m[2]}\n}`;
}
// 同步函数用不同正则（无 async）
function extractSync(name) {
  const re = new RegExp(`function ${name}\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = src.match(re);
  if (!m) throw new Error("not found: " + name);
  return `function ${name}(${m[1]}) {${m[2]}\n}`;
}

const CONSOLE_COOKIE = "chem_console";
const CONSOLE_TTL_MS = 7 * 24 * 3600 * 1000;
const globals = `const CONSOLE_COOKIE=${JSON.stringify(CONSOLE_COOKIE)}; const CONSOLE_TTL_MS=${CONSOLE_TTL_MS};`;
const impl = [
  globals,
  extractSync("b64urlEncode"),
  extractSync("b64urlDecode"),
  extract("hmacSign"),
  extract("signToken"),
  extract("verifyToken"),
  `return { signToken, verifyToken, b64urlEncode, b64urlDecode };`
].join("\n");

const mod = new Function("crypto", "btoa", "atob", "TextEncoder", "TextDecoder", impl);
const { signToken, verifyToken, b64urlEncode, b64urlDecode } = mod(
  globalThis.crypto, globalThis.btoa, globalThis.atob, TextEncoder, TextDecoder
);

// 1) 正常签发与验证
const token = await signToken("s3cret");
assert.ok(token.includes("."), "token 应含点分隔");
const payload = await verifyToken("s3cret", token);
assert.ok(payload && payload.iat > 0 && payload.exp > payload.iat, "payload 应含 iat/exp");

// 2) 错误密钥校验失败
const bad = await verifyToken("wrong", token);
assert.equal(bad, null, "错误密钥应拒绝");

// 3) 篡改 payload 校验失败
const dot = token.indexOf(".");
const [msgB64, sig] = [token.slice(0, dot), token.slice(dot + 1)];
const decoded = new TextDecoder().decode(b64urlDecode(msgB64));
const tampered = JSON.parse(decoded);
tampered.exp = 9999999999;
const tamperedMsg = b64urlEncode(new TextEncoder().encode(JSON.stringify(tampered)));
const forged = await verifyToken("s3cret", tamperedMsg + "." + sig);
assert.equal(forged, null, "篡改 payload 应拒绝");

// 4) 过期 token 拒绝（伪造旧 exp）
const expiredPayload = JSON.stringify({ iat: 1, exp: 2 });
const expiredToken = b64urlEncode(new TextEncoder().encode(expiredPayload)) + "." + sig;
// 用真实签名生成过期 token
const { verifyToken: vt2 } = new Function("crypto", "btoa", "atob", "TextEncoder", "TextDecoder",
  globals + extract("hmacSign") + extract("signToken") + extract("verifyToken") +
  "return { verifyToken };"
)(globalThis.crypto, globalThis.btoa, globalThis.atob, TextEncoder, TextDecoder);
const expiredMsg = b64urlEncode(new TextEncoder().encode(expiredPayload));
const { hmacSign: hs } = new Function("crypto", "btoa", "atob", "TextEncoder", "TextDecoder",
  globals + extractSync("b64urlEncode") + extract("hmacSign") + "return { hmacSign };"
)(globalThis.crypto, globalThis.btoa, globalThis.atob, TextEncoder, TextDecoder);
const expiredSig = await hs("s3cret", expiredPayload);
const expired = await vt2("s3cret", expiredMsg + "." + expiredSig);
assert.equal(expired, null, "过期 token 应拒绝");

// 5) base64url 往返
const round = "hello世界";
const enc = b64urlEncode(new TextEncoder().encode(round));
assert.equal(new TextDecoder().decode(b64urlDecode(enc)), round, "base64url 往返一致");
assert.ok(!/[+/=]/.test(enc), "base64url 不应含 +/= 字符");

// 6) 畸形 token 拒绝
assert.equal(await verifyToken("s3cret", "abc"), null, "无点 token 拒绝");
assert.equal(await verifyToken("s3cret", "!!!.###"), null, "非法字符拒绝");
assert.equal(await verifyToken("s3cret", null), null, "空 token 拒绝");

console.log("PASS: console-auth 全部用例通过");
