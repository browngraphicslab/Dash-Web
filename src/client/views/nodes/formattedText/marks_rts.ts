import React = require("react");
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { Doc } from "../../../../fields/Doc";


const emDOM: DOMOutputSpecArray = ["em", 0];
const strongDOM: DOMOutputSpecArray = ["strong", 0];
const codeDOM: DOMOutputSpecArray = ["code", 0];

// :: Object [Specs](#model.MarkSpec) for the marks in the schema.
export const marks: { [index: string]: MarkSpec } = {
    splitter: {
        attrs: {
            id: { default: "" }
        },
        toDOM(node: any) {
            return ["div", { className: "dummy" }, 0];
        }
    },
    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
        attrs: {
            allHrefs: { default: [] as { href: string, title: string, linkId: string, targetId: string }[] },
            showPreview: { default: true },
            location: { default: null },
            title: { default: null },
            docref: { default: false } // flags whether the linked text comes from a document within Dash.  If so, an attribution label is appended after the text
        },
        inclusive: false,
        parseDOM: [{
            tag: "a[href]", getAttrs(dom: any) {
                return { allHrefs: [{ href: dom.getAttribute("href"), title: dom.getAttribute("title"), linkId: dom.getAttribute("linkids"), targetId: dom.getAttribute("targetids") }], location: dom.getAttribute("location"), };
            }
        }],
        toDOM(node: any) {
            const targetids = node.attrs.allHrefs.reduce((p: string, item: { href: string, title: string, targetId: string, linkId: string }) => p + " " + item.targetId, "");
            const linkids = node.attrs.allHrefs.reduce((p: string, item: { href: string, title: string, targetId: string, linkId: string }) => p + " " + item.linkId, "");
            return node.attrs.docref && node.attrs.title ?
                ["div", ["span", `"`], ["span", 0], ["span", `"`], ["br"], ["a", { ...node.attrs, class: "prosemirror-attribution", title: `${node.attrs.title}` }, node.attrs.title], ["br"]] :
                node.attrs.allHrefs.length === 1 ?
                    ["a", { ...node.attrs, class: linkids, targetids, title: `${node.attrs.title}`, href: node.attrs.allHrefs[0].href }, 0] :
                    ["div", { class: "prosemirror-anchor" },
                        ["span", { class: "prosemirror-linkBtn" },
                            ["a", { ...node.attrs, class: linkids, targetids, title: `${node.attrs.title}` }, 0],
                            ["input", { class: "prosemirror-hrefoptions" }],
                        ],
                        ["div", { class: "prosemirror-links" }, ...node.attrs.allHrefs.map((item: { href: string, title: string }) =>
                            ["a", { class: "prosemirror-dropdownlink", href: item.href }, item.title]
                        )]
                    ];
        }
    },


    // :: MarkSpec Coloring on text. Has `color` attribute that defined the color of the marked text.
    pFontColor: {
        attrs: {
            color: { default: "#000" }
        },
        inclusive: true,
        parseDOM: [{
            tag: "span", getAttrs(dom: any) {
                return { color: dom.getAttribute("color") };
            }
        }],
        toDOM(node: any) {
            return node.attrs.color ? ['span', { style: 'color:' + node.attrs.color }] : ['span', 0];
        }
    },

    marker: {
        attrs: {
            highlight: { default: "transparent" }
        },
        inclusive: true,
        parseDOM: [{
            tag: "span", getAttrs(dom: any) {
                return { highlight: dom.getAttribute("backgroundColor") };
            }
        }],
        toDOM(node: any) {
            return node.attrs.highlight ? ['span', { style: 'background-color:' + node.attrs.highlight }] : ['span', { style: 'background-color: transparent' }];
        }
    },

    // :: MarkSpec An emphasis mark. Rendered as an `<em>` element.
    // Has parse rules that also match `<i>` and `font-style: italic`.
    em: {
        parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style: italic" }],
        toDOM() { return emDOM; }
    },

    // :: MarkSpec A strong mark. Rendered as `<strong>`, parse rules
    // also match `<b>` and `font-weight: bold`.
    strong: {
        parseDOM: [{ tag: "strong" },
        { tag: "b" },
        { style: "font-weight" }],
        toDOM() { return strongDOM; }
    },

    strikethrough: {
        parseDOM: [
            { tag: 'strike' },
            { style: 'text-decoration=line-through' },
            { style: 'text-decoration-line=line-through' }
        ],
        toDOM: () => ['span', {
            style: 'text-decoration-line:line-through'
        }]
    },

    subscript: {
        excludes: 'superscript',
        parseDOM: [
            { tag: 'sub' },
            { style: 'vertical-align=sub' }
        ],
        toDOM: () => ['sub']
    },

    superscript: {
        excludes: 'subscript',
        parseDOM: [
            { tag: 'sup' },
            { style: 'vertical-align=super' }
        ],
        toDOM: () => ['sup']
    },

    mbulletType: {
        attrs: {
            bulletType: { default: "decimal" }
        },
        toDOM(node: any) {
            return ['span', {
                style: `background: ${node.attrs.bulletType === "decimal" ? "yellow" : node.attrs.bulletType === "upper-alpha" ? "blue" : "green"}`
            }];
        }
    },

    metadata: {
        toDOM() {
            return ['span', { style: 'font-size:75%; background:rgba(100, 100, 100, 0.2); ' }];
        }
    },
    metadataKey: {
        toDOM() {
            return ['span', { style: 'font-style:italic; ' }];
        }
    },
    metadataVal: {
        toDOM() {
            return ['span'];
        }
    },

    summarizeInclusive: {
        parseDOM: [
            {
                tag: "span",
                getAttrs: (p: any) => {
                    if (typeof (p) !== "string") {
                        const style = getComputedStyle(p);
                        if (style.textDecoration === "underline") return null;
                        if (p.parentElement.outerHTML.indexOf("text-decoration: underline") !== -1 &&
                            p.parentElement.outerHTML.indexOf("text-decoration-style: solid") !== -1) {
                            return null;
                        }
                    }
                    return false;
                }
            },
        ],
        inclusive: true,
        toDOM() {
            return ['span', {
                style: 'text-decoration: underline; text-decoration-style: solid; text-decoration-color: rgba(204, 206, 210, 0.92)'
            }];
        }
    },

    summarize: {
        inclusive: false,
        parseDOM: [
            {
                tag: "span",
                getAttrs: (p: any) => {
                    if (typeof (p) !== "string") {
                        const style = getComputedStyle(p);
                        if (style.textDecoration === "underline") return null;
                        if (p.parentElement.outerHTML.indexOf("text-decoration: underline") !== -1 &&
                            p.parentElement.outerHTML.indexOf("text-decoration-style: dotted") !== -1) {
                            return null;
                        }
                    }
                    return false;
                }
            },
        ],
        toDOM() {
            return ['span', {
                style: 'text-decoration: underline; text-decoration-style: dotted; text-decoration-color: rgba(204, 206, 210, 0.92)'
            }];
        }
    },

    underline: {
        parseDOM: [
            {
                tag: "span",
                getAttrs: (p: any) => {
                    if (typeof (p) !== "string") {
                        const style = getComputedStyle(p);
                        if (style.textDecoration === "underline" || p.parentElement.outerHTML.indexOf("text-decoration-style:line") !== -1) {
                            return null;
                        }
                    }
                    return false;
                }
            }
            // { style: "text-decoration=underline" }
        ],
        toDOM: () => ['span', {
            style: 'text-decoration:underline;text-decoration-style:line'
        }]
    },

    search_highlight: {
        attrs: {
            selected: { default: false }
        },
        parseDOM: [{ style: 'background: yellow' }],
        toDOM(node: any) {
            return ['span', {
                style: `background: ${node.attrs.selected ? "orange" : "yellow"}`
            }];
        }
    },

    // the id of the user who entered the text
    user_mark: {
        attrs: {
            userid: { default: "" },
            modified: { default: "when?" }, // 1 second intervals since 1970
        },
        group: "inline",
        toDOM(node: any) {
            const uid = node.attrs.userid.replace(".", "").replace("@", "");
            const min = Math.round(node.attrs.modified / 12);
            const hr = Math.round(min / 60);
            const day = Math.round(hr / 60 / 24);
            const remote = node.attrs.userid !== Doc.CurrentUserEmail ? " userMark-remote" : "";
            return ['span', { class: "userMark-" + uid + remote + " userMark-min-" + min + " userMark-hr-" + hr + " userMark-day-" + day }, 0];
        }
    },
    // the id of the user who entered the text
    user_tag: {
        attrs: {
            userid: { default: "" },
            modified: { default: "when?" }, // 1 second intervals since 1970
            tag: { default: "" }
        },
        group: "inline",
        inclusive: false,
        toDOM(node: any) {
            const uid = node.attrs.userid.replace(".", "").replace("@", "");
            return ['span', { class: "userTag-" + uid + " userTag-" + node.attrs.tag }, 0];
        }
    },


    // :: MarkSpec Code font mark. Represented as a `<code>` element.
    code: {
        parseDOM: [{ tag: "code" }],
        toDOM() { return codeDOM; }
    },

    /* FONTS */
    pFontFamily: {
        attrs: {
            family: { default: "Crimson Text" },
        },
        parseDOM: [{
            tag: "span", getAttrs(dom: any) {
                const cstyle = getComputedStyle(dom);
                if (cstyle.font) {
                    if (cstyle.font.indexOf("Times New Roman") !== -1) return { family: "Times New Roman" };
                    if (cstyle.font.indexOf("Arial") !== -1) return { family: "Arial" };
                    if (cstyle.font.indexOf("Georgia") !== -1) return { family: "Georgia" };
                    if (cstyle.font.indexOf("Comic Sans") !== -1) return { family: "Comic Sans MS" };
                    if (cstyle.font.indexOf("Tahoma") !== -1) return { family: "Tahoma" };
                    if (cstyle.font.indexOf("Crimson") !== -1) return { family: "Crimson Text" };
                }
            }
        }],
        toDOM: (node) => ['span', {
            style: `font-family: "${node.attrs.family}";`
        }]
    },

    /** FONT SIZES */
    pFontSize: {
        attrs: {
            fontSize: { default: 10 }
        },
        parseDOM: [{ style: 'font-size: 10px;' }],
        toDOM: (node) => ['span', {
            style: `font-size: ${node.attrs.fontSize}px;`
        }]
    },
};
