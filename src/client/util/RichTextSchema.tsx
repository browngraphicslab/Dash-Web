import { DOMOutputSpecArray, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { TextSelection } from "prosemirror-state";
import { Doc } from "../../new_fields/Doc";

const pDOM: DOMOutputSpecArray = ["p", 0], blockquoteDOM: DOMOutputSpecArray = ["blockquote", 0], hrDOM: DOMOutputSpecArray = ["hr"],
    preDOM: DOMOutputSpecArray = ["pre", ["code", 0]], brDOM: DOMOutputSpecArray = ["br"], ulDOM: DOMOutputSpecArray = ["ul", 0];

// :: Object
// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes: { [index: string]: NodeSpec } = {
    // :: NodeSpec The top level document node.
    doc: {
        content: "block+"
    },

    // :: NodeSpec A plain paragraph textblock. Represented in the DOM
    // as a `<p>` element.
    paragraph: {
        content: "inline*",
        group: "block",
        parseDOM: [{ tag: "p" }],
        toDOM() { return pDOM; }
    },

    // starmine: {
    //     inline: true,
    //     attrs: { oldtext: { default: "" } },
    //     group: "inline",
    //     toDOM() { return ["star", "㊉"]; },
    //     parseDOM: [{ tag: "star" }]
    // },

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

    star: {
        inline: true,
        attrs: {
            visibility: { default: false },
            text: { default: undefined },
            textslice: { default: undefined },
            textlen: { default: 0 }

        },
        group: "inline",
        toDOM(node) {
            const attrs = { style: `width: 40px` };
            return ["span", { ...node.attrs, ...attrs }];
        },
        // parseDOM: [{
        //     tag: "star", getAttrs(dom: any) {
        //         return {
        //             visibility: dom.getAttribute("visibility"),
        //             oldtext: dom.getAttribute("oldtext"),
        //             oldtextlen: dom.getAttribute("oldtextlen"),
        //         }
        //     }
        // }]
    },
    // :: NodeSpec An inline image (`<img>`) node. Supports `src`,
    // `alt`, and `href` attributes. The latter two default to the empty
    // string.
    image: {
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
            tag: "img[src]", getAttrs(dom: any) {
                return {
                    src: dom.getAttribute("src"),
                    title: dom.getAttribute("title"),
                    alt: dom.getAttribute("alt"),
                    width: Math.min(100, Number(dom.getAttribute("width"))),
                };
            }
        }],
        // TODO if we don't define toDom, something weird happens: dragging the image will not move it but clone it. Why?
        toDOM(node) {
            const attrs = { style: `width: ${node.attrs.width}` };
            return ["img", { ...node.attrs, ...attrs }];
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
            bulletStyle: { default: "" },
        },
        toDOM(node: Node<any>) {
            for (let i = 0; i < node.childCount; i++) node.child(i).attrs.className = node.attrs.bulletStyle;
            return ['ol', { class: `${node.attrs.bulletStyle}-ol`, style: `list-style: none;` }, 0]
            //return ['ol', { class: `${node.attrs.bulletStyle}`, style: `list-style: ${node.attrs.bulletStyle};`, 0]
        }
    },
    //this doesn't currently work for some reason
    bullet_list: {
        ...bulletList,
        content: 'list_item+',
        group: 'block',
        // parseDOM: [{ tag: "ul" }, { style: 'list-style-type=disc' }],
        toDOM(node: Node<any>) {
            for (let i = 0; i < node.childCount; i++) node.child(i).attrs.className = "";
            return ['ul', 0]
        }
    },

    //bullet_list: {
    //  content: 'list_item+',
    // group: 'block',
    //active: blockActive(schema.nodes.bullet_list),
    //enable: wrapInList(schema.nodes.bullet_list),
    //run: wrapInList(schema.nodes.bullet_list),
    //select: state => true,
    // },
    list_item: {
        attrs: {
            className: { default: "" }
        },
        ...listItem,
        content: 'paragraph block*',
        toDOM(node: any) {
            return ["li", { class: node.attrs.className }, 0];
        }
    },
};

const emDOM: DOMOutputSpecArray = ["em", 0];
const strongDOM: DOMOutputSpecArray = ["strong", 0];
const codeDOM: DOMOutputSpecArray = ["code", 0];
const underlineDOM: DOMOutputSpecArray = ["underline", 0];

