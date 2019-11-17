import { action, observable, runInAction, reaction, IReactionDisposer } from "mobx";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, TextSelection, Plugin } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import * as ReactDOM from 'react-dom';
import { Doc, WidthSym, HeightSym } from "../../new_fields/Doc";
import { emptyFunction, returnEmptyString, returnFalse, returnOne, Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { DocumentView } from "../views/nodes/DocumentView";
import { DocumentManager } from "./DocumentManager";
import ParagraphNodeSpec from "./ParagraphNodeSpec";
import { Transform } from "./Transform";
import React = require("react");
import { BoolCast, NumCast } from "../../new_fields/Types";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";

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

    // // :: NodeSpec A plain paragraph textblock. Represented in the DOM
    // // as a `<p>` element.
    // paragraph: {
    //     content: "inline*",
    //     group: "block",
    //     parseDOM: [{ tag: "p" }],
    //     toDOM() { return pDOM; }
    // },

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
            docid: { default: "" }
        },
        group: "inline",
        draggable: true,
        // parseDOM: [{
        //     tag: "img[src]", getAttrs(dom: any) {
        //         return {
        //             src: dom.getAttribute("src"),
        //             title: dom.getAttribute("title"),
        //             alt: dom.getAttribute("alt"),
        //             width: Math.min(100, Number(dom.getAttribute("width"))),
        //         };
        //     }
        // }],
        // TODO if we don't define toDom, dragging the image crashes. Why?
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
            setFontFamily: { default: undefined },
            inheritedFontSize: { default: undefined },
            visibility: { default: true }
        },
        toDOM(node: Node<any>) {
            const bs = node.attrs.bulletStyle;
            if (node.attrs.mapStyle === "bullet") return ['ul', 0];
            const decMap = bs ? "decimal" + bs : "";
            const multiMap = bs === 1 ? "decimal1" : bs === 2 ? "upper-alpha" : bs === 3 ? "lower-roman" : bs === 4 ? "lower-alpha" : "";
            let map = node.attrs.mapStyle === "decimal" ? decMap : multiMap;
            let fsize = node.attrs.setFontSize ? node.attrs.setFontSize : node.attrs.inheritedFontSize;
            let ffam = node.attrs.setFontFamily;
            return node.attrs.visibility ? ['ol', { class: `${map}-ol`, style: `list-style: none; font-size: ${fsize}; font-family: ${ffam}` }, 0] :
                ['ol', { class: `${map}-ol`, style: `list-style: none; font-size: ${fsize}; font-family: ${ffam}` }];
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
            let map = node.attrs.mapStyle === "decimal" ? decMap : node.attrs.mapStyle === "multi" ? multiMap : "";
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
            docref: { default: false } // flags whether the linked text comes from a document within Dash.  If so, an attribution label is appended after the text
        },
        inclusive: false,
        parseDOM: [{
            tag: "a[href]", getAttrs(dom: any) {
                return { href: dom.getAttribute("href"), location: dom.getAttribute("location"), title: dom.getAttribute("title") };
            }
        }],
        toDOM(node: any) {
            return node.attrs.docref && node.attrs.title ?
                ["div", ["span", `"`], ["span", 0], ["span", `"`], ["br"], ["a", { ...node.attrs, class: "prosemirror-attribution", title: `${node.attrs.title}` }, node.attrs.title], ["br"]] :
                ["a", { ...node.attrs, title: `${node.attrs.title}` }, 0];
        }
    },

    // :: MarkSpec Coloring on text. Has `color` attribute that defined the color of the marked text.
    color: {
        attrs: {
            color: { default: "#000" }
        },
        inclusive: false,
        parseDOM: [{
            tag: "span", getAttrs(dom: any) {
                return { color: dom.getAttribute("color") };
            }
        }],
        toDOM(node: any) {
            return node.attrs.color ? ['span', { style: 'color:' + node.attrs.color }] : ['span', { style: 'color: black' }];
        }
    },

    marker: {
        attrs: {
            highlight: { default: "transparent" }
        },
        inclusive: false,
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

    highlight: {
        parseDOM: [
            {
                tag: "span",
                getAttrs: (p: any) => {
                    if (typeof (p) !== "string") {
                        let style = getComputedStyle(p);
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
            opened: { default: true },
            modified: { default: "when?" }, // 5 second intervals since 1970
        },
        group: "inline",
        toDOM(node: any) {
            let uid = node.attrs.userid.replace(".", "").replace("@", "");
            let min = Math.round(node.attrs.modified / 12);
            let hr = Math.round(min / 60);
            let day = Math.round(hr / 60 / 24);
            let remote = node.attrs.userid !== Doc.CurrentUserEmail ? " userMark-remote" : "";
            return node.attrs.opened ?
                ['span', { class: "userMark-" + uid + remote + " userMark-min-" + min + " userMark-hr-" + hr + " userMark-day-" + day }, 0] :
                ['span', { class: "userMark-" + uid + remote + " userMark-min-" + min + " userMark-hr-" + hr + " userMark-day-" + day }, ['span', 0]];
        }
    },
    // the id of the user who entered the text
    user_tag: {
        attrs: {
            userid: { default: "" },
            opened: { default: true },
            modified: { default: "when?" }, // 5 second intervals since 1970
            tag: { default: "" }
        },
        group: "inline",
        toDOM(node: any) {
            let uid = node.attrs.userid.replace(".", "").replace("@", "");
            return node.attrs.opened ?
                ['span', { class: "userTag-" + uid + " userTag-" + node.attrs.tag }, 0] :
                ['span', { class: "userTag-" + uid + " userTag-" + node.attrs.tag }, ['span', 0]];
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
                let cstyle = getComputedStyle(dom);
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
        this._outer.style.height = node.attrs.height;
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
        this._img.onclick = function (e: any) {
            e.stopPropagation();
            e.preventDefault();
            if (view.state.selection.node && view.state.selection.node.type !== view.state.schema.nodes.image) {
                view.dispatch(view.state.tr.setSelection(new NodeSelection(view.state.doc.resolve(view.state.selection.from - 2))));
            }
        };
        this._img.onpointerdown = function (e: any) {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                DocServer.GetRefField(node.attrs.docid).then(async linkDoc =>
                    (linkDoc instanceof Doc) &&
                    DocumentManager.Instance.FollowLink(linkDoc, view.state.schema.Document,
                        document => addDocTab(document, undefined, node.attrs.location ? node.attrs.location : "inTab"), false));
            }
        };
        this._handle.onpointerdown = function (e: any) {
            e.preventDefault();
            e.stopPropagation();
            let wid = Number(getComputedStyle(self._img).width.replace(/px/, ""));
            let hgt = Number(getComputedStyle(self._img).height.replace(/px/, ""));
            const startX = e.pageX;
            const startWidth = parseFloat(node.attrs.width);
            const onpointermove = (e: any) => {
                const currentX = e.pageX;
                const diffInPx = currentX - startX;
                self._outer.style.width = `${startWidth + diffInPx}`;
                self._outer.style.height = `${(startWidth + diffInPx) * hgt / wid}`;
            };

            const onpointerup = () => {
                document.removeEventListener("pointermove", onpointermove);
                document.removeEventListener("pointerup", onpointerup);
                let pos = view.state.selection.from;
                view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: self._outer.style.width, height: self._outer.style.height }));
                view.dispatch(view.state.tr.setSelection(new NodeSelection(view.state.doc.resolve(pos))));
            };

            document.addEventListener("pointermove", onpointermove);
            document.addEventListener("pointerup", onpointerup);
        };

        this._outer.appendChild(this._img);
        this._outer.appendChild(this._handle);
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

export class DashDocView {
    _dashSpan: HTMLDivElement;
    _outer: HTMLElement;
    _dashDoc: Doc | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _textBox: FormattedTextBox;

    getDocTransform = () => {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._outer);
        return new Transform(-translateX, -translateY, 1).scale(1 / this.contentScaling() / scale);
    }
    contentScaling = () => NumCast(this._dashDoc!.nativeWidth) > 0 && !this._dashDoc!.ignoreAspect ? this._dashDoc![WidthSym]() / NumCast(this._dashDoc!.nativeWidth) : 1;
    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        this._textBox = tbox;
        this._dashSpan = document.createElement("div");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.width = node.attrs.width;
        this._outer.style.height = node.attrs.height;
        this._outer.style.display = "inline-block";
        this._outer.style.overflow = "hidden";
        (this._outer.style as any).float = node.attrs.float;

        this._dashSpan.style.width = node.attrs.width;
        this._dashSpan.style.height = node.attrs.height;
        this._dashSpan.style.position = "absolute";
        this._dashSpan.style.display = "inline-block";
        let removeDoc = () => {
            let pos = getPos();
            let ns = new NodeSelection(view.state.doc.resolve(pos));
            view.dispatch(view.state.tr.setSelection(ns).deleteSelection());
            return true;
        };
        DocServer.GetRefField(node.attrs.docid).then(async dashDoc => {
            if (dashDoc instanceof Doc) {
                self._dashDoc = dashDoc;
                if (node.attrs.width !== dashDoc.width + "px" || node.attrs.height !== dashDoc.height + "px") {
                    view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: dashDoc.width + "px", height: dashDoc.height + "px" }));
                }
                this._reactionDisposer && this._reactionDisposer();
                this._reactionDisposer = reaction(() => dashDoc[HeightSym]() + dashDoc[WidthSym](), () => {
                    this._dashSpan.style.height = this._outer.style.height = dashDoc[HeightSym]() + "px";
                    this._dashSpan.style.width = this._outer.style.width = dashDoc[WidthSym]() + "px";
                });
                ReactDOM.render(<DocumentView
                    fitToBox={BoolCast(dashDoc.fitToBox)}
                    Document={dashDoc}
                    addDocument={returnFalse}
                    removeDocument={removeDoc}
                    ruleProvider={undefined}
                    ScreenToLocalTransform={this.getDocTransform}
                    addDocTab={self._textBox.props.addDocTab}
                    pinToPres={returnFalse}
                    renderDepth={1}
                    PanelWidth={self._dashDoc[WidthSym]}
                    PanelHeight={self._dashDoc[HeightSym]}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    dontRegisterView={true}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={this.contentScaling}
                />, this._dashSpan);
            }
        });
        let self = this;
        this._dashSpan.onkeydown = function (e: any) { e.stopPropagation(); };
        this._dashSpan.onkeypress = function (e: any) { e.stopPropagation(); };
        this._dashSpan.onwheel = function (e: any) { e.preventDefault(); };
        this._dashSpan.onkeyup = function (e: any) { e.stopPropagation(); };
        this._outer.appendChild(this._dashSpan);
        (this as any).dom = this._outer;
    }
    destroy() {
        this._reactionDisposer && this._reactionDisposer();
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
                }),
                new Plugin({
                    view(newView) {
                        return FormattedTextBox.getToolTip(newView);
                    }
                })
                ],

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
            for (let transaction of transactions) {
                let steps = transaction.steps;
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