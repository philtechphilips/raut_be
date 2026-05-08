import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { Endpoint, FieldInfo, HttpMethod, IProjectScanner, ProjectScanResult } from './scanner.domain';
import { detectApiMetadata, prefixEndpointPath } from './detect-api-metadata';

/** Framework labels produced by {@link RautsScanner} detection that we allow for GitHub import. */
export const RAUTS_SUPPORTED_FRAMEWORKS = new Set(['NestJS', 'Express', 'Laravel']);

/** In-process API scanner (same logic as routiq-cli; ships with the backend for GitHub / cloud scans). */
export class RautsScanner implements IProjectScanner {
  async scan(directory: string): Promise<ProjectScanResult> {
    const files = await glob('**/*.{ts,js,php}', {
      cwd: directory,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**'],
      absolute: true,
      nodir: true,
    });

    let detectedFramework = this.detectFramework(files, directory);
    const endpoints: Endpoint[] = [];

    for (const file of files) {
      try {
        const sourceCode = fs.readFileSync(file, 'utf-8');
        const fileEndpoints = this.parseFile(file, sourceCode, directory, detectedFramework, files);
        endpoints.push(...fileEndpoints);
      } catch {
        /* skip bad files */
      }
    }

    for (const ep of endpoints) {
      for (const key of ['body', 'query', 'params'] as const) {
        const list = ep[key];
        if (!list) continue;

        const complexItems = list.filter(
          (f) =>
            f.type && !['string', 'number', 'boolean', 'any', 'void'].includes(f.type.toLowerCase()),
        );

        for (const item of complexItems) {
          if (item.type) this.resolveComplexType(item as { type: string }, files, list);
        }
      }
    }

    const meta = detectApiMetadata(directory, detectedFramework, files);
    if (meta.routePrefix) {
      for (const ep of endpoints) {
        ep.path = prefixEndpointPath(meta.routePrefix, ep.path);
      }
    }

    return {
      name: path.basename(directory),
      framework: detectedFramework,
      endpoints,
      totalFilesScanned: files.length,
      ...(meta.routePrefix ? { routePrefix: meta.routePrefix } : {}),
      ...(meta.inferredBaseUrl ? { inferredBaseUrl: meta.inferredBaseUrl } : {}),
    };
  }

