import React = require("react");
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { ParagraphNodeSpec, toParagraphDOM, getParagraphNodeAttrs } from "./ParagraphNodeSpec";

const blockquoteDOM: DOMOutputSpecArray = ["blockquote", 0], hrDOM: DOMOutputSpecArray = ["hr"],
    preDOM: DOMOutputSpecArray = ["pre", ["code", 0]], brDOM: DOMOutputSpecArray = ["br"], ulDOM: DOMOutputSpecArray = ["ul", 0];

function formatAudioTime(time: number) {
    time = Math.round(time);
    const hours = Math.floor(time / 60 / 60);
    const minutes = Math.floor(time / 60) - (hours * 60);
    const seconds = time % 60;

    return minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
}
// :: Object
// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes: { [index: string]: NodeSpec } = {
    // :: NodeSpec The top level document node.
    doc: {
        content: "block+"
    },

    paragraph: ParagraphNodeSpec,

    audiotag: {
        group: "block",
        attrs: {
            timeCode: { default: 0 },
            audioId: { default: "" }
        },
        toDOM(node) {
            return ['audiotag',
                {
                    // style: see FormattedTextBox.scss
                    "data-timecode": node.attrs.timeCode,
                    "data-audioid": node.attrs.audioId,
                },
                formatAudioTime(node.attrs.timeCode.toString())
            ];
        },
        parseDOM: [
            {
                tag: "audiotag", getAttrs(dom: any) {
                    return {
                        timeCode: dom.getAttribute("data-timecode"),
                        audioId: dom.getAttribute("data-audioid")
                    };
                }
            },
        ]
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

    // :: NodeSpec A blockquote (`<blockquote>`) wrapping one or more blocks.
    blockquote: {
        content: "block*",
        group: "block",
        defining: true,
        parseDOM: [{ tag: "blockquote" }],
        toDOM() { return blockquoteDOM; }
    },


    // blockquote: {
    //     ...ParagraphNodeSpec,
    //     defining: true,
    //     parseDOM: [{
    //         tag: "blockquote", getAttrs(dom: any) {
    //             return getParagraphNodeAttrs(dom);
    //         }
    //     }],
    //     toDOM(node: any) {
    //         const dom = toParagraphDOM(node);
    //         (dom as any)[0] = 'blockquote';
    //         return dom;
    //     },
    // },

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
        ...ParagraphNodeSpec,
        attrs: {
            ...ParagraphNodeSpec.attrs,
            level: { default: 1 },
        },
        defining: true,
        parseDOM: [{ tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } }],
        toDOM(node) {
            const dom = toParagraphDOM(node) as any;
            const level = node.attrs.level || 1;
            dom[0] = 'h' + level;
            return dom;
        },
        getAttrs(dom: any) {
            const attrs = getParagraphNodeAttrs(dom) as any;
            const level = Number(dom.nodeName.substring(1)) || 1;
            attrs.level = level;
            return attrs;
        }
    },

    // :: NodeSpec A code listing. Disallows marks or non-text inline
    // nodes by default. Represented as a `<pre>` element with a
    // `<code>` element inside of it.
    code_block: {
        content: "inline*",
        marks: "_",
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
            location: { default: "add:right" },
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
            location: { default: "add:right" },
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
            docid: { default: "" },
            hideKey: { default: false }
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
            mapStyle: { default: "decimal" },// "decimal", "multi", "bullet"
            fontColor: { default: "inherit" },
            fontSize: { default: undefined },
            fontFamily: { default: undefined },
            visibility: { default: true },
            indent: { default: undefined }
        },
        parseDOM: [
            {
                tag: "ul", getAttrs(dom: any) {
                    return {
                        bulletStyle: dom.getAttribute("data-bulletStyle"),
                        mapStyle: dom.getAttribute("data-mapStyle"),
                        fontColor: dom.style.color,
                        fontSize: dom.style["font-size"],
                        fontFamily: dom.style["font-family"],
                        indent: dom.style["margin-left"]
                    };
                }
            },
            {
                style: 'list-style-type=disc', getAttrs(dom: any) {
                    return { mapStyle: "bullet" };
                }
            },
            {
                tag: "ol", getAttrs(dom: any) {
                    return {
                        bulletStyle: dom.getAttribute("data-bulletStyle"),
                        mapStyle: dom.getAttribute("data-mapStyle"),
                        fontColor: dom.style.color,
                        fontSize: dom.style["font-size"],
                        fontFamily: dom.style["font-family"],
                        indent: dom.style["margin-left"]
                    };
                }
            }],
        toDOM(node: Node<any>) {
            const map = node.attrs.bulletStyle ? node.attrs.mapStyle + node.attrs.bulletStyle : "";
            const fsize = node.attrs.fontSize ? `font-size: ${node.attrs.fontSize};` : "";
            const ffam = node.attrs.fontFamily ? `font-family:${node.attrs.fontFamily};` : "";
            const fcol = node.attrs.fontColor ? `color: ${node.attrs.fontColor};` : "";
            const marg = node.attrs.indent ? `margin-left: ${node.attrs.indent};` : "";
            if (node.attrs.mapStyle === "bullet") {
                return ['ul', {
                    "data-mapStyle": node.attrs.mapStyle,
                    "data-bulletStyle": node.attrs.bulletStyle,
                    style: `${fsize} ${ffam} ${fcol} ${marg}`
                }, 0];
            }
            return node.attrs.visibility ?
                ['ol', {
                    class: `${map}-ol`,
                    "data-mapStyle": node.attrs.mapStyle,
                    "data-bulletStyle": node.attrs.bulletStyle,
                    style: `list-style: none; ${fsize} ${ffam} ${fcol} ${marg}`
                }, 0] :
                ['ol', { class: `${map}-ol`, style: `list-style: none;` }];
        }
    },

    list_item: {
        ...listItem,
        attrs: {
            bulletStyle: { default: 0 },
            mapStyle: { default: "decimal" }, // "decimal", "multi", "bullet"
            visibility: { default: true }
        },
        content: '(paragraph|audiotag)+ | ((paragraph|audiotag)+ ordered_list)',
        parseDOM: [{
            tag: "li", getAttrs(dom: any) {
                return { mapStyle: dom.getAttribute("data-mapStyle"), bulletStyle: dom.getAttribute("data-bulletStyle") };
            }
        }],
        toDOM(node: any) {
            const map = node.attrs.bulletStyle ? node.attrs.mapStyle + node.attrs.bulletStyle : "";
            return ["li", { class: `${map}`, "data-mapStyle": node.attrs.mapStyle, "data-bulletStyle": node.attrs.bulletStyle }, node.attrs.visibility ? 0 :
                ["span", { style: `position: relative; width: 100%; height: 1.5em; overflow: hidden; display: ${node.attrs.mapStyle !== "bullet" ? "inline-block" : "list-item"}; text-overflow: ellipsis; white-space: pre` },
                    `${node.firstChild?.textContent}...`]];
        }
    },
};