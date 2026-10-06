/**
 * Local oxlint (ESLint-compatible) plugin with the project's command-layer rules.
 *
 * - `no-bare-await`: every awaited result must be consumed — assigned, returned, branched on, or
 *   explicitly discarded with `void (await expr);`. Awaiting a call to a locally declared function
 *   whose explicit return type is `Promise<void>` is allowed: there is no result to consume.
 * - `no-node-imports`: command code must not import host APIs (`node:*`) directly; host
 *   capabilities arrive through ports (process/fs/path/hash/...).
 * - `no-platform-globals`: no direct platform-global access in the scopes where the rule is
 *   enabled (e.g. page packages); host capabilities must arrive through injected ports.
 */

const VOID_TYPE = 'TSVoidKeyword';

const PLATFORM_GLOBALS = new Set([
  'window',
  'document',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'navigator',
]);

function isPromiseVoidType(typeNode) {
  if (!typeNode || typeNode.type !== 'TSTypeReference') return false;
  const name = typeNode.typeName && typeNode.typeName.type === 'Identifier' ? typeNode.typeName.name : undefined;
  if (name !== 'Promise') return false;
  const params = typeNode.typeArguments ? typeNode.typeArguments.params : undefined;
  return Array.isArray(params) && params.length === 1 && params[0].type === VOID_TYPE;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit);
    } else {
      walk(value, visit);
    }
  }
}

function walkWithAncestors(node, visit, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type !== 'string') return;
  visit(node, ancestors);
  const next = [...ancestors, node];
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walkWithAncestors(item, visit, next);
    } else {
      walkWithAncestors(value, visit, next);
    }
  }
}

/** 判断 Identifier 是否处在绑定/键位置（那里不是平台全局引用）。 */
function isNonReferencePosition(node, ancestors) {
  const parent = ancestors[ancestors.length - 1];
  const grandparent = ancestors[ancestors.length - 2];
  if (!parent) return false;
  switch (parent.type) {
    case 'MemberExpression':
      return parent.property === node && parent.computed !== true;
    case 'Property':
      if (parent.key === node && parent.computed !== true && parent.shorthand !== true) return true;
      // 解构绑定 `const { document } = input` 是取注入端口，不是全局引用。
      return parent.shorthand === true && grandparent !== undefined && grandparent.type === 'ObjectPattern';
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return parent.key === node && parent.computed !== true;
    case 'TSPropertySignature':
    case 'TSMethodSignature':
    case 'TSEnumMember':
      return parent.key === node && parent.computed !== true;
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSEnumDeclaration':
    case 'TSModuleDeclaration':
      return parent.id === node;
    case 'VariableDeclarator':
      return parent.id === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return parent.id === node || (Array.isArray(parent.params) && parent.params.includes(node));
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.id === node;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return parent.label === node;
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return parent.local === node;
    case 'TSQualifiedName':
    case 'TSTypeQuery':
    case 'TSTypeReference':
      return true;
    default:
      return false;
  }
}

function collectVoidFunctions(program) {
  const names = new Set();
  walk(program, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id && isPromiseVoidType(node.returnType && node.returnType.typeAnnotation)) {
      names.add(node.id.name);
    }
    if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' && node.init
      && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
      && isPromiseVoidType(node.init.returnType && node.init.returnType.typeAnnotation)) {
      names.add(node.id.name);
    }
  });
  return names;
}

function nodeSpecifier(value) {
  return typeof value === 'string' && value.startsWith('node:') ? value : undefined;
}

export default {
  meta: { name: 'fluvient' },
  rules: {
    'no-bare-await': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require every awaited result to be handled; use `void (await ...)` to discard explicitly.',
        },
        messages: {
          bareAwait: '裸 await 不允许：请处理返回值，或显式写成 `void (await ...)` 表示有意丢弃。',
        },
      },
      create(context) {
        const voidFunctions = new Set();
        return {
          Program(node) {
            for (const name of collectVoidFunctions(node)) voidFunctions.add(name);
          },
          ExpressionStatement(node) {
            if (node.expression.type !== 'AwaitExpression') return;
            const awaited = node.expression.argument;
            if (awaited.type === 'CallExpression' && awaited.callee.type === 'Identifier' && voidFunctions.has(awaited.callee.name)) return;
            context.report({ node: node.expression, messageId: 'bareAwait' });
          },
        };
      },
    },
    'no-node-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Command code must receive host capabilities through ports, not `node:*` imports.',
        },
        messages: {
          nodeImport: '命令代码不得直连 {{source}}；宿主能力应通过 ports 注入。',
        },
      },
      create(context) {
        const report = (node) => {
          const source = nodeSpecifier(node.source && node.source.value);
          if (source !== undefined) context.report({ node: node.source, messageId: 'nodeImport', data: { source } });
        };
        return {
          ImportDeclaration: report,
          ExportNamedDeclaration: report,
          ExportAllDeclaration: report,
          ImportExpression(node) {
            if (node.source && node.source.type === 'Literal') report(node);
          },
        };
      },
    },
    'no-platform-globals': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow direct platform-global access where enabled (page packages): use injected ports instead.',
        },
        messages: {
          platformGlobal: '禁止直接访问平台全局 {{name}}；宿主能力应通过注入的端口取用。',
        },
      },
      create(context) {
        return {
          Program(node) {
            walkWithAncestors(node, (child, ancestors) => {
              if (child.type !== 'Identifier' || !PLATFORM_GLOBALS.has(child.name)) return;
              if (isNonReferencePosition(child, ancestors)) return;
              context.report({
                node: child,
                messageId: 'platformGlobal',
                data: { name: child.name },
              });
            });
          },
        };
      },
    },
  },
};
