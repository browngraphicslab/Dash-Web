import { baseKeymap, toggleMark } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { EditorState, TextSelection } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../new_fields/Doc";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { DocServer } from "../DocServer";
import { Cast, NumCast } from "../../new_fields/Types";
import { DocumentManager } from "./DocumentManager";

const pDOM: DOMOutputSpecArray = ["p", 0], blockquoteDOM: DOMOutputSpecArray = ["blockquote", 0], hrDOM: DOMOutputSpecArray = ["hr"],
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

    // :: NodeSpec A plain paragraph textblock. Represented in the DOM
    // as a `<p>` element.
    paragraph: {
        content: "inline*",
        group: "block",
        parseDOM: [{ tag: "p" }],
        toDOM() { return pDOM; }
    },

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
            width: { default: 100 },
            alt: { default: null },
            title: { default: null },
            float: { default: "left" },
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
            visibility: { default: true }
        },
        toDOM(node: Node<any>) {
            const bs = node.attrs.bulletStyle;
            const decMap = bs ? "decimal" + bs : "";
            const multiMap = bs === 1 ? "decimal1" : bs === 2 ? "upper-alpha" : bs === 3 ? "lower-roman" : bs === 4 ? "lower-alpha" : "";
            let map = node.attrs.mapStyle === "decimal" ? decMap : multiMap;
            return node.attrs.visibility ? ['ol', { class: `${map}-ol`, style: `list-style: none;` }, 0] :
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
            const bs = node.attrs.bulletStyle;
            const decMap = bs ? "decimal" + bs : "";
            const multiMap = bs === 1 ? "decimal1" : bs === 2 ? "upper-alpha" : bs === 3 ? "lower-roman" : bs === 4 ? "lower-alpha" : "";
            let map = node.attrs.mapStyle === "decimal" ? decMap : multiMap;
            return node.attrs.visibility ? ["li", { class: `${map}` }, 0] : ["li", { class: `${map}` }, "..."];
            //return ["li", { class: `${map}` }, 0];
        }
    },
};

const emDOM: DOMOutputSpecArray = ["em", 0];
const strongDOM: DOMOutputSpecArray = ["strong", 0];
const codeDOM: DOMOutputSpecArray = ["code", 0];