  private detectFramework(allFiles: string[], directory: string): string {
    const packageJsonPath = path.join(directory, 'package.json');
    const composerJsonPath = path.join(directory, 'composer.json');
    const artisanPath = path.join(directory, 'artisan');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        if (pkg.dependencies?.['@nestjs/core']) return 'NestJS';
        if (pkg.dependencies?.express || pkg.devDependencies?.express) return 'Express';
      } catch {
        /* skip */
      }
    }

    if (
      fs.existsSync(composerJsonPath) ||
      fs.existsSync(artisanPath) ||
      allFiles.some((f) => f.includes('routes/web.php'))
    ) {
      return 'Laravel';
    }

    return 'Unknown';
  }

  private resolveComplexType(item: { type: string }, allFiles: string[], targetList: FieldInfo[]) {
    const typeName = item.type.replace(/\[\]$/, '');

    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes(`class ${typeName}`)) continue;

        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
          if (ts.isClassDeclaration(node) && node.name?.text === typeName) {
            node.members.forEach((member) => {
              if (ts.isPropertyDeclaration(member)) {
                const propName = member.name.getText();
                const propType = member.type?.getText() || 'any';
                const isOptional = !!member.questionToken;

                if (!targetList.some((f) => f.name === propName)) {
                  targetList.push({
                    name: propName,
                    required: !isOptional,
                    type: propType,
                    description: `(from ${typeName})`,
                  });
                }
              }
            });
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
        break;
      } catch {
        /* skip */
      }
    }
  }

  private generateSemanticName(method: string, pathStr: string): string {
    const parts = pathStr.split('/').filter((p) => p && !p.startsWith(':'));
    const lastPart = parts[parts.length - 1] || 'index';
    const action =
      method === 'GET'
        ? 'Fetch'
        : method === 'POST'
          ? 'Create'
          : method === 'PUT' || method === 'PATCH'
            ? 'Update'
            : 'Delete';
    return `${action} ${lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ')}`;
  }

  private posixRel(rootDir: string, absPath: string): string {
    const rel = path.relative(rootDir, absPath);
    return rel.split(path.sep).join('/') || '.';
  }

  private findContainingClassDeclaration(
    methodNode: ts.MethodDeclaration,
  ): ts.ClassDeclaration | undefined {
    let p: ts.Node | undefined = methodNode.parent;
    while (p) {
      if (ts.isClassDeclaration(p)) return p;
      p = p.parent;
    }
    return undefined;
  }

  private resolveExpressController(
    endpoint: Endpoint,
    _controllerName: string,
    methodName: string,
    allFiles: string[],
    rootDir: string,
  ) {
    endpoint.description = endpoint.description || this.generateSemanticName(endpoint.method, endpoint.path);

    let foundInProject = false;
    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes(methodName)) continue;

        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
          let found = false;
          if (ts.isFunctionDeclaration(node) && node.name?.text === methodName) {
            found = true;
          } else if (ts.isVariableDeclaration(node) && node.name.getText() === methodName) {
            found = true;
          } else if (ts.isPropertyAssignment(node) && node.name.getText() === methodName) {
            found = true;
          } else if (ts.isPropertyAccessExpression(node) && node.name.text === methodName) {
            if (node.expression.getText().match(/exports|module\.exports/)) {
              found = true;
            }
          }

          if (found) {
            foundInProject = true;
            endpoint.syncAnchor = `${this.posixRel(rootDir, file)}#${methodName}`;
            let handlerNode: ts.Node = node;
            if (ts.isVariableDeclaration(node) && node.initializer) handlerNode = node.initializer;
            if (ts.isPropertyAssignment(node)) handlerNode = node.initializer;
            this.scanHandler(handlerNode as ts.FunctionLikeDeclaration, endpoint, content);
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
      } catch {
        /* skip */
      }
    }

    if (!foundInProject) endpoint.confidence = 'low';
  }

  private resolveLaravelController(
    endpoint: Endpoint,
    controllerName: string,
    methodName: string,
    allFiles: string[],
    rootDir: string,
  ) {
    const targetFile = allFiles.find((f) => path.basename(f).includes(controllerName));
    if (targetFile) {
      try {
        const content = fs.readFileSync(targetFile, 'utf-8');
        const methodRegex = new RegExp(`function\\s+${methodName}\\s*\\(.*?\\)\\s*{([\\s\\S]*?)}`, 'm');
        const fullMatchRegex = new RegExp(`public\\s+function\\s+${methodName}[\\s\\S]*?{([\\s\\S]*?)}`, 'm');

        const mMatch = fullMatchRegex.exec(content) || methodRegex.exec(content);
        if (mMatch) {
          endpoint.handlerSource = mMatch[0];
          endpoint.syncAnchor = `${this.posixRel(rootDir, targetFile)}#${methodName}`;
          const methodBody = mMatch[1];

          const validateRegex = /\$request->validate\(\s*\[([\s\S]*?)\]/g;
          let vMatch;
          while ((vMatch = validateRegex.exec(methodBody)) !== null) {
            const rules = vMatch[1];
            const ruleRegex = /['"]([^'"]+)['"]\s*=>\s*['"]([^'"]+)['"]/g;
            let rMatch;
            while ((rMatch = ruleRegex.exec(rules)) !== null) {
              this.addField(endpoint.body!, rMatch[1], rMatch[2].includes('required'));
            }
          }
          endpoint.confidence = 'high';
        }
      } catch {
        /* skip */
      }
    }
  }

  private parseFile(
    filePath: string,
    sourceCode: string,
    rootDir: string,
    framework: string,
    allFiles: string[],
  ): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const relativeFolder = path.relative(rootDir, path.dirname(filePath)) || '/';

    if (filePath.endsWith('.php')) {
      const fullRouteRegex =
        /Route::(get|post|put|delete|patch|options|any)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^\)]+)\)/gi;
      let match;
      while ((match = fullRouteRegex.exec(sourceCode)) !== null) {
        const method = match[1].toUpperCase();
        const routePath = match[2].startsWith('/') ? match[2] : '/' + match[2];
        const action = match[3];

        const endpoint: Endpoint = {
          method: method as HttpMethod,
          path: routePath,
          confidence: 'high',
          sourceFile: path.basename(filePath),
          folder: relativeFolder,
          params: [],
          query: [],
          body: [],
        };

        let controllerName = '';
        let methodName = '';

        if (action.includes('::class')) {
          const cMatch = action.match(/(\w+)::class\s*,\s*['"](\w+)['"]/);
          if (cMatch) {
            controllerName = cMatch[1];
            methodName = cMatch[2];
          }
        } else if (action.includes('@')) {
          const cMatch = action.match(/['"](\w+)@(\w+)['"]/);
          if (cMatch) {
            controllerName = cMatch[1];
            methodName = cMatch[2];
          }
        }

        if (controllerName && methodName) {
          this.resolveLaravelController(endpoint, controllerName, methodName, allFiles, rootDir);
        }

        endpoints.push(endpoint);
      }
      return endpoints;
    }

    const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    let classControllerPath = '';

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        const controllerDecorator = ts.getDecorators(node)?.find(
          (d) =>
            ts.isCallExpression(d.expression) &&
            ts.isIdentifier(d.expression.expression) &&
            d.expression.expression.text === 'Controller',
        );
        if (controllerDecorator && ts.isCallExpression(controllerDecorator.expression)) {
          const arg = controllerDecorator.expression.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            classControllerPath = arg.text;
          }
        }
      }

      if (ts.isMethodDeclaration(node)) {
        const methodDecorators = ['Get', 'Post', 'Put', 'Delete', 'Patch'];
        const routeDecorator = ts.getDecorators(node)?.find(
          (d) =>
            ts.isCallExpression(d.expression) &&
            ts.isIdentifier(d.expression.expression) &&
            methodDecorators.includes(d.expression.expression.text),
        );

        if (routeDecorator && ts.isCallExpression(routeDecorator.expression)) {
          const arg = routeDecorator.expression.arguments[0];
          const routePath = arg && ts.isStringLiteral(arg) ? arg.text : '';
          const fullPath = `/${classControllerPath}/${routePath}`.replace(/\/+/g, '/');
          const methodName = (routeDecorator.expression.expression as ts.Identifier).text.toUpperCase();

          const endpoint: Endpoint = {
            method: methodName as HttpMethod,
            path: fullPath,
            confidence: 'high',
            sourceFile: path.basename(filePath),
            folder: relativeFolder,
            params: [],
            query: [],
            body: [],
          };

          const cls = this.findContainingClassDeclaration(node);
          const clsName = cls?.name ? cls.name.getText(sourceFile) : 'AnonymousController';
          const memberName = node.name ? node.name.getText(sourceFile) : 'handler';
          endpoint.syncAnchor = `${this.posixRel(rootDir, filePath)}#${clsName}.${memberName}`;

          if (node.type) {
            endpoint.response = node.type.getText();
          }

          this.scanHandler(node, endpoint, sourceCode);
          endpoints.push(endpoint);
        }
      }

      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isPropertyAccessExpression(expression)) {
          const methodName = expression.name.text.toLowerCase();
          const methods: string[] = ['get', 'post', 'put', 'delete', 'patch'];

          if (methods.includes(methodName)) {
            if (node.arguments.length >= 2) {
              const firstArg = node.arguments[0];
              const secondArg = node.arguments[1];

              if (ts.isStringLiteral(firstArg)) {
                const endpoint: Endpoint = {
                  method: methodName.toUpperCase() as HttpMethod,
                  path: firstArg.text,
                  confidence: framework === 'Express' ? 'high' : 'medium',
                  sourceFile: path.basename(filePath),
                  folder: relativeFolder,
                  params: [],
                  query: [],
                  body: [],
                };

                if (secondArg) {
                  if (ts.isIdentifier(secondArg)) {
                    this.resolveExpressController(endpoint, '', secondArg.text, allFiles, rootDir);
                  } else if (ts.isPropertyAccessExpression(secondArg)) {
                    const ctrl = secondArg.expression.getText();
                    const method = secondArg.name.text;
                    this.resolveExpressController(endpoint, ctrl, method, allFiles, rootDir);
                  }
                  this.scanHandler(secondArg, endpoint, sourceCode);
                }

                endpoints.push(endpoint);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return endpoints;
  }

  private scanHandler(
    handler: ts.FunctionLikeDeclaration | ts.Expression,
    endpoint: Endpoint,
    sourceCode: string,
  ) {
    if (ts.isMethodDeclaration(handler) || ts.isFunctionExpression(handler) || ts.isArrowFunction(handler)) {
      handler.parameters.forEach((param) => {
        const decorators = ts.getDecorators(param);
        decorators?.forEach((d) => {
          if (ts.isCallExpression(d.expression) && ts.isIdentifier(d.expression.expression)) {
            const decoratorName = d.expression.expression.text;
            const arg0 = d.expression.arguments[0];
            const paramName = arg0 && ts.isStringLiteral(arg0) ? arg0.text : param.name.getText();
            const typeName = param.type ? param.type.getText() : 'any';

            if (decoratorName === 'Body') this.addField(endpoint.body!, paramName, true, typeName);
            if (decoratorName === 'Query') this.addField(endpoint.query!, paramName, true, typeName);
            if (decoratorName === 'Param') this.addField(endpoint.params!, paramName, true, typeName);
          }
        });
      });
    }

    const visitHandler = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node)) {
        const objName = node.expression.getText();
        if (objName.match(/req|request/)) {
          const propName = node.name.text;
          const parent = node.parent;
          if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
            const fieldName = parent.name.text;
            if (propName === 'body') this.addField(endpoint.body!, fieldName, false, 'any');
            if (propName === 'query') this.addField(endpoint.query!, fieldName, false, 'any');
            if (propName === 'params') this.addField(endpoint.params!, fieldName, false, 'any');
          }
        }
      }

      if (ts.isVariableDeclaration(node) && node.initializer) {
        const init = node.initializer.getText();
        if (init.match(/req\.body|request\.body|req\.query|request\.query|req\.params|request\.params/)) {
          if (ts.isObjectBindingPattern(node.name)) {
            const target = init.includes('body')
              ? endpoint.body
              : init.includes('query')
                ? endpoint.query
                : endpoint.params;
            node.name.elements.forEach((element) => {
              if (ts.isBindingElement(element)) {
                this.addField(target!, element.name.getText(), false, 'any');
              }
            });
          }
        }
      }
      ts.forEachChild(node, visitHandler);
    };

    if (handler) {
      endpoint.handlerSource = handler.getText();
      ts.forEachChild(handler, visitHandler);

      const fullText = handler.getFullText();
      const commentMatch = fullText.match(/\/\*\*([\s\S]*?)\*\//);
      if (commentMatch) {
        const comment = commentMatch[1];
        const descMatch = comment.match(/^\s*\*\s*([^@\n]+)/);
        if (descMatch) endpoint.description = descMatch[1].trim();

        const tags = comment.match(/@\w+\s+[^\n]+/g);
        tags?.forEach((tag) => {
          if (tag.startsWith('@response')) endpoint.response = tag.replace('@response', '').trim();
          if (tag.startsWith('@body')) this.enrichField(endpoint.body!, tag.replace('@body', '').trim());
          if (tag.startsWith('@query')) this.enrichField(endpoint.query!, tag.replace('@query', '').trim());
        });
      }
    }
  }

  private addField(list: FieldInfo[], name: string, required: boolean, type: string = 'any') {
    if (!list.some((f) => f.name === name)) {
      list.push({ name, required, type });
    }
  }

  private enrichField(list: FieldInfo[], text: string) {
    const match = text.match(/\{([^}]+)\}\s+(\w+)(\s+-\s+(.+))?/);
    if (match) {
      const [, type, name, , desc] = match;
      let field = list.find((f) => f.name === name);
      if (!field) {
        field = { name, required: false, type };
        list.push(field);
      }
      field.type = type;
      if (desc) {
        field.description = desc;
        if (desc.toLowerCase().includes('required')) field.required = true;
      }
    }
  }
}
