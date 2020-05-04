import React = require("react");
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import ParagraphNodeSpec from "./ParagraphNodeSpec";

const blockquoteDOM: DOMOutputSpecArray = ["blockquote", 0], hrDOM: DOMOutputSpecArray = ["hr"],
    preDOM: DOMOutputSpecArray = ["pre", ["code", 0]], brDOM: DOMOutputSpecArray = ["br"], ulDOM: DOMOutputSpecArray = ["ul", 0];

// :: Object
// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes: { [index: string]: NodeSpec } = {
    // :: NodeSpec The top level document node.
    doc: {
        content: "block+"
    },

    footnote: {
        group: "inline",
        content: "inline*",
        inline: true,
        attrs: {
            visibility: { default: false }
        },
        // This makes the view treat the node as a leaf, even though it
        // technically has content
        atom: true,
        toDOM: () => ["footnote", 0],
        parseDOM: [{ tag: "footnote" }]
    },

    paragraph: ParagraphNodeSpec,

    // :: NodeSpec A blockquote (`<blockquote>`) wrapping one or more blocks.
    blockquote: {
        content: "block+",
        group: "block",
        defining: true,
        parseDOM: [{ tag: "blockquote" }],
        toDOM() { return blockquoteDOM; }
    },

    // :: NodeSpec A horizontal rule (`<hr>`).
    horizontal_rule: {
        group: "block",
        parseDOM: [{ tag: "hr" }],
        toDOM() { return hrDOM; }
    },

    // :: NodeSpec A heading textblock, with a `level` attribute that
    // should hold the number 1 to 6. Parsed and serialized as `<h1>` to
    // `<h6>` elements.
    heading: {
        attrs: { level: { default: 1 } },
        content: "inline*",
        group: "block",
        defining: true,
        parseDOM: [{ tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } }],
        toDOM(node: any) { return ["h" + node.attrs.level, 0]; }
    },

    // :: NodeSpec A code listing. Disallows marks or non-text inline
    // nodes by default. Represented as a `<pre>` element with a
    // `<code>` element inside of it.
    code_block: {
        content: "text*",
        marks: "",
        group: "block",
        code: true,
        defining: true,
        parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
        toDOM() { return preDOM; }
    },

    // :: NodeSpec The text node.
    text: {
        group: "inline"
    },

    dashComment: {
        attrs: {
            docid: { default: "" },
        },
        inline: true,
        group: "inline",
        toDOM(node) {
            const attrs = { style: `width: 40px` };
            return ["span", { ...node.attrs, ...attrs }, "←"];
        },
    },

    summary: {
        inline: true,
        attrs: {
            visibility: { default: false },
            text: { default: undefined },
            textslice: { default: undefined },
        },
        group: "inline",
        toDOM(node) {
            const attrs = { style: `width: 40px` };
            return ["span", { ...node.attrs, ...attrs }];
        },
    },

    // :: NodeSpec An inline image (`<img>`) node. Supports `src`,
    // `alt`, and `href` attributes. The latter two default to the empty
    // string.
    image: {
        inline: true,
        attrs: {
            src: {},
            agnostic: { default: null },
            width: { default: 100 },
            alt: { default: null },
            title: { default: null },
            float: { default: "left" },
            location: { default: "onRight" },
            docid: { default: "" }
        },
        group: "inline",
        draggable: true,
        parseDOM: [{
            tag: "img[src]", getAttrs(dom: any) {
                return {
                    src: dom.getAttribute("src"),
                    title: dom.getAttribute("title"),
                    alt: dom.getAttribute("alt"),
                    width: Math.min(100, Number(dom.getAttribute("width"))),
                };
            }
        }],
        // TODO if we don't define toDom, dragging the image crashes. Why?
        toDOM(node) {
            const attrs = { style: `width: ${node.attrs.width}` };
            return ["img", { ...node.attrs, ...attrs }];
        }
    },

    dashDoc: {
        inline: true,
        attrs: {
            width: { default: 200 },
            height: { default: 100 },
            title: { default: null },
            float: { default: "right" },
            location: { default: "onRight" },
            hidden: { default: false },
            fieldKey: { default: "" },
            docid: { default: "" },
            alias: { default: "" }
        },
        group: "inline",
        draggable: false,
        toDOM(node) {
            const attrs = { style: `width: ${node.attrs.width}, height: ${node.attrs.height}` };
            return ["div", { ...node.attrs, ...attrs }];
        }
    },

    dashField: {
        inline: true,
        attrs: {
            fieldKey: { default: "" },
            docid: { default: "" }
        },
        group: "inline",
        draggable: false,
        toDOM(node) {
            const attrs = { style: `width: ${node.attrs.width}, height: ${node.attrs.height}` };
            return ["div", { ...node.attrs, ...attrs }];
        }
    },

    video: {
        inline: true,
        attrs: {
            src: {},
            width: { default: "100px" },
            alt: { default: null },
            title: { default: null }
        },
        group: "inline",
        draggable: true,
        parseDOM: [{
            tag: "video[src]", getAttrs(dom: any) {
                return {
                    src: dom.getAttribute("src"),
                    title: dom.getAttribute("title"),
                    alt: dom.getAttribute("alt"),
                    width: Math.min(100, Number(dom.getAttribute("width"))),
                };
            }
        }],
        toDOM(node) {
            const attrs = { style: `width: ${node.attrs.width}` };
            return ["video", { ...node.attrs, ...attrs }];
        }
    },

    // :: NodeSpec A hard line break, represented in the DOM as `<br>`.
    hard_break: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM() { return brDOM; }
    },

    ordered_list: {
        ...orderedList,
        content: 'list_item+',
        group: 'block',
        attrs: {
            bulletStyle: { default: 0 },
            mapStyle: { default: "decimal" },
            setFontSize: { default: undefined },
            setFontFamily: { default: "inherit" },
            setFontColor: { default: "inherit" },
            inheritedFontSize: { default: undefined },
            visibility: { default: true },
            indent: { default: undefined }
        },
        toDOM(node: Node<any>) {
            if (node.attrs.mapStyle === "bullet") return ['ul', 0];
            const map = node.attrs.bulletStyle ? node.attrs.mapStyle + node.attrs.bulletStyle : "";
            const fsize = node.attrs.setFontSize ? node.attrs.setFontSize : node.attrs.inheritedFontSize;
            const ffam = node.attrs.setFontFamily;
            const color = node.attrs.setFontColor;
            return node.attrs.visibility ?
                ['ol', { class: `${map}-ol`, style: `list-style: none; font-size: ${fsize}; font-family: ${ffam}; color:${color}; margin-left: ${node.attrs.indent}` }, 0] :
                ['ol', { class: `${map}-ol`, style: `list-style: none;` }];
        }
    },

    bullet_list: {
        ...bulletList,
        content: 'list_item+',
        group: 'block',
        // parseDOM: [{ tag: "ul" }, { style: 'list-style-type=disc' }],
        toDOM(node: Node<any>) {
            return ['ul', 0];
        }
    },

    list_item: {
        attrs: {
            bulletStyle: { default: 0 },
            mapStyle: { default: "decimal" },
            visibility: { default: true }
        },
        ...listItem,
        content: 'paragraph block*',
        toDOM(node: any) {
            const map = node.attrs.bulletStyle ? node.attrs.mapStyle + node.attrs.bulletStyle : "";
            return node.attrs.visibility ? ["li", { class: `${map}` }, 0] : ["li", { class: `${map}` }, "..."];
            //return ["li", { class: `${map}` }, 0];
        }
    },
};