// :: Object [Specs](#model.MarkSpec) for the marks in the schema.
export const marks: { [index: string]: MarkSpec } = {
    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
        attrs: {
            href: {},
            location: { default: null },
            title: { default: null }
        },
        inclusive: false,
        parseDOM: [{
            tag: "a[href]", getAttrs(dom: any) {
                return { href: dom.getAttribute("href"), location: dom.getAttribute("location"), title: dom.getAttribute("title") };
            }
        }],
        toDOM(node: any) { return ["a", node.attrs, 0]; }
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

    underline: {
        parseDOM: [
            { tag: 'u' },
            { style: 'text-decoration=underline' }
        ],
        toDOM: () => ['span', {
            style: 'text-decoration:underline'
        }]
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
                style: `background: ${node.attrs.bulletType == "decimal" ? "yellow" : node.attrs.bulletType === "upper-alpha" ? "blue" : "green"}`
            }];
        }
    },

    highlight: {
        parseDOM: [{ style: 'color: blue' }],
        toDOM() {
            return ['span', {
                style: 'color: blue'
            }];
        }
    },

    search_highlight: {
        parseDOM: [{ style: 'background: yellow' }],
        toDOM() {
            return ['span', {
                style: 'background: yellow'
            }];
        }
    },

    // the id of the user who entered the text
    user_mark: {
        attrs: {
            userid: { default: "" }
        },
        toDOM(node: any) {
            return ['span', {
                style: `background: ${node.attrs.userid.indexOf(Doc.CurrentUserEmail) === -1 ? "rgba(255, 255, 0, 0.267)" : undefined};`
            }];
        }
    },


    // :: MarkSpec Code font mark. Represented as a `<code>` element.
    code: {
        parseDOM: [{ tag: "code" }],
        toDOM() { return codeDOM; }
    },


    /* FONTS */
    timesNewRoman: {
        parseDOM: [{ style: 'font-family: "Times New Roman", Times, serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: "Times New Roman", Times, serif;'
        }]
    },

    arial: {
        parseDOM: [{ style: 'font-family: Arial, Helvetica, sans-serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: Arial, Helvetica, sans-serif;'
        }]
    },

    georgia: {
        parseDOM: [{ style: 'font-family: Georgia, serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: Georgia, serif;'
        }]
    },

    comicSans: {
        parseDOM: [{ style: 'font-family: "Comic Sans MS", cursive, sans-serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: "Comic Sans MS", cursive, sans-serif;'
        }]
    },

    tahoma: {
        parseDOM: [{ style: 'font-family: Tahoma, Geneva, sans-serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: Tahoma, Geneva, sans-serif;'
        }]
    },

    impact: {
        parseDOM: [{ style: 'font-family: Impact, Charcoal, sans-serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: Impact, Charcoal, sans-serif;'
        }]
    },

    crimson: {
        parseDOM: [{ style: 'font-family: "Crimson Text", sans-serif;' }],
        toDOM: () => ['span', {
            style: 'font-family: "Crimson Text", sans-serif;'
        }]
    },

    pFontColor: {
        attrs: {
            color: { default: "yellow" }
        },
        parseDOM: [{ style: 'background: #d9dbdd' }],
        toDOM: (node) => {
            return ['span', {
                style: `color: ${node.attrs.color}`
            }];
        }
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

    p10: {
        parseDOM: [{ style: 'font-size: 10px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 10px;'
        }]
    },

    p12: {
        parseDOM: [{ style: 'font-size: 12px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 12px;'
        }]
    },

    p14: {
        parseDOM: [{ style: 'font-size: 14px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 14px;'
        }]
    },

    p16: {
        parseDOM: [{ style: 'font-size: 16px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 16px;'
        }]
    },

    p18: {
        parseDOM: [{ style: 'font-size: 18px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 18px;'
        }]
    },

    p20: {
        parseDOM: [{ style: 'font-size: 20px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 20px;'
        }]
    },

    p24: {
        parseDOM: [{ style: 'font-size: 24px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 24px;'
        }]
    },

    p32: {
        parseDOM: [{ style: 'font-size: 32px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 32px;'
        }]
    },

    p48: {
        parseDOM: [{ style: 'font-size: 48px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 48px;'
        }]
    },

    p72: {
        parseDOM: [{ style: 'font-size: 72px;' }],
        toDOM: () => ['span', {
            style: 'font-size: 72px;'
        }]
    },
};
function getFontSize(element: any) {
    return parseFloat((getComputedStyle(element) as any).fontSize);
}

