import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { builtinModules } from 'node:module';

const units = [
  'apps/admin',
  'apps/miniapp',
  'apps/api',
  'packages/api-client',
  'database',
];
const ignored = new Set(['node_modules', 'dist', '.local', '.swc']);

export function boundaryError(root, importer, specifier) {
  const unit = units.find((name) =>
    importer.startsWith(path.join(root, name) + path.sep),
  );
  if (!unit) return null;
  const relative = path
    .relative(path.join(root, unit), importer)
    .split(path.sep);
  const front = ['apps/admin', 'apps/miniapp', 'packages/api-client'].includes(
    unit,
  );
  if (unit === 'database' && /^@caau\/api-client(?:\/|$)/.test(specifier))
    return 'Database must not depend on frontend client packages';
  if (/^@caau\/(admin|miniapp|api)(\/|$)/.test(specifier)) {
    return 'Applications must not import application packages';
  }
  if (
    front &&
    ((relative[0] === 'src' &&
      (specifier.startsWith('node:') || builtinModules.includes(specifier))) ||
      /^(@nestjs\/|@prisma\/|prisma(?:\/|$)|pg(?:\/|$)|@caau\/database(?:\/|$))/.test(
        specifier,
      ))
  ) {
    return 'Frontend must not import server/database modules';
  }
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const target = path.resolve(path.dirname(importer), specifier);
    const appRoot = path.join(root, unit);
    const within = path.relative(appRoot, target);
    if (
      within === '..' ||
      within.startsWith(`..${path.sep}`) ||
      path.isAbsolute(within)
    ) {
      return 'Relative source imports must remain inside their application; use an approved package';
    }
  }
  return null;
}

export function importSpecifiers(filename, source) {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) imports.push(arg.text);
      else imports.push('<computed-import>');
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      imports.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return imports;
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      ignored.has(entry.name) ||
      entry.isSymbolicLink() ||
      (entry.name === 'generated' &&
        directory.endsWith(path.join('database', 'src')))
    )
      continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(filename)));
    else if (/\.(?:[cm]?js|tsx?)$/.test(entry.name)) result.push(filename);
  }
  return result;
}

export async function checkBoundaries(root) {
  const errors = [];
  const files = (
    await Promise.all(units.map((unit) => filesUnder(path.join(root, unit))))
  ).flat();
  for (const filename of files) {
    for (const specifier of importSpecifiers(
      filename,
      await readFile(filename, 'utf8'),
    )) {
      const error =
        specifier === '<computed-import>'
          ? 'Computed imports require explicit boundary review'
          : boundaryError(root, filename, specifier);
      if (error)
        errors.push(`${path.relative(root, filename)}: ${specifier}: ${error}`);
    }
  }
  for (const app of units) {
    const dir = path.join(root, app);
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'package.json'), 'utf8'),
    );
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      const error = boundaryError(root, path.join(dir, 'package.json'), name);
      if (error) errors.push(`${app}/package.json: ${name}: ${error}`);
    }
    if (
      app === 'packages/api-client' &&
      Object.keys(manifest.dependencies ?? {}).length
    ) {
      errors.push(
        'api-client must stay free of runtime dependencies; review any new transport dependency',
      );
    }
    const config = JSON.parse(
      await readFile(path.join(dir, 'tsconfig.json'), 'utf8'),
    );
    if (config.compilerOptions?.paths || config.compilerOptions?.baseUrl) {
      errors.push(
        `${app}: new TypeScript aliases must first be added to the boundary checker`,
      );
    }
  }
  return { files: files.length, errors };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { files, errors } = await checkBoundaries(process.cwd());
  errors.forEach((error) => console.error(error));
  console.log(
    `Checked ${files} application source/config/test files; ${errors.length} boundary errors.`,
  );
  process.exitCode = errors.length ? 1 : 0;
}