// :: Object [Specs](#model.MarkSpec) for the marks in the schema.
export const marks: { [index: string]: MarkSpec } = {
    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
        attrs: {
            href: {},
            location: { default: null },
            title: { default: null },
            docref: { default: false }
        },
        inclusive: false,
        parseDOM: [{
            tag: "a[href]", getAttrs(dom: any) {
                return { href: dom.getAttribute("href"), location: dom.getAttribute("location"), title: dom.getAttribute("title") };
            }
        }],
        toDOM(node: any) {
            return node.attrs.docref && node.attrs.title ?
                ["div", ["span", `"`], ["span", 0], ["span", `"`], ["br"], ["a", { ...node.attrs, class: "prosemirror-attribution" }, node.attrs.title], ["br"]] :
                ["a", { ...node.attrs }, 0];
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

    highlight: {
        parseDOM: [
            {
                tag: "span",
                getAttrs: (p: any) => {
                    if (typeof (p) !== "string") {
                        let style = getComputedStyle(p);
                        if (style.textDecoration === "underline") return null;
                        if (p.parentElement.outerHTML.indexOf("text-decoration: underline") !== -1 &&
                            p.parentElement.outerHTML.indexOf("text-decoration-style: dotted") !== -1)
                            return null;
                    }
                    return false;
                }
            },
        ],
        inclusive: true,
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
                        let style = getComputedStyle(p);
                        if (style.textDecoration === "underline")
                            return null;
                        if (p.parentElement.outerHTML.indexOf("text-decoration-style:line") !== -1)
                            return null;
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
            userid: { default: "" },
            hide_users: { default: [] },
            opened: { default: true },
            modified: { default: "when?" }
        },
        group: "inline",
        toDOM(node: any) {
            let hideUsers = node.attrs.hide_users;
            let hidden = hideUsers.indexOf(node.attrs.userid) !== -1 || (hideUsers.length === 0 && node.attrs.userid !== Doc.CurrentUserEmail);
            return hidden ?
                (node.attrs.opened ?
                    ['span', { class: "userMarkOpen" }, 0] :
                    ['span', { class: "userMark" }, ['span', 0]]
                ) :
                ['span', 0];
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

export class ImageResizeView {
    _handle: HTMLElement;
    _img: HTMLElement;
    _outer: HTMLElement;
    constructor(node: any, view: any, getPos: any, addDocTab: any) {
        this._handle = document.createElement("span");
        this._img = document.createElement("img");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.width = node.attrs.width;
        this._outer.style.display = "inline-block";
        this._outer.style.overflow = "hidden";
        (this._outer.style as any).float = node.attrs.float;

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
        this._img.onpointerdown = function (e: any) {
            if (!view.isOverlay || e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                DocServer.GetRefField(node.attrs.docid).then(async linkDoc => {
                    if (linkDoc instanceof Doc) {
                        let proto = Doc.GetProto(linkDoc);
                        let targetContext = await Cast(proto.targetContext, Doc);
                        let jumpToDoc = await Cast(linkDoc.anchor2, Doc);
                        if (jumpToDoc) {
                            if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {

                                DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, undefined, undefined, NumCast((jumpToDoc === linkDoc.anchor2 ? linkDoc.anchor2Page : linkDoc.anchor1Page)));
                                return;
                            }
                        }
                        if (targetContext) {
                            DocumentManager.Instance.jumpToDocument(targetContext, e.ctrlKey, false, document => addDocTab(document, undefined, location ? location : "inTab"));
                        } else if (jumpToDoc) {
                            DocumentManager.Instance.jumpToDocument(jumpToDoc, e.ctrlKey, false, document => addDocTab(document, undefined, location ? location : "inTab"));
                        } else {
                            DocumentManager.Instance.jumpToDocument(linkDoc, e.ctrlKey, false, document => addDocTab(document, undefined, location ? location : "inTab"));
                        } e.ctrlKey
                    }
                });
            }
        }
        this._handle.onpointerdown = function (e: any) {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.pageX;
            const startWidth = parseFloat(node.attrs.width);
            const onpointermove = (e: any) => {
                const currentX = e.pageX;
                const diffInPx = currentX - startX;
                self._outer.style.width = `${startWidth + diffInPx}`;
                //Array.from(FormattedTextBox.InputBoxOverlay!.CurrentDiv.getElementsByTagName("img")).map((img: any) => img.opacity = "0.1");
                FormattedTextBox.InputBoxOverlay!.CurrentDiv.style.opacity = "0";
            };

            const onpointerup = () => {
                document.removeEventListener("pointermove", onpointermove);
                document.removeEventListener("pointerup", onpointerup);
                view.dispatch(
                    view.state.tr.setSelection(view.state.selection).setNodeMarkup(getPos(), null,
                        { ...node.attrs, width: self._outer.style.width })
                );
                FormattedTextBox.InputBoxOverlay!.CurrentDiv.style.opacity = "1";
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

export class OrderedListView {
    update(node: any) {
        return false; // if attr's of an ordered_list (e.g., bulletStyle) change, return false forces the dom node to be recreated which is necessary for the bullet labels to update
    }
}

export class FootnoteView {
    innerView: any;
    outerView: any;
    node: any;
    dom: any;
    getPos: any;

    constructor(node: any, view: any, getPos: any) {
        // We'll need these later
        this.node = node;
        this.outerView = view;
        this.getPos = getPos;

        // The node's representation in the editor (empty, for now)
        this.dom = document.createElement("footnote");
        this.dom.addEventListener("pointerup", this.toggle, true);
        // These are used when the footnote is selected
        this.innerView = null;
    }
    selectNode() {
        const attrs = { ...this.node.attrs };
        attrs.visibility = true;
        this.dom.classList.add("ProseMirror-selectednode");
        if (!this.innerView) this.open();
    }

    deselectNode() {
        const attrs = { ...this.node.attrs };
        attrs.visibility = false;
        this.dom.classList.remove("ProseMirror-selectednode");
        if (this.innerView) this.close();
    }
    open() {
        if (!this.outerView.isOverlay) return;
        // Append a tooltip to the outer node
        let tooltip = this.dom.appendChild(document.createElement("div"));
        tooltip.className = "footnote-tooltip";
        // And put a sub-ProseMirror into that
        this.innerView = new EditorView(tooltip, {
            // You can use any node as an editor document
            state: EditorState.create({
                doc: this.node,
                plugins: [keymap(baseKeymap),
                keymap({
                    "Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
                    "Mod-y": () => redo(this.outerView.state, this.outerView.dispatch),
                    "Mod-b": toggleMark(schema.marks.strong)
                })]
            }),
            // This is the magic part
            dispatchTransaction: this.dispatchInner.bind(this),
            handleDOMEvents: {
                pointerdown: ((view: any, e: PointerEvent) => {
                    // Kludge to prevent issues due to the fact that the whole
                    // footnote is node-selected (and thus DOM-selected) when
                    // the parent editor is focused.
                    e.stopPropagation();
                    document.addEventListener("pointerup", this.ignore, true);
                    if (this.outerView.hasFocus()) this.innerView.focus();
                }) as any
            }

        });
        setTimeout(() => this.innerView && this.innerView.docView.setSelection(0, 0, this.innerView.root, true), 0);
    }

    ignore = (e: PointerEvent) => {
        e.stopPropagation();
        document.removeEventListener("pointerup", this.ignore, true);
    }

    toggle = () => {
        if (this.innerView) this.close();
        else {
            this.open();
        }
    }
    close() {
        this.innerView && this.innerView.destroy();
        this.innerView = null;
        this.dom.textContent = "";
    }
    dispatchInner(tr: any) {
        let { state, transactions } = this.innerView.state.applyTransaction(tr);
        this.innerView.updateState(state);

        if (!tr.getMeta("fromOutside")) {
            let outerTr = this.outerView.state.tr, offsetMap = StepMap.offset(this.getPos() + 1);
            for (let steps of transactions) {
                for (let step of steps) {
                    outerTr.step(step.map(offsetMap));
                }
            }
            if (outerTr.docChanged) this.outerView.dispatch(outerTr);
        }
    }
    update(node: any) {
        if (!node.sameMarkup(this.node)) return false;
        this.node = node;
        if (this.innerView) {
            let state = this.innerView.state;
            let start = node.content.findDiffStart(state.doc.content);
            if (start !== null) {
                let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content);
                let overlap = start - Math.min(endA, endB);
                if (overlap > 0) { endA += overlap; endB += overlap; }
                this.innerView.dispatch(
                    state.tr
                        .replace(start, endB, node.slice(start, endA))
                        .setMeta("fromOutside", true));
            }
        }
        return true;
    }

    destroy() {
        if (this.innerView) this.close();
    }

    stopEvent(event: any) {
        return this.innerView && this.innerView.dom.contains(event.target);
    }

    ignoreMutation() { return true; }
}

export class SummarizedView {
    _collapsed: HTMLElement;
    _view: any;
    constructor(node: any, view: any, getPos: any) {
        this._collapsed = document.createElement("span");
        this._collapsed.className = this.className(node.attrs.visibility);
        this._view = view;
        const js = node.toJSON;
        node.toJSON = function () {
            return js.apply(this, arguments);
        };

        this._collapsed.onpointerdown = (e: any) => {
            const visible = !node.attrs.visibility;
            const attrs = { ...node.attrs, visibility: visible };
            let textSelection = TextSelection.create(view.state.doc, getPos() + 1);
            if (!visible) { // update summarized text and save in attrs
                textSelection = this.updateSummarizedText(getPos() + 1);
                attrs.text = textSelection.content();
                attrs.textslice = attrs.text.toJSON();
            }
            view.dispatch(view.state.tr.
                setSelection(textSelection). // select the current summarized text (or where it will be if its collapsed)
                replaceSelection(!visible ? new Slice(Fragment.fromArray([]), 0, 0) : node.attrs.text). // collapse/expand it
                setNodeMarkup(getPos(), undefined, attrs)); // update the attrs 
            e.preventDefault();
            e.stopPropagation();
            this._collapsed.className = this.className(visible);
        };
        (this as any).dom = this._collapsed;
    }
    selectNode() { }

    deselectNode() { }

    className = (visible: boolean) => "formattedTextBox-summarizer" + (visible ? "" : "-collapsed");

    updateSummarizedText(start?: any) {
        let mark = this._view.state.schema.marks.highlight.create();
        let endPos = start;

        let visited = new Set();
        for (let i: number = start + 1; i < this._view.state.doc.nodeSize - 1; i++) {
            let skip = false;
            this._view.state.doc.nodesBetween(start, i, (node: Node, pos: number, parent: Node, index: number) => {
                if (node.isLeaf && !visited.has(node) && !skip) {
                    if (node.marks.find((m: any) => m.type === mark.type)) {
                        visited.add(node);
                        endPos = i + node.nodeSize - 1;
                    }
                    else skip = true;
                }
            });
        }
        return TextSelection.create(this._view.state.doc, start, endPos);
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