export class ImageResizeView {
    _handle: HTMLElement;
    _img: HTMLElement;
    _outer: HTMLElement;
    constructor(node: any, view: any, getPos: any) {
        this._handle = document.createElement("span");
        this._img = document.createElement("img");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.width = node.attrs.width;
        this._outer.style.display = "inline-block";
        this._outer.style.overflow = "hidden";

        this._img.setAttribute("src", node.attrs.src);
        this._img.style.width = "100%";
        this._handle.style.position = "absolute";
        this._handle.style.width = "20px";
        this._handle.style.height = "20px";
        this._handle.style.backgroundColor = "blue";
        this._handle.style.borderRadius = "15px";
        this._handle.style.display = "none";
        this._handle.style.bottom = "-10px";
        this._handle.style.right = "-10px";
        let self = this;
        this._handle.onpointerdown = function (e: any) {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.pageX;
            const startWidth = parseFloat(node.attrs.width);
            const onpointermove = (e: any) => {
                const currentX = e.pageX;
                const diffInPx = currentX - startX;
                self._outer.style.width = `${startWidth + diffInPx}`;
            };

            const onpointerup = () => {
                document.removeEventListener("pointermove", onpointermove);
                document.removeEventListener("pointerup", onpointerup);
                view.dispatch(
                    view.state.tr.setNodeMarkup(getPos(), null,
                        { src: node.attrs.src, width: self._outer.style.width })
                        .setSelection(view.state.selection));
            };

            document.addEventListener("pointermove", onpointermove);
            document.addEventListener("pointerup", onpointerup);
        };

        this._outer.appendChild(this._handle);
        this._outer.appendChild(this._img);
        (this as any).dom = this._outer;
    }

    selectNode() {
        this._img.classList.add("ProseMirror-selectednode");

        this._handle.style.display = "";
    }

    deselectNode() {
        this._img.classList.remove("ProseMirror-selectednode");

        this._handle.style.display = "none";
    }
}

export class SummarizedView {
    // TODO: highlight text that is summarized. to find end of region, walk along mark
    _collapsed: HTMLElement;
    _view: any;
    constructor(node: any, view: any, getPos: any) {
        this._collapsed = document.createElement("span");
        this._collapsed.textContent = node.attrs.visibility ? "㊀" : "㊉";
        this._collapsed.style.opacity = "0.5";
        this._collapsed.style.position = "relative";
        this._collapsed.style.width = "40px";
        this._collapsed.style.height = "20px";
        let self = this;
        this._view = view;
        const js = node.toJSON;
        node.toJSON = function () {

            return js.apply(this, arguments);
        };
        this._collapsed.onpointerdown = function (e: any) {
            if (node.attrs.visibility) {
                // node.attrs.visibility = !node.attrs.visibility;
                let y = getPos();
                const attrs = { ...node.attrs };
                attrs.visibility = !attrs.visibility;
                let { from, to } = self.updateSummarizedText(y + 1, view.state.schema.marks.highlight);
                let length = to - from;
                let newSelection = TextSelection.create(view.state.doc, y + 1, y + 1 + length);
                // update attrs of node
                attrs.text = newSelection.content();
                attrs.textslice = newSelection.content().toJSON();
                view.dispatch(view.state.tr.setNodeMarkup(y, undefined, attrs));
                view.dispatch(view.state.tr.setSelection(newSelection).deleteSelection(view.state, () => { }));
                self._collapsed.textContent = "㊉";
            } else {
                // node.attrs.visibility = !node.attrs.visibility;
                let y = getPos();
                const attrs = { ...node.attrs };
                attrs.visibility = !attrs.visibility;
                view.dispatch(view.state.tr.setNodeMarkup(y, undefined, attrs));
                let mark = view.state.schema.mark(view.state.schema.marks.highlight);
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, y + 1, y + 1)));
                const from = view.state.selection.from;
                let size = node.attrs.text.size;
                view.dispatch(view.state.tr.replaceSelection(node.attrs.text).addMark(from, from + size, mark).removeStoredMark(mark));
                self._collapsed.textContent = "㊀";
            }
            e.preventDefault();
            e.stopPropagation();
        };
        (this as any).dom = this._collapsed;

    }
    selectNode() {
    }

    updateSummarizedText(start?: any, mark?: any) {
        let $start = this._view.state.doc.resolve(start);
        let endPos = start;

        let _mark = this._view.state.schema.mark(this._view.state.schema.marks.highlight);
        let visited = new Set();
        for (let i: number = start + 1; i < this._view.state.doc.nodeSize - 1; i++) {
            let skip = false;
            this._view.state.doc.nodesBetween(start, i, (node: Node, pos: number, parent: Node, index: number) => {
                if (node.isLeaf && !visited.has(node) && !skip) {
                    if (node.marks.includes(_mark)) {
                        visited.add(node);
                        endPos = i + node.nodeSize - 1;
                    }
                    else skip = true;
                }
            });
        }
        return { from: start, to: endPos };
    }

    deselectNode() {
    }
}
// :: Schema
// This schema rougly corresponds to the document schema used by
// [CommonMark](http://commonmark.org/), minus the list elements,
// which are defined in the [`prosemirror-schema-list`](#schema-list)
// module.
//
// To reuse elements from this schema, extend or read from its
// `spec.nodes` and `spec.marks` [properties](#model.Schema.spec).
export const schema = new Schema({ nodes, marks });

const fromJson = schema.nodeFromJSON;

schema.nodeFromJSON = (json: any) => {
    let node = fromJson(json);
    if (json.type === "star") {
        node.attrs.text = Slice.fromJSON(schema, node.attrs.textslice);
    }
    return node;
};