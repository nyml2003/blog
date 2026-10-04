/**
 * 编译期锚：本包的实现满足 @fluvient-loom/serde 的 Parser / Serializer 契约。
 * 只编译不执行（文件名不匹配包内 tsx --test 的 test/*.test.ts 通配）。
 */
import type { Parser, Serializer } from "@fluvient-loom/serde";
import { parseJsonText, serializeJson } from "../src/json.ts";
import { parseQueryString } from "../src/search-params.ts";

const jsonParser: Parser<string> = parseJsonText;
const jsonSerializer: Serializer = serializeJson;
const queryParser: Parser<string | URL> = parseQueryString;

// 以上声明仅作编译期断言；本文件不会被执行。
export { jsonParser, jsonSerializer, queryParser };
