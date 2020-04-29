import clamp from '../../../util/clamp';
import convertToCSSPTValue from '../../../util/convertToCSSPTValue';
import toCSSLineSpacing from '../../../util/toCSSLineSpacing';
import { Node, DOMOutputSpec } from 'prosemirror-model';

//import type { NodeSpec } from './Types';
type NodeSpec = {
    attrs?: { [key: string]: any },
    content?: string,
    draggable?: boolean,
    group?: string,
    inline?: boolean,
    name?: string,
    parseDOM?: Array<any>,
    toDOM?: (node: any) => DOMOutputSpec,
};

// This assumes that every 36pt maps to one indent level.
export const INDENT_MARGIN_PT_SIZE = 36;
export const MIN_INDENT_LEVEL = 0;
export const MAX_INDENT_LEVEL = 7;
export const ATTRIBUTE_INDENT = 'data-indent';

export const EMPTY_CSS_VALUE = new Set(['', '0%', '0pt', '0px']);

const ALIGN_PATTERN = /(left|right|center|justify)/;

// https://github.com/ProseMirror/prosemirror-schema-basic/blob/master/src/schema-basic.js
// :: NodeSpec A plain paragraph textblock. Represented in the DOM
// as a `<p>` element.
const ParagraphNodeSpec: NodeSpec = {
    attrs: {
        align: { default: null },
        color: { default: null },
        id: { default: null },
        indent: { default: null },
        inset: { default: null },
        lineSpacing: { default: null },
        // TODO: Add UI to let user edit / clear padding.
        paddingBottom: { default: null },
        // TODO: Add UI to let user edit / clear padding.
        paddingTop: { default: null },
    },
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p', getAttrs }],
    toDOM,
};

function getAttrs(dom: HTMLElement): Object {
    const {
        lineHeight,
        textAlign,
        marginLeft,
        paddingTop,
        paddingBottom,
    } = dom.style;

    let align = dom.getAttribute('align') || textAlign || '';
    align = ALIGN_PATTERN.test(align) ? align : "";

    let indent = parseInt(dom.getAttribute(ATTRIBUTE_INDENT) || "", 10);

    if (!indent && marginLeft) {
        indent = convertMarginLeftToIndentValue(marginLeft);
    }

    indent = indent || MIN_INDENT_LEVEL;

    const lineSpacing = lineHeight ? toCSSLineSpacing(lineHeight) : null;

    const id = dom.getAttribute('id') || '';
    return { align, indent, lineSpacing, paddingTop, paddingBottom, id };
}

function toDOM(node: Node): DOMOutputSpec {
    const {
        align,
        indent,
        inset,
        lineSpacing,
        paddingTop,
        paddingBottom,
        id,
    } = node.attrs;
    const attrs: { [key: string]: any } | null = {};

    let style = '';
    if (align && align !== 'left') {
        style += `text-align: ${align};`;
    }

    if (lineSpacing) {
        const cssLineSpacing = toCSSLineSpacing(lineSpacing);
        style +=
            `line-height: ${cssLineSpacing};` +
            // This creates the local css variable `--czi-content-line-height`
            // that its children may apply.
            `--czi-content-line-height: ${cssLineSpacing}`;
    }

    if (paddingTop && !EMPTY_CSS_VALUE.has(paddingTop)) {
        style += `padding-top: ${paddingTop};`;
    }

    if (paddingBottom && !EMPTY_CSS_VALUE.has(paddingBottom)) {
        style += `padding-bottom: ${paddingBottom};`;
    }

    if (indent) {
        style += `text-indent: ${indent}; padding-left: ${indent < 0 ? -indent : undefined};`;
    }

    if (inset) {
        style += `margin-left: ${inset}; margin-right: ${inset};`;
    }

    style && (attrs.style = style);

    if (indent) {
        attrs[ATTRIBUTE_INDENT] = String(indent);
    }

    if (id) {
        attrs.id = id;
    }

    return ['p', attrs, 0];
}

export const toParagraphDOM = toDOM;
export const getParagraphNodeAttrs = getAttrs;

export function convertMarginLeftToIndentValue(marginLeft: string): number {
    const ptValue = convertToCSSPTValue(marginLeft);
    return clamp(
        MIN_INDENT_LEVEL,
        Math.floor(ptValue / INDENT_MARGIN_PT_SIZE),
        MAX_INDENT_LEVEL
    );
}

export default ParagraphNodeSpec;