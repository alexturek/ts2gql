import * as _ from 'lodash';
import * as typescript from 'typescript';
import * as path from 'path';

import * as types from './types';
import * as util from './util';
import Collector from './Collector';
import Emitter from './Emitter';

export function load(schemaRootPath:string, queryInterfaceName:string):types.TypeMap {
  schemaRootPath = path.resolve(schemaRootPath);
  const program = typescript.createProgram([schemaRootPath], {});
  const schemaRoot = program.getSourceFile(schemaRootPath);

  const interfaces:{[key:string]:typescript.InterfaceDeclaration} = {};
  typescript.forEachChild(schemaRoot, (node) => {
    if (!isNodeExported(node)) return;
    if (node.kind === typescript.SyntaxKind.InterfaceDeclaration) {
      const interfaceNode = <typescript.InterfaceDeclaration>node;
      interfaces[interfaceNode.name.text] = interfaceNode;
    }
  });

  const queryInterface = interfaces[queryInterfaceName];
  if (!queryInterface) {
    throw new Error(`No interface named ${queryInterfaceName} was exported by ${schemaRootPath}`);
  }

  const collector = new Collector(program);
  collector.addQueryNode(queryInterface);

  _.each(interfaces, (node, name) => {
    const documentation = util.documentationForNode(node);
    const override = _.find(documentation.tags, {title: 'graphql', description: 'override'});
    if (!override) return;
    collector.mergeOverrides(node, name);
  });

  return collector.types;
}

export function emit(schemaRootPath:string, queryInterfaceName:string, stream:NodeJS.WritableStream = process.stdout):void {
  const types = load(schemaRootPath, queryInterfaceName);
  const emitter = new Emitter(types);
  emitter.emitAll(stream);
}

function isNodeExported(node:typescript.Node):boolean {
  return (node.flags & typescript.NodeFlags.Export) !== 0
    || (node.parent && node.parent.kind === typescript.SyntaxKind.SourceFile);
}
