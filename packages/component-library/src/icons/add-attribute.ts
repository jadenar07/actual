import type { PluginObj } from '@babel/core';
import type createTemplate from '@babel/template';
import type * as BabelTypes from '@babel/types';

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
      // template.ast may return different shapes; cast to any expression to avoid noisy types
      return t.jsxExpressionContainer((template as any).ast(value).expression);
    }

    if (typeof value === 'string') {
      return t.stringLiteral(value);
    }

    return null;
  }

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
      JSXOpeningElement(path: any) {
        if (!opts.elements.includes(path.node.name.name)) return;

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

              const attrValueNode = attribute.some((attribute: any) => {
                if (!isEqualAttribute(attribute)) {
                  return false;
                }
                attribute.replaceWith(newAttribute);

                return true;
              });

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
  } as PluginObj;
};

export default addJSXAttribute;
