import type { PluginObj } from '@babel/core';
import type createTemplate from '@babel/template';
import type { NodePath } from '@babel/traverse';
import type * as BabelTypes from '@babel/types';
import type {
  JSXOpeningElement,
  JSXAttribute,
  JSXSpreadAttribute,
} from '@babel/types';

type AttributeSpec = {
  name: string;
  value?: unknown;
  spread?: boolean;
  literal?: boolean;
  position?: 'start' | 'end';
};

type Opts = {
  elements: string[];
  attributes: AttributeSpec[];
};

// Narrowly typed shape for template.ast(...) result when parsing an expression
type TemplateAstResult = { expression: BabelTypes.Expression };

const positionMethod: Record<
  'start' | 'end',
  'unshiftContainer' | 'pushContainer'
> = {
  start: 'unshiftContainer',
  end: 'pushContainer',
};

const addJSXAttribute = (
  {
    types: t,
    template,
  }: { types: typeof BabelTypes; template: typeof createTemplate },
  opts: Opts,
): PluginObj => {
  function getAttributeValue({
    literal,
    value,
  }: {
    literal?: boolean;
    value?: unknown;
  }) {
    if (typeof value === 'boolean') {
      return t.jsxExpressionContainer(t.booleanLiteral(value));
    }

    if (typeof value === 'number') {
      return t.jsxExpressionContainer(t.numericLiteral(value));
    }

    if (typeof value === 'string' && literal) {
      // Parse the string into an expression node and use a strongly typed result
      const astResult = (
        template as unknown as { ast: (code: string) => TemplateAstResult }
      ).ast(value);
      return t.jsxExpressionContainer(astResult.expression);
    }

    if (typeof value === 'string') {
      return t.stringLiteral(value);
    }

    return null;
  }

  // ...existing code...
  function getAttribute({
    spread,
    name,
    value,
    literal,
  }: {
    spread?: boolean;
    name: string;
    value?: unknown;
    literal?: boolean;
  }) {
    if (spread) {
      return t.jsxSpreadAttribute(t.identifier(name));
    }

    return t.jsxAttribute(
      t.jsxIdentifier(name),
      getAttributeValue({ value, literal }),
    );
  }

  return {
    visitor: {
      JSXOpeningElement(path: NodePath<JSXOpeningElement>) {
        function getElementName(nameNode: any): string | null {
          if (!nameNode) return null;
          if (t.isJSXIdentifier(nameNode)) {
            return nameNode.name;
          }
          if (t.isJSXMemberExpression(nameNode)) {
            const objectName = getElementName(nameNode.object);
            const property = nameNode.property;
            const propName = t.isJSXIdentifier(property) ? property.name : null;
            return objectName && propName ? `${objectName}.${propName}` : null;
          }
          if (t.isJSXNamespacedName(nameNode)) {
            const ns = nameNode.namespace;
            const n = nameNode.name;
            if (t.isJSXIdentifier(ns) && t.isJSXIdentifier(n)) {
              return `${ns.name}:${n.name}`;
            }
            return null;
          }
          return null;
        }

        const tagName = getElementName(path.node.name);
        if (!tagName || !opts.elements.includes(tagName)) return;

        opts.attributes.forEach(
          ({
            name,
            value = null,
            spread = false,
            literal = false,
            position = 'end',
          }: AttributeSpec) => {
            const method = positionMethod[position];
            const newAttribute = getAttribute({ spread, name, value, literal });
            const attributes = path.get('attributes');

            const isEqualAttribute = (attribute: any) => {
              if (spread) {
                return attribute.get('argument').isIdentifier({ name });
              }

              return attribute.get('name').isJSXIdentifier({ name });
            };

            const replaced = attributes.some((attribute: any) => {
              if (!isEqualAttribute(attribute)) {
                return false;
              }
              attribute.replaceWith(newAttribute);
              return true;
            });

            if (!replaced) {
              // path[method] expects the container name and node(s)
              path[method]('attributes', newAttribute);
            }
          },
        );
      },
    },
  };
};

export default addJSXAttribute;
